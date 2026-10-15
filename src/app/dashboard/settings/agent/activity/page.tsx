import Link from "next/link";

import { card } from "@/components/styles";
import { listAgentAudit } from "@/lib/agent/audit";
import { requireUser } from "@/lib/dal";

export const metadata = { title: "Agent audit log" };

function formatWhen(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default async function AgentActivityPage() {
  const user = await requireUser();
  const entries = await listAgentAudit(user.id, 100);

  return (
    <div>
      <Link
        href="/dashboard/settings/agent"
        className="text-sm font-semibold text-pine"
      >
        Back to agent access
      </Link>
      <p className="mt-3 text-sm font-semibold uppercase tracking-[0.16em] text-gold">
        Settings
      </p>
      <h1 className="mt-1 font-serif text-4xl tracking-tight">Audit log</h1>
      <p className="mt-2 max-w-xl text-muted">
        N4 notices you save, confirm, or mark as served are listed here.
        Anything an assistant did with a token is tagged via agent.
      </p>
      {entries.length === 0 ? (
        <p className={`${card} mt-8 p-4 text-muted`}>
          No agent has used this account yet.
        </p>
      ) : (
        <ul className="mt-8 flex flex-col gap-3">
          {entries.map((entry) => (
            <li key={entry.id} className={`${card} p-4`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{entry.tool}</h2>
                    <span className="rounded-full bg-pine/10 px-2 py-0.5 text-xs font-semibold text-pine">
                      {entry.viaAgent ? "via agent" : "in the app"}
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                      {entry.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm">{entry.summary}</p>
                </div>
                <p className="text-sm text-muted">{formatWhen(entry.createdAt)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
