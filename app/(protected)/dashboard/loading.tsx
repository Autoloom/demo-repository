import { Gauge } from "lucide-react";

export default function DashboardLoading() {
  return (
    <main className="flex min-h-screen flex-col gap-6 bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <section className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex max-w-3xl flex-col gap-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Gauge className="size-4" aria-hidden={true} />
              <span className="text-xs font-medium">Loading command cockpit</span>
            </div>
            <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
            <div className="h-4 w-full animate-pulse rounded-md bg-muted" />
          </div>
          <div className="hidden gap-2 sm:flex">
            <div className="h-8 w-20 animate-pulse rounded-md bg-muted" />
            <div className="h-8 w-20 animate-pulse rounded-md bg-muted" />
            <div className="h-8 w-20 animate-pulse rounded-md bg-muted" />
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="mb-4 h-4 w-32 animate-pulse rounded-md bg-muted" />
        <div className="grid gap-3 md:grid-cols-5">
          {["Inquiry", "Quote", "Order", "Dispatch", "Invoice"].map((stage) => (
            <div key={stage} className="rounded-md border bg-background p-3">
              <div className="mb-3 h-4 animate-pulse rounded-md bg-muted" />
              <div className="h-2 animate-pulse rounded-sm bg-muted" />
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <SkeletonPanel />
        <SkeletonPanel />
        <SkeletonPanel />
      </section>

      <section className="grid gap-4 xl:grid-cols-5">
        <SkeletonPanel className="xl:col-span-2" />
        <SkeletonPanel className="xl:col-span-3" />
      </section>
    </main>
  );
}

function SkeletonPanel({ className }: { className?: string }) {
  return (
    <section className={`rounded-lg border bg-card p-4 shadow-sm ${className ?? ""}`}>
      <div className="mb-4 flex items-start gap-3">
        <div className="size-9 animate-pulse rounded-md bg-muted" />
        <div className="flex flex-1 flex-col gap-2">
          <div className="h-4 w-32 animate-pulse rounded-md bg-muted" />
          <div className="h-3 w-48 animate-pulse rounded-md bg-muted" />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="h-12 animate-pulse rounded-md bg-muted" />
        <div className="h-12 animate-pulse rounded-md bg-muted" />
        <div className="h-12 animate-pulse rounded-md bg-muted" />
      </div>
    </section>
  );
}
