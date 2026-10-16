import { notFound, redirect } from "next/navigation";

import { requireUser } from "@/lib/dal";
import { STORAGE_NOT_CONFIGURED } from "@/lib/documents/catalog";
import { ServiceError } from "@/lib/services/errors";
import { createDocumentLink } from "@/lib/services/documents";

export async function GET(
  _request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  const user = await requireUser();
  const { documentId } = await context.params;
  let url: string;
  try {
    const link = await createDocumentLink(user.id, documentId);
    url = link.url;
  } catch (error) {
    if (error instanceof ServiceError && error.code === "not_found") {
      notFound();
    }
    const message = error instanceof ServiceError ? error.message : "The file could not be opened.";
    const status = message === STORAGE_NOT_CONFIGURED ? 503 : 400;
    return new Response(message, {
      status,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  redirect(url);
}
