import { formatCad } from "@/lib/money";

export function propertyTitle(property: {
  name: string | null;
  streetAddress: string;
}) {
  return property.name?.trim() || property.streetAddress;
}

export function formatAddress(property: {
  streetAddress: string;
  city: string;
  province: string;
  postalCode: string;
}) {
  return `${property.streetAddress}, ${property.city} ${property.province} ${property.postalCode}`;
}

export function tenantName(tenant: { firstName: string; lastName: string }) {
  return `${tenant.firstName} ${tenant.lastName}`;
}

export function balancePhrase(cents: number): string {
  if (cents > 0) {
    return `${formatCad(cents)} owing`;
  }
  if (cents < 0) {
    return `${formatCad(-cents)} credit`;
  }
  return "Nothing owing";
}

export function ordinal(day: number): string {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return `${day}th`;
  }
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

export function formatMonth(periodStart: string): string {
  const [year, month] = periodStart.split("-").map(Number);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function daysLateLabel(days: number): string {
  if (days === 1) {
    return "1 day late";
  }
  return `${days} days late`;
}

export function bedroomLabel(bedrooms: number | null): string | null {
  if (bedrooms === null) {
    return null;
  }
  if (bedrooms === 0) {
    return "Studio";
  }
  if (bedrooms === 1) {
    return "1 bedroom";
  }
  return `${bedrooms} bedrooms`;
}
