"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Filter,
  GitBranch,
  Inbox,
  Loader2,
  MessageSquareText,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button, Input } from "@/components/ui";
import { now } from "@/lib/domain/clock";
import { formatDate, formatINR } from "@/lib/domain/format";
import {
  approvalsService,
  dataService,
  signalsService,
  type ActivityEvent,
  type ApprovalKind,
  type ApprovalRequest,
  type CableSpec,
  type CableStore,
  type RiskLevel,
  type Role,
  type Signal,
} from "@/lib/services";
import { actorFromSession, hydrateSessionRole, useSessionStore } from "@/lib/store/session";
import { cn } from "@/lib/utils";

type InboxTab = "action" | "requested" | "signals" | "history";
type StatusFilter = "All" | ApprovalRequest["status"];
type KindFilter = "All" | ApprovalKind;
type SeverityFilter = "All" | RiskLevel;
type RecordFilter = "All" | ActivityEvent["recordType"];
type NoticeTone = "success" | "danger" | "info";

type QueueState = {
  approvals: ApprovalRequest[];
  signals: Signal[];
  store: CableStore;
};

type RecordContext = {
  title: string;
  customer?: string;
  amountInr?: number;
  spec?: CableSpec;
  status?: string;
  route: string;
  journeyRoute: string;
  meta: string;
};

const tabs: Array<{ id: InboxTab; label: string; icon: LucideIcon }> = [
  { id: "action", label: "Needs my action", icon: Bell },
  { id: "requested", label: "Requested by me", icon: MessageSquareText },
  { id: "signals", label: "Signals", icon: Sparkles },
  { id: "history", label: "All / History", icon: Clock3 },
];

const approvalKinds: KindFilter[] = [
  "All",
  "Margin approval",
  "BG/EMD approval",
  "Credit override",
  "Dispatch hold",
  "Machine incident",
];

const severities: SeverityFilter[] = ["All", "Low", "Medium", "High"];
const statuses: StatusFilter[] = ["All", "Pending", "Approved", "Rejected"];
const recordTypes: RecordFilter[] = [
  "All",
  "inquiry",
  "quote",
  "order",
  "dispatch",
  "invoice",
  "compliance",
  "jobcard",
];

const severityTone: Record<RiskLevel, string> = {
  Low: "border-success/30 bg-success/10 text-success",
  Medium: "border-warning/30 bg-warning/10 text-warning",
  High: "border-danger/30 bg-danger/10 text-danger",
};

const statusTone: Record<ApprovalRequest["status"], string> = {
  Pending: "border-warning/30 bg-warning/10 text-warning",
  Approved: "border-success/30 bg-success/10 text-success",
  Rejected: "border-danger/30 bg-danger/10 text-danger",
};

const kindTone: Record<ApprovalKind, string> = {
  "Margin approval": "border-highlight/30 bg-highlight/10 text-highlight",
  "BG/EMD approval": "border-info/30 bg-info/10 text-info",
  "Credit override": "border-danger/30 bg-danger/10 text-danger",
  "Dispatch hold": "border-warning/30 bg-warning/10 text-warning",
  "Machine incident": "border-danger/30 bg-danger/10 text-danger",
};

const signalRecordType: Record<Signal["type"], ActivityEvent["recordType"]> = {
  "Hot lead": "inquiry",
  "Follow-up due": "inquiry",
  "Repeat-order due": "inquiry",
  "Margin anomaly": "quote",
  "Delay risk": "order",
  "Missing document": "dispatch",
  "Cash control": "invoice",
  "Credit risk": "invoice",
  // Both carry an ORDER id in `recordId` (see gtpMissingSignals / inspectionCallSignals),
  // so they resolve against orders even though they route to /gtp and /dispatch.
  "GTP missing": "order",
  "Inspection call due": "order",
};

const signalRoleScope: Record<Role, Array<ActivityEvent["recordType"]>> = {
  Owner: ["inquiry", "quote", "order", "dispatch", "invoice", "compliance", "jobcard"],
  Sales: ["inquiry", "quote", "compliance"],
  Operations: ["order", "dispatch", "jobcard"],
  Accounts: ["invoice", "dispatch", "compliance"],
};

