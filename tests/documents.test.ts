import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createAgentAccessToken } from "@/lib/agent/tokens";
import {
  EXPIRY_WINDOW_DAYS,
  MAX_DOCUMENT_BYTES,
  SIGNED_URL_SECONDS,
} from "@/lib/documents/catalog";
import { inspectDocumentFile } from "@/lib/documents/files";
import { signLocalDownload, verifyLocalDownload } from "@/lib/documents/local-link";
import { n4DraftLines } from "@/lib/documents/notice-lines";
import {
  createMemoryStorage,
  setDocumentStorageForTests,
  storageKeyFor,
  type DocumentStorage,
} from "@/lib/documents/storage";
import { addDays, dateOnlyToUtc, todayDateOnly } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { expiryState } from "@/lib/services/documents";
import { handleMcpRequest } from "@/lib/mcp/http";
import { ServiceError } from "@/lib/services/errors";
import {
  createDocumentLink,
  deleteDocument,
  listDocuments,
  saveN4DraftDocument,
  saveNoticePdf,
  uploadDocument,
} from "@/lib/services/documents";
import { GET as localDownload } from "@/app/api/documents/local/route";

const ownerIds: string[] = [];

function pdfBytes(extra = "sample"): Uint8Array {
  return new TextEncoder().encode(`%PDF-1.4\n${extra}\n`);
}

function heicBytes(): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0, 0, 0, 24], 0);
  bytes.set(new TextEncoder().encode("ftypheic"), 4);
  return bytes;
}

async function makeLandlord(label: string) {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const user = await prisma.user.create({
    data: {
      name: label,
      email: `${label}-${stamp}@example.com`,
      passwordHash: "not-used",
    },
  });
  ownerIds.push(user.id);
  const tenant = await prisma.tenant.create({
    data: {
      ownerId: user.id,
      firstName: "Jordan",
      lastName: "Patel",
      email: `jordan-${stamp}@example.com`,
    },
  });
  const property = await prisma.property.create({
    data: {
      ownerId: user.id,
      name: `${label} house`,
      streetAddress: `${label} ${stamp} Street`,
      city: "Hamilton",
      province: "ON",
      postalCode: "L8P 1A1",
      units: {
        create: {
          label: "Upper",
          tenancies: {
            create: {
              tenantId: tenant.id,
              leaseStart: dateOnlyToUtc("2024-01-01"),
              moveInOn: dateOnlyToUtc("2024-01-01"),
              monthlyRentCents: 100_000,
              rentDueDay: 1,
            },
          },
        },
      },
    },
    include: { units: { include: { tenancies: true } } },
  });
  return {
    user,
    tenant,
    property,
    unitId: property.units[0].id,
    tenancyId: property.units[0].tenancies[0].id,
  };
}

describe("document files", () => {
  it("accepts pdf, jpeg, png, heic, and docx", () => {
    expect(inspectDocumentFile({ fileName: "lease.pdf", bytes: pdfBytes() }).ok).toBe(true);
    expect(
      inspectDocumentFile({
        fileName: "id.jpg",
        bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0x00]),
      }).ok,
    ).toBe(true);
    expect(
      inspectDocumentFile({
        fileName: "photo.png",
        bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      }).ok,
    ).toBe(true);
    const heic = inspectDocumentFile({ fileName: "scan.heic", bytes: heicBytes() });
    expect(heic.ok).toBe(true);
    if (heic.ok) {
      expect(heic.file.mimeType).toBe("image/heic");
    }
    const docx = inspectDocumentFile({
      fileName: "letter.docx",
      bytes: Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x00]),
    });
    expect(docx.ok).toBe(true);
    if (docx.ok) {
      expect(docx.file.mimeType).toContain("wordprocessingml");
    }
  });

  it("rejects the wrong type, an empty file, and a file over 10 MB", () => {
    const renamed = inspectDocumentFile({
      fileName: "notes.pdf",
      bytes: new TextEncoder().encode("not a pdf"),
    });
    expect(renamed.ok).toBe(false);
    expect(inspectDocumentFile({ fileName: "empty.pdf", bytes: new Uint8Array() }).ok).toBe(
      false,
    );
    const huge = inspectDocumentFile({
      fileName: "big.pdf",
      bytes: new Uint8Array(MAX_DOCUMENT_BYTES + 1),
    });
    expect(huge.ok).toBe(false);
    if (!huge.ok) {
      expect(huge.message).toMatch(/10 MB/);
    }
  });

  it("classifies expiry dates inside the 60-day window", () => {
    const today = "2026-10-15";
    expect(expiryState(null, today)).toBe("none");
    expect(expiryState("2026-10-14", today)).toBe("expired");
    expect(expiryState(today, today)).toBe("soon");
    expect(expiryState(addDays(today, EXPIRY_WINDOW_DAYS), today)).toBe("soon");
    expect(expiryState(addDays(today, EXPIRY_WINDOW_DAYS + 1), today)).toBe("ok");
  });

  it("rejects an expired local download token", () => {
    const token = signLocalDownload({
      documentId: "doc",
      ownerId: "owner",
      storageKey: "owner/doc",
      expiresInSeconds: -5,
      secret: "test-secret",
    });
    expect(token).toBeTruthy();
    expect(verifyLocalDownload(token!, Date.now(), "test-secret")).toBeNull();
  });

  it("writes N4 draft lines without calling the file a served notice", () => {
    const lines = n4DraftLines({
      landlordName: "Avery Chen",
      tenantName: "Sam Okonkwo",
      unitLabel: "Lower",
      address: "18 King Street West, Hamilton ON L8P 1A1",
      asOf: "2026-10-15",
      totalOwingCents: 145000,
      periods: [{ periodStart: "2026-09-01", owingCents: 145000 }],
      suggestedTerminationDate: "2026-10-29",
    });
    expect(lines.join("\n")).toMatch(/DRAFT/);
    expect(lines.join("\n")).toMatch(/not been served/);
    expect(lines.join("\n")).toMatch(/Sam Okonkwo/);
  });
});

