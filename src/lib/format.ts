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
