"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect, unstable_rethrow } from "next/navigation";

import { requireUser } from "@/lib/dal";
import { formString, type FieldErrors } from "@/lib/validators";
import {
  parseRentIncreaseForm,
  type IncreaseFormState,
} from "@/lib/rent-increase/parse";
import { warningKey } from "@/lib/rent-increase/calculate";
import { assessRentIncrease, saveRentIncreaseDraft } from "@/lib/services/rent-increase";
import { ServiceError } from "@/lib/services/errors";

export async function createRentIncreaseDraft(
  _prev: IncreaseFormState,
  formData: FormData,
): Promise<IncreaseFormState> {
  const user = await requireUser();
  const tenancyId = formString(formData, "tenancyId");
  const parsed = parseRentIncreaseForm({
    effectiveOn: formString(formData, "effectiveOn"),
    newRent: formString(formData, "newRent"),
  });
  if (!parsed.ok) {
    return { errors: parsed.errors };
  }

  const assessed = await assessRentIncrease(user.id, {
    tenancyId,
    effectiveOn: parsed.data.effectiveOn,
    newRentCents: parsed.data.newRentCents,
  });
  if (assessed.status === "not_found") {
    notFound();
  }
  if (assessed.status !== "ready") {
    const errors: FieldErrors | undefined =
      assessed.status === "invalid" ? { newRent: [assessed.message] } : undefined;
    return { message: assessed.message, errors };
  }
  if (
    assessed.warnings.length > 0 &&
    (formString(formData, "acknowledge") !== "yes" ||
      formString(formData, "acceptedWarnings") !== warningKey(assessed.warnings))
  ) {
    return {
      message: "Read the warnings, then save the draft.",
      warnings: assessed.warnings,
    };
  }

  try {
    const saved = await saveRentIncreaseDraft(user.id, {
      tenancyId,
      effectiveOn: parsed.data.effectiveOn,
      newRentCents: parsed.data.newRentCents,
    });
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/rent-increases");
    redirect(`/dashboard/tenancies/${tenancyId}/notices/${saved.noticeId}`);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ServiceError) {
      return { message: error.message };
    }
    throw error;
  }
}
