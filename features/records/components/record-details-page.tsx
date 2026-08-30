/*  End-to-end record journey/details view showing related stages,
    activity, dispatch readiness, and role-dependent timeline information. */

"use client";

import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CableIcon,
  CheckCircle2Icon,
  CircleIcon,
  FileTextIcon,
  InboxIcon,
  LockKeyholeIcon,
  RefreshCwIcon,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { formatDate, formatINR } from "@/lib/domain/format";
import { can } from "@/lib/rbac";
import {
  dataService,
  journeyService,
  type ActivityEvent,
  type CableStore,
  type Customer,
  type Dispatch,
  type Inquiry,
  type Invoice,
  type Order,
  type Quote,
} from "@/lib/services";
import { useSessionStore } from "@/lib/store/session";
import { cn } from "@/lib/utils";

type Chain = {
  customer?: Customer;
  inquiry?: Inquiry;
  quote?: Quote;
  order?: Order;
  dispatch?: Dispatch;
  invoice?: Invoice;
};

type LoadState = {
  chain: Chain | null;
  store: CableStore | null;
};

type StageNode = {
  label: string;
  recordId?: string;
  status: "done" | "current" | "upcoming" | "locked";
  route: string;
  facts: string[];
  resource: "inquiry" | "quote" | "order" | "dispatch" | "invoice";
};

function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-sm border px-2 py-1 text-xs font-medium", className)}>
      {children}
    </span>
  );
}

function isReady(dispatch?: Dispatch) {
  if (!dispatch) return false;
  const required = dispatch.checklist.filter((item) => item.required);
  return required.length > 0 && required.every((item) => item.done);
}

function timeline(chain: Chain, role: ReturnType<typeof useSessionStore.getState>["role"]): StageNode[] {
  const orderId = chain.order?.id;
  const nodes: StageNode[] = [
    {
      label: "Inquiry",
      recordId: chain.inquiry?.id,
      status: chain.inquiry ? "done" : "upcoming",
      route: `/sales?inquiryId=${chain.inquiry?.id ?? ""}`,
      facts: chain.inquiry ? [chain.inquiry.stage, chain.inquiry.requirement] : ["No inquiry linked"],
      resource: "inquiry",
    },
    {
      label: "Quote",
      recordId: chain.quote?.id,
      status: chain.quote ? (chain.order ? "done" : "current") : "upcoming",
      route: chain.quote ? `/quote/${chain.quote.id}` : "/quote",
      facts: chain.quote ? [chain.quote.status, formatINR(chain.quote.totalInr)] : ["Quote pending"],
      resource: "quote",
    },
    {
      label: "Order",
      recordId: chain.order?.id,
      status: chain.order ? (chain.order.stage === "Invoiced" ? "done" : "current") : "upcoming",
      route: orderId ? `/orders?orderId=${orderId}` : "/orders",
      facts: chain.order ? [chain.order.stage, `${chain.order.completionPct}% complete`] : ["Not on board"],
      resource: "order",
    },
    {
      label: "Dispatch",
      recordId: chain.dispatch?.id,
      status: chain.dispatch ? (isReady(chain.dispatch) ? "done" : "current") : "upcoming",
      route: orderId ? `/dispatch?orderId=${orderId}` : "/dispatch",
      facts: chain.dispatch ? [isReady(chain.dispatch) ? "Checklist complete" : "Checklist open", chain.dispatch.ewayBillNo ?? "E-way pending"] : ["Dispatch not created"],
      resource: "dispatch",
    },
    {
      label: "Invoice",
      recordId: chain.invoice?.id,
      status: chain.invoice?.syncStatus === "Synced to Zoho Books" ? "done" : chain.invoice ? "current" : "upcoming",
      route: "/accounting",
      facts: chain.invoice ? [chain.invoice.syncStatus, formatINR(chain.invoice.totalInr)] : ["Invoice not created"],
      resource: "invoice",
    },
  ];

  return nodes.map((node) => (can(role, "view", node.resource) ? node : { ...node, status: "locked" }));
}

function relatedActivity(store: CableStore | null, chain: Chain | null): ActivityEvent[] {
  if (!store || !chain) return [];
  const ids = new Set([
    chain.inquiry?.id,
    chain.quote?.id,
    chain.order?.id,
    chain.dispatch?.id,
    chain.invoice?.id,
    chain.order?.jobCardId,
  ].filter(Boolean));
  return store.activity.filter((event) => ids.has(event.recordId)).slice(0, 8);
}

async function fetchJourneyPageData(recordId: string): Promise<LoadState> {
  const [chain, store] = await Promise.all([journeyService.get(recordId), dataService.read()]);
  return { chain, store };
}

