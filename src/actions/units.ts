"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { formString, parseUnit, type FormState } from "@/lib/validators";

async function ownedProperty(userId: string, propertyId: string) {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, ownerId: userId },
    select: { id: true },
  });
  if (!property) {
    notFound();
  }
  return property;
}

export async function createUnit(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const propertyId = formString(formData, "propertyId");
  await ownedProperty(user.id, propertyId);
  const parsed = parseUnit({
    label: formString(formData, "label"),
    bedrooms: formString(formData, "bedrooms"),
  });
  if (!parsed.ok) {
    return { errors: parsed.errors };
  }

  const unit = await prisma.unit.create({
    data: { propertyId, ...parsed.data },
  });
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/properties");
  revalidatePath(`/dashboard/properties/${propertyId}`);
  redirect(`/dashboard/properties/${propertyId}/units/${unit.id}`);
}

export async function updateUnit(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const propertyId = formString(formData, "propertyId");
  const unitId = formString(formData, "id");
  await ownedProperty(user.id, propertyId);
  const parsed = parseUnit({
    label: formString(formData, "label"),
    bedrooms: formString(formData, "bedrooms"),
  });
  if (!parsed.ok) {
    return { errors: parsed.errors };
  }

  const updated = await prisma.unit.updateMany({
    where: { id: unitId, propertyId, property: { ownerId: user.id } },
    data: parsed.data,
  });
  if (updated.count === 0) {
    notFound();
  }
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/properties");
  revalidatePath(`/dashboard/properties/${propertyId}`);
  redirect(`/dashboard/properties/${propertyId}/units/${unitId}`);
}

export async function deleteUnit(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (formString(formData, "confirm") !== "yes") {
    return { message: "Confirm that you want to delete this unit." };
  }
  const propertyId = formString(formData, "propertyId");
  const unitId = formString(formData, "id");
  const unit = await prisma.unit.findFirst({
    where: { id: unitId, propertyId, property: { ownerId: user.id } },
    include: { tenancies: { select: { tenantId: true } } },
  });
  if (!unit) {
    notFound();
  }
  const tenantIds = unit.tenancies.map((tenancy) => tenancy.tenantId);
  await prisma.unit.delete({ where: { id: unit.id } });
  if (tenantIds.length > 0) {
    await prisma.tenant.deleteMany({
      where: {
        id: { in: tenantIds },
        ownerId: user.id,
        tenancies: { none: {} },
      },
    });
  }
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/properties");
  revalidatePath(`/dashboard/properties/${propertyId}`);
  redirect(`/dashboard/properties/${propertyId}`);
}
