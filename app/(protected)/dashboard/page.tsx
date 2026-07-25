import type { Metadata } from "next";

import { DashboardPageContent } from "@/components/features/dashboard/DashboardPageContent";

import { dashboardService, parseRole } from "./data";

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
