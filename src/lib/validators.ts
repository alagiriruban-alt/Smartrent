import { z } from "zod";

import { isIsoDate } from "@/lib/dates";
import { parseCadToCents } from "@/lib/money";
import { isPaymentMethod, type RentPaymentMethod } from "@/lib/payment-methods";
import { normalizePostalCode } from "@/lib/postal";
import { isProvinceCode, type ProvinceCode } from "@/lib/provinces";

export type FieldErrors = Record<string, string[] | undefined>;

export type FormState = {
  message?: string;
  errors?: FieldErrors;
};

type Parsed<T> =
  | { ok: true; data: T }
  | { ok: false; errors: FieldErrors };

function failure(error: z.ZodError): Parsed<never> {
  return { ok: false, errors: error.flatten().fieldErrors };
}

const nameSchema = z
  .string()
  .trim()
  .min(2, { error: "Enter at least 2 characters." })
  .max(80, { error: "Use 80 characters or fewer." });

const emailSchema = z.email({ error: "Enter a valid email address." });

const passwordSchema = z
  .string()
  .min(8, { error: "Use at least 8 characters." })
  .regex(/[A-Za-z]/, { error: "Include at least one letter." })
  .regex(/[0-9]/, { error: "Include at least one number." });

export const signupSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    error: "Those passwords do not match.",
  });

export function parseSignup(input: {
  name: unknown;
  email: unknown;
  password: unknown;
  confirmPassword: unknown;
}): Parsed<{ name: string; email: string; password: string }> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) {
    return failure(parsed.error);
  }
  return {
    ok: true,
    data: {
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase(),
      password: parsed.data.password,
    },
  };
}

export function parseLogin(input: {
  email: unknown;
  password: unknown;
}): Parsed<{ email: string; password: string }> {
  const parsed = z
    .object({
      email: emailSchema,
      password: z.string().min(1, { error: "Enter your password." }),
    })
    .safeParse(input);
  if (!parsed.success) {
    return failure(parsed.error);
  }
  return {
    ok: true,
    data: {
      email: parsed.data.email.toLowerCase(),
      password: parsed.data.password,
    },
  };
}

export type PropertyInput = {
  name: string | null;
  streetAddress: string;
  city: string;
  province: ProvinceCode;
  postalCode: string;
};

export function parseProperty(input: {
  name: unknown;
  streetAddress: unknown;
  city: unknown;
  province: unknown;
  postalCode: unknown;
}): Parsed<PropertyInput> {
  const parsed = z
    .object({
      name: z.string().trim().max(80, { error: "Use 80 characters or fewer." }),
      streetAddress: z
        .string()
        .trim()
        .min(3, { error: "Enter the street address." })
        .max(120, { error: "Use 120 characters or fewer." }),
      city: z
        .string()
        .trim()
        .min(2, { error: "Enter the city." })
        .max(80, { error: "Use 80 characters or fewer." }),
      province: z.string(),
      postalCode: z.string(),
    })
    .safeParse(input);
  if (!parsed.success) {
    return failure(parsed.error);
  }

  const errors: FieldErrors = {};
  if (!isProvinceCode(parsed.data.province)) {
    errors.province = ["Choose a province or territory."];
  }
  const postalCode = normalizePostalCode(parsed.data.postalCode);
  if (!postalCode) {
    errors.postalCode = ["Enter a postal code like A1A 1A1."];
  }
  if (Object.keys(errors).length > 0 || !isProvinceCode(parsed.data.province) || !postalCode) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      name: parsed.data.name.length > 0 ? parsed.data.name : null,
      streetAddress: parsed.data.streetAddress,
      city: parsed.data.city,
      province: parsed.data.province,
      postalCode,
    },
  };
}

export type UnitInput = {
  label: string;
  bedrooms: number | null;
};

