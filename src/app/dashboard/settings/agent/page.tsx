import Link from "next/link";

import { revokeAgentToken } from "@/actions/agent-access";
import { AgentTokenForm } from "@/components/agent-token-form";
import { card, dangerButton, secondaryButton } from "@/components/styles";
import { listAgentAudit } from "@/lib/agent/audit";
import { listAgentAccessTokens } from "@/lib/agent/tokens";
import { requireUser } from "@/lib/dal";

export const metadata = { title: "Agent access" };

function formatWhen(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function scopeLabel(scopes: string[]): string {
  return scopes.includes("WRITE") ? "Read and write" : "Read";
}

export default async function AgentAccessPage() {
  const user = await requireUser();
  const [tokens, activity] = await Promise.all([
    listAgentAccessTokens(user.id),
    listAgentAudit(user.id, 5),
  ]);

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-gold">
        Settings
      </p>
      <h1 className="mt-1 font-serif text-4xl tracking-tight">Agent access</h1>
      <p className="mt-2 max-w-xl text-muted">
        Create a personal token so an assistant can read this account and, if
        you allow it, record rent. The token is stored as a hash. You can
        revoke it here at any time.
      </p>

      <section className={`${card} mt-8 p-4`}>
        <h2 className="font-serif text-2xl">New token</h2>
        <div className="mt-4">
          <AgentTokenForm />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-serif text-2xl">Tokens</h2>
        {tokens.length === 0 ? (
          <p className={`${card} mt-4 p-4 text-muted`}>No tokens yet.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {tokens.map((token) => {
              const revoked = Boolean(token.revokedAt);
              return (
                <li key={token.id} className={`${card} p-4`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{token.name}</h3>
                      <p className="mt-1 font-mono text-sm text-muted">{token.tokenPrefix}</p>
                      <p className="mt-1 text-sm text-muted">
                        {scopeLabel(token.scopes)}
                        {" · "}
                        Created {formatWhen(token.createdAt)}
                      </p>
                      <p className="text-sm text-muted">
                        {token.lastUsedAt
                          ? `Last used ${formatWhen(token.lastUsedAt)}`
                          : "Not used yet"}
                      </p>
                    </div>
                    {revoked ? (
                      <p className="text-sm font-semibold text-danger">Revoked</p>
                    ) : (
                      <form action={revokeAgentToken}>
                        <input type="hidden" name="id" value={token.id} />
                        <button type="submit" className={dangerButton}>
                          Revoke
                        </button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-serif text-2xl">Recent activity</h2>
          <Link href="/dashboard/settings/agent/activity" className={secondaryButton}>
            Audit log
          </Link>
        </div>
        {activity.length === 0 ? (
          <p className={`${card} mt-4 p-4 text-muted`}>
            No agent has used this account yet.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {activity.map((entry) => (
              <li key={entry.id} className={`${card} p-4`}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{entry.tool}</p>
                  <span className="rounded-full bg-pine/10 px-2 py-0.5 text-xs font-semibold text-pine">
                    via agent
                  </span>
                </div>
                <p className="mt-1 text-sm">{entry.summary}</p>
                <p className="mt-1 text-sm text-muted">{formatWhen(entry.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
