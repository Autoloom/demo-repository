"use client";

import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  FileCheck2Icon,
  InboxIcon,
  PackageCheckIcon,
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
  dispatchService,
  integrationsService,
  type CableStore,
  type Dispatch,
} from "@/lib/services";
import { actorFromSession, useSessionStore } from "@/lib/store/session";
import { cn } from "@/lib/utils";

type LoadState = {
  dispatches: Dispatch[];
  store: CableStore | null;
};

function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-sm border px-2 py-1 text-xs font-medium", className)}>
      {children}
    </span>
  );
}

function SkeletonCards() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {[0, 1].map((item) => (
        <div key={item} className="rounded-md border bg-card p-4">
          <div className="h-5 w-40 rounded-sm bg-muted" />
          <div className="mt-4 space-y-2">
            <div className="h-10 rounded-md bg-muted" />
            <div className="h-10 rounded-md bg-muted" />
            <div className="h-10 rounded-md bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

function requiredProgress(dispatch: Dispatch) {
  const required = dispatch.checklist.filter((item) => item.required);
  const done = required.filter((item) => item.done).length;
  return { done, total: required.length, ready: required.length > 0 && done === required.length };
}

function orderFor(store: CableStore | null, dispatch: Dispatch) {
  return store?.orders.find((order) => order.id === dispatch.orderId);
}

function customerName(store: CableStore | null, customerId?: string) {
  return store?.customers.find((customer) => customer.id === customerId)?.name ?? customerId ?? "Unlinked customer";
}

async function fetchDispatchPageData(): Promise<LoadState> {
  const [dispatches, store] = await Promise.all([dispatchService.list(), dataService.read()]);
  return { dispatches, store };
}

export default function DispatchPage() {
  const role = useSessionStore((state) => state.role);
  const [data, setData] = React.useState<LoadState>({ dispatches: [], store: null });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const editable = can(role, "edit", "dispatch");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchDispatchPageData());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dispatch checklist could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let active = true;
    fetchDispatchPageData()
      .then((nextData) => {
        if (active) setData(nextData);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Dispatch checklist could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function toggle(dispatchId: string, itemId: string, done: boolean) {
    setBusy(`${dispatchId}-${itemId}`);
    setError(null);
    try {
      await dispatchService.toggleChecklist(dispatchId, itemId, done, actorFromSession());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checklist update failed.");
    } finally {
      setBusy(null);
    }
  }

  async function generateEway(dispatchId: string) {
    setBusy(`${dispatchId}-eway`);
    setError(null);
    try {
      await integrationsService.generateEwayBill(dispatchId, actorFromSession());
      await dispatchService.toggleChecklist(dispatchId, "eway", true, actorFromSession());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "E-way bill generation failed.");
    } finally {
      setBusy(null);
    }
  }

  const readyCount = data.dispatches.filter((dispatch) => requiredProgress(dispatch).ready).length;
  const blockers = data.dispatches.length - readyCount;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
            <TruckIcon className="size-4" />
            Dispatch handoff
          </div>
          <h1 className="text-2xl font-semibold">Dispatch Checklist</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Clear drum marking, test certificate, packing list, invoice readiness, and e-way bill before Accounts syncs the invoice.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()}>
          <RefreshCwIcon className="mr-2 size-4" />
          Refresh
        </Button>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        <div className="rounded-md border bg-card p-4">
          <p className="text-sm text-muted-foreground">Ready cards</p>
          <p className="mt-2 font-mono text-2xl font-semibold">{readyCount}</p>
        </div>
        <div className="rounded-md border bg-card p-4">
          <p className="text-sm text-muted-foreground">Open blockers</p>
          <p className="mt-2 font-mono text-2xl font-semibold">{blockers}</p>
        </div>
        <div className="rounded-md border bg-card p-4">
          <p className="text-sm text-muted-foreground">Edit access</p>
          <p className="mt-2 text-sm font-medium">{editable ? `${role} can complete checklist items` : `${role} is view-only`}</p>
        </div>
      </section>

      {loading ? <SkeletonCards /> : null}

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

      {!loading && !error && data.dispatches.length === 0 ? (
        <div className="rounded-md border bg-card p-8 text-center">
          <InboxIcon className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-3 font-medium">No dispatch cards</h2>
          <p className="mt-1 text-sm text-muted-foreground">Dispatch cards are created when quotes move to the order board.</p>
        </div>
      ) : null}

      {!loading && !error && data.dispatches.length > 0 ? (
        <section className="grid gap-4 lg:grid-cols-2">
          {data.dispatches.map((dispatch) => {
            const order = orderFor(data.store, dispatch);
            const progress = requiredProgress(dispatch);
            return (
              <article key={dispatch.id} className="rounded-md border bg-card p-4 shadow-sm">
                <div className="flex flex-col gap-3 border-b pb-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-medium">{order?.title ?? dispatch.orderId}</h2>
                      <Badge className={progress.ready ? "border-success/30 bg-success/10 text-success" : "border-warning/30 bg-warning/10 text-warning"}>
                        {progress.ready ? "Ready" : `${progress.done}/${progress.total} ready`}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{customerName(data.store, order?.customerId)}</p>
                    <p className="mt-2 font-mono text-xs text-muted-foreground">{dispatch.id} · {dispatch.orderId}</p>
                  </div>
                  <div className="text-sm md:text-right">
                    <p className="font-mono font-medium">{formatINR(order?.amountInr ?? 0)}</p>
                    <p className="mt-1 text-muted-foreground">Created {formatDate(dispatch.createdAt)}</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-md border bg-background p-3">
                    <p className="text-xs font-medium uppercase text-muted-foreground">Transporter</p>
                    <p className="mt-2 text-sm">{dispatch.transporter}</p>
                  </div>
                  <div className="rounded-md border bg-background p-3">
                    <p className="text-xs font-medium uppercase text-muted-foreground">Vehicle</p>
                    <p className="mt-2 font-mono text-sm">{dispatch.vehicleNo || "Pending"}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-5 gap-1" aria-label={`${progress.done} of ${progress.total} checklist items complete`}>
                  {dispatch.checklist.filter((item) => item.required).map((item) => (
                    <span key={item.id} className={cn("h-1 rounded-sm", item.done ? "bg-success" : "bg-muted")} />
                  ))}
                </div>

                <div className="mt-4 space-y-2">
                  {dispatch.checklist.map((item) => (
                    <label key={item.id} className="flex min-h-10 items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm">
                      <span className="flex items-center gap-2">
                        {item.done ? <CheckCircle2Icon className="size-4 text-success" /> : <FileCheck2Icon className="size-4 text-muted-foreground" />}
                        <span>{item.label}</span>
                        {!item.required ? <Badge className="border-border bg-muted text-muted-foreground">Optional</Badge> : null}
                      </span>
                      <input
                        type="checkbox"
                        checked={item.done}
                        disabled={!editable || busy === `${dispatch.id}-${item.id}`}
                        onChange={(event) => void toggle(dispatch.id, item.id, event.target.checked)}
                        className="size-4 accent-primary disabled:cursor-not-allowed"
                      />
                    </label>
                  ))}
                </div>

                <div className="mt-4 rounded-md border bg-muted p-3 text-sm">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-medium">E-way bill</p>
                      <p className="mt-1 text-muted-foreground">
                        {dispatch.ewayBillRequired ? "Required for this consignment" : "Not required below threshold"}
                        {dispatch.ewayBillNo ? ` · ${dispatch.ewayBillNo}` : ""}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      disabled={!editable || !dispatch.ewayBillRequired || Boolean(dispatch.ewayBillNo) || busy === `${dispatch.id}-eway`}
                      onClick={() => void generateEway(dispatch.id)}
                    >
                      <PackageCheckIcon className="mr-2 size-4" />
                      Generate
                    </Button>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/orders?orderId=${dispatch.orderId}`}>View order board</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/records/${dispatch.orderId}`}>View journey</Link>
                  </Button>
                </div>
              </article>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}
