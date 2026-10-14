"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { requireUser } from "@/lib/dal";
import { todayDateOnly } from "@/lib/dates";
import { ServiceError } from "@/lib/services/errors";
import { recordRentPayment } from "@/lib/services/rent";
import { formString, parsePayment, type FormState } from "@/lib/validators";

export async function recordPayment(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const today = todayDateOnly();
  const parsed = parsePayment(
    {
      tenancyId: formString(formData, "tenancyId"),
      paidOn: formString(formData, "paidOn"),
      amount: formString(formData, "amount"),
      method: formString(formData, "method"),
      referenceNumber: formString(formData, "referenceNumber"),
      note: formString(formData, "note"),
    },
    today,
  );
  if (!parsed.ok) {
    return { errors: parsed.errors };
  }

  let result: Awaited<ReturnType<typeof recordRentPayment>>;
  try {
    result = await recordRentPayment(user.id, parsed.data, today);
  } catch (error) {
    if (error instanceof ServiceError && error.code === "not_found") {
      notFound();
    }
    throw error;
  }

  if (result.outcome === "already_recorded") {
    return {
      errors: {
        referenceNumber: [
          "That e-Transfer reference is already on the ledger.",
        ],
      },
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/rent");
  revalidatePath("/dashboard/reminders");
  revalidatePath(`/dashboard/tenancies/${result.payment.tenancyId}/rent`);
  revalidatePath("/dashboard/properties");
  redirect(`/dashboard/payments/${result.payment.id}`);
}
