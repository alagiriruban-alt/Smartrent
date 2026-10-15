"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { dashboardNav, isDashboardNavActive } from "@/lib/nav";

export function DashboardNav() {
  const pathname = usePathname();
  return (
    <nav className="mb-8 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
      {dashboardNav.map((link) => {
        const active = isDashboardNavActive(pathname, link.href);
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
