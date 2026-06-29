import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
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
import { daysUntil, now } from "@/lib/domain/clock";
import { formatDate, formatINR } from "@/lib/domain/format";
import { cn } from "@/lib/utils";

import {
  dashboardService,
  parseRole,
  roles,
  type ApprovalRequest,
  type OrderSnapshot,
  type OrderStage,
  type Priority,
  type PriorityQueueItem,
  type Role,
  type Signal,
} from "./data";

export const metadata: Metadata = {
  title: "Dashboard | Cable OS",
};

type DashboardPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
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

const stageClasses: Record<OrderStage, string> = {
  Quoted: "border-stage-quote/30 bg-stage-quote/10 text-stage-quote",
  Won: "border-stage-order/30 bg-stage-order/10 text-stage-order",
  "In Production": "border-info/30 bg-info/10 text-info",
  "Ready for Dispatch": "border-stage-dispatch/30 bg-stage-dispatch/10 text-stage-dispatch",
  Invoiced: "border-stage-invoice/30 bg-stage-invoice/10 text-stage-invoice",
};

const stageDotClasses: Record<OrderStage, string> = {
  Quoted: "bg-stage-quote",
  Won: "bg-stage-order",
  "In Production": "bg-info",
  "Ready for Dispatch": "bg-stage-dispatch",
  Invoiced: "bg-stage-invoice",
};

const priorityTone: Record<Priority, Tone> = {
  Low: "success",
  Medium: "warning",
  High: "danger",
};

const roleNotes: Record<Role, string> = {
  Owner: "Admin cockpit with the three things that need judgment: approvals, priority work, and live order movement.",
  Sales: "Sales view is intentionally quiet: the live order snapshot is the handoff truth.",
  Operations: "Operations view keeps the order snapshot central with only the priority work that can affect delivery.",
  Accounts: "Accounts view focuses on receivables, sync readiness, payment holds, and invoice-linked action.",
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const role = parseRole(params?.role);
  const todayIso = now().toISOString().slice(0, 10);
  const summary = await dashboardService.summary(role);

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
          <LiveOrderSnapshot orders={summary.orderSnapshot} roomy />
        </section>
      ) : role === "Owner" ? (
        <section className="grid gap-4">
          <LiveOrderSnapshot orders={summary.orderSnapshot} roomy />
          <div className="grid gap-4 xl:grid-cols-2">
            <ApprovalsSignalsCard approvals={summary.approvals} signals={summary.signals} />
            <PriorityQueueCard items={summary.priorityQueue} />
          </div>
        </section>
      ) : (
        <section className="grid gap-4">
          <LiveOrderSnapshot orders={summary.orderSnapshot} roomy />
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
            <div>
              <h3 className="text-sm font-medium">Invoice action queue</h3>
              <p className="text-xs text-muted-foreground">Payment and compliance items that affect invoice movement.</p>
            </div>
            <Pill tone={accountQueue.length > 0 ? "warning" : "success"}>{accountQueue.length}</Pill>
          </div>
          <DataState
            emptyTitle="No invoice-linked actions"
            emptyDescription="Payment and compliance holds will appear here."
            isEmpty={accountQueue.length === 0}
          >
            <div className="divide-y divide-border">
              {accountQueue.map((item) => (
                <PriorityQueueRow key={item.id} item={item} />
              ))}
            </div>
          </DataState>
        </div>
      </Panel>

      <Panel title="Accounts Signals" description="Cash and invoice exceptions." icon={Bell}>
        <DataState
          emptyTitle="No accounts signals"
          emptyDescription="Cash-control and invoice-risk signals will show here."
          isEmpty={accountSignals.length === 0}
        >
          <div className="flex flex-col gap-3">
            {accountSignals.map((signal) => (
              <SignalRow key={signal.id} signal={signal} />
            ))}
          </div>
        </DataState>
      </Panel>
    </section>
  );
}

