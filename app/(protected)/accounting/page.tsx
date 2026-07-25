"use client";

import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  FileTextIcon,
  InboxIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  UploadCloudIcon,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { formatDate, formatINR } from "@/lib/domain/format";
import { can } from "@/lib/rbac";
import {
  dataService,
  invoicesService,
  type CableStore,
  type Invoice,
  type InvoiceStatus,
  type RiskLevel,
  type SyncStatus,
} from "@/lib/services";
import { actorFromSession, useSessionStore } from "@/lib/store/session";
import { cn } from "@/lib/utils";

type LoadState = {
  invoices: Invoice[];
  store: CableStore | null;
};

const riskTones: Record<RiskLevel, string> = {
  Low: "border-success/30 bg-success/10 text-success",
  Medium: "border-warning/30 bg-warning/10 text-warning",
  High: "border-danger/30 bg-danger/10 text-danger",
};

const syncTones: Record<SyncStatus, string> = {
  "Not synced": "border-border bg-muted text-muted-foreground",
  "Ready to sync": "border-info/30 bg-info/10 text-info",
  "Synced to Zoho Books": "border-success/30 bg-success/10 text-success",
  "Sync failed": "border-danger/30 bg-danger/10 text-danger",
  "Missing dispatch data": "border-warning/30 bg-warning/10 text-warning",
};

const statusTones: Record<InvoiceStatus, string> = {
  Draft: "border-border bg-muted text-muted-foreground",
  "Ready to sync": "border-info/30 bg-info/10 text-info",
  "Payment pending": "border-warning/30 bg-warning/10 text-warning",
  Paid: "border-success/30 bg-success/10 text-success",
  Overdue: "border-danger/30 bg-danger/10 text-danger",
  Blocked: "border-danger/30 bg-danger/10 text-danger",
};

function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-sm border px-2 py-1 text-xs font-medium", className)}>
      {children}
    </span>
  );
}

function SkeletonTable() {
  return (
    <div className="rounded-md border bg-card">
      <div className="grid gap-3 p-4">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-14 rounded-md bg-muted" />
        ))}
      </div>
    </div>
  );
}

function customerName(store: CableStore | null, customerId: string) {
  return store?.customers.find((customer) => customer.id === customerId)?.name ?? customerId;
}

function orderTitle(store: CableStore | null, orderId: string) {
  return store?.orders.find((order) => order.id === orderId)?.title ?? orderId;
}

async function fetchAccountingPageData(): Promise<LoadState> {
  const [invoices, store] = await Promise.all([invoicesService.list(), dataService.read()]);
  return { invoices, store };
}

