"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { requireUser } from "@/lib/dal";
import { dateOnlyToUtc, todayDateOnly } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { syncTenancyLedger } from "@/lib/rent-sync";
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

  const tenancy = await prisma.tenancy.findFirst({
    where: {
      id: parsed.data.tenancyId,
      unit: { property: { ownerId: user.id } },
    },
    select: {
      id: true,
      leaseStart: true,
      leaseEnd: true,
      monthlyRentCents: true,
      rentDueDay: true,
      unit: { select: { propertyId: true } },
    },
  });
  if (!tenancy) {
    notFound();
  }

  const payment = await prisma.$transaction(async (tx) => {
    await syncTenancyLedger(tx, tenancy, today);
    const created = await tx.rentPayment.create({
      data: {
        ownerId: user.id,
        tenancyId: tenancy.id,
        amountCents: parsed.data.amountCents,
        paidOn: dateOnlyToUtc(parsed.data.paidOn),
        method: parsed.data.method,
        referenceNumber: parsed.data.referenceNumber,
        note: parsed.data.note,
      },
    });
    await syncTenancyLedger(tx, tenancy, today);
    return created;
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/rent");
  revalidatePath("/dashboard/reminders");
  revalidatePath(`/dashboard/tenancies/${tenancy.id}/rent`);
  revalidatePath(`/dashboard/properties/${tenancy.unit.propertyId}`);
  redirect(`/dashboard/payments/${payment.id}`);
}