const actors: Record<Role, string> = {
  Owner: "Owner intervention queue",
  Sales: "Sales can track requests raised from quotes and tenders.",
  Operations: "Operations sees production and dispatch-linked signals.",
  Accounts: "Accounts sees cash, invoice, and compliance-linked work.",
};

function ageLabel(iso: string) {
  const value = iso.length > 10 ? iso : `${iso}T00:00:00+05:30`;
  const days = Math.max(0, Math.floor((now().getTime() - Date.parse(value)) / 86_400_000));
  if (days === 0) return "Today";
  if (days === 1) return "1d old";
  return `${days}d old`;
}

function moneyCell(amountInr: number) {
  return <span className="font-mono tabular-nums">{formatINR(amountInr)}</span>;
}

function shortDate(iso: string) {
  return formatDate(iso.slice(0, 10));
}

function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-xs font-medium",
        className,
      )}
    >
      {children}
    </span>
  );
}

function Panel({
  title,
  description,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  description?: string;
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border bg-card shadow-sm", className)}>
      <div className="flex items-start justify-between gap-4 border-b p-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-md border bg-muted p-2 text-muted-foreground">
            <Icon className="size-4" aria-hidden={true} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{title}</h2>
            {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
          </div>
        </div>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function SummaryTile({
  label,
  value,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  tone?: "neutral" | "warning" | "danger" | "success";
}) {
  const toneClass =
    tone === "danger"
      ? "text-danger"
      : tone === "warning"
        ? "text-warning"
        : tone === "success"
          ? "text-success"
          : "text-muted-foreground";

  return (
    <div className="rounded-md border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Icon className={cn("size-4", toneClass)} aria-hidden={true} />
      </div>
      <div className="mt-3 font-mono text-2xl font-semibold">{value}</div>
    </div>
  );
}

function SelectFilter<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: T[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function findSpec(store: CableStore, specId?: string) {
  if (!specId) return undefined;
  return store.specs.find((spec) => spec.id === specId);
}

function customerName(store: CableStore, customerId?: string) {
  if (!customerId) return undefined;
  return store.customers.find((customer) => customer.id === customerId)?.name ?? customerId;
}

function contextFromRecord(
  store: CableStore,
  recordType: ActivityEvent["recordType"],
  recordId: string,
  fallbackRoute?: string,
): RecordContext {
  if (recordType === "quote") {
    const quote = store.quotes.find((item) => item.id === recordId);
    const inquiry = quote?.inquiryId
      ? store.inquiries.find((item) => item.id === quote.inquiryId)
      : undefined;
    const spec = findSpec(store, quote?.lines[0]?.specId ?? inquiry?.specId);
    return {
      title: quote?.id ?? recordId,
      customer: customerName(store, quote?.customerId ?? inquiry?.customerId),
      amountInr: quote?.totalInr,
      spec,
      status: quote?.status,
      route: `/quote?quoteId=${recordId}`,
      journeyRoute: `/records/${recordId}`,
      meta: inquiry?.tenderRef ?? inquiry?.requirement ?? "Quote workflow",
    };
  }

  if (recordType === "compliance") {
    const item = store.compliance.find((entry) => entry.id === recordId);
    const inquiry = item?.inquiryId
      ? store.inquiries.find((entry) => entry.id === item.inquiryId)
      : undefined;
    return {
      title: item ? `${item.type} ${item.id}` : recordId,
      customer: customerName(store, item?.customerId ?? inquiry?.customerId),
      amountInr: item?.amountInr,
      spec: findSpec(store, inquiry?.specId),
      status: item?.status,
      route: `/compliance?itemId=${recordId}`,
      journeyRoute: `/records/${recordId}`,
      meta: item ? `Due ${shortDate(item.dueDate)} · ${item.risk} risk` : "Compliance workflow",
    };
  }

  if (recordType === "order") {
    const order = store.orders.find((item) => item.id === recordId);
    const quote = order ? store.quotes.find((item) => item.id === order.quoteId) : undefined;
    return {
      title: order?.title ?? recordId,
      customer: customerName(store, order?.customerId),
      amountInr: order?.amountInr,
      spec: findSpec(store, quote?.lines[0]?.specId),
      status: order?.stage,
      route: `/orders?orderId=${recordId}`,
      journeyRoute: `/records/${recordId}`,
      meta: order ? `${order.id} · promised ${shortDate(order.promisedDate)}` : "Order workflow",
    };
  }

  if (recordType === "dispatch") {
    const dispatch = store.dispatches.find((item) => item.id === recordId);
    const order = dispatch ? store.orders.find((item) => item.id === dispatch.orderId) : undefined;
    const quote = order ? store.quotes.find((item) => item.id === order.quoteId) : undefined;
    return {
      title: order?.title ?? recordId,
      customer: customerName(store, order?.customerId),
      amountInr: order?.amountInr,
      spec: findSpec(store, quote?.lines[0]?.specId),
      status: dispatch?.ewayBillRequired ? "E-way required" : "Ready check",
      route: `/dispatch?dispatchId=${recordId}`,
      journeyRoute: `/records/${dispatch?.orderId ?? recordId}`,
      meta: dispatch ? `${dispatch.id} · ${dispatch.transporter}` : "Dispatch workflow",
    };
  }

  if (recordType === "invoice") {
    const invoice = store.invoices.find((item) => item.id === recordId);
    const order = invoice ? store.orders.find((item) => item.id === invoice.orderId) : undefined;
    const quote = order ? store.quotes.find((item) => item.id === order.quoteId) : undefined;
    return {
      title: invoice ? `${invoice.kind} ${invoice.id}` : recordId,
      customer: customerName(store, invoice?.customerId ?? order?.customerId),
      amountInr: invoice?.totalInr,
      spec: findSpec(store, quote?.lines[0]?.specId),
      status: invoice?.status,
      route: `/accounting?invoiceId=${recordId}`,
      journeyRoute: `/records/${invoice?.orderId ?? recordId}`,
      meta: invoice ? `${invoice.syncStatus} · due ${shortDate(invoice.dueDate)}` : "Invoice workflow",
    };
  }

  if (recordType === "jobcard") {
    const jobCard = store.jobCards.find((item) => item.id === recordId);
    const order = jobCard ? store.orders.find((item) => item.id === jobCard.orderId) : undefined;
    return {
      title: order?.title ?? recordId,
      customer: customerName(store, order?.customerId),
      amountInr: order?.amountInr,
      spec: findSpec(store, jobCard?.specId),
      status: "Job card",
      route: `/job-card?jobCardId=${recordId}`,
      journeyRoute: `/records/${jobCard?.orderId ?? recordId}`,
      meta: jobCard ? `${jobCard.id} · updated ${shortDate(jobCard.updatedAt)}` : "Production workflow",
    };
  }

  const inquiry = store.inquiries.find((item) => item.id === recordId);
  return {
    title: inquiry?.requirement ?? recordId,
    customer: customerName(store, inquiry?.customerId),
    amountInr: inquiry?.estimatedValueInr,
    spec: findSpec(store, inquiry?.specId),
    status: inquiry?.stage,
    route: fallbackRoute ?? `/sales?inquiryId=${recordId}`,
    journeyRoute: `/records/${recordId}`,
    meta: inquiry?.tenderRef ?? inquiry?.source ?? "Inquiry workflow",
  };
}

function contextForSignal(store: CableStore, signal: Signal) {
  const recordType = signalRecordType[signal.type];
  return contextFromRecord(store, recordType, signal.recordId ?? signal.id, signal.route);
}

function CableSpecSummary({ spec }: { spec?: CableSpec }) {
  if (!spec) {
    return <span className="text-xs text-muted-foreground">No cable specification linked</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span className="font-mono text-foreground">{spec.cableCode ?? spec.id}</span>
      <span>{spec.cores}</span>
      <span>{spec.conductorSizeSqMm} sq mm</span>
      <span>{spec.conductorMaterial}</span>
      <span>{spec.voltageGrade}</span>
    </div>
  );
}

function RecordSummary({ context }: { context: RecordContext }) {
  return (
    <div className="rounded-md border bg-muted p-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-2">
          <div>
            <p className="truncate text-sm font-semibold">{context.title}</p>
            <p className="text-xs text-muted-foreground">{context.customer ?? "Unassigned customer"}</p>
          </div>
          <CableSpecSummary spec={context.spec} />
          <p className="text-xs text-muted-foreground">{context.meta}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {context.amountInr ? <Badge className="border-border bg-card text-foreground">{moneyCell(context.amountInr)}</Badge> : null}
          {context.status ? <Badge className="border-border bg-card text-muted-foreground">{context.status}</Badge> : null}
        </div>
      </div>
    </div>
  );
}

function ApprovalCard({
  approval,
  context,
  role,
  note,
  resolvingId,
  onNoteChange,
  onResolve,
}: {
  approval: ApprovalRequest;
  context: RecordContext;
  role: Role;
  note: string;
  resolvingId: string | null;
  onNoteChange: (value: string) => void;
  onResolve: (approvalId: string, decision: "Approved" | "Rejected") => void;
}) {
  const canResolve = role === "Owner" && approval.status === "Pending";
  const busy = resolvingId === approval.id;

  return (
    <article className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={kindTone[approval.kind]}>{approval.kind}</Badge>
              <Badge className={statusTone[approval.status]}>{approval.status}</Badge>
              <span className="font-mono text-xs text-muted-foreground">{approval.id}</span>
            </div>
            <div>
              <h3 className="text-base font-semibold">{approval.reason}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Requested by <span className="font-mono text-foreground">{approval.requestedByRole}</span>{" "}
                on <span className="font-mono">{shortDate(approval.createdAt)}</span> · {ageLabel(approval.createdAt)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={context.route}>
                Open record
                <ExternalLink className="ml-2 size-3" aria-hidden={true} />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href={context.journeyRoute}>
                Journey
                <GitBranch className="ml-2 size-3" aria-hidden={true} />
              </Link>
            </Button>
          </div>
        </div>

        <RecordSummary context={context} />

        {canResolve ? (
          <div className="flex flex-col gap-3 border-t pt-4 lg:flex-row lg:items-center">
            <Input
              value={note}
              onChange={(event) => onNoteChange(event.target.value)}
              placeholder="Optional owner note"
              aria-label={`Owner note for ${approval.id}`}
              className="lg:flex-1"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => onResolve(approval.id, "Approved")}
                disabled={busy}
              >
                {busy ? <Loader2 className="mr-2 size-3 animate-spin" aria-hidden={true} /> : <CheckCircle2 className="mr-2 size-3" aria-hidden={true} />}
                Approve
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => onResolve(approval.id, "Rejected")}
                disabled={busy}
              >
                {busy ? <Loader2 className="mr-2 size-3 animate-spin" aria-hidden={true} /> : <XCircle className="mr-2 size-3" aria-hidden={true} />}
                Reject
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 border-t pt-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              {approval.status === "Pending"
                ? role === approval.requestedByRole
                  ? "Awaiting Owner decision."
                  : "View-only request for this role."
                : `Resolved by ${approval.resolvedByRole ?? "Owner"}${approval.resolvedAt ? ` on ${shortDate(approval.resolvedAt)}` : ""}.`}
            </span>
            <Button asChild variant="outline" size="sm">
              <Link href={context.journeyRoute}>View request journey</Link>
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}

function SignalCard({ signal, context }: { signal: Signal; context: RecordContext }) {
  return (
    <article className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={severityTone[signal.severity]}>{signal.severity} severity</Badge>
              <Badge className="border-info/30 bg-info/10 text-info">{signal.type}</Badge>
              <span className="font-mono text-xs text-muted-foreground">{signal.id}</span>
            </div>
            <div>
              <h3 className="text-base font-semibold">{signal.text}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Read-only insight · resolving the underlying record clears the signal.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={signal.route}>
                Open record
                <ExternalLink className="ml-2 size-3" aria-hidden={true} />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href={context.journeyRoute}>
                Journey
                <GitBranch className="ml-2 size-3" aria-hidden={true} />
              </Link>
            </Button>
          </div>
        </div>
        <RecordSummary context={context} />
      </div>
    </article>
  );
}

function LoadingState() {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="animate-pulse rounded-md border bg-muted p-12" />
        ))}
      </div>
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="animate-pulse rounded-lg border bg-muted p-16" />
      ))}
    </div>
  );
}

