import "server-only";

import { cache } from "react";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { todayDateOnly, utcToDateOnly } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { ownedWhere } from "@/lib/ownership";
import {
  isTenancyCurrent,
  summarizeUnits,
  type TenancySnapshot,
} from "@/lib/portfolio";
import { loadPortfolio } from "@/lib/services/portfolio";

export const requireUser = cache(async () => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/login");
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true },
  });
  if (!user) {
    redirect("/login");
  }
  return user;
});

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

export async function getPortfolio() {
  const user = await requireUser();
  const portfolio = await loadPortfolio(user.id);
  return { user, rows: portfolio.rows, totals: portfolio.totals };
}

export async function getProperty(propertyId: string) {
  const user = await requireUser();
  const property = await prisma.property.findFirst({
    where: ownedWhere(user.id, propertyId),
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
  if (!property) {
    notFound();
  }
  const today = todayDateOnly();
  return {
    user,
    property,
    today,
    summary: summarizeUnits(
      property.units.map((unit) => ({
        tenancies: unit.tenancies.map(toSnapshot),
      })),
      today,
    ),
  };
}

export async function getUnit(propertyId: string, unitId: string) {
  const { property, today } = await getProperty(propertyId);
  const unit = property.units.find((item) => item.id === unitId);
  if (!unit) {
    notFound();
  }
  const current = unit.tenancies.filter((tenancy) =>
    isTenancyCurrent(toSnapshot(tenancy), today),
  );
  return { property, unit, today, current };
}

export async function getTenancy(tenancyId: string) {
  const user = await requireUser();
  const tenancy = await prisma.tenancy.findFirst({
    where: {
      id: tenancyId,
      unit: { property: ownedWhere(user.id) },
    },
    include: {
      tenant: true,
      unit: { include: { property: true } },
    },
  });
  if (!tenancy) {
    notFound();
  }
  return tenancy;
}
