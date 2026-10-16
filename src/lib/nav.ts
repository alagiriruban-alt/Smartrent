export const dashboardNav = [
  { href: "/dashboard", label: "Rent roll" },
  { href: "/dashboard/properties", label: "Properties" },
  { href: "/dashboard/documents", label: "Documents" },
  { href: "/dashboard/rent", label: "Rent" },
  { href: "/dashboard/rent-increases", label: "Increases" },
  { href: "/dashboard/reminders", label: "Reminders" },
  { href: "/dashboard/settings/agent", label: "Settings" },
] as const;

const tenancyEditPath = /\/tenancies\/[^/]+\/edit$/;
const tenancyRentPath = /\/tenancies\/[^/]+\/rent$/;

export function isDashboardNavActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === "/dashboard";
  }
  if (href === "/dashboard/documents") {
    return pathname === "/dashboard/documents" || pathname.startsWith("/dashboard/documents/");
  }
  if (href === "/dashboard/properties") {
    return (
      pathname === "/dashboard/properties" ||
      pathname.startsWith("/dashboard/properties/") ||
      tenancyEditPath.test(pathname)
    );
  }
  if (href === "/dashboard/rent") {
    return (
      pathname === "/dashboard/rent" ||
      pathname.startsWith("/dashboard/rent/") ||
      pathname.startsWith("/dashboard/payments") ||
      tenancyRentPath.test(pathname)
    );
  }
  if (href === "/dashboard/rent-increases") {
    return (
      pathname.startsWith("/dashboard/rent-increases") ||
      pathname.includes("/rent-increase") ||
      pathname.includes("/notices/")
    );
  }
  if (href === "/dashboard/settings/agent") {
    return pathname.startsWith("/dashboard/settings");
  }
  return pathname.startsWith(href);
}
