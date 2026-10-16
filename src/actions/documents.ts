"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/dal";
import {
  MAX_DOCUMENT_BYTES,
  type DocumentSubjectName,
} from "@/lib/documents/catalog";
import { ServiceError } from "@/lib/services/errors";
import {
  deleteDocument,
  getDocument,
  saveN4DraftDocument,
  saveNoticePdf,
  uploadDocument,
  type DocumentView,
} from "@/lib/services/documents";
import { formString, type FieldErrors } from "@/lib/validators";

export type DocumentFormState = {
  message?: string;
  errors?: FieldErrors;
  documentId?: string;
};

function revalidateDocument(doc: Pick<DocumentView, "propertyId" | "unitId" | "tenancyId" | "noticeId">) {
  revalidatePath("/dashboard/documents");
  if (doc.propertyId) {
    revalidatePath(`/dashboard/properties/${doc.propertyId}`);
    if (doc.unitId) {
      revalidatePath(`/dashboard/properties/${doc.propertyId}/units/${doc.unitId}`);
    }
  }
  if (doc.tenancyId) {
    revalidatePath(`/dashboard/tenancies/${doc.tenancyId}/edit`);
    revalidatePath(`/dashboard/tenancies/${doc.tenancyId}/rent`);
    if (doc.noticeId) {
      revalidatePath(`/dashboard/tenancies/${doc.tenancyId}/notices/${doc.noticeId}`);
    }
  }
}

function parseTarget(value: string): { subject: DocumentSubjectName; subjectId: string } | null {
  const match = /^(property|unit|tenant|lease):([A-Za-z0-9_-]+)$/.exec(value.trim());
  if (!match) {
    return null;
  }
  return { subject: match[1] as DocumentSubjectName, subjectId: match[2] };
}

function failure(error: unknown): DocumentFormState | null {
  if (error instanceof ServiceError) {
    return { message: error.message };
  }
  return null;
}

export async function uploadDocumentAction(
  _prev: DocumentFormState,
  formData: FormData,
): Promise<DocumentFormState> {
  const user = await requireUser();
  const target = parseTarget(formString(formData, "target"));
  if (!target) {
    return { errors: { target: ["Choose what this file is attached to."] } };
  }
  const expiresOn = formString(formData, "expiresOn");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { errors: { file: ["Choose a file."] } };
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return { errors: { file: ["Each file must be 10 MB or smaller."] } };
  }
  try {
    const saved = await uploadDocument(user.id, {
      subject: target.subject,
      subjectId: target.subjectId,
      kind: formString(formData, "kind"),
      fileName: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
      expiresOn: expiresOn || null,
    });
    revalidateDocument(saved);
    return { documentId: saved.id, message: `Saved ${saved.fileName}.` };
  } catch (error) {
    const known = failure(error);
    if (known) {
      return known;
    }
    throw error;
  }
}

export async function deleteDocumentAction(
  _prev: DocumentFormState,
  formData: FormData,
): Promise<DocumentFormState> {
  const user = await requireUser();
  if (formString(formData, "confirm") !== "yes") {
    return { message: "Confirm that you want to delete this file." };
  }
  const id = formString(formData, "id");
  const existing = await getDocument(user.id, id);
  if (!existing) {
    notFound();
  }
  try {
    await deleteDocument(user.id, id);
  } catch (error) {
    const known = failure(error);
    if (known) {
      return known;
    }
    throw error;
  }
  revalidateDocument(existing);
  return {};
}

export async function saveNoticeCopyAction(
  _prev: DocumentFormState,
  formData: FormData,
): Promise<DocumentFormState> {
  const user = await requireUser();
  const noticeId = formString(formData, "noticeId");
  try {
    const saved = await saveNoticePdf(user.id, noticeId);
    revalidateDocument(saved);
    return { documentId: saved.id, message: `Saved ${saved.fileName} in Documents.` };
  } catch (error) {
    const known = failure(error);
    if (known) {
      return known;
    }
    throw error;
  }
}

export async function saveN4CopyAction(
  _prev: DocumentFormState,
  formData: FormData,
): Promise<DocumentFormState> {
  const user = await requireUser();
  const tenancyId = formString(formData, "tenancyId");
  try {
    const saved = await saveN4DraftDocument(user.id, tenancyId);
    revalidateDocument(saved);
    return { documentId: saved.id, message: `Saved ${saved.fileName} in Documents.` };
  } catch (error) {
    const known = failure(error);
    if (known) {
      return known;
    }
    throw error;
  }
}
