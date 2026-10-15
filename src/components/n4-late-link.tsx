import Link from "next/link";

import { formatDmy } from "@/lib/n4/document";
import type { N4LateBadge } from "@/lib/services/rent";

export function N4LateLink({
  tenancyId,
  notice,
}: {
  tenancyId: string;
  notice: N4LateBadge | null;
}) {
  if (!notice) {
    return (
      <Link
        href={`/dashboard/tenancies/${tenancyId}/n4`}
        className="text-sm font-semibold text-pine"
      >
        Prepare an N4
      </Link>
    );
  }
  const label =
    notice.status === "SERVED"
      ? "N4 served"
      : notice.confirmed
        ? "N4 confirmed"
        : "N4 draft";
  const when = notice.terminationDate ? ` · ends ${formatDmy(notice.terminationDate)}` : "";
  return (
    <Link
      href={`/dashboard/tenancies/${tenancyId}/notices/${notice.noticeId}`}
      className="text-sm font-semibold text-pine"
    >
      {label}
      {when}
    </Link>
  );
}
