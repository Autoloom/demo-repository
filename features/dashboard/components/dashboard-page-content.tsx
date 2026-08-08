/* Pure dashboard presentation layer: 
    metrics, pipeline flow, order snapshot, approvals/signals,
    priority queues, account-specific dashboard content, etc. */

"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Bell,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  Gauge,
  Inbox,
  IndianRupee,
  ListChecks,
  PackageCheck,
  ShieldAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui";
import { now } from "@/lib/domain/clock";
import { formatDate, formatINR } from "@/lib/domain/format";
import { cn } from "@/lib/utils";

import {
  dashboardService,
  roles,
  type ApprovalRequest,
  type OrderSnapshot,
  type PriorityQueueItem,
  type Role,
  type Signal,
} from "@/features/dashboard/data/dashboard-data";

type DashboardPageContentProps = {
  role: Role;
  summary: Awaited<ReturnType<typeof dashboardService.summary>>;
};

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "highlight";

const toneClasses: Record<Tone, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-danger/30 bg-danger/10 text-danger",
  info: "border-info/30 bg-info/10 text-info",
  highlight: "border-highlight/30 bg-highlight/10 text-highlight",
};

const roleNotes: Record<Role, string> = {
  Owner: "Admin cockpit with the three things that need judgment: approvals, priority work, and live order movement.",
  Sales: "Sales view is intentionally quiet: the live order snapshot is the handoff truth.",
  Operations: "Operations view keeps the order snapshot central with only the priority work that can affect delivery.",
  Accounts: "Accounts view focuses on receivables, sync readiness, payment holds, and invoice-linked action.",
};

export function DashboardPageContent({ role, summary }: DashboardPageContentProps) {
  const todayIso = now().toISOString().slice(0, 10);

  return (
    <main className="flex min-h-screen flex-col gap-6 bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="highlight" icon={Gauge}>
                Command cockpit
              </Pill>
              <span className="font-mono text-xs text-muted-foreground">{formatDate(todayIso)}</span>
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
              <p className="text-sm text-muted-foreground">{roleNotes[role]}</p>
            </div>
          </div>

          <nav className="flex flex-wrap gap-2" aria-label="Dashboard role view">
            {roles.map((availableRole) => (
              <Button
                key={availableRole}
                asChild
                size="sm"
                variant={availableRole === role ? "default" : "outline"}
              >
                <Link href={`/dashboard?role=${availableRole}`}>{availableRole}</Link>
              </Button>
            ))}
          </nav>
        </div>
      </section>

      <PipelineFlow
        openQuotes={summary.operational.openQuotes}
        inProduction={summary.operational.inProduction}
        readyToDispatch={summary.operational.readyToDispatch}
        pendingSync={summary.accounts.pendingSync}
        dispatchBlockers={summary.operational.dispatchBlockers}
        paymentHolds={summary.accounts.paymentHolds}
      />

      {role === "Accounts" ? (
        <AccountsDashboard summary={summary} />
      ) : role === "Sales" ? (
        <section className="grid gap-4">
          <LiveOrderSnapshot orders={summary.orderSnapshot} />
        </section>
      ) : role === "Owner" ? (
        <section className="grid gap-4">
          <LiveOrderSnapshot orders={summary.orderSnapshot} />
          <div className="grid gap-4 xl:grid-cols-2">
            <ApprovalsSignalsCard approvals={summary.approvals} signals={summary.signals} />
            <PriorityQueueCard items={summary.priorityQueue} />
          </div>
        </section>
      ) : (
        <section className="grid gap-4">
          <LiveOrderSnapshot orders={summary.orderSnapshot} />
          <PriorityQueueCard items={summary.priorityQueue} />
        </section>
      )}
    </main>
  );
}