export function parseUnit(input: {
  label: unknown;
  bedrooms: unknown;
}): Parsed<UnitInput> {
  const parsed = z
    .object({
      label: z
        .string()
        .trim()
        .min(1, { error: "Name the unit, such as Upper or Unit 2." })
        .max(40, { error: "Use 40 characters or fewer." }),
      bedrooms: z.string(),
    })
    .safeParse(input);
  if (!parsed.success) {
    return failure(parsed.error);
  }

  const rawBedrooms = parsed.data.bedrooms.trim();
  if (rawBedrooms.length === 0) {
    return { ok: true, data: { label: parsed.data.label, bedrooms: null } };
  }
  if (!/^\d{1,2}$/.test(rawBedrooms)) {
    return {
      ok: false,
      errors: { bedrooms: ["Enter a whole number from 0 to 20, or leave it blank."] },
    };
  }
  const bedrooms = Number(rawBedrooms);
  if (bedrooms > 20) {
    return {
      ok: false,
      errors: { bedrooms: ["Enter a whole number from 0 to 20, or leave it blank."] },
    };
  }
  return { ok: true, data: { label: parsed.data.label, bedrooms } };
}

const phoneSchema = z
  .string()
  .trim()
  .refine((value) => value.length === 0 || /^[0-9+().\-\s]{7,20}$/.test(value), {
    error: "Enter a phone number, or leave it blank.",
  });

export type TenantInput = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  leaseStart: string;
  leaseEnd: string | null;
  monthlyRentCents: number;
  rentDueDay: number;
};

export function parseTenant(input: {
  firstName: unknown;
  lastName: unknown;
  email: unknown;
  phone: unknown;
  leaseStart: unknown;
  leaseEnd: unknown;
  monthlyRent: unknown;
  rentDueDay: unknown;
}): Parsed<TenantInput> {
  const parsed = z
    .object({
      firstName: z
        .string()
        .trim()
        .min(1, { error: "Enter a first name." })
        .max(60, { error: "Use 60 characters or fewer." }),
      lastName: z
        .string()
        .trim()
        .min(1, { error: "Enter a last name." })
        .max(60, { error: "Use 60 characters or fewer." }),
      email: z.string().trim(),
      phone: phoneSchema,
      leaseStart: z.string().trim(),
      leaseEnd: z.string().trim(),
      monthlyRent: z.string().trim(),
      rentDueDay: z.string().trim(),
    })
    .safeParse(input);
  if (!parsed.success) {
    return failure(parsed.error);
  }

  const errors: FieldErrors = {};
  let email: string | null = null;
  if (parsed.data.email.length > 0) {
    const emailParsed = emailSchema.safeParse(parsed.data.email);
    if (!emailParsed.success) {
      errors.email = ["Enter a valid email, or leave it blank."];
    } else {
      email = emailParsed.data.toLowerCase();
    }
  }

  if (!isIsoDate(parsed.data.leaseStart)) {
    errors.leaseStart = ["Enter the lease start date."];
  }
  let leaseEnd: string | null = null;
  if (parsed.data.leaseEnd.length > 0) {
    if (!isIsoDate(parsed.data.leaseEnd)) {
      errors.leaseEnd = ["Enter a real end date, or leave it blank for month-to-month."];
    } else if (
      isIsoDate(parsed.data.leaseStart) &&
      parsed.data.leaseEnd < parsed.data.leaseStart
    ) {
      errors.leaseEnd = ["The end date must be on or after the start date."];
    } else {
      leaseEnd = parsed.data.leaseEnd;
    }
  }

  const monthlyRentCents = parseCadToCents(parsed.data.monthlyRent);
  if (monthlyRentCents === null) {
    errors.monthlyRent = ["Enter a rent amount from $0.00 to $100,000.00."];
  }

  if (!/^\d{1,2}$/.test(parsed.data.rentDueDay)) {
    errors.rentDueDay = ["Choose a day from the 1st to the 31st."];
  } else {
    const day = Number(parsed.data.rentDueDay);
    if (day < 1 || day > 31) {
      errors.rentDueDay = ["Choose a day from the 1st to the 31st."];
    }
  }

  if (
    Object.keys(errors).length > 0 ||
    monthlyRentCents === null ||
    !isIsoDate(parsed.data.leaseStart)
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      email,
      phone: parsed.data.phone.length > 0 ? parsed.data.phone : null,
      leaseStart: parsed.data.leaseStart,
      leaseEnd,
      monthlyRentCents,
      rentDueDay: Number(parsed.data.rentDueDay),
    },
  };
}