function EmptyState({ tab }: { tab: InboxTab }) {
  const copy =
    tab === "signals"
      ? "No active signals for this role."
      : tab === "history"
        ? "No approvals or signals match these filters."
        : "You're all caught up.";

  return (
    <div className="rounded-lg border bg-card p-8 text-center shadow-sm">
      <Inbox className="mx-auto size-8 text-muted-foreground" aria-hidden={true} />
      <h2 className="mt-4 text-lg font-semibold">{copy}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Approval requests and AI signals will appear here with record context, journey links, and
        role-aware actions.
      </p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-danger/30 bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <AlertTriangle className="mt-1 size-5 text-danger" aria-hidden={true} />
          <div>
            <h2 className="font-semibold">Approvals inbox could not load</h2>
            <p className="mt-1 text-sm text-muted-foreground">{message}</p>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="mr-2 size-3" aria-hidden={true} />
          Retry
        </Button>
      </div>
    </div>
  );
}

function Notice({ tone, children }: { tone: NoticeTone; children: ReactNode }) {
  const toneClass =
    tone === "success"
      ? "border-success/30 bg-success/10 text-success"
      : tone === "danger"
        ? "border-danger/30 bg-danger/10 text-danger"
        : "border-info/30 bg-info/10 text-info";

  return (
    <div className={cn("rounded-md border px-4 py-3 text-sm font-medium", toneClass)} role="status">
      {children}
    </div>
  );
}

