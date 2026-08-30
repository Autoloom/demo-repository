/* Dashboard-specific Next.js error boundary. */

"use client";

import { AlertTriangle, RefreshCcw } from "lucide-react";

import { Button } from "@/components/ui";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <section className="max-w-lg rounded-lg border border-danger/30 bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-start gap-3">
          <span className="rounded-md border border-danger/30 bg-danger/10 p-2 text-danger">
            <AlertTriangle className="size-5" aria-hidden={true} />
          </span>
          <div>
            <h1 className="text-lg font-semibold">Dashboard could not load</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              The command cockpit hit an unexpected error. Retry will re-run the dashboard data load.
            </p>
          </div>
        </div>
        <div className="rounded-md border bg-background p-3">
          <p className="text-sm text-muted-foreground">{error.message}</p>
        </div>
        <div className="mt-4">
          <Button type="button" onClick={reset}>
            <RefreshCcw className="size-4" aria-hidden={true} />
            Retry dashboard
          </Button>
        </div>
      </section>
    </main>
  );
}
