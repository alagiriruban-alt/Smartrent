import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { primaryButton, secondaryButton, card } from "@/components/styles";
import { Wordmark } from "@/components/wordmark";

export default async function HomePage() {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-full">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5">
        <Wordmark href="/" />
        <Link href="/login" className={secondaryButton}>
          Sign in
        </Link>
      </header>
      <main className="mx-auto max-w-3xl px-5 pb-20 pt-8">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-gold">
          Ontario · 1 to 10 units
        </p>
        <h1 className="mt-3 max-w-xl font-serif text-5xl leading-[1.05] tracking-tight">
          The rent roll for a handful of homes.
        </h1>
        <p className="mt-4 max-w-xl text-lg leading-8 text-muted">
          SmartRentBoss keeps each property, the units inside it, and the
          lease on that unit in one place. Record the rent when it arrives,
          see who is late, and print a receipt. It is for a landlord who
          still knows every tenant by name.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/signup" className={primaryButton}>
            Create an account
          </Link>
          <Link href="/login" className={secondaryButton}>
            Sign in
          </Link>
        </div>
        <ul className="mt-14 grid gap-4 sm:grid-cols-3">
          <li className={`${card} p-4`}>
            <h2 className="font-serif text-xl">Your records only</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Sign in with email and a password. Another landlord cannot open
              your buildings or tenants.
            </p>
          </li>
          <li className={`${card} p-4`}>
            <h2 className="font-serif text-xl">Rent in dollars</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Each occupied unit shows the monthly rent in Canadian dollars
              and the day it is due.
            </p>
          </li>
          <li className={`${card} p-4`}>
            <h2 className="font-serif text-xl">Ontario first</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              New properties start in Ontario. Change the province if you own
              a place somewhere else in Canada.
            </p>
          </li>
        </ul>
      </main>
    </div>
  );
}