function ApprovalsSignalsCard({
  approvals,
  signals,
}: {
  approvals: ApprovalRequest[];
  signals: Signal[];
}) {
  const urgentSignals = signals.filter((signal) => signal.severity === "High");
  const visibleSignals = urgentSignals.length > 0 ? urgentSignals : signals;

  return (
    <Panel
      title="Approvals & Signals"
      description="Only intervention-grade items, with stronger contrast where attention is needed."
      icon={Bell}
      href="/approvals"
      hrefLabel="Open approvals"
    >
      <DataState
        emptyTitle="No active interventions"
        emptyDescription="Approvals and high-signal exceptions will appear here."
        isEmpty={approvals.length + visibleSignals.length === 0}
      >
        <div className="flex flex-col gap-3">
          {approvals.map((approval) => (
            <ApprovalRow key={approval.id} approval={approval} />
          ))}
          {visibleSignals.map((signal) => (
            <SignalRow key={signal.id} signal={signal} />
          ))}
        </div>
      </DataState>
    </Panel>
  );
}

function PriorityQueueCard({ items }: { items: PriorityQueueItem[] }) {
  return (
    <Panel title="Priority Queue" description="Due work with enough room to read the next action." icon={ListChecks}>
      <DataState
        emptyTitle="Nothing due"
        emptyDescription="The queue stays empty until a record needs attention."
        isEmpty={items.length === 0}
      >
        <div className="divide-y divide-border">
          {items.slice(0, 5).map((item) => (
            <PriorityQueueRow key={item.id} item={item} />
          ))}
        </div>
      </DataState>
    </Panel>
  );
}

function LiveOrderSnapshot({
  orders,
  className,
  roomy = false,
}: {
  orders: OrderSnapshot[];
  className?: string;
  roomy?: boolean;
}) {
  return (
    <Panel
      title="Live Order Snapshot"
      description="Stage, promise, priority, and amount without extra dashboard noise."
      icon={PackageCheck}
      href="/orders"
      hrefLabel="Open order board"
      className={className}
    >
      <DataState
        emptyTitle="No visible orders"
        emptyDescription="Orders matching this role will appear after quote handoff."
        isEmpty={orders.length === 0}
      >
        <div className="rounded-md border">
          <div className="hidden items-center justify-between gap-4 bg-muted px-4 py-3 text-xs font-medium text-muted-foreground md:flex">
            <span>Order</span>
            <span className="flex items-center gap-8">
              <span>Status</span>
              <span>Promise</span>
              <span>Amount</span>
            </span>
          </div>
          <div className="divide-y divide-border">
            {orders.map((order) => (
              <OrderRow key={order.id} order={order} roomy={roomy} />
            ))}
          </div>
        </div>
      </DataState>
    </Panel>
  );
}

