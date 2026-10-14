"use client";

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div>
      <h1 className="font-serif text-3xl tracking-tight">Something went wrong</h1>
      <p className="mt-2 text-muted">
        The page could not load. Try again, and if it keeps failing, check
        that the database is running.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-4 rounded-md bg-pine px-4 py-2.5 text-sm font-semibold text-white"
      >
        Try again
      </button>
    </div>
  );
}
