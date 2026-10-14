import { dateOnlyToUtc, todayDateOnly, utcToDateOnly } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { formatAddress, propertyTitle, tenantName } from "@/lib/format";
import {
  buildRentIncreaseDraft,
  formatBasisPoints,
  increaseBasisPoints,
  noticeDocumentLines,
  rentAfterGuideline,
  type DraftResult,
  type DraftWarning,
  type NoticeDocument,
  type ReadyDraft,
} from "@/lib/rent-increase/calculate";
import {
  defaultEffectiveDate,
  increaseAlerts,
  increaseSchedule,
  noticeFormFor,
  ontarioRentRules,
  rulesForProvince,
  type IncreaseAlert,
} from "@/lib/rent-increase/rules";
import { ServiceError } from "@/lib/services/errors";

const tenancyInclude = {
  tenant: true,
  unit: { include: { property: { include: { owner: true } } } },
} as const;

export type IncreaseBoardRow = {
  tenancyId: string;
  tenantName: string;
  unitLabel: string;
  propertyLabel: string;
  propertyId: string;
  province: string;
  monthlyRentCents: number;
  guidelineExempt: boolean;
  exemptionEvidence: string | null;
  moveInOn: string;
  lastIncreaseOn: string | null;
  lastIncreaseCents: number | null;
  supported: boolean;
  formCode: "N1" | "N2" | null;
  eligibleOn: string | null;
  serveBy: string | null;
  alerts: IncreaseAlert[];
};

type LoadedTenancy = {
  id: string;
  status: "ACTIVE" | "ENDED";
  monthlyRentCents: number;
  moveInOn: Date;
  lastIncreaseOn: Date | null;
  lastIncreaseCents: number | null;
  tenant: { firstName: string; lastName: string };
  unit: {
    id: string;
    label: string;
    guidelineExempt: boolean;
    exemptionEvidence: string | null;
    property: {
      id: string;
      name: string | null;
      streetAddress: string;
      city: string;
      province: string;
      postalCode: string;
      ownerId: string;
      owner: { name: string };
    };
  };
};

function toBoardRow(tenancy: LoadedTenancy, today: string): IncreaseBoardRow {
  const province = tenancy.unit.property.province;
  const rules = rulesForProvince(province);
  const moveInOn = utcToDateOnly(tenancy.moveInOn);
  const lastIncreaseOn = tenancy.lastIncreaseOn
    ? utcToDateOnly(tenancy.lastIncreaseOn)
    : null;
  if (!rules) {
    return {
      tenancyId: tenancy.id,
      tenantName: tenantName(tenancy.tenant),
      unitLabel: tenancy.unit.label,
      propertyLabel: propertyTitle(tenancy.unit.property),
      propertyId: tenancy.unit.property.id,
      province,
      monthlyRentCents: tenancy.monthlyRentCents,
      guidelineExempt: tenancy.unit.guidelineExempt,
      exemptionEvidence: tenancy.unit.exemptionEvidence,
      moveInOn,
      lastIncreaseOn,
      lastIncreaseCents: tenancy.lastIncreaseCents,
      supported: false,
      formCode: null,
      eligibleOn: null,
      serveBy: null,
      alerts: [],
    };
  }
  const schedule = increaseSchedule(rules, moveInOn, lastIncreaseOn);
  return {
    tenancyId: tenancy.id,
    tenantName: tenantName(tenancy.tenant),
    unitLabel: tenancy.unit.label,
    propertyLabel: propertyTitle(tenancy.unit.property),
    propertyId: tenancy.unit.property.id,
    province,
    monthlyRentCents: tenancy.monthlyRentCents,
    guidelineExempt: tenancy.unit.guidelineExempt,
    exemptionEvidence: tenancy.unit.exemptionEvidence,
    moveInOn,
    lastIncreaseOn,
    lastIncreaseCents: tenancy.lastIncreaseCents,
    supported: true,
    formCode: noticeFormFor(rules, tenancy.unit.guidelineExempt).code,
    eligibleOn: schedule.eligibleOn,
    serveBy: schedule.serveBy,
    alerts: increaseAlerts(rules, schedule, today),
  };
}

export async function listRentIncreases(
  ownerId: string,
  today = todayDateOnly(),
): Promise<IncreaseBoardRow[]> {
  const tenancies = await prisma.tenancy.findMany({
    where: { status: "ACTIVE", unit: { property: { ownerId } } },
    include: tenancyInclude,
  });
  return tenancies
    .map((tenancy) => toBoardRow(tenancy, today))
    .sort((a, b) => {
      const aRank = a.alerts.length > 0 ? 0 : 1;
      const bRank = b.alerts.length > 0 ? 0 : 1;
      if (aRank !== bRank) {
        return aRank - bRank;
      }
      return (a.eligibleOn ?? "9999").localeCompare(b.eligibleOn ?? "9999");
    });
}

