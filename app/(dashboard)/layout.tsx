import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";
import { IdleLogout } from "@/components/auth/idle-logout";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return (
    <>
      <IdleLogout />
      <AppShell>{children}</AppShell>
    </>
  );
}
