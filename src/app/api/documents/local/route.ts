import { contentDisposition } from "@/lib/documents/files";
import { verifyLocalDownload } from "@/lib/documents/local-link";
import { getDocumentStorage } from "@/lib/documents/storage";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) {
    return new Response("Missing download token.", {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const claims = verifyLocalDownload(token);
  if (!claims) {
    return new Response("This download link has expired.", {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const document = await prisma.document.findFirst({
    where: {
      id: claims.documentId,
      ownerId: claims.ownerId,
      storageKey: claims.storageKey,
    },
    select: { fileName: true, mimeType: true, storageKey: true },
  });
  if (!document) {
    return new Response("That document was not found.", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const bytes = await getDocumentStorage().read(document.storageKey);
  if (!bytes) {
    return new Response("That document was not found.", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": document.mimeType ?? "application/octet-stream",
      "Content-Disposition": contentDisposition(document.fileName),
      "Cache-Control": "private, no-store",
    },
  });
}
