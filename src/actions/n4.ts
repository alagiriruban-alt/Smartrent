"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect, unstable_rethrow } from "next/navigation";

import { requireUser } from "@/lib/dal";
import { isIsoDate } from "@/lib/dates";
import {
  isN4ServiceMethod,
  isRentFrequency,
  type N4ServiceMethod,
  type RentFrequency,
} from "@/lib/n4/rules";
import { ServiceError } from "@/lib/services/errors";
import {
  confirmN4ForLandlord,
  recordN4ServiceForLandlord,
  saveN4ForLandlord,
  type N4DraftInput,
} from "@/lib/services/n4";
import { formString, type FormState } from "@/lib/validators";

function refresh(tenancyId: string, noticeId?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/rent");
  revalidatePath(`/dashboard/tenancies/${tenancyId}/rent`);
  revalidatePath(`/dashboard/tenancies/${tenancyId}/n4`);
  if (noticeId) {
    revalidatePath(`/dashboard/tenancies/${tenancyId}/notices/${noticeId}`);
  }
}

function readDraft(formData: FormData): { ok: true; input: N4DraftInput } | { ok: false; state: FormState } {
  const tenancyId = formString(formData, "tenancyId");
  const noticeId = formString(formData, "noticeId").trim();
  const givenOn = formString(formData, "givenOn");
  const terminationDate = formString(formData, "terminationDate");
  const serviceMethod = formString(formData, "serviceMethod");
  const rentFrequency = formString(formData, "rentFrequency");
  const errors: FormState["errors"] = {};
  if (!isIsoDate(givenOn)) {
    errors.givenOn = ["Enter the day you will give the notice."];
  }
  if (!isIsoDate(terminationDate)) {
    errors.terminationDate = ["Enter the termination date."];
  }
  if (!isN4ServiceMethod(serviceMethod)) {
    errors.serviceMethod = ["Choose how you will give the notice."];
  }
  if (!isRentFrequency(rentFrequency)) {
    errors.rentFrequency = ["Choose how often rent is paid."];
  }
  if (!tenancyId) {
    return { ok: false, state: { message: "That lease was not found." } };
  }
  if (Object.keys(errors).length > 0) {
    return { ok: false, state: { errors } };
  }
  return {
    ok: true,
    input: {
      tenancyId,
      noticeId: noticeId.length > 0 ? noticeId : null,
      givenOn,
      terminationDate,
      serviceMethod: serviceMethod as N4ServiceMethod,
      rentFrequency: rentFrequency as RentFrequency,
      landlordName: formString(formData, "landlordName"),
      landlordContact: formString(formData, "landlordContact"),
      tenantNames: formString(formData, "tenantNames"),
      unitAddress: formString(formData, "unitAddress"),
    },
  };
}

export async function saveN4DraftAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = readDraft(formData);
  if (!parsed.ok) {
    return parsed.state;
  }
  try {
    const saved = await saveN4ForLandlord(user.id, parsed.input);
    refresh(parsed.input.tenancyId, saved.noticeId);
    redirect(`/dashboard/tenancies/${parsed.input.tenancyId}/notices/${saved.noticeId}`);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ServiceError) {
      if (error.code === "not_found") {
        notFound();
      }
      return { message: error.message };
    }
    throw error;
  }
}

export async function confirmN4Action(formData: FormData): Promise<void> {
  const user = await requireUser();
  const tenancyId = formString(formData, "tenancyId");
  const noticeId = formString(formData, "noticeId");
  try {
    await confirmN4ForLandlord(user.id, noticeId);
    refresh(tenancyId, noticeId);
    redirect(`/dashboard/tenancies/${tenancyId}/notices/${noticeId}`);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ServiceError && error.code === "not_found") {
      notFound();
    }
    throw error;
  }
}

export async function recordN4ServiceAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const tenancyId = formString(formData, "tenancyId");
  const noticeId = formString(formData, "noticeId");
  const servedOn = formString(formData, "servedOn");
  const serviceMethod = formString(formData, "serviceMethod");
  if (!isIsoDate(servedOn)) {
    return { errors: { servedOn: ["Enter the day you gave the notice."] } };
  }
  if (!isN4ServiceMethod(serviceMethod)) {
    return { errors: { serviceMethod: ["Choose how you gave the notice."] } };
  }
  try {
    await recordN4ServiceForLandlord(user.id, { noticeId, servedOn, serviceMethod });
    refresh(tenancyId, noticeId);
    redirect(`/dashboard/tenancies/${tenancyId}/notices/${noticeId}`);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ServiceError) {
      if (error.code === "not_found") {
        notFound();
      }
      return { message: error.message };
    }
    throw error;
  }
}
