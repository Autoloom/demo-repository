/* Server-side dashboard route; parses the requested role,
gets dashboard data, and passes it to the dashboard feature UI. */

import type { Metadata } from "next";

import { DashboardPageContent } from "@/features/dashboard/components/dashboard-page-content";

import { dashboardService, parseRole } from "@/features/dashboard/data/dashboard-data";

export const metadata: Metadata = {
  title: "Dashboard | Cable OS",
};

type DashboardPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const role = parseRole(params?.role);
  const summary = await dashboardService.summary(role);

  return <DashboardPageContent role={role} summary={summary} />;
}
