"use client";

import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CableIcon,
  CalendarDaysIcon,
  CheckCircle2Icon,
  ClipboardListIcon,
  InboxIcon,
  RefreshCwIcon,
  TruckIcon,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { formatDate, formatINR } from "@/lib/domain/format";
import { can } from "@/lib/rbac";
import {
  dataService,
  ordersService,
  type CableStore,
  type Order,
  type OrderStage,
  type Priority,
} from "@/lib/services";
import { actorFromSession, useSessionStore } from "@/lib/store/session";
import { cn } from "@/lib/utils";

type LoadState = {
  orders: Order[];
  store: CableStore | null;
};

const stages: OrderStage[] = ["Quoted", "Won", "In Production", "Ready for Dispatch", "Invoiced"];

const stageTones: Record<OrderStage, string> = {
  Quoted: "border-stage-quote/30 bg-stage-quote/10 text-stage-quote",
  Won: "border-stage-order/30 bg-stage-order/10 text-stage-order",
  "In Production": "border-info/30 bg-info/10 text-info",
  "Ready for Dispatch": "border-stage-dispatch/30 bg-stage-dispatch/10 text-stage-dispatch",
  Invoiced: "border-stage-invoice/30 bg-stage-invoice/10 text-stage-invoice",
};

const priorityTones: Record<Priority, string> = {
  Low: "border-success/30 bg-success/10 text-success",
  Medium: "border-warning/30 bg-warning/10 text-warning",
  High: "border-danger/30 bg-danger/10 text-danger",
};

function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-sm border px-2 py-1 text-xs font-medium", className)}>
      {children}
    </span>
  );
}

