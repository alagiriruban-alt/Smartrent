import { AppHeader } from "@/components/app-header";
import { requireUser } from "@/lib/dal";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  return (
    <div className="min-h-full">
      <AppHeader name={user.name} />
      <main className="mx-auto w-full max-w-3xl px-5 py-8">{children}</main>
    </div>
  );
}
