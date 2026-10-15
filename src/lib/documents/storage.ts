import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { DOCUMENT_BUCKET, SIGNED_URL_SECONDS } from "@/lib/documents/catalog";
import { signLocalDownload } from "@/lib/documents/local-link";

export type StorageMode = "supabase" | "local" | "unconfigured";

export type DocumentStorage = {
  mode: StorageMode;
  put(key: string, bytes: Uint8Array, mimeType: string): Promise<void>;
  remove(key: string): Promise<void>;
  signedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  read(key: string): Promise<Uint8Array | null>;
};

const KEY_PATTERN = /^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/;

export function isSafeStorageKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

export function storageKeyFor(ownerId: string, documentId: string): string {
  const key = `${ownerId}/${documentId}`;
  if (!isSafeStorageKey(key)) {
    throw new Error("Invalid storage key.");
  }
  return key;
}

function appOrigin(): string {
  return (process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

function localRoot(): string {
  return path.resolve(process.env.DOCUMENT_LOCAL_DIR || path.join(process.cwd(), ".data", "documents"));
}

function localFilePath(key: string): string {
  if (!isSafeStorageKey(key)) {
    throw new Error("Invalid storage key.");
  }
  const root = localRoot();
  const full = path.resolve(root, key);
  if (full !== path.join(root, key)) {
    throw new Error("Invalid storage key.");
  }
  return full;
}

async function localSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
  const [ownerId, documentId] = key.split("/");
  const token = signLocalDownload({
    documentId,
    ownerId,
    storageKey: key,
    expiresInSeconds,
  });
  if (!token) {
    throw new Error("AUTH_SECRET is not set.");
  }
  return `${appOrigin()}/api/documents/local?token=${encodeURIComponent(token)}`;
}

function createLocalStorage(): DocumentStorage {
  return {
    mode: "local",
    async put(key, bytes) {
      const filePath = localFilePath(key);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, bytes);
    },
    async remove(key) {
      await rm(localFilePath(key), { force: true });
    },
    signedUrl: localSignedUrl,
    async read(key) {
      try {
        return new Uint8Array(await readFile(localFilePath(key)));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return null;
        }
        throw error;
      }
    },
  };
}

export function createMemoryStorage(): DocumentStorage & {
  objects: Map<string, Uint8Array>;
} {
  const objects = new Map<string, Uint8Array>();
  return {
    mode: "local",
    objects,
    async put(key, bytes) {
      if (!isSafeStorageKey(key)) {
        throw new Error("Invalid storage key.");
      }
      objects.set(key, Uint8Array.from(bytes));
    },
    async remove(key) {
      objects.delete(key);
    },
    signedUrl: localSignedUrl,
    async read(key) {
      const found = objects.get(key);
      return found ? Uint8Array.from(found) : null;
    },
  };
}

let supabaseClient: SupabaseClient | null = null;

function bucketName(): string {
  return process.env.SUPABASE_DOCUMENT_BUCKET?.trim() || DOCUMENT_BUCKET;
}

function supabase(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient;
  }
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    throw new Error("Document storage is not configured.");
  }
  supabaseClient = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return supabaseClient;
}

function createSupabaseStorage(): DocumentStorage {
  return {
    mode: "supabase",
    async put(key, bytes, mimeType) {
      if (!isSafeStorageKey(key)) {
        throw new Error("Invalid storage key.");
      }
      const { error } = await supabase()
        .storage.from(bucketName())
        .upload(key, bytes, { contentType: mimeType, upsert: false });
      if (error) {
        console.error("Supabase upload failed", error.message);
        throw new Error("The file could not be stored.");
      }
    },
    async remove(key) {
      if (!isSafeStorageKey(key)) {
        throw new Error("Invalid storage key.");
      }
      const { error } = await supabase().storage.from(bucketName()).remove([key]);
      if (error) {
        console.error("Supabase delete failed", error.message);
        throw new Error("The file could not be deleted.");
      }
    },
    async signedUrl(key, expiresInSeconds = SIGNED_URL_SECONDS) {
      if (!isSafeStorageKey(key)) {
        throw new Error("Invalid storage key.");
      }
      const { data, error } = await supabase()
        .storage.from(bucketName())
        .createSignedUrl(key, expiresInSeconds);
      if (error || !data?.signedUrl) {
        console.error("Supabase signed URL failed", error?.message);
        throw new Error("The download link could not be created.");
      }
      return data.signedUrl;
    },
    async read() {
      return null;
    },
  };
}

const unconfigured: DocumentStorage = {
  mode: "unconfigured",
  async put() {
    throw new Error("Document storage is not configured.");
  },
  async remove() {
    throw new Error("Document storage is not configured.");
  },
  async signedUrl() {
    throw new Error("Document storage is not configured.");
  },
  async read() {
    return null;
  },
};

export function supabaseCredentials(): { url: string; serviceRoleKey: string } | null {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    return null;
  }
  return { url, serviceRoleKey };
}

export function storageFromEnv(): DocumentStorage {
  if (supabaseCredentials()) {
    return createSupabaseStorage();
  }
  if (process.env.DOCUMENT_STORAGE === "local") {
    return createLocalStorage();
  }
  return unconfigured;
}

let override: DocumentStorage | null = null;

export function setDocumentStorageForTests(storage: DocumentStorage | null) {
  override = storage;
}

export function getDocumentStorage(): DocumentStorage {
  return override ?? storageFromEnv();
}
