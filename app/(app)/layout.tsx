import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth/auth0";
import Sidebar from "@/components/layout/sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth0.getSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-svh">
      <Sidebar />
      <div className="flex-1">{children}</div>
    </div>
  );
}
