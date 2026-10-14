"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { formString, type FormState } from "@/lib/validators";
import { parseGuidelineForm } from "@/lib/rent-increase/parse";

export async function saveGuideline(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireUser();
  const parsed = parseGuidelineForm({
    year: formString(formData, "year"),
    percent: formString(formData, "percent"),
    sourceUrl: formString(formData, "sourceUrl"),
    verified: formData.get("verified"),
  });
  if (!parsed.ok) {
    return { errors: parsed.errors };
  }

  await prisma.rentGuideline.upsert({
    where: {
      province_year: { province: "ON", year: parsed.data.year },
    },
    create: {
      province: "ON",
      year: parsed.data.year,
      basisPoints: parsed.data.basisPoints,
      sourceUrl: parsed.data.sourceUrl,
      verified: parsed.data.verified,
    },
    update: {
      basisPoints: parsed.data.basisPoints,
      sourceUrl: parsed.data.sourceUrl,
      verified: parsed.data.verified,
    },
  });

  revalidatePath("/dashboard/settings/guidelines");
  revalidatePath("/dashboard/rent-increases");
  return { message: `Saved the ${parsed.data.year} Ontario guideline.` };
}