function PipelineFlow({
  openQuotes,
  inProduction,
  readyToDispatch,
  pendingSync,
  dispatchBlockers,
  paymentHolds,
}: {
  openQuotes: number;
  inProduction: number;
  readyToDispatch: number;
  pendingSync: number;
  dispatchBlockers: number;
  paymentHolds: number;
}) {
  const stages = [
    { label: "Inquiry", count: 5, tone: "info" as Tone, hint: "Demand captured" },
    { label: "Quote", count: openQuotes, tone: "highlight" as Tone, hint: "Pricing active" },
    { label: "Order", count: inProduction, tone: "warning" as Tone, hint: "In production" },
    {
      label: "Dispatch",
      count: readyToDispatch,
      tone: dispatchBlockers > 0 ? ("danger" as Tone) : ("success" as Tone),
      hint: dispatchBlockers > 0 ? `${dispatchBlockers} blocker${dispatchBlockers === 1 ? "" : "s"}` : "Ready queue",
    },
    {
      label: "Invoice",
      count: pendingSync,
      tone: paymentHolds > 0 ? ("warning" as Tone) : ("success" as Tone),
      hint: paymentHolds > 0 ? `${paymentHolds} payment hold${paymentHolds === 1 ? "" : "s"}` : "Sync control",
    },
  ];

  return (
    <section className="rounded-lg border bg-card p-6 shadow-sm" aria-labelledby="pipeline-title">
      <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 id="pipeline-title" className="text-sm font-semibold">
            Pipeline Flow
          </h2>
          <p className="text-xs text-muted-foreground">Inquiry to invoice, shown as one connected chain.</p>
        </div>
        <Pill tone={dispatchBlockers + paymentHolds > 0 ? "warning" : "neutral"}>Live operational pulse</Pill>
      </div>

      <div className="grid gap-3 lg:grid-cols-5">
        {stages.map((stage, index) => (
          <div key={stage.label} className="relative rounded-md border bg-background p-4">
            {index > 0 ? <span className="absolute -left-3 top-1/2 hidden h-px w-3 bg-border lg:block" /> : null}
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2">
                <span className={cn("block size-2 rounded-sm", toneClasses[stage.tone].includes("danger") ? "bg-danger" : toneClasses[stage.tone].includes("warning") ? "bg-warning" : toneClasses[stage.tone].includes("success") ? "bg-success" : toneClasses[stage.tone].includes("highlight") ? "bg-highlight" : "bg-info")} />
                <div>
                  <p className="text-sm font-medium">{stage.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{stage.hint}</p>
                </div>
              </div>
              <Pill tone={stage.tone}>{stage.count}</Pill>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AccountsDashboard({ summary }: { summary: Awaited<ReturnType<typeof dashboardService.summary>> }) {
  const accountSignals = summary.signals.filter((signal) => signal.resource === "invoice");
  const accountQueue = summary.priorityQueue.filter((item) => item.resource === "invoice" || item.resource === "compliance");

  return (
    <section className="grid gap-4 xl:grid-cols-3">
      <Panel
        title="Accounts Overview"
        description="Receivables, Zoho readiness, and cash-control work in one place."
        icon={IndianRupee}
        href="/accounting"
        hrefLabel="Open invoice readiness"
        className="xl:col-span-2"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <MetricBlock
            label="Receivables tracked"
            value={<MoneyText amountInr={summary.accounts.receivablesInr} />}
            icon={CircleDollarSign}
          />
          <MetricBlock label="Invoices synced" value={summary.accounts.invoicesSynced} icon={FileCheck2} tone="success" />
          <MetricBlock
            label="Pending sync"
            value={summary.accounts.pendingSync}
            icon={Clock3}
            tone={summary.accounts.pendingSync > 0 ? "warning" : "neutral"}
          />
          <MetricBlock
            label="Payment holds"
            value={summary.accounts.paymentHolds}
            icon={ShieldAlert}
            tone={summary.accounts.paymentHolds > 0 ? "danger" : "neutral"}
          />
        </div>

        <div className="mt-6 rounded-md border bg-background p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>... </div>
          </div>
        </div>
      </Panel>
      <div className="grid gap-4">
        <Panel title="Invoice signals" description="Open issues affecting invoice readiness." icon={AlertTriangle} href="/accounting" hrefLabel="Review accounts actions">
          <div className="space-y-3">
            {accountSignals.map((signal) => (
              <div key={signal.id} className="rounded-md border bg-background p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{signal.text}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{signal.type}</p>
                  </div>
                  <Pill tone={signal.severity === "High" ? "warning" : "neutral"}>{signal.severity}</Pill>
                </div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Accounts queue" description="Priority work tied to invoice and compliance." icon={ListChecks} href="/accounting" hrefLabel="Open queue">
          <div className="space-y-3">
            {accountQueue.map((item) => (
              <div key={item.id} className="rounded-md border bg-background p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.nextAction}</p>
                  </div>
                  <Pill tone={item.resource === "invoice" ? "warning" : "neutral"}>{item.resource}</Pill>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </section>
  );
}

function LiveOrderSnapshot({ orders }: { orders: OrderSnapshot[] }) {
  return (
    <Panel title="Order snapshot" description="The current live view of order movement." icon={PackageCheck} href="/orders" hrefLabel="Open order board">
      <div className="space-y-3">
        {orders.map((order) => (
          <div key={order.id} className="rounded-md border bg-background p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{order.customer}</p>
                <p className="mt-1 text-xs text-muted-foreground">{order.title}</p>
              </div>
              <div className="flex items-center gap-2">
                <Pill tone={order.stage === "Won" ? "success" : "neutral"}>{order.stage}</Pill>
                <Pill tone="info">{order.promisedDate}</Pill>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ApprovalsSignalsCard({ approvals, signals }: { approvals: ApprovalRequest[]; signals: Signal[] }) {
  return (
    <Panel title="Approvals & signals" description="Requests that need attention." icon={Bell} href="/approvals" hrefLabel="Open approvals">
      <div className="space-y-3">
        {approvals.map((approval) => (
          <div key={approval.id} className="rounded-md border bg-background p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{approval.kind}</p>
                <p className="mt-1 text-xs text-muted-foreground">{approval.reason}</p>
              </div>
              <Pill tone="warning">{approval.status}</Pill>
            </div>
          </div>
        ))}
        {signals.map((signal) => (
          <div key={signal.id} className="rounded-md border bg-background p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{signal.text}</p>
                <p className="mt-1 text-xs text-muted-foreground">{signal.type}</p>
              </div>
              <Pill tone={signal.severity === "High" ? "warning" : "neutral"}>{signal.severity}</Pill>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function PriorityQueueCard({ items }: { items: PriorityQueueItem[] }) {
  return (
    <Panel title="Priority queue" description="The work that needs immediate attention." icon={Inbox} href="/approvals" hrefLabel="Review work items">
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-md border bg-background p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{item.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.nextAction}</p>
              </div>
              <Pill tone={item.resource === "invoice" ? "warning" : "neutral"}>{item.resource}</Pill>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Panel({
  title,
  description,
  icon: Icon,
  action,
  children,
  collapsible = true,
  defaultOpen = true,
  storageKey,
  href,
  hrefLabel,
  className,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  storageKey?: string;
  href?: string;
  hrefLabel?: string;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(() => {
    if (!collapsible) return true;
    if (storageKey && typeof window !== "undefined") {
      const storedValue = window.localStorage.getItem(`cableos2:panel:${storageKey}`);
      if (storedValue === "open") return true;
      if (storedValue === "closed") return false;
    }
    return defaultOpen;
  });

  function togglePanel() {
    setIsOpen((currentValue) => {
      const nextValue = !currentValue;
      if (storageKey && typeof window !== "undefined") {
        window.localStorage.setItem(`cableos2:panel:${storageKey}`, nextValue ? "open" : "closed");
      }
      return nextValue;
    });
  }

  return (
    <section className={cn("rounded-lg border bg-card p-6 shadow-sm", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
            <h3 className="text-sm font-semibold">{title}</h3>
          </div>
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {action ? <div>{action}</div> : null}
          {href ? (
            <Button asChild size="sm" variant="ghost">
              <Link href={href}>{hrefLabel}</Link>
            </Button>
          ) : null}
          {collapsible ? (
            <Button size="sm" variant="ghost" onClick={togglePanel}>
              {isOpen ? "Hide" : "Show"}
            </Button>
          ) : null}
        </div>
      </div>
      {isOpen ? <div>{children}</div> : null}
    </section>
  );
}

function Pill({ tone = "neutral", children, icon: Icon }: { tone?: Tone; children: ReactNode; icon?: LucideIcon }) {
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium", toneClasses[tone])}>
      {Icon ? <Icon className="size-3" /> : null}
      {children}
    </span>
  );
}

function MetricBlock({
  label,
  value,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
}) {
  return (
    <div className={cn("rounded-md border bg-background p-4", toneClasses[tone])}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <div className="mt-2 text-lg font-semibold">{value}</div>
      </div>
      {Icon ? <Icon className="size-4" /> : null}
    </div>
    </div>
  );
}

function MoneyText({ amountInr }: { amountInr: number }) {
  return <span className="font-mono tabular-nums">{formatINR(amountInr)}</span>;
}
