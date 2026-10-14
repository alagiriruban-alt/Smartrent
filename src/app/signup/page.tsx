import Link from "next/link";
import { redirect } from "next/navigation";

import { signup } from "@/actions/auth";
import { auth } from "@/auth";
import { SignupForm } from "@/components/signup-form";
import { Wordmark } from "@/components/wordmark";

export const metadata = { title: "Create account" };

export default async function SignupPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-full">
      <header className="mx-auto flex max-w-md items-center px-5 py-5">
        <Wordmark href="/" />
      </header>
      <main className="mx-auto w-full max-w-md px-5 pb-16">
        <h1 className="font-serif text-4xl tracking-tight">Create an account</h1>
        <p className="mt-2 text-muted">
          This account is only for your properties. Use an email you can
          remember.
        </p>
        <div className="mt-6">
          <SignupForm action={signup} />
        </div>
        <p className="mt-6 text-sm text-muted">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-pine">
            Sign in
          </Link>
        </p>
      </main>
    </div>
  );
}