describe("landlord document storage", () => {
  let storage: ReturnType<typeof createMemoryStorage>;

  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
  });

  beforeEach(() => {
    storage = createMemoryStorage();
    setDocumentStorageForTests(storage);
  });

  afterAll(async () => {
    setDocumentStorageForTests(null);
    if (ownerIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: ownerIds } } });
    }
    await prisma.$disconnect();
  });

  async function uploadPdf(
    ownerId: string,
    subject: "property" | "unit" | "tenant" | "lease",
    subjectId: string,
    fileName: string,
    expiresOn: string | null = null,
    kind = "LEASE",
  ) {
    return uploadDocument(ownerId, {
      subject,
      subjectId,
      kind,
      fileName,
      bytes: pdfBytes(fileName),
      expiresOn,
    });
  }

  it("keeps a file inside the landlord who uploaded it", async () => {
    const alpha = await makeLandlord("Alpha");
    const beta = await makeLandlord("Beta");
    const saved = await uploadPdf(alpha.user.id, "property", alpha.property.id, "lease.pdf");
    expect(saved).not.toHaveProperty("storageKey");
    expect(storage.objects.has(storageKeyFor(alpha.user.id, saved.id))).toBe(true);

    const own = await listDocuments(alpha.user.id);
    expect(own.map((row) => row.id)).toEqual([saved.id]);
    const other = await listDocuments(beta.user.id);
    expect(other).toEqual([]);

    await expect(createDocumentLink(beta.user.id, saved.id)).rejects.toBeInstanceOf(ServiceError);
    await expect(deleteDocument(beta.user.id, saved.id)).rejects.toBeInstanceOf(ServiceError);
    expect(storage.objects.has(storageKeyFor(alpha.user.id, saved.id))).toBe(true);

    const link = await createDocumentLink(alpha.user.id, saved.id);
    expect(link.expiresInSeconds).toBe(SIGNED_URL_SECONDS);
    expect(link.url).toContain("/api/documents/local?token=");
    const response = await localDownload(new Request(link.url));
    expect(response.status).toBe(200);
    const body = new Uint8Array(await response.arrayBuffer());
    expect(String.fromCharCode(...body.slice(0, 4))).toBe("%PDF");

    await expect(
      uploadDocument(alpha.user.id, {
        subject: "property",
        subjectId: beta.property.id,
        kind: "OTHER",
        fileName: "nope.pdf",
        bytes: pdfBytes(),
        expiresOn: null,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("writes an audit row on upload and delete, and removes the bytes", async () => {
    const alpha = await makeLandlord("Audit");
    const saved = await uploadPdf(alpha.user.id, "lease", alpha.tenancyId, "policy.pdf", addDays(todayDateOnly(), 30), "INSURANCE");
    expect(saved.subject).toBe("lease");
    expect(saved.propertyId).toBe(alpha.property.id);
    expect(saved.tenantId).toBe(alpha.tenant.id);
    expect(saved.expiry).toBe("soon");

    const uploaded = await prisma.documentAuditLog.findFirst({
      where: { ownerId: alpha.user.id, documentId: saved.id, action: "UPLOAD" },
    });
    expect(uploaded?.summary).toMatch(/Uploaded policy.pdf/);

    await deleteDocument(alpha.user.id, saved.id);
    expect(storage.objects.size).toBe(0);
    expect(await prisma.document.count({ where: { id: saved.id } })).toBe(0);
    const deleted = await prisma.documentAuditLog.findFirst({
      where: { ownerId: alpha.user.id, action: "DELETE", fileName: "policy.pdf" },
    });
    expect(deleted?.summary).toMatch(/Deleted policy.pdf/);
  });

  it("lists upcoming and expired dates and hides a later date", async () => {
    const alpha = await makeLandlord("Expiry");
    const today = todayDateOnly();
    await uploadPdf(alpha.user.id, "tenant", alpha.tenant.id, "id.pdf", addDays(today, 10), "ID");
    await uploadPdf(alpha.user.id, "unit", alpha.unitId, "old.pdf", addDays(today, -2), "INSURANCE");
    await uploadPdf(
      alpha.user.id,
      "property",
      alpha.property.id,
      "later.pdf",
      addDays(today, EXPIRY_WINDOW_DAYS + 5),
      "OTHER",
    );
    const expiring = await listDocuments(alpha.user.id, { expiringOnly: true }, today);
    expect(expiring.map((row) => row.fileName).sort()).toEqual(["id.pdf", "old.pdf"]);
    const tenantDocs = await listDocuments(alpha.user.id, { tenantId: alpha.tenant.id });
    expect(tenantDocs.map((row) => row.fileName)).toContain("id.pdf");
    const tenantOnly = tenantDocs.find((row) => row.fileName === "id.pdf");
    expect(tenantOnly?.propertyId).toBeNull();
  });

  it("refuses to upload when storage is not configured", async () => {
    const alpha = await makeLandlord("Off");
    const unconfigured: DocumentStorage = {
      mode: "unconfigured",
      async put() {
        throw new Error("should not store");
      },
      async remove() {
        throw new Error("should not store");
      },
      async signedUrl() {
        throw new Error("should not store");
      },
      async read() {
        return null;
      },
    };
    setDocumentStorageForTests(unconfigured);
    await expect(
      uploadPdf(alpha.user.id, "property", alpha.property.id, "lease.pdf"),
    ).rejects.toMatchObject({ message: "Document storage is not configured." });
    expect(await prisma.document.count({ where: { ownerId: alpha.user.id } })).toBe(0);
  });

  it("saves a generated N4 PDF on the lease", async () => {
    const alpha = await makeLandlord("Notice");
    const saved = await saveN4DraftDocument(alpha.user.id, alpha.tenancyId);
    expect(saved.kind).toBe("NOTICE");
    expect(saved.noticeType).toBe("N4");
    expect(saved.tenancyId).toBe(alpha.tenancyId);
    expect(saved.fileName).toMatch(/^N4-draft-/);
    const bytes = storage.objects.get(storageKeyFor(alpha.user.id, saved.id));
    expect(bytes && String.fromCharCode(...bytes.slice(0, 4))).toBe("%PDF");
  });

  it("saves an existing notice PDF and a read token can open only that landlord's link", async () => {
    const alpha = await makeLandlord("McpA");
    const beta = await makeLandlord("McpB");
    const notice = await prisma.notice.create({
      data: {
        ownerId: alpha.user.id,
        tenancyId: alpha.tenancyId,
        type: "N4",
        status: "DRAFT",
        totalOwingCents: 100,
      },
    });
    const saved = await saveNoticePdf(alpha.user.id, notice.id);
    const read = await createAgentAccessToken({
      ownerId: alpha.user.id,
      name: "Reader",
      access: "read",
    });
    const other = await createAgentAccessToken({
      ownerId: beta.user.id,
      name: "Other",
      access: "read",
    });

    async function tool(secret: string, name: string, args: Record<string, unknown>) {
      const response = await handleMcpRequest(
        new Request("http://127.0.0.1:3000/api/mcp", {
          method: "POST",
          headers: {
            authorization: `Bearer ${secret}`,
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name, arguments: args },
          }),
        }),
      );
      const body = await response.json();
      const text = body.result?.content?.[0]?.text as string;
      return {
        isError: Boolean(body.result?.isError),
        data: body.result?.isError ? text : JSON.parse(text),
      };
    }

    const listed = await tool(read.secret, "list_documents", { tenancyId: alpha.tenancyId });
    expect(listed.isError).toBe(false);
    expect(listed.data.documents.map((row: { id: string }) => row.id)).toEqual([saved.id]);
    expect(JSON.stringify(listed.data)).not.toContain("storageKey");

    const link = await tool(read.secret, "get_document_link", { documentId: saved.id });
    expect(link.isError).toBe(false);
    expect(link.data.expiresInSeconds).toBe(SIGNED_URL_SECONDS);
    expect(link.data.url).toContain("token=");

    const denied = await tool(other.secret, "get_document_link", { documentId: saved.id });
    expect(denied.isError).toBe(true);
    expect(denied.data).toMatch(/not found/i);

    const hidden = await tool(other.secret, "list_documents", {});
    expect(hidden.data.documents).toEqual([]);
  });
});