function Panel({
  title,
  description,
  icon: Icon,
  href,
  hrefLabel,
  children,
  className,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  href?: string;
  hrefLabel?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border bg-card p-6 shadow-sm", className)}>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="rounded-md border bg-muted p-2 text-muted-foreground">
            <Icon className="size-4" aria-hidden={true} />
          </span>
          <div>
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        {href && hrefLabel ? (
          <Button asChild variant="ghost" size="sm">
            <Link href={href} aria-label={hrefLabel}>
              <span className="sr-only">{hrefLabel}</span>
              <ArrowRight className="size-4" aria-hidden={true} />
            </Link>
          </Button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function DataState({
  isLoading = false,
  error,
  isEmpty,
  emptyTitle,
  emptyDescription,
  children,
}: {
  isLoading?: boolean;
  error?: string;
  isEmpty: boolean;
  emptyTitle: string;
  emptyDescription: string;
  children: ReactNode;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-3" aria-label="Loading dashboard section">
        <SkeletonLine />
        <SkeletonLine />
        <SkeletonLine />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-1 size-4" aria-hidden={true} />
          <div className="space-y-3">
            <p className="font-medium">This section could not load.</p>
            <p>{error}</p>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard">Retry</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="rounded-md border bg-background p-6 text-center">
        <Inbox className="mx-auto mb-3 size-5 text-muted-foreground" aria-hidden={true} />
        <h3 className="text-sm font-medium">{emptyTitle}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{emptyDescription}</p>
      </div>
    );
  }

  return <>{children}</>;
}

function SkeletonLine() {
  return <div className="h-12 animate-pulse rounded-md bg-muted" />;
}

function MetricBlock({
  label,
  value,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value?: ReactNode;
  icon: LucideIcon;
  tone?: Tone;
}) {
  return (
    <div className={cn("rounded-md border bg-background p-4", tone !== "neutral" && toneClasses[tone])}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Icon className={cn("size-4", tone !== "neutral" && toneClasses[tone].split(" ").at(-1))} aria-hidden={true} />
      </div>
      <div className="font-mono text-2xl font-semibold">{value ?? <span aria-label="No data">&mdash;</span>}</div>
    </div>
  );
}

function PriorityQueueRow({ item }: { item: PriorityQueueItem }) {
  const dueInDays = daysUntil(item.dueDate);
  const dueTone = dueInDays < 0 ? "danger" : dueInDays <= 1 ? "warning" : "neutral";

  return (
    <Link
      href={item.route}
      className="group flex items-start justify-between gap-4 py-4 outline-offset-2 transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
      aria-label={`Open ${item.id}`}
    >
      <span className="min-w-0 space-y-2">
        <span className="block text-sm font-medium">{item.label}</span>
        <span className="block text-xs text-muted-foreground">{item.nextAction}</span>
        <span className="block font-mono text-xs text-muted-foreground">{item.id}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-2">
        <Pill tone={dueTone}>{formatDate(item.dueDate)}</Pill>
        <span className="text-xs text-muted-foreground">{item.ownerRole}</span>
      </span>
    </Link>
  );
}

function OrderRow({ order, roomy }: { order: OrderSnapshot; roomy?: boolean }) {
  return (
    <Link
      href={order.route}
      className={cn(
        "flex flex-col gap-4 px-4 outline-offset-2 transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring md:flex-row md:items-center md:justify-between",
        roomy ? "py-5" : "py-4",
      )}
      aria-label={`Open ${order.id}`}
    >
      <span className="min-w-0 space-y-1 md:flex-1">
        <span className="block text-sm font-medium">{order.title}</span>
        <span className="block text-xs text-muted-foreground">{order.customer}</span>
        <span className="font-mono text-xs text-muted-foreground">{order.id}</span>
      </span>
      <span className="flex flex-col gap-3 md:w-96">
        <span className="flex flex-wrap items-center gap-2">
          <StageBadge stage={order.stage} />
          <Pill tone={priorityTone[order.priority]}>{order.priority}</Pill>
        </span>
        <span className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Promise</span>
            <span>{formatDate(order.promisedDate)}</span>
          </span>
          <span className="text-left text-sm font-semibold sm:text-right">
            <MoneyText amountInr={order.amountInr} />
          </span>
        </span>
      </span>
    </Link>
  );
}

function ApprovalRow({ approval }: { approval: ApprovalRequest }) {
  return (
    <Link
      href={approval.route}
      className="rounded-md border border-warning/30 bg-warning/10 p-4 outline-offset-2 transition-colors hover:bg-warning/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
      aria-label={`Open approval ${approval.id}`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Pill tone="warning" icon={ShieldAlert}>
          {approval.kind}
        </Pill>
        <span className="font-mono text-xs text-muted-foreground">{approval.id}</span>
      </div>
      <p className="text-sm font-medium">{approval.reason}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        <span className="font-mono">{approval.recordId}</span> / requested by {approval.requestedByRole}
      </p>
    </Link>
  );
}

function SignalRow({ signal }: { signal: Signal }) {
  const tone = signal.severity === "High" ? "danger" : signal.severity === "Medium" ? "warning" : "info";

  return (
    <Link
      href={signal.route}
      className={cn(
        "rounded-md border p-4 outline-offset-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring",
        toneClasses[tone],
      )}
      aria-label={`Open signal ${signal.id}`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Pill tone={tone} icon={AlertTriangle}>
          {signal.type}
        </Pill>
        <span className="font-mono text-xs text-muted-foreground">{signal.recordId}</span>
      </div>
      <p className="text-sm">{signal.text}</p>
    </Link>
  );
}

function StageBadge({ stage }: { stage: OrderStage }) {
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-sm border px-2 py-1 text-xs font-medium", stageClasses[stage])}>
      <span className={cn("size-1.5 rounded-sm", stageDotClasses[stage])} />
      {stage}
    </span>
  );
}

function Pill({
  tone,
  icon: Icon,
  children,
}: {
  tone: Tone;
  icon?: LucideIcon;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-xs font-medium",
        toneClasses[tone],
      )}
    >
      {Icon ? <Icon className="size-3" aria-hidden={true} /> : null}
      {children}
    </span>
  );
}

function MoneyText({ amountInr }: { amountInr: number }) {
  return <span className="font-mono">{formatINR(amountInr)}</span>;
}
