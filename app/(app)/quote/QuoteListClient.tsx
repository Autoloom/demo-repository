"use client";

/**
 * Quotation — starting points and saved quotes.
 *
 * A quote can only begin from a GTP. There is no blank "new quote" here: the GTP owns the cable
 * (derived from IS tables, traceable); the quote prices what the GTP derived
 * (BUILD_PLAN_GTP_QUOTE.md §1.2). A GTP does not need its engineer stamps to be quoted — sign-off
 * gates production, not pricing — so this lists every gap-free GTP regardless of status, and
 * lists quotes already started from one.
 */
import { AlertTriangleIcon, FileCheckIcon, InboxIcon, PlusIcon, ReceiptIcon, RefreshCwIcon } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { formatDate, formatINR } from "@/lib/domain/format";
import { can } from "@/lib/rbac";
import { dataService, type CableSpec, type CableStore, type Gtp, type GtpStatus, type Quote } from "@/lib/services";
import { useSessionStore } from "@/lib/store/session";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";
const toneClass: Record<Tone, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-danger/30 bg-danger/10 text-danger",
  info: "border-info/30 bg-info/10 text-info",
};
function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-xs font-medium", toneClass[tone])}>
      {children}
    </span>
  );
}

const gtpStatusTone: Record<GtpStatus, Tone> = {
  Draft: "neutral",
  Submitted: "info",
  "Corrections received": "warning",
  Approved: "success",
};

/** A GTP a quote can start from, and why it can't yet if it can't. */
interface QuoteEligibility {
  gtp: Gtp;
  spec?: CableSpec;
  blockedReason?: string;
}

function eligibilityFor(gtp: Gtp, store: CableStore): QuoteEligibility {
  if (gtp.isTemplate) return { gtp, blockedReason: "This is a reusable format template, not an order's GTP." };
  const spec = store.specs.find((entry) => entry.id === gtp.specId);
  if (!spec) return { gtp, blockedReason: "No cable is linked to this GTP yet." };
  const hasGap = spec.gtpSource?.fields.some((field) => field.gap) ?? false;
  if (hasGap) return { gtp, spec, blockedReason: "The GTP has an unresolved parameter — resolve it before pricing." };
  return { gtp, spec };
}

export function QuoteListClient() {
  const role = useSessionStore((state) => state.role);
  const [store, setStore] = React.useState<CableStore | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const canCreate = can(role, "create", "quote");
  const canView = can(role, "view", "quote");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStore(await dataService.read());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Quotation records could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const handle = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(handle);
  }, [load]);

  if (!canView) {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger/10 p-6 text-sm text-danger">
        You do not have access to quotations.
      </div>
    );
  }

  const gtps = store?.gtps ?? [];
  const quotes = store?.quotes ?? [];
  const quotedGtpIds = new Set(quotes.map((quote) => quote.gtpId).filter((id): id is string => Boolean(id)));

  const eligible = gtps
    .filter((gtp) => !gtp.isTemplate)
    .map((gtp) => eligibilityFor(gtp, store ?? { specs: [] as CableSpec[] } as CableStore))
    .filter((row) => !quotedGtpIds.has(row.gtp.id));

  const customerName = (customerId: string) => store?.customers.find((c) => c.id === customerId)?.name;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
            <ReceiptIcon className="size-4" />
            Quotation
          </div>
          <h1 className="text-2xl font-semibold">Quotation</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Every quote starts from a GTP — the standard derives the cable, the quote prices what
            it derived. Sign-off gates production, not pricing, so a quote can start before either
            engineer stamps it.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()}>
          <RefreshCwIcon className="mr-2 size-4" />
          Refresh
        </Button>
      </header>

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-40 animate-pulse rounded-md border bg-muted" />
          <div className="h-40 animate-pulse rounded-md border bg-muted" />
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangleIcon className="size-4" />
            {error}
          </div>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      ) : null}

      {!loading && !error ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-3">
            <h2 className="font-medium">Ready to quote</h2>
            {eligible.length === 0 ? (
              <div className="rounded-md border bg-card p-8 text-center">
                <InboxIcon className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">
                  No GTPs are waiting for a quote. Generate one in{" "}
                  <Link href="/gtp/review" className="underline underline-offset-4">
                    Review GTPs
                  </Link>{" "}
                  first.
                </p>
              </div>
            ) : (
              eligible.map(({ gtp, spec, blockedReason }) => (
                <div key={gtp.id} className="rounded-md border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold">{gtp.id}</span>
                        <Badge tone={gtpStatusTone[gtp.status]}>
                          <FileCheckIcon className="size-3" />
                          {gtp.status}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm">{gtp.designation ?? gtp.cableType}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {gtp.customerId ? customerName(gtp.customerId) ?? gtp.customerId : "Customer pending"}
                        {gtp.state ? ` · ${gtp.state}` : ""}
                      </p>
                    </div>
                    {!blockedReason && canCreate ? (
                      <Button asChild size="sm">
                        <Link href={`/quote/new?gtpId=${gtp.id}`}>
                          <PlusIcon className="mr-2 size-4" />
                          Start quote
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                  {blockedReason ? (
                    <p className="mt-3 flex items-start gap-2 text-xs text-warning">
                      <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
                      {blockedReason}
                    </p>
                  ) : spec ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      {spec.conductorSizeSqMm} sq mm {spec.conductorMaterial} · {spec.insulation} · {spec.armour}
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </section>

          <section className="space-y-3">
            <h2 className="font-medium">Quotes</h2>
            {quotes.length === 0 ? (
              <div className="rounded-md border bg-card p-8 text-center">
                <ReceiptIcon className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">No quotes have been started yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {quotes.map((quote: Quote) => (
                  <Link
                    key={quote.id}
                    href={`/quote/${quote.id}`}
                    className="block rounded-md border bg-card p-4 text-sm transition-colors hover:bg-muted"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm font-semibold">{quote.id}</span>
                      <Badge
                        tone={
                          quote.status === "Approved"
                            ? "success"
                            : quote.status === "Review"
                              ? "warning"
                              : quote.status === "Rejected"
                                ? "danger"
                                : "neutral"
                        }
                      >
                        {quote.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{customerName(quote.customerId) ?? quote.customerId}</p>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Valid until {formatDate(quote.validUntil)}</span>
                      <span className="font-mono font-medium text-foreground">{formatINR(quote.totalInr)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