export async function listUpcomingRentIncreases(ownerId: string, today = todayDateOnly()) {
  const rows = await listRentIncreases(ownerId, today);
  return rows.filter((row) => row.alerts.length > 0);
}

async function loadTenancy(ownerId: string, tenancyId: string): Promise<LoadedTenancy | null> {
  return prisma.tenancy.findFirst({
    where: { id: tenancyId, unit: { property: { ownerId } } },
    include: tenancyInclude,
  });
}

async function assessLoaded(
  tenancy: LoadedTenancy,
  input: { effectiveOn: string; newRentCents: number },
  preparedOn: string,
): Promise<DraftResult> {
  const year = Number(input.effectiveOn.slice(0, 4));
  const guideline = await prisma.rentGuideline.findUnique({
    where: {
      province_year: { province: tenancy.unit.property.province, year },
    },
  });
  return buildRentIncreaseDraft({
    province: tenancy.unit.property.province,
    guidelineExempt: tenancy.unit.guidelineExempt,
    moveInOn: utcToDateOnly(tenancy.moveInOn),
    lastIncreaseOn: tenancy.lastIncreaseOn ? utcToDateOnly(tenancy.lastIncreaseOn) : null,
    currentRentCents: tenancy.monthlyRentCents,
    effectiveOn: input.effectiveOn,
    newRentCents: input.newRentCents,
    preparedOn,
    guideline: guideline
      ? {
          year: guideline.year,
          basisPoints: guideline.basisPoints,
          sourceUrl: guideline.sourceUrl,
          verified: guideline.verified,
        }
      : null,
  });
}

export async function assessRentIncrease(
  ownerId: string,
  input: { tenancyId: string; effectiveOn: string; newRentCents: number },
  preparedOn = todayDateOnly(),
): Promise<
  | (ReadyDraft & { tenantName: string })
  | Exclude<DraftResult, { status: "ready" }>
  | { status: "not_found" }
> {
  const tenancy = await loadTenancy(ownerId, input.tenancyId);
  if (!tenancy) {
    return { status: "not_found" };
  }
  if (tenancy.status !== "ACTIVE") {
    return {
      status: "blocked",
      message: "Rent increase drafts are for active leases.",
    };
  }
  const draft = await assessLoaded(tenancy, input, preparedOn);
  if (draft.status !== "ready") {
    return draft;
  }
  return { ...draft, tenantName: tenantName(tenancy.tenant) };
}

export async function saveRentIncreaseDraft(
  ownerId: string,
  input: { tenancyId: string; effectiveOn: string; newRentCents: number },
  preparedOn = todayDateOnly(),
): Promise<{ noticeId: string; tenantName: string; draft: ReadyDraft }> {
  const tenancy = await loadTenancy(ownerId, input.tenancyId);
  if (!tenancy) {
    throw new ServiceError("not_found", "That lease was not found.");
  }
  if (tenancy.status !== "ACTIVE") {
    throw new ServiceError("invalid", "Rent increase drafts are for active leases.");
  }
  const result = await assessLoaded(tenancy, input, preparedOn);
  if (result.status !== "ready") {
    throw new ServiceError("invalid", result.message);
  }
  const notice = await prisma.notice.create({
    data: {
      ownerId,
      tenancyId: tenancy.id,
      type: result.form.code,
      status: "DRAFT",
      effectiveOn: dateOnlyToUtc(result.effectiveOn),
      currentRentCents: result.currentRentCents,
      newRentCents: result.newRentCents,
      guidelineYear: result.guidelineYear,
      guidelineBasisPoints: result.guidelineBasisPoints,
      guidelineSourceUrl: result.guidelineSourceUrl,
      warningCodes: result.warnings.map((warning) => warning.code),
    },
  });
  return {
    noticeId: notice.id,
    tenantName: tenantName(tenancy.tenant),
    draft: result,
  };
}

export type IncreaseFormContext = {
  row: IncreaseBoardRow;
  landlordName: string;
  address: string;
  preparedOn: string;
  defaultEffectiveOn: string;
  suggestedNewRentCents: number | null;
  guidelineNote: string;
};