export default function RecordJourneyPage() {
  const params = useParams<{ recordId: string }>();
  const role = useSessionStore((state) => state.role);
  const recordId = params.recordId;
  const [data, setData] = React.useState<LoadState>({ chain: null, store: null });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchJourneyPageData(recordId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Record journey could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [recordId]);

  React.useEffect(() => {
    let active = true;
    fetchJourneyPageData(recordId)
      .then((nextData) => {
        if (active) setData(nextData);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Record journey could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [recordId]);

  const chain = data.chain;
  const nodes = chain ? timeline(chain, role) : [];
  const activities = relatedActivity(data.store, chain);
  const currentOrder = chain?.order;
  const currentAmount = chain?.invoice?.totalInr ?? chain?.order?.amountInr ?? chain?.quote?.totalInr ?? chain?.inquiry?.estimatedValueInr ?? 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
            <FileTextIcon className="size-4" />
            Chronological clarity
          </div>
          <h1 className="text-2xl font-semibold">Record Journey</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Resolve any inquiry, quote, order, dispatch, or invoice ID into one customer journey.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()}>
          <RefreshCwIcon className="mr-2 size-4" />
          Refresh
        </Button>
      </header>

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="h-48 rounded-md border bg-card p-4 lg:col-span-2">
            <div className="h-5 w-48 rounded-sm bg-muted" />
            <div className="mt-6 space-y-3">
              <div className="h-12 rounded-md bg-muted" />
              <div className="h-12 rounded-md bg-muted" />
              <div className="h-12 rounded-md bg-muted" />
            </div>
          </div>
          <div className="h-48 rounded-md border bg-card p-4">
            <div className="h-5 w-28 rounded-sm bg-muted" />
          </div>
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

      {!loading && !error && !chain?.customer && !chain?.order && !chain?.quote && !chain?.inquiry ? (
        <div className="rounded-md border bg-card p-8 text-center">
          <InboxIcon className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-3 font-medium">Record not found</h2>
          <p className="mt-1 text-sm text-muted-foreground">No chain could be resolved for {recordId}.</p>
        </div>
      ) : null}

      {!loading && !error && chain ? (
        <>
          <section className="rounded-md border bg-card p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold">{chain.customer?.name ?? "Unlinked customer"}</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[chain.inquiry?.id, chain.quote?.id, chain.order?.id, chain.dispatch?.id, chain.invoice?.id].filter(Boolean).map((id) => (
                    <Badge key={id} className="border-border bg-muted text-muted-foreground">{id}</Badge>
                  ))}
                </div>
                <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
                  <CableIcon className="mt-0.5 size-4" />
                  {currentOrder?.specSummary ?? chain.inquiry?.requirement ?? "Cable specification pending"}
                </p>
              </div>
              <div className="grid gap-2 text-sm lg:text-right">
                <p className="font-mono text-2xl font-semibold">{formatINR(currentAmount)}</p>
                {currentOrder ? <Badge className="border-stage-order/30 bg-stage-order/10 text-stage-order">{currentOrder.stage}</Badge> : null}
                {currentOrder ? <p className="text-muted-foreground">Promise {formatDate(currentOrder.promisedDate)}</p> : null}
              </div>
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-3">
            <section className="rounded-md border bg-card p-4 lg:col-span-2">
              <h2 className="font-medium">Journey timeline</h2>
              <div className="mt-4 space-y-3">
                {nodes.map((node) => (
                  <article key={node.label} className="rounded-md border bg-background p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="flex gap-3">
                        <span className={cn("mt-1 flex size-6 items-center justify-center rounded-md border", node.status === "done" ? "border-success/30 bg-success/10 text-success" : node.status === "current" ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground")}>
                          {node.status === "done" ? <CheckCircle2Icon className="size-4" /> : node.status === "locked" ? <LockKeyholeIcon className="size-4" /> : <CircleIcon className="size-4" />}
                        </span>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-medium">{node.label}</h3>
                            {node.recordId ? <span className="font-mono text-xs text-muted-foreground">{node.recordId}</span> : null}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {node.facts.map((fact) => (
                              <Badge key={fact} className="border-border bg-muted text-muted-foreground">{fact}</Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                      {node.status === "locked" ? (
                        <Badge className="border-border bg-muted text-muted-foreground">Locked for {role}</Badge>
                      ) : (
                        <Button asChild variant="outline" size="sm">
                          <Link href={node.route}>
                            Open
                            <ArrowRightIcon className="ml-2 size-4" />
                          </Link>
                        </Button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <aside className="space-y-4">
              <section className="rounded-md border bg-card p-4">
                <h2 className="font-medium">Related records</h2>
                <div className="mt-3 grid gap-2 text-sm">
                  {currentOrder?.jobCardId ? <Link className="rounded-md border px-3 py-2 hover:bg-muted" href={`/job-card?orderId=${currentOrder.id}`}>Job card · {currentOrder.jobCardId}</Link> : null}
                  {chain.dispatch ? <Link className="rounded-md border px-3 py-2 hover:bg-muted" href={`/dispatch?orderId=${currentOrder?.id ?? ""}`}>Dispatch · {chain.dispatch.id}</Link> : null}
                  {chain.invoice ? <Link className="rounded-md border px-3 py-2 hover:bg-muted" href="/accounting">Invoice · {chain.invoice.id}</Link> : null}
                  {chain.customer ? <Link className="rounded-md border px-3 py-2 hover:bg-muted" href={`/contacts?customerId=${chain.customer.id}`}>Contact · {chain.customer.gstin}</Link> : null}
                </div>
              </section>

              <section className="rounded-md border bg-card p-4">
                <h2 className="font-medium">Activity</h2>
                <div className="mt-3 space-y-3">
                  {activities.length === 0 ? <p className="text-sm text-muted-foreground">No activity captured for this chain yet.</p> : null}
                  {activities.map((event) => (
                    <div key={event.id} className="rounded-md border bg-background p-3 text-sm">
                      <p>{event.text}</p>
                      <p className="mt-2 font-mono text-xs text-muted-foreground">{formatDate(event.at)} · {event.actorRole}</p>
                    </div>
                  ))}
                </div>
              </section>
            </aside>
          </div>
        </>
      ) : null}
    </div>
  );
}
