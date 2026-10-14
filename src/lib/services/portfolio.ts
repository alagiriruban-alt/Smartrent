import { todayDateOnly, utcToDateOnly } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { formatAddress, propertyTitle, tenantName } from "@/lib/format";
import { ownedWhere } from "@/lib/ownership";
import {
  isTenancyCurrent,
  summarizeUnits,
  type TenancySnapshot,
} from "@/lib/portfolio";
import { ServiceError } from "@/lib/services/errors";

const tenancySelect = {
  id: true,
  leaseStart: true,
  leaseEnd: true,
  monthlyRentCents: true,
  rentDueDay: true,
  status: true,
  tenant: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
    },
  },
} as const;

function toSnapshot(tenancy: {
  leaseStart: Date;
  leaseEnd: Date | null;
  monthlyRentCents: number;
  status: "ACTIVE" | "ENDED";
}): TenancySnapshot {
  return {
    leaseStart: utcToDateOnly(tenancy.leaseStart),
    leaseEnd: tenancy.leaseEnd ? utcToDateOnly(tenancy.leaseEnd) : null,
    monthlyRentCents: tenancy.monthlyRentCents,
    status: tenancy.status,
  };
}

export async function loadPortfolio(ownerId: string) {
  const properties = await prisma.property.findMany({
    where: ownedWhere(ownerId),
    orderBy: [{ name: "asc" }, { streetAddress: "asc" }],
    include: {
      units: {
        orderBy: { label: "asc" },
        include: {
          tenancies: {
            select: tenancySelect,
            orderBy: { leaseStart: "desc" },
          },
        },
      },
    },
  });

  const today = todayDateOnly();
  const rows = properties.map((property) => ({
    property,
    summary: summarizeUnits(
      property.units.map((unit) => ({
        tenancies: unit.tenancies.map(toSnapshot),
      })),
      today,
    ),
  }));

  const totals = rows.reduce(
    (sum, row) => ({
      properties: sum.properties + 1,
      unitCount: sum.unitCount + row.summary.unitCount,
      occupiedCount: sum.occupiedCount + row.summary.occupiedCount,
      monthlyRentCents: sum.monthlyRentCents + row.summary.monthlyRentCents,
    }),
    { properties: 0, unitCount: 0, occupiedCount: 0, monthlyRentCents: 0 },
  );

  return { rows, totals, today };
}

export async function listProperties(ownerId: string) {
  const { rows, today } = await loadPortfolio(ownerId);
  return rows.map(({ property, summary }) => ({
    id: property.id,
    name: property.name,
    streetAddress: property.streetAddress,
    city: property.city,
    province: property.province,
    postalCode: property.postalCode,
    address: formatAddress(property),
    unitCount: summary.unitCount,
    occupiedCount: summary.occupiedCount,
    monthlyRentCents: summary.monthlyRentCents,
    units: property.units.map((unit) => {
      const current = unit.tenancies.find((tenancy) =>
        isTenancyCurrent(toSnapshot(tenancy), today),
      );
      return {
        id: unit.id,
        label: unit.label,
        bedrooms: unit.bedrooms,
        tenancyId: current?.id ?? null,
        tenantName: current ? tenantName(current.tenant) : null,
        monthlyRentCents: current?.monthlyRentCents ?? null,
      };
    }),
  }));
}

export async function listTenants(ownerId: string, propertyId?: string) {
  if (propertyId) {
    const property = await prisma.property.findFirst({
      where: ownedWhere(ownerId, propertyId),
      select: { id: true },
    });
    if (!property) {
      throw new ServiceError("not_found", "That property was not found.");
    }
  }
  const tenancies = await prisma.tenancy.findMany({
    where: {
      unit: {
        property: propertyId ? ownedWhere(ownerId, propertyId) : ownedWhere(ownerId),
      },
    },
    include: {
      tenant: true,
      unit: { include: { property: true } },
    },
    orderBy: [{ leaseStart: "asc" }],
  });
  return tenancies.map((tenancy) => ({
    tenantId: tenancy.tenant.id,
    tenancyId: tenancy.id,
    firstName: tenancy.tenant.firstName,
    lastName: tenancy.tenant.lastName,
    tenantName: tenantName(tenancy.tenant),
    email: tenancy.tenant.email,
    phone: tenancy.tenant.phone,
    unitId: tenancy.unitId,
    unitLabel: tenancy.unit.label,
    propertyId: tenancy.unit.propertyId,
    propertyLabel: propertyTitle(tenancy.unit.property),
    leaseStart: utcToDateOnly(tenancy.leaseStart),
    leaseEnd: tenancy.leaseEnd ? utcToDateOnly(tenancy.leaseEnd) : null,
    monthlyRentCents: tenancy.monthlyRentCents,
    rentDueDay: tenancy.rentDueDay,
    status: tenancy.status,
  }));
}
