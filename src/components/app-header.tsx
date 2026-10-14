import { LogoutButton } from "@/components/logout-button";
import { Wordmark } from "@/components/wordmark";

export function AppHeader({ name }: { name: string }) {
  return (
    <header className="border-b border-line bg-card/90">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4">
        <Wordmark href="/dashboard" />
        <div className="flex items-center gap-3">
          <p className="hidden text-sm text-muted sm:block">{name}</p>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
