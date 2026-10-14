import Link from "next/link";

import { primaryButton } from "@/components/styles";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-5 py-20">
      <h1 className="font-serif text-4xl tracking-tight">That page is not here</h1>
      <p className="mt-3 text-muted">
        The record may belong to another account, or it may have been deleted.
      </p>
      <Link href="/dashboard" className={`${primaryButton} mt-6`}>
        Go to your rent roll
      </Link>
    </main>
  );
}
