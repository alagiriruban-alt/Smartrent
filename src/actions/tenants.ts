"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { requireUser } from "@/lib/dal";
import { dateOnlyToUtc, rangesOverlap, utcToDateOnly } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { purgeOwnedDocuments } from "@/lib/services/documents";
import { formString, parseTenant, type FormState } from "@/lib/validators";

function tenantFields(formData: FormData) {
  return {
    firstName: formString(formData, "firstName"),
    lastName: formString(formData, "lastName"),
    email: formString(formData, "email"),
    phone: formString(formData, "phone"),
    leaseStart: formString(formData, "leaseStart"),
    leaseEnd: formString(formData, "leaseEnd"),
    monthlyRent: formString(formData, "monthlyRent"),
    rentDueDay: formString(formData, "rentDueDay"),
    moveInOn: formString(formData, "moveInOn"),
    lastIncreaseOn: formString(formData, "lastIncreaseOn"),
    lastIncreaseAmount: formString(formData, "lastIncreaseAmount"),
    guidelineExempt: formData.get("guidelineExempt"),
    exemptionEvidence: formString(formData, "exemptionEvidence"),
  };
}

async function ownedUnit(userId: string, propertyId: string, unitId: string) {
  const unit = await prisma.unit.findFirst({
    where: {
      id: unitId,
      propertyId,
      property: { ownerId: userId },
    },
    include: { tenancies: true },
  });
  if (!unit) {
    notFound();
  }
  return unit;
}

export async function createTenant(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const propertyId = formString(formData, "propertyId");
  const unitId = formString(formData, "unitId");
  const unit = await ownedUnit(user.id, propertyId, unitId);
  const parsed = parseTenant(tenantFields(formData));
  if (!parsed.ok) {
    return { errors: parsed.errors };
  }

  const nextRange = { start: parsed.data.leaseStart, end: parsed.data.leaseEnd };
  const overlaps = unit.tenancies.some((tenancy) =>
    rangesOverlap(nextRange, {
      start: utcToDateOnly(tenancy.leaseStart),
      end: tenancy.leaseEnd ? utcToDateOnly(tenancy.leaseEnd) : null,
    }),
  );
  if (overlaps) {
    return {
      errors: {
        leaseStart: ["Those dates overlap another lease on this unit."],
      },
    };
  }

  await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        ownerId: user.id,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        email: parsed.data.email,
        phone: parsed.data.phone,
      },
    });
    await tx.unit.update({
      where: { id: unit.id },
      data: {
        guidelineExempt: parsed.data.guidelineExempt,
        exemptionEvidence: parsed.data.exemptionEvidence,
      },
    });
    await tx.tenancy.create({
      data: {
        unitId: unit.id,
        tenantId: tenant.id,
        leaseStart: dateOnlyToUtc(parsed.data.leaseStart),
        leaseEnd: parsed.data.leaseEnd
          ? dateOnlyToUtc(parsed.data.leaseEnd)
          : null,
        monthlyRentCents: parsed.data.monthlyRentCents,
        rentDueDay: parsed.data.rentDueDay,
        moveInOn: dateOnlyToUtc(parsed.data.moveInOn),
        lastIncreaseOn: parsed.data.lastIncreaseOn
          ? dateOnlyToUtc(parsed.data.lastIncreaseOn)
          : null,
        lastIncreaseCents: parsed.data.lastIncreaseCents,
      },
    });
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/properties");
  revalidatePath(`/dashboard/properties/${propertyId}`);
  redirect(`/dashboard/properties/${propertyId}/units/${unitId}`);
}

export async function updateTenant(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const tenancyId = formString(formData, "tenancyId");
  const tenancy = await prisma.tenancy.findFirst({
    where: { id: tenancyId, unit: { property: { ownerId: user.id } } },
    include: { unit: { include: { tenancies: true } }, tenant: true },
  });
  if (!tenancy || tenancy.tenant.ownerId !== user.id) {
    notFound();
  }
  const parsed = parseTenant(tenantFields(formData));
  if (!parsed.ok) {
    return { errors: parsed.errors };
  }

  const nextRange = { start: parsed.data.leaseStart, end: parsed.data.leaseEnd };
  const overlaps = tenancy.unit.tenancies.some(
    (other) =>
      other.id !== tenancy.id &&
      rangesOverlap(nextRange, {
        start: utcToDateOnly(other.leaseStart),
        end: other.leaseEnd ? utcToDateOnly(other.leaseEnd) : null,
      }),
  );
  if (overlaps) {
    return {
      errors: {
        leaseStart: ["Those dates overlap another lease on this unit."],
      },
    };
  }

  await prisma.$transaction([
    prisma.tenant.update({
      where: { id: tenancy.tenantId },
      data: {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        email: parsed.data.email,
        phone: parsed.data.phone,
      },
    }),
    prisma.unit.update({
      where: { id: tenancy.unitId },
      data: {
        guidelineExempt: parsed.data.guidelineExempt,
        exemptionEvidence: parsed.data.exemptionEvidence,
      },
    }),
    prisma.tenancy.update({
      where: { id: tenancy.id },
      data: {
        leaseStart: dateOnlyToUtc(parsed.data.leaseStart),
        leaseEnd: parsed.data.leaseEnd
          ? dateOnlyToUtc(parsed.data.leaseEnd)
          : null,
        monthlyRentCents: parsed.data.monthlyRentCents,
        rentDueDay: parsed.data.rentDueDay,
        moveInOn: dateOnlyToUtc(parsed.data.moveInOn),
        lastIncreaseOn: parsed.data.lastIncreaseOn
          ? dateOnlyToUtc(parsed.data.lastIncreaseOn)
          : null,
        lastIncreaseCents: parsed.data.lastIncreaseCents,
      },
    }),
  ]);

  const propertyId = tenancy.unit.propertyId;
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/properties");
  revalidatePath(`/dashboard/properties/${propertyId}`);
  redirect(`/dashboard/properties/${propertyId}/units/${tenancy.unitId}`);
}

export async function deleteTenant(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (formString(formData, "confirm") !== "yes") {
    return { message: "Confirm that you want to remove this tenant." };
  }
  const tenancyId = formString(formData, "id");
  const tenancy = await prisma.tenancy.findFirst({
    where: { id: tenancyId, unit: { property: { ownerId: user.id } } },
    include: { unit: true, tenant: true },
  });
  if (!tenancy) {
    notFound();
  }
  await purgeOwnedDocuments(user.id, { tenancyId: tenancy.id });
  const otherLeases = await prisma.tenancy.count({
    where: { tenantId: tenancy.tenantId, NOT: { id: tenancy.id } },
  });
  if (otherLeases === 0) {
    await purgeOwnedDocuments(user.id, { tenantId: tenancy.tenantId, tenancyId: null });
  }
  await prisma.tenancy.delete({ where: { id: tenancy.id } });
  await prisma.tenant.deleteMany({
    where: {
      id: tenancy.tenantId,
      ownerId: user.id,
      tenancies: { none: {} },
    },
  });
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/properties");
  revalidatePath(`/dashboard/properties/${tenancy.unit.propertyId}`);
  redirect(
    `/dashboard/properties/${tenancy.unit.propertyId}/units/${tenancy.unitId}`,
  );
}
