"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/db";
import {
  formStrings,
  parseReminderSchedule,
  type FormState,
} from "@/lib/validators";

export async function saveReminderSchedule(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = parseReminderSchedule({
    offsetDays: formStrings(formData, "offsetDays"),
    enabled: formStrings(formData, "enabled"),
  });
  if (!parsed.ok) {
    return { errors: parsed.errors };
  }

  await prisma.$transaction([
    prisma.reminderRule.deleteMany({ where: { ownerId: user.id } }),
    prisma.reminderRule.createMany({
      data: parsed.data.rules.map((rule) => ({
        ownerId: user.id,
        offsetDays: rule.offsetDays,
        enabled: rule.enabled,
      })),
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { remindersConfigured: true },
    }),
  ]);

  revalidatePath("/dashboard/reminders");
  return {};
}