export default function AccountingPage() {
  const role = useSessionStore((state) => state.role);
  const [data, setData] = React.useState<LoadState>({ invoices: [], store: null });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const canSync = can(role, "sync", "invoice");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchAccountingPageData());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invoice readiness could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let active = true;
    fetchAccountingPageData()
      .then((nextData) => {
        if (active) setData(nextData);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Invoice readiness could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function sync(invoiceId: string) {
    setBusyId(invoiceId);
    setError(null);
    try {
      await invoicesService.sync(invoiceId, actorFromSession());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invoice sync failed.");
    } finally {
      setBusyId(null);
    }
  }

  const totalValue = data.invoices.reduce((sum, invoice) => sum + invoice.totalInr, 0);
  const synced = data.invoices.filter((invoice) => invoice.syncStatus === "Synced to Zoho Books").length;
  const pending = data.invoices.filter((invoice) => invoice.syncStatus === "Ready to sync").length;
  const holds = data.invoices.filter((invoice) => invoice.syncStatus === "Missing dispatch data" || invoice.risk === "High").length;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
            <FileTextIcon className="size-4" />
            Accounts terminal step
          </div>
          <h1 className="text-2xl font-semibold">Invoice Readiness</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Track GST split, dispatch blockers, and mock Zoho Books sync. Syncing an invoice closes the linked order as invoiced.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()}>
          <RefreshCwIcon className="mr-2 size-4" />
          Refresh
        </Button>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <div className="rounded-md border bg-card p-4">
          <p className="text-sm text-muted-foreground">Receivables tracked</p>
          <p className="mt-2 font-mono text-2xl font-semibold">{formatINR(totalValue)}</p>
        </div>
        <div className="rounded-md border bg-card p-4">
          <p className="text-sm text-muted-foreground">Synced</p>
          <p className="mt-2 font-mono text-2xl font-semibold">{synced}</p>
        </div>
        <div className="rounded-md border bg-card p-4">
          <p className="text-sm text-muted-foreground">Pending sync</p>
          <p className="mt-2 font-mono text-2xl font-semibold">{pending}</p>
        </div>
        <div className="rounded-md border bg-card p-4">
          <p className="text-sm text-muted-foreground">Payment or dispatch holds</p>
          <p className="mt-2 font-mono text-2xl font-semibold">{holds}</p>
        </div>
      </section>

      {loading ? <SkeletonTable /> : null}

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

      {!loading && !error && data.invoices.length === 0 ? (
        <div className="rounded-md border bg-card p-8 text-center">
          <InboxIcon className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-3 font-medium">No invoices yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">Invoices are created when quotes are sent to the order board.</p>
        </div>
      ) : null}

      {!loading && !error && data.invoices.length > 0 ? (
        <section className="overflow-hidden rounded-md border bg-card">
          <div className="grid grid-cols-12 gap-3 border-b bg-muted px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
            <span className="col-span-3">Document</span>
            <span className="col-span-2">Customer</span>
            <span className="col-span-2">GST split</span>
            <span className="col-span-2">Risk / due</span>
            <span className="col-span-2">Sync</span>
            <span className="col-span-1 text-right">Action</span>
          </div>
          <div className="divide-y">
            {data.invoices.map((invoice) => {
              const blocked = invoice.syncStatus === "Missing dispatch data";
              return (
                <article key={invoice.id} className="grid grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-12 lg:items-center">
                  <div className="lg:col-span-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-medium">{invoice.id}</span>
                      <Badge className={statusTones[invoice.status]}>{invoice.status}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{orderTitle(data.store, invoice.orderId)}</p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">HSN {invoice.hsnCode}</p>
                  </div>
                  <div className="text-sm lg:col-span-2">{customerName(data.store, invoice.customerId)}</div>
                  <div className="space-y-1 text-sm lg:col-span-2">
                    <p className="font-mono">{formatINR(invoice.taxableInr)}</p>
                    <p className="text-muted-foreground">
                      {invoice.igstInr ? `IGST ${formatINR(invoice.igstInr)}` : `CGST ${formatINR(invoice.cgstInr ?? 0)} · SGST ${formatINR(invoice.sgstInr ?? 0)}`}
                    </p>
                    <p className="font-mono font-medium">{formatINR(invoice.totalInr)}</p>
                  </div>
                  <div className="space-y-2 lg:col-span-2">
                    <Badge className={riskTones[invoice.risk]}>
                      {invoice.risk === "High" ? <ShieldAlertIcon className="mr-1 size-3" /> : null}
                      {invoice.risk} risk
                    </Badge>
                    <p className="font-mono text-xs text-muted-foreground">Due {formatDate(invoice.dueDate)}</p>
                  </div>
                  <div className="space-y-2 lg:col-span-2">
                    <Badge className={syncTones[invoice.syncStatus]}>
                      {invoice.syncStatus === "Synced to Zoho Books" ? <CheckCircle2Icon className="mr-1 size-3" /> : null}
                      {invoice.syncStatus}
                    </Badge>
                    {invoice.zohoBooksId ? <p className="font-mono text-xs text-muted-foreground">{invoice.zohoBooksId}</p> : null}
                    {blocked ? <p className="text-xs text-warning">Complete dispatch checklist first.</p> : null}
                  </div>
                  <div className="flex flex-wrap justify-start gap-2 lg:col-span-1 lg:justify-end">
                    <Button
                      type="button"
                      size="sm"
                      disabled={!canSync || blocked || busyId === invoice.id}
                      onClick={() => void sync(invoice.id)}
                    >
                      <UploadCloudIcon className="mr-2 size-4" />
                      Sync
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/records/${invoice.orderId}`}>Journey</Link>
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
