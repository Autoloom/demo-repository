"use client";

/**
 * Review GTPs — the list view (PRD P0-10).
 *
 * Shows every GTP made so far with its status and age-in-status, so the person chasing a
 * divisional engineer's stamp can see what's waiting. Opening one goes to the existing detail
 * view, which is where edits and sign-offs happen.
 */
import { CircleAlert, FileStack, RefreshCw } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/domain/format";
import { dataService, type CableStore, type Gtp, type GtpStatus } from "@/lib/services";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<GtpStatus, string> = {
  Draft: "border-border bg-muted text-muted-foreground",
  "Pending sign-off": "border-warning/30 bg-warning/10 text-warning",
  Approved: "border-success/30 bg-success/10 text-success",
};

/** Days a GTP has sat in its current status — the nudge to chase a stamp. */
function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

/** Waiting longer than this on a sign-off turns the age amber. */
const STALE_DAYS = 10;

export default function ReviewGtpsPage() {
  const [store, setStore] = React.useState<CableStore | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [statusFilter, setStatusFilter] = React.useState<GtpStatus | "All">("All");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStore(await dataService.read());
    } catch (err) {
      setError(err instanceof Error ? err.message : "GTP records could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const handle = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(handle);
  }, [load]);

  const all: Gtp[] = React.useMemo(
    () => (store?.gtps ?? []).filter((g) => !g.isTemplate),
    [store],
  );
  const visible = statusFilter === "All" ? all : all.filter((g) => g.status === statusFilter);

  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <header className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
            <FileStack className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            Review GTPs
          </h1>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              Refresh
            </Button>
            <Link href="/gtp" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
              Back to GTP
            </Link>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Every GTP made so far. Open one to review or change it.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {(["All", "Draft", "Pending sign-off", "Approved"] as const).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setStatusFilter(status)}
            aria-pressed={statusFilter === status}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm transition-colors",
              statusFilter === status
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {status}
            {status !== "All" ? (
              <span className="ml-1.5 font-mono text-xs">{all.filter((g) => g.status === status).length}</span>
            ) : null}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg border border-border bg-muted" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-danger/30 bg-danger/10 p-4">
          <div className="flex items-start gap-3">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
            <div>
              <p className="text-sm text-foreground">{error}</p>
              <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/50 p-8 text-center">
          <FileStack className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 font-medium text-foreground">
            {all.length === 0 ? "No GTPs yet" : `No ${statusFilter.toLowerCase()} GTPs`}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {all.length === 0
              ? "Make your first one — the IS values fill themselves in."
              : "Try a different status filter."}
          </p>
          {all.length === 0 ? (
            <Button asChild className="mt-4">
              <Link href="/gtp/new">New GTP</Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted text-xs text-muted-foreground">
              <tr>
                <th className="p-3 font-medium">GTP</th>
                <th className="p-3 font-medium">Board / customer</th>
                <th className="p-3 font-medium">Cable</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Waiting</th>
                <th className="p-3 font-medium">Updated</th>
                <th className="p-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((gtp) => {
                const age = daysSince(gtp.updatedAt);
                const stale = gtp.status === "Pending sign-off" && age >= STALE_DAYS;
                return (
                  <tr key={gtp.id} className="border-t border-border">
                    <td className="p-3 font-mono text-xs">
                      {gtp.id}
                      <span className="ml-1 text-muted-foreground">v{gtp.version}</span>
                    </td>
                    <td className="p-3">{gtp.boardName}</td>
                    <td className="p-3 text-muted-foreground">{gtp.cableType}</td>
                    <td className="p-3">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-sm border px-2 py-1 text-xs font-medium",
                          STATUS_TONE[gtp.status],
                        )}
                      >
                        {gtp.status}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={cn("font-mono text-xs", stale ? "font-medium text-warning" : "text-muted-foreground")}>
                        {age} day{age === 1 ? "" : "s"}
                      </span>
                      {stale ? <span className="ml-1 text-xs text-warning">chase it</span> : null}
                    </td>
                    <td className="p-3 font-mono text-xs text-muted-foreground">{formatDate(gtp.updatedAt)}</td>
                    <td className="p-3">
                      <Link
                        href={`/gtp?gtpId=${gtp.id}`}
                        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
