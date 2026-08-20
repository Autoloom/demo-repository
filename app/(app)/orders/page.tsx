"use client";

import type { DragEndEvent } from "@dnd-kit/core";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CalendarDaysIcon,
  CheckCircle2Icon,
  ClipboardListIcon,
  CopyIcon,
  FileCheckIcon,
  InboxIcon,
  MegaphoneIcon,
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

const priorityTones: Record<Priority, string> = {
  Low: "border-success/30 bg-success/10 text-success",
  Medium: "border-warning/30 bg-warning/10 text-warning",
  High: "border-danger/30 bg-danger/10 text-danger",
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

function SkeletonBoard() {
  return (
    <div className="grid w-full min-w-0 grid-cols-1 gap-4 overflow-x-clip md:grid-cols-2 xl:grid-cols-5">
      {stages.map((stage) => (
        <section key={stage} className="flex min-h-96 flex-col gap-3 rounded-lg border bg-muted p-3">
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
              <Card className="w-80 rounded-md border-border bg-card p-3 shadow-lg outline outline-2 outline-ring">
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
      <KanbanHeader name={stage} count={orders.length} indicatorClassName={stageIndicatorClass(stage)} />
      <KanbanCards className="max-h-dvh pr-1">
        {orders.length === 0 ? (
          <div className="flex min-h-40 items-center justify-center rounded-md border border-dashed bg-card p-4 text-center text-sm text-muted-foreground">
            No orders in {stage}
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
      className={cn("border-border bg-card p-3", !canTransition && "cursor-default")}
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

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{name}</p>
          {isEditing ? (
            <input
              aria-label={`Edit title for ${order.id}`}
              autoFocus
              className="mt-1 h-8 w-full rounded-sm border border-input bg-background px-2 text-xs text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                "mt-1 line-clamp-2 w-full rounded-sm text-left text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
        </div>
        <Badge className={cn("shrink-0", priorityTones[order.priority])}>{order.priority}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md border bg-background p-2">
          <p className="text-muted-foreground">Value</p>
          <p className="mt-1 truncate font-mono font-semibold">{formatINR(order.amountInr)}</p>
        </div>
        <div className="rounded-md border bg-background p-2">
          <p className="text-muted-foreground">Promise</p>
          <p className="mt-1 truncate font-medium">{formatDate(order.promisedDate)}</p>
        </div>
      </div>

      <div className="space-y-2" aria-label={`${order.completionPct}% complete`}>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Progress</span>
          <span className="font-mono font-medium">{order.completionPct}%</span>
        </div>
        <div className="grid grid-cols-5 gap-1">
          {[20, 40, 60, 80, 100].map((step) => (
            <span key={step} className={cn("h-1.5 rounded-sm", order.completionPct >= step ? "bg-primary" : "bg-border")} />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {flags.gtpGated ? (
          <Badge className={flags.gtpStatus ? "border-warning/30 bg-warning/10 text-warning" : "border-danger/30 bg-danger/10 text-danger"}>
            <FileCheckIcon className="mr-1 size-3" />
            {flags.gtpStatus ? `GTP ${flags.gtpStatus}` : "GTP missing"}
          </Badge>
        ) : flags.gtpStatus === "Approved" ? (
          <Badge className="border-success/30 bg-success/10 text-success">
            <FileCheckIcon className="mr-1 size-3" />
            GTP ✓
          </Badge>
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

      {flags.inspection.state !== "none" ? (
        <div
          className={cn(
            "flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs font-medium",
            flags.inspection.state === "overdue"
              ? "border-danger/30 bg-danger/10 text-danger"
              : flags.inspection.state === "due"
                ? "border-warning/30 bg-warning/10 text-warning"
                : "border-border bg-muted text-muted-foreground",
          )}
        >
          <MegaphoneIcon className="size-3.5 shrink-0" />
          {flags.inspection.state === "overdue"
            ? `Inspection call overdue by ${flags.inspection.overdueBy}d (call by ${formatDate(flags.inspection.callBy)})`
            : `Call inspection by ${formatDate(flags.inspection.callBy)} (${flags.inspection.daysLeft}d left)`}
        </div>
      ) : null}

      {canTransition ? (
        <select
          aria-label={`Move ${order.id} to stage`}
          value={order.stage}
          disabled={busy}
          onChange={(event) => onTransition?.(order.id, event.target.value as OrderStage)}
          onClick={stopDrag}
          onPointerDown={stopDrag}
          className="h-8 w-full rounded-md border bg-background px-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
        >
          {stages.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm" className="h-8 px-2 text-xs">
          <Link href={`/records/${order.id}`}>Journey</Link>
        </Button>
        <Button asChild variant="outline" size="sm" className="h-8 px-2 text-xs">
          <Link href={`/gtp/review?orderId=${order.id}`}>GTP</Link>
        </Button>
        <Button asChild variant="outline" size="sm" className="h-8 px-2 text-xs">
          <Link href={`/job-card?orderId=${order.id}`}>Job</Link>
        </Button>
        <Button asChild variant="outline" size="sm" className="h-8 px-2 text-xs">
          <Link href={`/dispatch?orderId=${order.id}`}>Dispatch</Link>
        </Button>
        {canTransition && onRepeat ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 px-2 text-xs"
            disabled={busy}
            onClick={(event) => {
              stopDrag(event);
              onRepeat(order.id);
            }}
            onPointerDown={stopDrag}
            title="Clone this order with GTP, drum plan, and pricing carried over"
          >
            <CopyIcon className="mr-1 size-3" />
            Repeat
          </Button>
        ) : null}
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