export async function getIncreaseFormContext(
  ownerId: string,
  tenancyId: string,
  today = todayDateOnly(),
): Promise<IncreaseFormContext | null> {
  const tenancy = await loadTenancy(ownerId, tenancyId);
  if (!tenancy) {
    return null;
  }
  const row = toBoardRow(tenancy, today);
  const rules = rulesForProvince(row.province);
  const defaultEffectiveOn =
    rules && row.eligibleOn
      ? defaultEffectiveDate(rules, row.eligibleOn, today)
      : today;
  const year = Number(defaultEffectiveOn.slice(0, 4));
  const guideline = rules
    ? await prisma.rentGuideline.findUnique({
        where: { province_year: { province: row.province, year } },
      })
    : null;
  let suggestedNewRentCents: number | null = null;
  let guidelineNote = "Rent increase rules for this province are not available yet.";
  if (rules && row.guidelineExempt) {
    guidelineNote =
      "This unit is guideline-exempt, so the draft uses N2 data and you choose the new rent. The 12-month gap and 90 days' notice still apply.";
  } else if (rules && guideline?.verified && guideline.sourceUrl.trim()) {
    suggestedNewRentCents = rentAfterGuideline(row.monthlyRentCents, guideline.basisPoints);
    guidelineNote = `The verified ${year} Ontario guideline is ${formatBasisPoints(guideline.basisPoints)}. An increase above that is allowed on the draft only with a warning.`;
  } else if (rules) {
    guidelineNote = `The ${year} Ontario guideline is not verified. An N1 draft stays blocked until you verify that year in Settings.`;
  }
  return {
    row,
    landlordName: tenancy.unit.property.owner.name,
    address: formatAddress(tenancy.unit.property),
    preparedOn: today,
    defaultEffectiveOn,
    suggestedNewRentCents,
    guidelineNote,
  };
}

export async function getRentIncreaseNotice(ownerId: string, noticeId: string) {
  const notice = await prisma.notice.findFirst({
    where: {
      id: noticeId,
      ownerId,
      type: { in: ["N1", "N2"] },
    },
    include: {
      tenancy: { include: tenancyInclude },
    },
  });
  if (!notice || !notice.effectiveOn || notice.currentRentCents === null || notice.newRentCents === null) {
    return null;
  }
  const tenancy = notice.tenancy;
  const rules = rulesForProvince(tenancy.unit.property.province);
  const moveInOn = utcToDateOnly(tenancy.moveInOn);
  const lastIncreaseOn = tenancy.lastIncreaseOn ? utcToDateOnly(tenancy.lastIncreaseOn) : null;
  const schedule = rules
    ? increaseSchedule(rules, moveInOn, lastIncreaseOn)
    : null;
  const warnings = rebuildWarnings(notice.warningCodes, {
    province: tenancy.unit.property.province,
    guidelineExempt: notice.type === "N2",
    moveInOn,
    lastIncreaseOn,
    currentRentCents: notice.currentRentCents,
    newRentCents: notice.newRentCents,
    effectiveOn: utcToDateOnly(notice.effectiveOn),
    preparedOn: todayDateOnly(notice.createdAt),
    guideline:
      notice.guidelineYear !== null && notice.guidelineBasisPoints !== null
        ? {
            year: notice.guidelineYear,
            basisPoints: notice.guidelineBasisPoints,
            sourceUrl: notice.guidelineSourceUrl ?? "https://www.ontario.ca/page/residential-rent-increases",
            verified: true,
          }
        : null,
  });
  const form = notice.type === "N2" ? ontarioRentRules.exemptForm : ontarioRentRules.standardForm;
  const document: NoticeDocument = {
    formCode: form.code,
    formName: form.name,
    officialUrl: form.officialUrl,
    landlordName: tenancy.unit.property.owner.name,
    tenantName: tenantName(tenancy.tenant),
    unitLabel: tenancy.unit.label,
    address: formatAddress(tenancy.unit.property),
    moveInOn,
    lastIncreaseOn,
    lastIncreaseCents: tenancy.lastIncreaseCents,
    exemptionEvidence: notice.type === "N2" ? tenancy.unit.exemptionEvidence : null,
    currentRentCents: notice.currentRentCents,
    newRentCents: notice.newRentCents,
    increaseCents: notice.newRentCents - notice.currentRentCents,
    increaseBasisPoints: increaseBasisPoints(notice.currentRentCents, notice.newRentCents),
    effectiveOn: utcToDateOnly(notice.effectiveOn),
    eligibleOn: schedule?.eligibleOn ?? utcToDateOnly(notice.effectiveOn),
    serveBy: schedule?.serveBy ?? utcToDateOnly(notice.effectiveOn),
    guidelineYear: notice.guidelineYear,
    guidelineBasisPoints: notice.guidelineBasisPoints,
    guidelineSourceUrl: notice.guidelineSourceUrl,
    preparedOn: todayDateOnly(notice.createdAt),
    warnings,
  };
  return {
    noticeId: notice.id,
    tenancyId: tenancy.id,
    propertyId: tenancy.unit.property.id,
    document,
    lines: noticeDocumentLines(document),
  };
}

function rebuildWarnings(
  codes: string[],
  input: Parameters<typeof buildRentIncreaseDraft>[0],
): DraftWarning[] {
  const built = buildRentIncreaseDraft(input);
  if (built.status !== "ready") {
    return codes.map((code) => ({
      code: code as DraftWarning["code"],
      message: code,
    }));
  }
  const byCode = new Map(built.warnings.map((warning) => [warning.code, warning]));
  return codes.flatMap((code) => {
    const warning = byCode.get(code as DraftWarning["code"]);
    return warning ? [warning] : [];
  });
}