function SkeletonBoard() {
  return (
    <div className="grid gap-4 xl:grid-cols-5">
      {stages.map((stage) => (
        <div key={stage} className="rounded-md border bg-card p-3">
          <div className="h-4 w-24 rounded-sm bg-muted" />
          <div className="mt-4 space-y-3">
            <div className="h-28 rounded-md bg-muted" />
            <div className="h-24 rounded-md bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

function customerName(store: CableStore | null, customerId: string) {
  return store?.customers.find((customer) => customer.id === customerId)?.name ?? customerId;
}

function dispatchProgress(store: CableStore | null, order: Order) {
  const dispatch = store?.dispatches.find((item) => item.id === order.dispatchId || item.orderId === order.id);
  if (!dispatch) return { done: 0, total: 5, ready: false };
  const required = dispatch.checklist.filter((item) => item.required);
  const done = required.filter((item) => item.done).length;
  return { done, total: required.length, ready: required.length > 0 && done === required.length };
}

async function fetchOrderPageData(): Promise<LoadState> {
  const [orders, store] = await Promise.all([ordersService.list(), dataService.read()]);
  return { orders, store };
}

export default function OrdersPage() {
  const role = useSessionStore((state) => state.role);
  const [data, setData] = React.useState<LoadState>({ orders: [], store: null });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const editable = can(role, "transition", "order");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchOrderPageData());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Order board could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let active = true;
    fetchOrderPageData()
      .then((nextData) => {
        if (active) setData(nextData);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Order board could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function transition(orderId: string, stage: OrderStage) {
    setBusyId(orderId);
    setError(null);
    try {
      await ordersService.transition(orderId, stage, actorFromSession());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Stage transition failed.");
    } finally {
      setBusyId(null);
    }
  }

  const activeValue = data.orders
    .filter((order) => order.stage !== "Invoiced")
    .reduce((sum, order) => sum + order.amountInr, 0);
  const readyCount = data.orders.filter((order) => order.stage === "Ready for Dispatch").length;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
            <ClipboardListIcon className="size-4" />
            Operations chain
          </div>
          <h1 className="text-2xl font-semibold">Order Board</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Move won work through production, dispatch readiness, and invoicing. Sales and Accounts can inspect the same board; Operations and Owner can transition stages.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => void load()}>
            <RefreshCwIcon className="mr-2 size-4" />
            Refresh
          </Button>
          <Button asChild>
            <Link href="/job-card">
              Open job cards
              <ArrowRightIcon className="ml-2 size-4" />
            </Link>
          </Button>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        <div className="rounded-md border bg-card p-4">
          <p className="text-sm text-muted-foreground">Active order value</p>
          <p className="mt-2 font-mono text-2xl font-semibold">{formatINR(activeValue)}</p>
        </div>
        <div className="rounded-md border bg-card p-4">
          <p className="text-sm text-muted-foreground">Ready for dispatch</p>
          <p className="mt-2 font-mono text-2xl font-semibold">{readyCount}</p>
        </div>
        <div className="rounded-md border bg-card p-4">
          <p className="text-sm text-muted-foreground">Transition authority</p>
          <p className="mt-2 text-sm font-medium">{editable ? `${role} can move orders` : `${role} is view-only here`}</p>
        </div>
      </section>

      {loading ? <SkeletonBoard /> : null}

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

      {!loading && !error && data.orders.length === 0 ? (
        <div className="rounded-md border bg-card p-8 text-center">
          <InboxIcon className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-3 font-medium">No orders yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">Send an approved quote to the board to create the first order.</p>
          <Button asChild className="mt-4">
            <Link href="/quote">Open Quote Builder</Link>
          </Button>
        </div>
      ) : null}

      {!loading && !error && data.orders.length > 0 ? (
        <section className="grid gap-4 xl:grid-cols-5">
          {stages.map((stage) => {
            const rows = data.orders.filter((order) => order.stage === stage);
            return (
              <div key={stage} className="rounded-md border bg-card">
                <div className="flex items-center justify-between border-b bg-muted px-3 py-3">
                  <Badge className={stageTones[stage]}>{stage}</Badge>
                  <span className="font-mono text-xs text-muted-foreground">{rows.length}</span>
                </div>
                <div className="space-y-3 p-3">
                  {rows.length === 0 ? (
                    <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">No orders in this stage</div>
                  ) : null}
                  {rows.map((order) => {
                    const dispatch = dispatchProgress(data.store, order);
                    return (
                      <article key={order.id} className="rounded-md border bg-background p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h2 className="font-medium">{order.title}</h2>
                            <p className="mt-1 text-sm text-muted-foreground">{customerName(data.store, order.customerId)}</p>
                          </div>
                          <Badge className={priorityTones[order.priority]}>{order.priority}</Badge>
                        </div>
                        <p className="mt-3 font-mono text-xs text-muted-foreground">{order.id}</p>
                        <div className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
                          <CableIcon className="mt-0.5 size-4" />
                          <span>{order.specSummary}</span>
                        </div>
                        <div className="mt-4 grid grid-cols-5 gap-1" aria-label={`${order.completionPct}% complete`}>
                          {[20, 40, 60, 80, 100].map((step) => (
                            <span key={step} className={cn("h-1 rounded-sm", order.completionPct >= step ? "bg-primary" : "bg-muted")} />
                          ))}
                        </div>
                        <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                          <span className="font-mono font-medium">{formatINR(order.amountInr)}</span>
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <CalendarDaysIcon className="size-4" />
                            {formatDate(order.promisedDate)}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Badge className={dispatch.ready ? "border-success/30 bg-success/10 text-success" : "border-warning/30 bg-warning/10 text-warning"}>
                            {dispatch.ready ? <CheckCircle2Icon className="mr-1 size-3" /> : <TruckIcon className="mr-1 size-3" />}
                            Dispatch {dispatch.done}/{dispatch.total}
                          </Badge>
                        </div>
                        <div className="mt-4 grid gap-2">
                          <label className="text-xs font-medium text-muted-foreground" htmlFor={`${order.id}-stage`}>
                            Move stage
                          </label>
                          <select
                            id={`${order.id}-stage`}
                            value={order.stage}
                            disabled={!editable || busyId === order.id}
                            onChange={(event) => void transition(order.id, event.target.value as OrderStage)}
                            className="h-9 rounded-md border bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {stages.map((item) => (
                              <option key={item} value={item}>
                                {item}
                              </option>
                            ))}
                          </select>
                          <div className="flex flex-wrap gap-2">
                            <Button asChild variant="outline" size="sm">
                              <Link href={`/records/${order.id}`}>Journey</Link>
                            </Button>
                            <Button asChild variant="outline" size="sm">
                              <Link href={`/job-card?orderId=${order.id}`}>Job card</Link>
                            </Button>
                            <Button asChild variant="outline" size="sm">
                              <Link href={`/dispatch?orderId=${order.id}`}>Dispatch</Link>
                            </Button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}
