import Link from "next/link";
import { redirect } from "next/navigation";

import { login } from "@/actions/auth";
import { auth } from "@/auth";
import { LoginForm } from "@/components/login-form";
import { Wordmark } from "@/components/wordmark";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }
  const params = await searchParams;
  const created = params.created === "1";

  return (
    <div className="min-h-full">
      <header className="mx-auto flex max-w-md items-center px-5 py-5">
        <Wordmark href="/" />
      </header>
      <main className="mx-auto w-full max-w-md px-5 pb-16">
        <h1 className="font-serif text-4xl tracking-tight">Sign in</h1>
        <p className="mt-2 text-muted">
          Use the email and password for your landlord account.
        </p>
        {created ? (
          <p className="mt-4 rounded-md border border-line bg-card px-3 py-2 text-sm" role="status">
            Your account is ready. Sign in with the password you just chose.
          </p>
        ) : null}
        <div className="mt-6">
          <LoginForm action={login} />
        </div>
        <p className="mt-6 text-sm text-muted">
          New here?{" "}
          <Link href="/signup" className="font-semibold text-pine">
            Create an account
          </Link>
        </p>
      </main>
    </div>
  );
}
