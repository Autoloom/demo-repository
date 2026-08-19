/* Server-side dashboard route; parses the requested role,
gets dashboard data, and passes it to the dashboard feature UI. */

import type { Metadata } from "next";

import { DashboardPageContent } from "@/features/dashboard/components/dashboard-page-content";
import { dashboardService, parseRole } from "@/features/dashboard/data/dashboard-data";
import { auth0 } from "@/lib/auth/auth0";
import type { User } from "@/lib/services/types";

export const metadata: Metadata = {
  title: "Dashboard | Cable OS",
};

type DashboardPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  let currentUser: User | null = null;

  // Get user from Auth0 session (doesn't require access token)
  // TODO: use access token
  try {
    const session = await auth0.getSession();
    console.log("📋 Auth0 session:", { 
      hasSub: !!session?.user?.sub, 
      hasName: !!session?.user?.name,
      hasEmail: !!session?.user?.email,
    });
    if (session?.user) {
      currentUser = {
        id: session.user.sub || "",
        name: session.user.name || "",
        email: session.user.email || "",
        role: "Owner",
        active: true,
      };
      console.log(`✅ User loaded from session: id: ${currentUser.id}, name: ${currentUser.name}`);
    } else {
      console.log("⚠️ No user in session");
    }
  } catch (error) {
    console.error("❌ Failed to load session:", error);
  }

  const params = await searchParams;
  const role = parseRole(params?.role);
  const summary = await dashboardService.summary(role);

  return <DashboardPageContent user={currentUser} role={role} summary={summary} />;
}
