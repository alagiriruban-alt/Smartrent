"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Rent roll" },
  { href: "/dashboard/rent", label: "Rent" },
  { href: "/dashboard/reminders", label: "Reminders" },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return (
      pathname === "/dashboard" || pathname.startsWith("/dashboard/properties")
    );
  }
  if (href === "/dashboard/rent") {
    return (
      pathname.startsWith("/dashboard/rent") ||
      pathname.startsWith("/dashboard/payments") ||
      pathname.includes("/rent")
    );
  }
  return pathname.startsWith(href);
}

export function DashboardNav() {
  const pathname = usePathname();
  return (
    <nav className="mb-8 flex gap-5 text-sm font-semibold">
      {links.map((link) => {
        const active = isActive(pathname, link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={
              active
                ? "border-b-2 border-pine pb-0.5 text-ink"
                : "pb-0.5 text-muted hover:text-ink"
            }
            aria-current={active ? "page" : undefined}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
