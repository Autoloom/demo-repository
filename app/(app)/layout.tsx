import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth/auth0";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth0.getSession();

  if (!session) {
    redirect("/login");
  }
}
