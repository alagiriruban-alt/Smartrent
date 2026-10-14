import { AppHeader } from "@/components/app-header";
import { DashboardNav } from "@/components/dashboard-nav";
import { requireUser } from "@/lib/dal";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  return (
    <div className="min-h-full">
      <div className="print:hidden">
        <AppHeader name={user.name} />
      </div>
      <main className="mx-auto w-full max-w-3xl px-5 py-8">
        <div className="print:hidden">
          <DashboardNav />
        </div>
        {children}
      </main>
    </div>
  );
}
