/*  Main order-board implementation including order states, filtering,
    transitions, operational data, and order-related UI. */

"use client";

import type { DragEndEvent } from "@dnd-kit/core";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  CableIcon,
  CalendarDaysIcon,
  CheckCircle2Icon,
  ClipboardListIcon,
  FileCheckIcon,
  HistoryIcon,
  InboxIcon,
  PackageSearchIcon,
  RefreshCwIcon,
  TruckIcon,
  WrenchIcon,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";

import {
  Button,
  Card,
  KanbanBoard,
  KanbanCard as UiKanbanCard,
  KanbanCards,
  KanbanHeader,
  KanbanProvider,
} from "@/components/ui";
import { daysUntil } from "@/lib/domain/clock";
import { formatDate, formatINR } from "@/lib/domain/format";
import { gtpForOrder } from "@/lib/domain/gtp";
import { inspectionCallUrgency, type InspectionCallUrgency } from "@/lib/domain/inspection";
import { can } from "@/lib/rbac";
import {
  dataService,
  ordersService,
  type CableStore,
  type GtpStatus,
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

// One-line context under each column name — orients anyone new to the chain.
const stageSubtitles: Record<OrderStage, string> = {
  Quoted: "Priced, awaiting production slot",
  Won: "Confirmed, spec pending approval",
  "In Production": "On the shop floor",
  "Ready for Dispatch": "Cleared, awaiting pickup",
  Invoiced: "Billed and closed",
};

const priorityDotTones: Record<Priority, string> = {
  Low: "bg-success",
  Medium: "bg-warning",
  High: "bg-danger",
};

const priorityRank: Record<Priority, number> = {
  High: 0,
  Medium: 1,
  Low: 2,
};

function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-sm border px-2 py-1 text-xs font-medium", className)}>
      {children}
    </span>
  );
}

// Self-explanatory action row for card footers — full label + icon + tooltip,
// so users never have to guess what a destination is.
function CardActionLink({
  href,
  icon,
  label,
  hint,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      title={hint}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      className="flex h-8 items-center gap-2 rounded-md border bg-background px-2 text-xs font-medium text-foreground/80 transition-colors hover:border-primary/30 hover:bg-primary-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      <ArrowUpRightIcon className="size-3 text-muted-foreground" />
    </Link>
  );
}