function roleVisibleSignals(role: Role, signals: Signal[]) {
  if (role === "Owner") return signals;
  const allowed = signalRoleScope[role];
  return signals.filter((signal) => allowed.includes(signalRecordType[signal.type]));
}

export default function ApprovalsInboxPage() {
  const role = useSessionStore((state) => state.role);
  const [activeTab, setActiveTab] = useState<InboxTab>("action");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [kindFilter, setKindFilter] = useState<KindFilter>("All");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("All");
  const [recordFilter, setRecordFilter] = useState<RecordFilter>("All");
  const [queue, setQueue] = useState<QueueState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: NoticeTone; text: string } | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [approvals, signals, store] = await Promise.all([
        approvalsService.list(role),
        signalsService.list(),
        dataService.read(),
      ]);
      setQueue({ approvals, signals: roleVisibleSignals(role, signals), store });
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Unexpected inbox error.");
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    hydrateSessionRole();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadQueue();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadQueue]);

  const counts = useMemo(() => {
    const approvals = queue?.approvals ?? [];
    const signals = queue?.signals ?? [];
    return {
      pending: approvals.filter((approval) => approval.status === "Pending").length,
      requested: approvals.filter((approval) => approval.requestedByRole === role).length,
      signals: signals.length,
      history: approvals.length + signals.length,
      highRisk: signals.filter((signal) => signal.severity === "High").length,
    };
  }, [queue, role]);

  const filteredApprovals = useMemo(() => {
    const approvals = queue?.approvals ?? [];
    return approvals
      .filter((approval) => {
        if (activeTab === "signals") return false;
        if (activeTab === "action") return approval.status === "Pending";
        if (activeTab === "requested") return approval.requestedByRole === role;
        return true;
      })
      .filter((approval) => statusFilter === "All" || approval.status === statusFilter)
      .filter((approval) => kindFilter === "All" || approval.kind === kindFilter)
      .filter((approval) => recordFilter === "All" || approval.recordType === recordFilter);
  }, [activeTab, kindFilter, queue, recordFilter, role, statusFilter]);

  const filteredSignals = useMemo(() => {
    const signals = queue?.signals ?? [];
    return signals
      .filter(() => activeTab === "signals" || activeTab === "history")
      .filter((signal) => severityFilter === "All" || signal.severity === severityFilter)
      .filter((signal) => recordFilter === "All" || signalRecordType[signal.type] === recordFilter);
  }, [activeTab, queue, recordFilter, severityFilter]);

  const isEmpty = !loading && !error && filteredApprovals.length === 0 && filteredSignals.length === 0;

  async function resolveApproval(approvalId: string, decision: "Approved" | "Rejected") {
    if (role !== "Owner") return;
    setResolvingId(approvalId);
    setNotice(null);
    try {
      await approvalsService.resolve(approvalId, decision, notes[approvalId] ?? "", actorFromSession());
      setNotice({
        tone: decision === "Approved" ? "success" : "info",
        text: `${approvalId} ${decision.toLowerCase()}. Downstream activity was recorded.`,
      });
      setNotes((current) => ({ ...current, [approvalId]: "" }));
      await loadQueue();
    } catch (issue) {
      setNotice({
        tone: "danger",
        text: issue instanceof Error ? issue.message : "Could not resolve approval.",
      });
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-highlight/30 bg-highlight/10 text-highlight">
                <ShieldCheck className="size-3" aria-hidden={true} />
                Approvals inbox
              </Badge>
              <span className="font-mono text-xs text-muted-foreground">{role}</span>
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Approvals & Notifications</h1>
              <p className="mt-1 text-sm text-muted-foreground">{actors[role]}</p>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={loadQueue} disabled={loading}>
            <RefreshCw className={cn("mr-2 size-3", loading ? "animate-spin" : "")} aria-hidden={true} />
            Refresh
          </Button>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <SummaryTile label="Pending requests" value={counts.pending} icon={Bell} tone={counts.pending > 0 ? "warning" : "success"} />
        <SummaryTile label="Requested by me" value={counts.requested} icon={MessageSquareText} />
        <SummaryTile label="Signals" value={counts.signals} icon={Sparkles} tone={counts.highRisk > 0 ? "danger" : "neutral"} />
        <SummaryTile label="History rows" value={counts.history} icon={FileText} />
      </section>

      <Panel title="Inbox controls" description="Segment the queue by action ownership, signal type, record, and resolution state." icon={Filter}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Approvals inbox segments">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const selected = activeTab === tab.id;
              return (
                <Button
                  key={tab.id}
                  type="button"
                  variant={selected ? "default" : "outline"}
                  size="sm"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <Icon className="mr-2 size-3" aria-hidden={true} />
                  {tab.label}
                </Button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-3">
            <SelectFilter label="Kind" value={kindFilter} options={approvalKinds} onChange={setKindFilter} />
            <SelectFilter label="Severity" value={severityFilter} options={severities} onChange={setSeverityFilter} />
            <SelectFilter label="Record type" value={recordFilter} options={recordTypes} onChange={setRecordFilter} />
            <SelectFilter label="Status" value={statusFilter} options={statuses} onChange={setStatusFilter} />
          </div>
        </div>
      </Panel>

      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={loadQueue} /> : null}
      {isEmpty ? <EmptyState tab={activeTab} /> : null}

      {!loading && !error && queue ? (
        <section className="grid gap-4" aria-live="polite">
          {filteredApprovals.map((approval) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              context={contextFromRecord(queue.store, approval.recordType, approval.recordId)}
              role={role}
              note={notes[approval.id] ?? ""}
              resolvingId={resolvingId}
              onNoteChange={(value) => setNotes((current) => ({ ...current, [approval.id]: value }))}
              onResolve={resolveApproval}
            />
          ))}

          {filteredSignals.map((signal) => (
            <SignalCard key={signal.id} signal={signal} context={contextForSignal(queue.store, signal)} />
          ))}
        </section>
      ) : null}
    </div>
  );
}
