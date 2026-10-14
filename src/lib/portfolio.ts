export type TenancyStatus = "ACTIVE" | "ENDED";

export type TenancySnapshot = {
  leaseStart: string;
  leaseEnd: string | null;
  monthlyRentCents: number;
  status: TenancyStatus;
};

export type UnitSnapshot = {
  tenancies: TenancySnapshot[];
};

export type TenancyPhase = "current" | "upcoming" | "ended";

export function tenancyPhase(
  tenancy: TenancySnapshot,
  today: string,
): TenancyPhase {
  if (tenancy.status !== "ACTIVE") {
    return "ended";
  }
  if (tenancy.leaseEnd && tenancy.leaseEnd < today) {
    return "ended";
  }
  if (tenancy.leaseStart > today) {
    return "upcoming";
  }
  return "current";
}

export function isTenancyCurrent(
  tenancy: TenancySnapshot,
  today: string,
): boolean {
  return tenancyPhase(tenancy, today) === "current";
}

export function summarizeUnits(units: UnitSnapshot[], today: string) {
  let occupiedCount = 0;
  let monthlyRentCents = 0;
  for (const unit of units) {
    const current = unit.tenancies.filter((tenancy) =>
      isTenancyCurrent(tenancy, today),
    );
    if (current.length > 0) {
      occupiedCount += 1;
      monthlyRentCents += current.reduce(
        (sum, tenancy) => sum + tenancy.monthlyRentCents,
        0,
      );
    }
  }
  return {
    unitCount: units.length,
    occupiedCount,
    monthlyRentCents,
  };
}