function SkeletonBoard() {
  return (
    <div className="grid w-full min-w-0 auto-cols-[minmax(272px,1fr)] grid-flow-col gap-4 overflow-x-auto pb-2">
      {stages.map((stage) => (
        <section key={stage} className="flex min-h-96 flex-col gap-3 rounded-lg border bg-muted/60 p-3">
          <div className="flex items-center justify-between">
            <div className="h-4 w-28 rounded-sm bg-border" />
            <div className="h-4 w-5 rounded-sm bg-border" />
          </div>
          <div className="space-y-2">
            <div className="h-32 rounded-md bg-card" />
            <div className="h-28 rounded-md bg-card" />
            <div className="h-24 rounded-md bg-card" />
          </div>
        </section>
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

type OrderFlags = {
  /** undefined = no GTP on file yet. */
  gtpStatus?: GtpStatus;
  gtpGated: boolean;
  machineHold: boolean;
  inspection: InspectionCallUrgency;
};

/** Compliance-gate state per card: GTP, machine hold, inspection countdown. */
function orderFlags(store: CableStore | null, order: Order): OrderFlags {
  const gtp = store ? gtpForOrder(store.gtps, order) : undefined;
  const gated = order.stage === "Won" || order.stage === "In Production";
  return {
    gtpStatus: gtp?.status,
    gtpGated: gated && gtp?.status !== "Approved",
    machineHold:
      store?.machineIncidents.some(
        (incident) =>
          incident.orderId === order.id &&
          (incident.status === "Open" || incident.status === "Awaiting approval"),
      ) ?? false,
    inspection: gated ? inspectionCallUrgency(order) : { state: "none" },
  };
}

function completionForStage(stage: OrderStage) {
  const completion: Record<OrderStage, number> = {
    Quoted: 0,
    Won: 20,
    "In Production": 60,
    "Ready for Dispatch": 90,
    Invoiced: 100,
  };
  return completion[stage];
}

function isOrderStage(value: unknown): value is OrderStage {
  return typeof value === "string" && stages.includes(value as OrderStage);
}

// Surfaces dispatch risk directly on the card — the #1 signal ops needs at a glance.
type PromiseRisk = "overdue" | "due-soon" | "ok";

function promiseRisk(iso: string, stage: OrderStage): PromiseRisk {
  if (stage === "Invoiced") return "ok";
  const remaining = daysUntil(iso);
  if (remaining < 0) return "overdue";
  if (remaining <= 3) return "due-soon";
  return "ok";
}

function promiseLabel(iso: string, stage: OrderStage): string {
  if (stage === "Invoiced") return formatDate(iso);
  const remaining = daysUntil(iso);
  if (remaining < 0) return `${Math.abs(remaining)}d overdue`;
  if (remaining === 0) return "Due today";
  if (remaining <= 3) return `Due in ${remaining}d`;
  return formatDate(iso);
}

const promiseToneClass: Record<PromiseRisk, string> = {
  overdue: "border-danger/30 bg-danger-muted text-danger",
  "due-soon": "border-warning/30 bg-warning-muted text-warning",
  ok: "border-border bg-background text-foreground",
};

function sortOrders(a: Order, b: Order) {
  const priorityDelta = priorityRank[a.priority] - priorityRank[b.priority];
  if (priorityDelta !== 0) return priorityDelta;
  return new Date(a.promisedDate).getTime() - new Date(b.promisedDate).getTime();
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

  const canView = can(role, "view", "order");
  const canTransition = can(role, "transition", "order");
  const canEditTitle = can(role, "edit", "order");

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
    if (!canTransition) return;
    const previousData = data;
    setBusyId(orderId);
    setError(null);
    setData((current) => ({
      ...current,
      orders: current.orders.map((order) =>
        order.id === orderId
          ? {
              ...order,
              stage,
              completionPct: completionForStage(stage),
            }
          : order,
      ),
    }));

    try {
      await ordersService.transition(orderId, stage, actorFromSession());
      await load();
    } catch (err) {
      setData(previousData);
      setError(err instanceof Error ? err.message : "Stage transition failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function repeatOrder(orderId: string) {
    setBusyId(orderId);
    setError(null);
    try {
      await ordersService.repeatOrder(orderId, actorFromSession());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Repeat order failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function updateTitle(orderId: string, title: string) {
    if (!canEditTitle) return;
    const nextTitle = title.trim();
    if (!nextTitle) return;

    const previousData = data;
    setBusyId(orderId);
    setError(null);
    setData((current) => ({
      ...current,
      orders: current.orders.map((order) => (order.id === orderId ? { ...order, title: nextTitle } : order)),
    }));

    try {
      await ordersService.updateTitle(orderId, nextTitle, actorFromSession());
      await load();
    } catch (err) {
      setData(previousData);
      setError(err instanceof Error ? err.message : "Order title could not be updated.");
    } finally {
      setBusyId(null);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const orderId = event.active.id;
    const nextStage = event.over?.id;
    if (
      typeof orderId === "string" &&
      isOrderStage(nextStage) &&
      event.active.data.current?.parent !== nextStage
    ) {
      void transition(orderId, nextStage);
    }
  }

  const groupedOrders = React.useMemo(() => {
    return stages.reduce<Record<OrderStage, Order[]>>(
      (groups, stage) => ({
        ...groups,
        [stage]: data.orders.filter((order) => order.stage === stage).toSorted(sortOrders),
      }),
      {
        Quoted: [],
        Won: [],
        "In Production": [],
        "Ready for Dispatch": [],
        Invoiced: [],
      },
    );
  }, [data.orders]);

  const activeValue = data.orders
    .filter((order) => order.stage !== "Invoiced")
    .reduce((sum, order) => sum + order.amountInr, 0);
  const readyCount = groupedOrders["Ready for Dispatch"].length;
  const productionCount = groupedOrders["In Production"].length;
  const highPriorityCount = data.orders.filter((order) => order.priority === "High" && order.stage !== "Invoiced").length;

  if (!canView) {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger/10 p-6 text-sm text-danger">
        You do not have access to the order board.
      </div>
    );
  }

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
            Track confirmed work from quote handoff through production, dispatch readiness, and invoicing.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => void load()}>
            <RefreshCwIcon className="mr-2 size-4" />
            Refresh
          </Button>
          <Button asChild>
            <Link href="/job-card">
              Job cards
              <ArrowRightIcon className="ml-2 size-4" />
            </Link>
          </Button>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Active order value" value={formatINR(activeValue)} />
        <MetricCard label="In production" value={String(productionCount)} />
        <MetricCard label="Ready dispatch" value={String(readyCount)} tone={readyCount > 0 ? "success" : "neutral"} />
        <MetricCard label="High priority" value={String(highPriorityCount)} tone={highPriorityCount > 0 ? "danger" : "neutral"} />
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
        <KanbanProvider
          onDragEnd={handleDragEnd}
          renderOverlay={(activeId) => {
            const order = data.orders.find((item) => item.id === activeId);
            if (!order) return null;

            return (
              <Card className="w-72 rounded-md border-primary/50 bg-card p-3 shadow-lg">
                <OrderCardContent
                  customerName={customerName(data.store, order.customerId)}
                  dispatch={dispatchProgress(data.store, order)}
                  flags={orderFlags(data.store, order)}
                  order={order}
                />
              </Card>
            );
          }}
        >
          {stages.map((stage) => (
            <OrderColumn
              key={stage}
              stage={stage}
              orders={groupedOrders[stage]}
              store={data.store}
              busyId={busyId}
              canTransition={canTransition}
              canEditTitle={canEditTitle}
              onTransition={transition}
              onUpdateTitle={updateTitle}
              onRepeat={repeatOrder}
            />
          ))}
        </KanbanProvider>
      ) : null}
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "danger";
}) {
  return (
    <Card
      className={cn(
        "rounded-md p-4",
        tone === "success" && "border-success/30 bg-success/10",
        tone === "danger" && "border-danger/30 bg-danger/10",
      )}
    >
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 font-mono text-2xl font-semibold">{value}</p>
    </Card>
  );
}

function OrderColumn({
  stage,
  orders,
  store,
  busyId,
  canTransition,
  canEditTitle,
  onTransition,
  onUpdateTitle,
  onRepeat,
}: {
  stage: OrderStage;
  orders: Order[];
  store: CableStore | null;
  busyId: string | null;
  canTransition: boolean;
  canEditTitle: boolean;
  onTransition: (orderId: string, stage: OrderStage) => void;
  onUpdateTitle: (orderId: string, title: string) => void;
  onRepeat: (orderId: string) => void;
}) {
  return (
    <KanbanBoard id={stage}>
      <KanbanHeader
        name={stage}
        count={orders.length}
        subtitle={stageSubtitles[stage]}
        indicatorClassName={stageIndicatorClass(stage)}
      />
      <KanbanCards className="max-h-dvh pr-1">
        {orders.length === 0 ? (
          <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-md border border-dashed p-4 text-center">
            <PackageSearchIcon className="size-5 text-muted-foreground/60" />
            <p className="m-0 text-xs text-muted-foreground">No orders in {stage.toLowerCase()}</p>
          </div>
        ) : (
          orders.map((order, index) => (
            <OrderKanbanCard
              key={order.id}
              index={index}
              stage={stage}
              order={order}
              customerName={customerName(store, order.customerId)}
              dispatch={dispatchProgress(store, order)}
              flags={orderFlags(store, order)}
              busy={busyId === order.id}
              canTransition={canTransition}
              canEditTitle={canEditTitle}
              onTransition={onTransition}
              onUpdateTitle={onUpdateTitle}
              onRepeat={onRepeat}
            />
          ))
        )}
      </KanbanCards>
    </KanbanBoard>
  );
}

function OrderKanbanCard({
  index,
  stage,
  order,
  customerName: name,
  dispatch,
  flags,
  busy,
  canTransition,
  canEditTitle,
  onTransition,
  onUpdateTitle,
  onRepeat,
}: {
  index: number;
  stage: OrderStage;
  order: Order;
  customerName: string;
  dispatch: ReturnType<typeof dispatchProgress>;
  flags: OrderFlags;
  busy: boolean;
  canTransition: boolean;
  canEditTitle: boolean;
  onTransition: (orderId: string, stage: OrderStage) => void;
  onUpdateTitle: (orderId: string, title: string) => void;
  onRepeat: (orderId: string) => void;
}) {
  return (
    <UiKanbanCard
      id={order.id}
      name={order.title}
      parent={stage}
      className={cn("group border-border bg-card p-3", !canTransition && "cursor-default")}
      index={index}
      disabled={!canTransition || busy}
    >
      <OrderCardContent
        customerName={name}
        dispatch={dispatch}
        flags={flags}
        order={order}
        editable={canEditTitle}
        canTransition={canTransition}
        busy={busy}
        onTransition={onTransition}
        onUpdateTitle={onUpdateTitle}
        onRepeat={onRepeat}
      />
    </UiKanbanCard>
  );
}

function OrderCardContent({
  order,
  customerName: name,
  dispatch,
  flags,
  editable = false,
  canTransition = false,
  busy = false,
  onTransition,
  onUpdateTitle,
  onRepeat,
}: {
  order: Order;
  customerName: string;
  dispatch: ReturnType<typeof dispatchProgress>;
  flags: OrderFlags;
  editable?: boolean;
  canTransition?: boolean;
  busy?: boolean;
  onTransition?: (orderId: string, stage: OrderStage) => void;
  onUpdateTitle?: (orderId: string, title: string) => void;
  onRepeat?: (orderId: string) => void;
}) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [draftTitle, setDraftTitle] = React.useState(order.title);

  function stopDrag(event: React.SyntheticEvent) {
    event.stopPropagation();
  }

  function cancelEdit() {
    setDraftTitle(order.title);
    setIsEditing(false);
  }

  function commitEdit() {
    const nextTitle = draftTitle.trim();
    if (!nextTitle) {
      cancelEdit();
      return;
    }

    setIsEditing(false);
    if (nextTitle !== order.title) {
      onUpdateTitle?.(order.id, nextTitle);
    }
  }

  const risk = promiseRisk(order.promisedDate, order.stage);

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold">{name}</p>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <span className={cn("size-1.5 rounded-full", priorityDotTones[order.priority])} />
          {order.priority}
        </span>
      </div>

      {isEditing ? (
        <input
          aria-label={`Edit title for ${order.id}`}
          autoFocus
          className="h-8 w-full rounded-sm border border-input bg-background px-2 text-xs text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onBlur={commitEdit}
          onChange={(event) => setDraftTitle(event.target.value)}
          onClick={stopDrag}
          onKeyDown={(event) => {
            if (event.key === "Enter") commitEdit();
            if (event.key === "Escape") cancelEdit();
          }}
          onPointerDown={stopDrag}
          value={draftTitle}
        />
      ) : (
        <button
          aria-label={`Edit title for ${order.id}`}
          className={cn(
            "line-clamp-1 w-full rounded-sm text-left text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            editable && "cursor-text hover:text-foreground",
          )}
          disabled={!editable}
          onClick={(event) => {
            stopDrag(event);
            if (editable) {
              setDraftTitle(order.title);
              setIsEditing(true);
            }
          }}
          onPointerDown={stopDrag}
          type="button"
        >
          {order.title}
        </button>
      )}

      {/* Cable spec — the field production/dispatch actually key off; mono per the
          project's own convention for machine/technical data. */}
      <div className="flex items-start gap-1.5 rounded-md border bg-muted/40 px-2 py-1.5">
        <CableIcon className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
        <p className="m-0 line-clamp-2 font-mono text-[11px] leading-snug text-foreground/90">
          {order.specSummary}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md border bg-background p-2">
          <p className="text-muted-foreground">Value</p>
          <p className="mt-1 truncate font-mono font-semibold">{formatINR(order.amountInr)}</p>
        </div>
        <div className={cn("rounded-md border p-2", promiseToneClass[risk])}>
          <p className={cn(risk === "ok" ? "text-muted-foreground" : "opacity-80")}>Promise</p>
          <p className="mt-1 flex items-center gap-1 truncate font-medium">
            {risk !== "ok" ? <AlertTriangleIcon className="size-3 shrink-0" /> : null}
            {promiseLabel(order.promisedDate, order.stage)}
          </p>
        </div>
      </div>

      <div className="space-y-1.5" aria-label={`${order.completionPct}% complete`}>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{order.stage}</span>
          <span className="font-mono font-medium">{order.completionPct}%</span>
        </div>
        <div className="grid grid-cols-5 gap-1">
          {[20, 40, 60, 80, 100].map((step) => (
            <span key={step} className={cn("h-1.5 rounded-sm", order.completionPct >= step ? "bg-primary" : "bg-border")} />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* The GTP badge is the fix-it link: a gated card should let you act, not just worry.
            No GTP yet → the builder; one exists → its record. */}
        {flags.gtpGated ? (
          <Link
            href={flags.gtpStatus ? `/gtp/review?orderId=${order.id}` : `/gtp/new?orderId=${order.id}`}
            onClick={(event) => event.stopPropagation()}
            title={flags.gtpStatus ? "Open this GTP" : "Create a GTP for this order"}
            className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Badge
              className={cn(
                "hover:brightness-95",
                flags.gtpStatus
                  ? "border-warning/30 bg-warning/10 text-warning"
                  : "border-danger/30 bg-danger/10 text-danger",
              )}
            >
              <FileCheckIcon className="mr-1 size-3" />
              {flags.gtpStatus ? `GTP ${flags.gtpStatus}` : "GTP missing"}
            </Badge>
          </Link>
        ) : flags.gtpStatus === "Approved" ? (
          <Link
            href={`/gtp/review?orderId=${order.id}`}
            onClick={(event) => event.stopPropagation()}
            title="Open the approved GTP"
            className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Badge className="border-success/30 bg-success/10 text-success hover:brightness-95">
              <FileCheckIcon className="mr-1 size-3" />
              GTP ✓
            </Badge>
          </Link>
        ) : null}
        {flags.machineHold ? (
          <Badge className="border-danger/30 bg-danger/10 text-danger">
            <WrenchIcon className="mr-1 size-3" />
            Machine hold
          </Badge>
        ) : null}
        <Badge className={dispatch.ready ? "border-success/30 bg-success/10 text-success" : "border-warning/30 bg-warning/10 text-warning"}>
          {dispatch.ready ? <CheckCircle2Icon className="mr-1 size-3" /> : <TruckIcon className="mr-1 size-3" />}
          Dispatch {dispatch.done}/{dispatch.total}
        </Badge>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <CalendarDaysIcon className="size-3" />
          {order.id}
        </span>
      </div>

      {/* Secondary actions — collapsed at rest, revealed on hover/keyboard-focus so the
          resting card stays scannable. Drag-and-drop is the primary way to move a card;
          this footer is the accessible fallback, not the default affordance. */}
      <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-200 ease-out group-hover:grid-rows-[1fr] group-focus-within:grid-rows-[1fr]">
        <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
          {canTransition ? (
            <select
              aria-label={`Move ${order.id} to stage`}
              value={order.stage}
              disabled={busy}
              onChange={(event) => onTransition?.(order.id, event.target.value as OrderStage)}
              onClick={stopDrag}
              onPointerDown={stopDrag}
              className="h-8 w-full rounded-md border bg-background px-2 pt-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              {stages.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          ) : null}

          <div className="flex flex-col gap-1 pb-0.5">
            <CardActionLink
              href={`/records/${order.id}`}
              icon={<HistoryIcon className="size-3.5" />}
              label="Order history"
              hint={`Full timeline of ${order.id} — every stage change and edit`}
            />
            <CardActionLink
              href={`/job-card?orderId=${order.id}`}
              icon={<ClipboardListIcon className="size-3.5" />}
              label="Operator job card"
              hint="Shop-floor job card with the production spec"
            />
            <CardActionLink
              href={`/dispatch?orderId=${order.id}`}
              icon={<TruckIcon className="size-3.5" />}
              label="Dispatch checklist"
              hint="Pre-dispatch checks required before pickup"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function stageIndicatorClass(stage: OrderStage) {
  const tones: Record<OrderStage, string> = {
    Quoted: "bg-stage-quote",
    Won: "bg-stage-order",
    "In Production": "bg-info",
    "Ready for Dispatch": "bg-stage-dispatch",
    Invoiced: "bg-stage-invoice",
  };

  return tones[stage];
}
