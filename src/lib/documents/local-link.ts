import { createHmac, timingSafeEqual } from "node:crypto";

export type LocalDownloadClaims = {
  documentId: string;
  ownerId: string;
  storageKey: string;
  exp: number;
};

function secretFrom(secret?: string): string | null {
  const value = secret ?? process.env.AUTH_SECRET;
  if (!value) {
    return null;
  }
  return value;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function signaturesMatch(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export function signLocalDownload(input: {
  documentId: string;
  ownerId: string;
  storageKey: string;
  expiresInSeconds: number;
  now?: number;
  secret?: string;
}): string | null {
  const secret = secretFrom(input.secret);
  if (!secret) {
    return null;
  }
  const claims: LocalDownloadClaims = {
    documentId: input.documentId,
    ownerId: input.ownerId,
    storageKey: input.storageKey,
    exp: (input.now ?? Date.now()) + input.expiresInSeconds * 1000,
  };
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyLocalDownload(
  token: string,
  now = Date.now(),
  secret?: string,
): LocalDownloadClaims | null {
  const signingSecret = secretFrom(secret);
  if (!signingSecret) {
    return null;
  }
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) {
    return null;
  }
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!signaturesMatch(signature, sign(payload, signingSecret))) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const claims = parsed as Partial<LocalDownloadClaims>;
  if (
    typeof claims.documentId !== "string" ||
    typeof claims.ownerId !== "string" ||
    typeof claims.storageKey !== "string" ||
    typeof claims.exp !== "number"
  ) {
    return null;
  }
  if (claims.exp <= now) {
    return null;
  }
  if (claims.storageKey !== `${claims.ownerId}/${claims.documentId}`) {
    return null;
  }
  return {
    documentId: claims.documentId,
    ownerId: claims.ownerId,
    storageKey: claims.storageKey,
    exp: claims.exp,
  };
}
