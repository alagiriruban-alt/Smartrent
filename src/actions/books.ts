"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import {
  correctChargeAmount,
  replacePropertyOwners,
  saveExpense,
  saveLedgerCharge,
  saveLegalCase,
  saveRentCredit,
  readLegalCase,
} from "@/lib/books-records";
import { requireUser } from "@/lib/dal";
import { parseMoneyToCents } from "@/lib/money";
import { parseOwnerLines } from "@/lib/shares";
import {
  commitImportBatch,
  reviewImportRow,
  stageImportBundle,
} from "@/lib/services/import-batch";
import { ServiceError } from "@/lib/services/errors";
import { formString, type FormState } from "@/lib/validators";

function fail(error: unknown): FormState {
  if (error instanceof ServiceError) {
    return { message: error.message };
  }
  throw error;
}

export async function createLedgerCharge(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const tenancyId = formString(formData, "tenancyId");
  const amountCents = parseMoneyToCents(formString(formData, "amount"));
  if (amountCents === null) {
    return { errors: { amount: ["Enter the amount in dollars, such as 67.93."] } };
  }
  try {
    await saveLedgerCharge({
      ownerId: user.id,
      tenancyId,
      kind: formString(formData, "kind"),
      period: formString(formData, "period") || null,
      description: formString(formData, "description"),
      amountCents,
      dueOn: formString(formData, "dueOn"),
      viaAgent: false,
    });
  } catch (error) {
    return fail(error);
  }
  revalidatePath(`/dashboard/tenancies/${tenancyId}/rent`);
  redirect(`/dashboard/tenancies/${tenancyId}/rent`);
}

export async function createRentCredit(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const tenancyId = formString(formData, "tenancyId");
  const amountCents = parseMoneyToCents(formString(formData, "amount"));
  const kind = formString(formData, "kind");
  if (amountCents === null) {
    return { errors: { amount: ["Enter the amount in dollars."] } };
  }
  if (kind !== "IN_KIND" && kind !== "OFFSET") {
    return { errors: { kind: ["Choose in-kind or an offset."] } };
  }
  try {
    await saveRentCredit({
      ownerId: user.id,
      tenancyId,
      amountCents,
      kind,
      reason: formString(formData, "reason"),
      documentId: formString(formData, "documentId") || null,
      period: formString(formData, "period") || null,
      effectiveOn: formString(formData, "effectiveOn"),
    });
  } catch (error) {
    return fail(error);
  }
  revalidatePath(`/dashboard/tenancies/${tenancyId}/rent`);
  redirect(`/dashboard/tenancies/${tenancyId}/rent`);
}

export async function createLegalCase(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const tenancyId = formString(formData, "tenancyId");
  try {
    const legal = readLegalCase({
      id: formString(formData, "id") || null,
      tenancyId,
      type: formString(formData, "type"),
      typeDetail: formString(formData, "typeDetail"),
      servedOn: formString(formData, "servedOn"),
      filedOn: formString(formData, "filedOn"),
      ltbFileNumber: formString(formData, "ltbFileNumber"),
      filingFee: formString(formData, "filingFee"),
      hearingOn: formString(formData, "hearingOn"),
      status: formString(formData, "status") || "OPEN",
      outcome: formString(formData, "outcome"),
      notes: formString(formData, "notes"),
    });
    await saveLegalCase({
      ownerId: user.id,
      legal,
      id: formString(formData, "id") || null,
      viaAgent: false,
      reason: formString(formData, "reason") || "Recorded on the lease",
    });
  } catch (error) {
    if (error instanceof ServiceError && error.code === "not_found") {
      notFound();
    }
    return fail(error);
  }
  revalidatePath(`/dashboard/tenancies/${tenancyId}/rent`);
  redirect(`/dashboard/tenancies/${tenancyId}/rent`);
}

export async function correctCharge(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const tenancyId = formString(formData, "tenancyId");
  const amountCents = parseMoneyToCents(formString(formData, "amount"));
  if (amountCents === null) {
    return { message: "Enter the corrected amount in dollars." };
  }
  try {
    await correctChargeAmount({
      ownerId: user.id,
      chargeId: formString(formData, "chargeId"),
      amountCents,
      reason: formString(formData, "reason"),
    });
  } catch (error) {
    return fail(error);
  }
  revalidatePath(`/dashboard/tenancies/${tenancyId}/rent`);
  redirect(`/dashboard/tenancies/${tenancyId}/rent`);
}

export async function createExpense(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const propertyId = formString(formData, "propertyId");
  const subtotalCents = parseMoneyToCents(formString(formData, "subtotal"));
  const hstCents = parseMoneyToCents(formString(formData, "hst"));
  if (subtotalCents === null || hstCents === null) {
    return { message: "Enter the subtotal and HST in dollars." };
  }
  try {
    await saveExpense({
      ownerId: user.id,
      propertyId,
      incurredOn: formString(formData, "incurredOn"),
      vendor: formString(formData, "vendor"),
      invoiceNumber: formString(formData, "invoiceNumber"),
      description: formString(formData, "description"),
      category: formString(formData, "category"),
      subtotalCents,
      hstCents,
      receiptDocumentId: formString(formData, "receiptDocumentId"),
    });
  } catch (error) {
    return fail(error);
  }
  revalidatePath(`/dashboard/properties/${propertyId}`);
  redirect(`/dashboard/properties/${propertyId}`);
}

export async function saveOwners(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const propertyId = formString(formData, "propertyId");
  const parsed = parseOwnerLines(formString(formData, "owners"));
  if (!parsed.ok) {
    return { message: parsed.message };
  }
  try {
    await replacePropertyOwners({
      ownerId: user.id,
      propertyId,
      owners: parsed.owners,
      reason: formString(formData, "reason"),
    });
  } catch (error) {
    return fail(error);
  }
  revalidatePath(`/dashboard/properties/${propertyId}`);
  redirect(`/dashboard/properties/${propertyId}`);
}

export async function stageImport(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const propertyId = formString(formData, "propertyId");
  try {
    const staged = await stageImportBundle({
      ownerId: user.id,
      propertyId,
      sourceName: formString(formData, "sourceName") || "bundle",
      raw: formString(formData, "raw"),
    });
    revalidatePath(`/dashboard/properties/${propertyId}/import`);
    redirect(`/dashboard/properties/${propertyId}/import?batch=${staged.batchId}`);
  } catch (error) {
    return fail(error);
  }
}

export async function reviewImport(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const propertyId = formString(formData, "propertyId");
  const batchId = formString(formData, "batchId");
  const status = formString(formData, "status");
  if (status !== "APPROVED" && status !== "REJECTED" && status !== "PENDING") {
    return { message: "Choose approve or reject." };
  }
  try {
    await reviewImportRow({
      ownerId: user.id,
      rowId: formString(formData, "rowId"),
      status,
      periodOverride: formString(formData, "periodOverride") || null,
    });
  } catch (error) {
    return fail(error);
  }
  revalidatePath(`/dashboard/properties/${propertyId}/import`);
  redirect(`/dashboard/properties/${propertyId}/import?batch=${batchId}`);
}

export async function commitImport(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const propertyId = formString(formData, "propertyId");
  const batchId = formString(formData, "batchId");
  try {
    await commitImportBatch(user.id, batchId);
  } catch (error) {
    return fail(error);
  }
  revalidatePath(`/dashboard/properties/${propertyId}/import`);
  revalidatePath(`/dashboard/properties/${propertyId}`);
  redirect(`/dashboard/properties/${propertyId}/import?batch=${batchId}`);
}