export function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export function formStrings(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .filter((value): value is string => typeof value === "string");
}

export type PaymentInput = {
  tenancyId: string;
  paidOn: string;
  amountCents: number;
  method: RentPaymentMethod;
  referenceNumber: string | null;
  note: string | null;
};

export function parsePayment(
  input: {
    tenancyId: unknown;
    paidOn: unknown;
    amount: unknown;
    method: unknown;
    referenceNumber: unknown;
    note: unknown;
  },
  today: string,
): Parsed<PaymentInput> {
  const tenancyId = typeof input.tenancyId === "string" ? input.tenancyId.trim() : "";
  const paidOn = typeof input.paidOn === "string" ? input.paidOn.trim() : "";
  const amount = typeof input.amount === "string" ? input.amount.trim() : "";
  const method = typeof input.method === "string" ? input.method.trim() : "";
  const reference =
    typeof input.referenceNumber === "string" ? input.referenceNumber.trim() : "";
  const note = typeof input.note === "string" ? input.note.trim() : "";
  const errors: FieldErrors = {};

  if (!tenancyId) {
    errors.tenancyId = ["Choose the lease this payment belongs to."];
  }
  if (!isIsoDate(paidOn)) {
    errors.paidOn = ["Enter the date you received the money."];
  } else if (paidOn > today) {
    errors.paidOn = ["The payment date cannot be in the future."];
  }
  const amountCents = parseCadToCents(amount);
  if (amountCents === null || amountCents <= 0) {
    errors.amount = ["Enter an amount from $0.01 to $100,000.00."];
  }
  if (!isPaymentMethod(method)) {
    errors.method = ["Choose how the tenant paid."];
  }
  if (reference.length > 40) {
    errors.referenceNumber = ["Use 40 characters or fewer."];
  }
  if (note.length > 500) {
    errors.note = ["Use 500 characters or fewer."];
  }
  if (Object.keys(errors).length > 0 || amountCents === null || !isPaymentMethod(method)) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    data: {
      tenancyId,
      paidOn,
      amountCents,
      method,
      referenceNumber: reference.length > 0 ? reference : null,
      note: note.length > 0 ? note : null,
    },
  };
}

function parseOffset(value: string): number | null {
  if (!/^-?\d{1,3}$/.test(value.trim())) {
    return null;
  }
  const offset = Number(value);
  if (!Number.isInteger(offset) || offset < -60 || offset > 90) {
    return null;
  }
  return offset;
}

export function parseReminderSchedule(input: {
  offsetDays: string[];
  enabled: string[];
}): Parsed<{ rules: { offsetDays: number; enabled: boolean }[] }> {
  const enabled = new Set(
    input.enabled
      .map((value) => parseOffset(value))
      .filter((value): value is number => value !== null),
  );
  const rules: { offsetDays: number; enabled: boolean }[] = [];
  const seen = new Set<number>();
  for (const value of input.offsetDays) {
    const offset = parseOffset(value);
    if (offset === null) {
      return {
        ok: false,
        errors: {
          offsetDays: ["Use a whole number of days from 60 before to 90 after."],
        },
      };
    }
    if (seen.has(offset)) {
      return {
        ok: false,
        errors: { offsetDays: ["That reminder is already on the schedule."] },
      };
    }
    seen.add(offset);
    rules.push({ offsetDays: offset, enabled: enabled.has(offset) });
  }
  return { ok: true, data: { rules } };
}
