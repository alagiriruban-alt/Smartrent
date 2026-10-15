"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/dal";
import { ownedWhere } from "@/lib/ownership";
import { formString, parseProperty, type FormState } from "@/lib/validators";

function propertyFields(formData: FormData) {
  return {
    name: formString(formData, "name"),
    streetAddress: formString(formData, "streetAddress"),
    city: formString(formData, "city"),
    province: formString(formData, "province"),
    jurisdiction: formString(formData, "jurisdiction"),
    postalCode: formString(formData, "postalCode"),
  };
}

export async function createProperty(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = parseProperty(propertyFields(formData));
  if (!parsed.ok) {
    return { errors: parsed.errors };
  }

  const property = await prisma.property.create({
    data: { ownerId: user.id, ...parsed.data },
  });
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/properties");
  redirect(`/dashboard/properties/${property.id}`);
}

export async function updateProperty(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const id = formString(formData, "id");
  const parsed = parseProperty(propertyFields(formData));
  if (!parsed.ok) {
    return { errors: parsed.errors };
  }

  const updated = await prisma.property.updateMany({
    where: ownedWhere(user.id, id),
    data: parsed.data,
  });
  if (updated.count === 0) {
    notFound();
  }
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/properties");
  revalidatePath(`/dashboard/properties/${id}`);
  redirect(`/dashboard/properties/${id}`);
}

export async function deleteProperty(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (formString(formData, "confirm") !== "yes") {
    return { message: "Confirm that you want to delete this property." };
  }
  const id = formString(formData, "id");
  const property = await prisma.property.findFirst({
    where: ownedWhere(user.id, id),
    include: {
      units: { include: { tenancies: { select: { tenantId: true } } } },
    },
  });
  if (!property) {
    notFound();
  }
  const tenantIds = property.units.flatMap((unit) =>
    unit.tenancies.map((tenancy) => tenancy.tenantId),
  );
  await prisma.property.delete({ where: { id: property.id } });
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
  redirect("/dashboard/properties");
}
