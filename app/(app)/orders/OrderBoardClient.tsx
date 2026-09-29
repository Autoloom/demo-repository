"use client";

import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  ClockIcon,
  InboxIcon,
  LockKeyholeIcon,
  RefreshCwIcon,
  SaveIcon,
  XCircleIcon,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  KanbanBoard,
  KanbanCard,
  KanbanCards,
  KanbanHeader,
  KanbanProvider,
} from "@/components/ui/kanban";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  blankIncomingQc,
  buildBoard,
  isAdjacentMove,
  matchesFilter,
  orderGtp,
  summarize,
  transitionBlockers,
  type BoardCard,
  type BoardFilter,
  type DueBucket,
  type TrayItem,
  type TrayState,
} from "@/lib/domain/board";
import { now } from "@/lib/domain/clock";
import { formatDate, formatINR } from "@/lib/domain/format";
import { can } from "@/lib/rbac";
import { dataService, ordersService, rawMaterialQcService, type CableStore } from "@/lib/services";
import type { OrderStage, RawMaterialCheck } from "@/lib/services/types";
import { actorFromSession, useSessionStore } from "@/lib/store/session";
import { cn } from "@/lib/utils";

// ── Small pieces ──────────────────────────────────────────────────────────────

const DUE_TONE: Record<DueBucket, string> = {
  overdue: "border-danger/30 bg-danger/10 text-danger",
  today: "border-warning/30 bg-warning/10 text-warning",
  soon: "border-primary/30 bg-primary/10 text-primary",
  later: "border-border bg-muted text-muted-foreground",
  done: "border-success/30 bg-success/10 text-success",
};

const TRAY_TONE: Record<TrayState, string> = {
  ok: "border-success/30 bg-success/10 text-success",
  waiting: "border-warning/30 bg-warning/10 text-warning",
  problem: "border-danger/30 bg-danger/10 text-danger",
  missing: "border-dashed border-border bg-transparent text-muted-foreground",
};

/** State is never colour alone: each has its own shape and its own words for a screen reader. */
const TRAY_ICON: Record<TrayState, React.ComponentType<{ className?: string }>> = {
  ok: CheckCircle2Icon,
  waiting: ClockIcon,
  problem: XCircleIcon,
  missing: CircleDashedIcon,
};

const TRAY_WORD: Record<TrayState, string> = {
  ok: "done",
  waiting: "waiting",
  problem: "needs attention",
  missing: "not started",
};

function Pill({ className, children, title }: { className?: string; children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={cn("inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-xs font-medium", className)}
    >
      {children}
    </span>
  );
}

function TrayChip({ item }: { item: TrayItem }) {
  const Icon = TRAY_ICON[item.state];
  return (
    <Pill className={TRAY_TONE[item.state]} title={`${item.label}: ${item.text}`}>
      <Icon className="size-3" aria-hidden="true" />
      {item.label}
      <span className="sr-only">
        {" "}
        — {TRAY_WORD[item.state]}: {item.text}
      </span>
    </Pill>
  );
}

function cableSummary(card: BoardCard): string {
  const [first, ...rest] = card.cables;
  if (!first) return "";
  return rest.length === 0 ? first.label : `${first.label} + ${rest.length} more cable${rest.length === 1 ? "" : "s"}`;
}

/** The stage a card can go to, spelled the way the column is. */
function stageTitle(stage: OrderStage | undefined, columns: { stage: OrderStage; title: string }[]): string {
  return columns.find((column) => column.stage === stage)?.title ?? "";
}

// ── The page ──────────────────────────────────────────────────────────────────

/**
 * Wrapped because `useSearchParams` suspends during prerender; without the boundary the route
 * opts out of static rendering and the build fails.
 */
export function OrderBoardClient() {
  return (
    <React.Suspense fallback={<div className="h-96 animate-pulse rounded-lg border bg-muted" />}>
      <OrderBoard />
    </React.Suspense>
  );
}

type Feedback = { tone: "success" | "danger" | "info"; text: string };

function OrderBoard() {
  const searchParams = useSearchParams();
  const role = useSessionStore((state) => state.role);
  const [store, setStore] = React.useState<CableStore | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<BoardFilter>("all");
  const [busy, setBusy] = React.useState(false);
  const [feedback, setFeedback] = React.useState<Feedback | null>(null);
  /**
   * The order whose panel is open: whatever was clicked, else whatever the URL names. Derived
   * rather than copied from the URL in an effect — "" means it was closed on purpose, so the URL
   * stops reopening it.
   */
  const [chosen, setChosen] = React.useState<string | null>(null);
  const selectedId = chosen ?? searchParams.get("order") ?? "";

  const canView = can(role, "view", "order");
  const canMove = can(role, "transition", "order");
  const canEdit = can(role, "edit", "order");

  const load = React.useCallback(async () => {
    setError(null);
    try {
      setStore(await dataService.read());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Orders could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const handle = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(handle);
  }, [load]);

  // Only a confirmation fades. A refusal, or a message explaining a rule, stays until it is read
  // and dismissed — six seconds is not long enough to read "why can't I do that" and act on it.
  React.useEffect(() => {
    if (!feedback || feedback.tone !== "success") return;
    const handle = window.setTimeout(() => setFeedback(null), 6000);
    return () => window.clearTimeout(handle);
  }, [feedback]);

  const allColumns = React.useMemo(() => (store ? buildBoard(store, now()) : []), [store]);
  const summary = React.useMemo(() => summarize(allColumns), [allColumns]);
  const columns = React.useMemo(
    () => allColumns.map((column) => ({ ...column, cards: column.cards.filter((card) => matchesFilter(card, filter)) })),
    [allColumns, filter],
  );
  const total = allColumns.reduce((sum, column) => sum + column.cards.length, 0);
  const shown = columns.reduce((sum, column) => sum + column.cards.length, 0);
  const selected = allColumns.flatMap((column) => column.cards).find((card) => card.orderId === selectedId);

  /**
   * Every way of moving a card — drag, the button on the card, the button in the panel — comes
   * through here, so they cannot disagree. The gate is checked BEFORE the service is called and
   * said in words; the service still enforces it, but a refusal after the click is the failure
   * this board exists to remove.
   */
  async function requestMove(orderId: string, target: OrderStage) {
    if (!store || !canMove || busy) return;
    const order = store.orders.find((entry) => entry.id === orderId);
    if (!order || order.stage === target) return;
    if (!isAdjacentMove(order.stage, target)) {
      setFeedback({
        tone: "info",
        text: "Cards move one stage at a time, so nothing skips a check. Move it to the next column.",
      });
      return;
    }
    const check = transitionBlockers(store, order, target);
    if (check.blockers.length > 0) {
      setFeedback({ tone: "danger", text: `${orderId} can't move yet — ${check.blockers.join(" ")}` });
      return;
    }
    setBusy(true);
    try {
      await ordersService.transition(orderId, target, actorFromSession());
      await load();
      const title = stageTitle(target, allColumns);
      setFeedback({ tone: "success", text: `${orderId} moved to ${title}.` });
    } catch (err) {
      setFeedback({ tone: "danger", text: err instanceof Error ? err.message : "Could not move the order." });
    } finally {
      setBusy(false);
    }
  }

  if (!canView) {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger/10 p-6 text-sm text-danger">
        You do not have access to the order board.
      </div>
    );
  }

  const filters: { key: BoardFilter; label: string; count: number; tone: string }[] = [
    { key: "overdue", label: "Overdue", count: summary.overdue, tone: summary.overdue > 0 ? "text-danger" : "" },
    { key: "today", label: "Due today", count: summary.dueToday, tone: summary.dueToday > 0 ? "text-warning" : "" },
    { key: "inProduction", label: "In production", count: summary.inProduction, tone: "" },
    { key: "waiting", label: "Waiting to start", count: summary.waitingToStart, tone: summary.waitingToStart > 0 ? "text-warning" : "" },
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Order board</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Every order, by stage. Each card shows what is due, which documents exist, and what is
            still in the way of the next step.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()}>
          <RefreshCwIcon className="mr-2 size-4" />
          Refresh
        </Button>
      </header>

      {feedback ? (
        <div
          role={feedback.tone === "danger" ? "alert" : "status"}
          className={cn(
            "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
            feedback.tone === "success" && "border-success/30 bg-success/10 text-success",
            feedback.tone === "danger" && "border-danger/30 bg-danger/10 text-danger",
            feedback.tone === "info" && "border-info/30 bg-info/10 text-info",
          )}
        >
          {feedback.tone === "success" ? (
            <CheckCircle2Icon className="mt-0.5 size-4 shrink-0" />
          ) : (
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
          )}
          <span className="flex-1">{feedback.text}</span>
          <button type="button" className="text-xs underline underline-offset-2" onClick={() => setFeedback(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          <p className="font-medium">{error}</p>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      ) : null}

      {loading ? (
        <div className="h-96 animate-pulse rounded-lg border bg-muted" />
      ) : store ? (
        <>
          {/* What the owner asked to see first: what is due, what is running, what is stuck. Each
              number is also the filter that shows exactly those cards. */}
          <section aria-label="Overview" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {filters.map((entry) => (
              <button
                key={entry.key}
                type="button"
                aria-pressed={filter === entry.key}
                onClick={() => setFilter(filter === entry.key ? "all" : entry.key)}
                className={cn(
                  "rounded-md border bg-card p-2.5 text-left transition-colors hover:bg-muted sm:p-3",
                  filter === entry.key && "border-primary ring-1 ring-primary",
                )}
              >
                <span className={cn("block font-mono text-xl font-semibold sm:text-2xl", entry.tone)}>{entry.count}</span>
                <span className="text-xs text-muted-foreground">{entry.label}</span>
              </button>
            ))}
            <button
              type="button"
              aria-pressed={filter === "all"}
              onClick={() => setFilter("all")}
              className={cn(
                "rounded-md border bg-card p-2.5 text-left transition-colors hover:bg-muted sm:p-3",
                filter === "all" && "border-primary ring-1 ring-primary",
              )}
            >
              <span className="block font-mono text-xl font-semibold sm:text-2xl">{total}</span>
              <span className="text-xs text-muted-foreground">All orders</span>
            </button>
          </section>

          {!canMove ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <LockKeyholeIcon className="size-3.5" />
              You can see every order and its documents. Moving an order between stages is for Operations and Accounts.
            </p>
          ) : null}

          {total === 0 ? (
            <div className="rounded-lg border bg-card p-8 text-center">
              <InboxIcon className="mx-auto size-8 text-muted-foreground" />
              <h2 className="mt-3 font-medium">No orders yet</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                An order appears here when a quote is sent to the order board from the Quotation page.
              </p>
              <Button asChild className="mt-4" variant="outline">
                <Link href="/quote">Go to Quotation</Link>
              </Button>
            </div>
          ) : (
            <>
              {filter !== "all" ? (
                <p className="text-sm text-muted-foreground">
                  Showing {shown} of {total} orders.{" "}
                  <button type="button" className="underline underline-offset-2" onClick={() => setFilter("all")}>
                    Show all
                  </button>
                </p>
              ) : null}
              <KanbanProvider
                onDragEnd={(event) => {
                  const target = event.over?.id;
                  if (target) void requestMove(String(event.active.id), String(target) as OrderStage);
                }}
                renderOverlay={(id) => {
                  const card = allColumns.flatMap((column) => column.cards).find((entry) => entry.orderId === id);
                  return card ? (
                    <div className="w-64 rounded-md border bg-card p-3 text-sm shadow-lg">
                      <p className="font-mono text-xs text-muted-foreground">{card.orderId}</p>
                      <p className="font-medium">{card.customerName}</p>
                    </div>
                  ) : null;
                }}
                // Columns scroll sideways at any width instead of wrapping into rows: a board that
                // reflows to a 2 × 3 grid stops reading left-to-right as a pipeline.
                className="grid-flow-col grid-cols-none auto-cols-[minmax(17rem,1fr)] overflow-x-auto pb-3 md:grid-cols-none xl:grid-cols-none"
              >
                {columns.map((column) => (
                  <KanbanBoard key={column.stage} id={column.stage} className="snap-start">
                    <div className="space-y-0.5">
                      <KanbanHeader name={column.title} count={column.cards.length} />
                      <p className="text-xs text-muted-foreground">{column.hint}</p>
                    </div>
                    <KanbanCards>
                      {column.cards.length === 0 ? (
                        <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                          {filter === "all" ? "Nothing at this stage." : "No orders match this view here."}
                        </p>
                      ) : (
                        column.cards.map((card, index) => (
                          <OrderCard
                            key={card.orderId}
                            card={card}
                            index={index}
                            canMove={canMove}
                            busy={busy}
                            stages={allColumns}
                            onOpen={() => setChosen(card.orderId)}
                            onMove={(target) => void requestMove(card.orderId, target)}
                          />
                        ))
                      )}
                    </KanbanCards>
                  </KanbanBoard>
                ))}
              </KanbanProvider>
            </>
          )}
        </>
      ) : null}

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setChosen("")}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          {selected && store ? (
            <OrderPanel
              key={selected.orderId}
              card={selected}
              store={store}
              stages={allColumns}
              canMove={canMove}
              canEdit={canEdit}
              busy={busy}
              onMove={(target) => void requestMove(selected.orderId, target)}
              onChanged={async (text) => {
                await load();
                setFeedback({ tone: "success", text });
              }}
              onError={(text) => setFeedback({ tone: "danger", text })}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ── The card ──────────────────────────────────────────────────────────────────

function OrderCard({
  card,
  index,
  canMove,
  busy,
  stages,
  onOpen,
  onMove,
}: {
  card: BoardCard;
  index: number;
  canMove: boolean;
  busy: boolean;
  stages: { stage: OrderStage; title: string }[];
  onOpen: () => void;
  onMove: (target: OrderStage) => void;
}) {
  const gated = card.nextBlockers.length > 0;
  // The gate is spoken about in the future tense on a card that has not started ("Waiting for"),
  // and stays quiet on one that is simply mid-production and not yet inspected — that is a normal
  // state of a cable being made, not a blockage.
  const showGate = gated && card.stage !== "Quoted" && card.stage !== "Invoiced";

  return (
    <KanbanCard
      id={card.orderId}
      name={card.orderId}
      index={index}
      parent={card.stage}
      disabled={!canMove}
      className="space-y-3"
    >
      {/* Clicking the card body opens the panel for a mouse; the order number is the real button,
          so a keyboard or screen-reader user can do the same. Buttons inside stop the click here. */}
      <div className="cursor-pointer space-y-3" onClick={onOpen}>
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            className="text-left font-mono text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={(event) => {
              event.stopPropagation();
              onOpen();
            }}
            aria-label={`Open ${card.orderId}, ${card.customerName}`}
          >
            {card.orderId}
          </button>
          {card.priority === "High" ? (
            <Pill className="border-danger/30 bg-danger/10 text-danger">High priority</Pill>
          ) : null}
        </div>

        <div className="space-y-0.5">
          <p className="text-sm font-medium leading-snug">{card.customerName}</p>
          <p className="text-xs text-muted-foreground">{cableSummary(card)}</p>
          <p className="text-xs text-muted-foreground">
            {card.totalMetres > 0 ? `${card.totalMetres.toLocaleString("en-IN")} m · ` : ""}
            {formatINR(card.amountInr)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Pill className={DUE_TONE[card.due.bucket]} title={`Promised ${formatDate(card.promisedDate)}`}>
            {card.due.label}
          </Pill>
        </div>

        <div className="flex flex-wrap gap-1" aria-label="Documents">
          {card.tray.map((item) => (
            <TrayChip key={item.label} item={item} />
          ))}
        </div>

        {showGate ? (
          <div className="flex items-start gap-1.5 rounded-md border border-warning/30 bg-warning/10 p-2 text-xs text-warning">
            <LockKeyholeIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <p>
              <span className="font-medium">
                {card.nextGate === "Production" ? "Can't start yet:" : "Before dispatch:"}
              </span>{" "}
              {card.nextBlockers[0]}
              {card.nextBlockers.length > 1 ? ` (+${card.nextBlockers.length - 1} more)` : ""}
            </p>
          </div>
        ) : null}
      </div>

      {canMove ? (
        <div className="flex items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
          {card.previousStage ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => onMove(card.previousStage!)}
              aria-label={`Move ${card.orderId} back to ${stageTitle(card.previousStage, stages)}`}
              title={`Back to ${stageTitle(card.previousStage, stages)}`}
            >
              <ArrowLeftIcon className="size-4" />
            </Button>
          ) : null}
          {card.nextStage ? (
            <Button
              type="button"
              size="sm"
              variant={gated ? "outline" : "default"}
              // Wraps rather than truncates: "Move to Ready for dispatch" is longer than the card.
              className="h-auto min-h-8 flex-1 whitespace-normal py-1.5 text-left leading-tight"
              // Never a bare disabled button: the reason is printed on the card above. A blocked
              // press is still allowed to happen, and answers with the reason in words.
              aria-disabled={gated || busy}
              disabled={busy}
              onClick={() => onMove(card.nextStage!)}
            >
              <span className="flex-1">Move to {stageTitle(card.nextStage, stages)}</span>
              <ArrowRightIcon className="ml-1.5 size-4 shrink-0" />
            </Button>
          ) : null}
        </div>
      ) : null}
    </KanbanCard>
  );
}

// ── The panel ─────────────────────────────────────────────────────────────────

function OrderPanel({
  card,
  store,
  stages,
  canMove,
  canEdit,
  busy,
  onMove,
  onChanged,
  onError,
}: {
  card: BoardCard;
  store: CableStore;
  stages: { stage: OrderStage; title: string }[];
  canMove: boolean;
  canEdit: boolean;
  busy: boolean;
  onMove: (target: OrderStage) => void;
  onChanged: (text: string) => Promise<void>;
  onError: (text: string) => void;
}) {
  const order = store.orders.find((entry) => entry.id === card.orderId)!;
  const gtp = orderGtp(store, order);
  const gated = card.nextBlockers.length > 0;

  return (
    <>
      <SheetHeader>
        <SheetTitle className="font-mono text-base">{card.orderId}</SheetTitle>
        <SheetDescription>
          {card.customerName} · {stageTitle(card.stage, stages)}
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-6 px-4 pb-6">
        <section className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Pill className={DUE_TONE[card.due.bucket]}>{card.due.label}</Pill>
            <span className="text-xs text-muted-foreground">
              Promised {formatDate(card.promisedDate)} · {formatINR(card.amountInr)}
            </span>
          </div>
          {canEdit ? (
            <DeliveryDate
              key={`${card.orderId}-${card.promisedDate}`}
              orderId={card.orderId}
              value={card.promisedDate}
              onSaved={onChanged}
              onError={onError}
            />
          ) : null}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">
            Cables{card.cables.length > 1 ? ` (${card.cables.length})` : ""}
          </h3>
          <ul className="space-y-1 text-sm">
            {card.cables.map((cable, index) => (
              <li key={`${cable.specId}-${index}`} className="flex justify-between gap-3 rounded-md border bg-background px-3 py-2">
                <span>{cable.label}</span>
                {cable.lengthM > 0 ? (
                  <span className="font-mono text-xs text-muted-foreground">
                    {cable.lengthM.toLocaleString("en-IN")} m
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Documents</h3>
          <ul className="space-y-2">
            {card.tray.map((item) => {
              const Icon = TRAY_ICON[item.state];
              return (
                <li key={item.label} className="rounded-md border bg-background p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-medium">
                      <Icon
                        className={cn(
                          "size-4",
                          item.state === "ok" && "text-success",
                          item.state === "waiting" && "text-warning",
                          item.state === "problem" && "text-danger",
                          item.state === "missing" && "text-muted-foreground",
                        )}
                        aria-hidden="true"
                      />
                      {item.label}
                    </span>
                    <span className="text-xs text-muted-foreground">{item.text}</span>
                  </div>
                  {item.records.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {item.records.map((record) => (
                        <li key={record.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-mono">{record.id}</span>
                          {record.href ? (
                            <Link href={record.href} className="text-primary underline underline-offset-2">
                              Open
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">{record.status}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>

        {card.nextStage && card.stage !== "Quoted" ? (
          <section className="space-y-2">
            <h3 className="text-sm font-medium">
              {card.nextGate === "Production" ? "To start production" : card.nextGate === "Dispatch" ? "Before dispatch" : "Next step"}
            </h3>
            {gated ? (
              <ul className="space-y-2">
                {card.nextBlockers.map((blocker) => (
                  <li key={blocker} className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
                    <LockKeyholeIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <span>
                      {blocker}
                      {/GTP/.test(blocker) && gtp ? (
                        <>
                          {" "}
                          <Link href={`/gtp/review?gtpId=${gtp.id}`} className="font-medium underline underline-offset-2">
                            Open {gtp.id}
                          </Link>
                        </>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-2 text-sm text-success">
                <CheckCircle2Icon className="size-4" /> Nothing in the way.
              </p>
            )}
          </section>
        ) : null}

        {card.stage === "Won" || card.stage === "In Production" ? (
          <IncomingQc
            key={`${card.orderId}-${store.rawMaterialChecks.find((entry) => entry.orderId === card.orderId)?.passedAt ?? "open"}`}
            store={store}
            orderId={card.orderId}
            canEdit={canEdit}
            onSaved={onChanged}
            onError={onError}
          />
        ) : null}

        {canMove ? (
          <div className="flex gap-2 border-t pt-4">
            {card.previousStage ? (
              <Button type="button" variant="outline" disabled={busy} onClick={() => onMove(card.previousStage!)}>
                <ArrowLeftIcon className="mr-2 size-4" />
                Back to {stageTitle(card.previousStage, stages)}
              </Button>
            ) : null}
            {card.nextStage ? (
              <Button type="button" className="flex-1" variant={gated ? "outline" : "default"} disabled={busy} onClick={() => onMove(card.nextStage!)}>
                Move to {stageTitle(card.nextStage, stages)}
                <ArrowRightIcon className="ml-2 size-4" />
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}

function DeliveryDate({
  orderId,
  value,
  onSaved,
  onError,
}: {
  orderId: string;
  value: string;
  onSaved: (text: string) => Promise<void>;
  onError: (text: string) => void;
}) {
  const [draft, setDraft] = React.useState(value.slice(0, 10));
  const [saving, setSaving] = React.useState(false);
  const changed = draft !== value.slice(0, 10) && /^\d{4}-\d{2}-\d{2}$/.test(draft);
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <Label htmlFor="promised-date" className="text-xs">
          Promised delivery date
        </Label>
        <Input id="promised-date" type="date" value={draft} onChange={(event) => setDraft(event.target.value)} className="w-44" />
      </div>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={!changed || saving}
        onClick={async () => {
          setSaving(true);
          try {
            await ordersService.setPromisedDate(orderId, draft, actorFromSession());
            await onSaved(`${orderId} delivery date set to ${formatDate(draft)}.`);
          } catch (err) {
            onError(err instanceof Error ? err.message : "Could not change the date.");
          } finally {
            setSaving(false);
          }
        }}
      >
        <SaveIcon className="mr-2 size-4" />
        Save date
      </Button>
    </div>
  );
}

const QC_RESULTS = ["Pending", "Pass", "Fail"] as const;

/**
 * Incoming raw-material QC, recorded where the gate that needs it is shown.
 *
 * The production gate requires a passed QC record and converting a quote does not create one, and
 * this build has no other screen for it — so without this an order could never leave "Won". Kept
 * to the five checks the plant already runs; a failed check is escalated to the Owner by the
 * service, which is said here because the person ticking "Fail" should know it will be seen.
 */
function IncomingQc({
  store,
  orderId,
  canEdit,
  onSaved,
  onError,
}: {
  store: CableStore;
  orderId: string;
  canEdit: boolean;
  onSaved: (text: string) => Promise<void>;
  onError: (text: string) => void;
}) {
  const order = store.orders.find((entry) => entry.id === orderId)!;
  const existing = store.rawMaterialChecks.find((entry) => entry.orderId === orderId);
  const base: RawMaterialCheck = existing ?? blankIncomingQc(store, order);
  const [results, setResults] = React.useState<Record<string, (typeof QC_RESULTS)[number]>>(
    Object.fromEntries(base.checks.map((check) => [check.id, check.result])),
  );
  const [saving, setSaving] = React.useState(false);
  const passed = base.checks.every((check) => check.result === "Pass");
  const changed = base.checks.some((check) => results[check.id] !== check.result);
  const failed = Object.values(results).includes("Fail");

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Incoming raw material QC</h3>
        {passed && existing?.approvedBy ? (
          <Pill className={TRAY_TONE.ok}>Passed · {existing.approvedBy}</Pill>
        ) : (
          <Pill className={existing ? TRAY_TONE.waiting : TRAY_TONE.missing}>{existing ? "In progress" : "Not recorded"}</Pill>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{base.materialType}</p>
      <ul className="space-y-1.5">
        {base.checks.map((check) => (
          <li key={check.id} className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm">
            <span>{check.label}</span>
            <select
              aria-label={`${check.label} result`}
              disabled={!canEdit || saving}
              value={results[check.id]}
              onChange={(event) => setResults((current) => ({ ...current, [check.id]: event.target.value as (typeof QC_RESULTS)[number] }))}
              className={cn(
                "h-8 rounded-md border border-input bg-background px-2 text-xs",
                results[check.id] === "Pass" && "text-success",
                results[check.id] === "Fail" && "text-danger",
              )}
            >
              {QC_RESULTS.map((result) => (
                <option key={result} value={result}>
                  {result}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
      {canEdit ? (
        <>
          {failed ? (
            <p className="text-xs text-danger">A failed check is escalated to the Owner and keeps production gated.</p>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!changed || saving}
            onClick={async () => {
              setSaving(true);
              try {
                await rawMaterialQcService.save(
                  { ...base, checks: base.checks.map((check) => ({ ...check, result: results[check.id] })) },
                  actorFromSession(),
                );
                await onSaved(
                  Object.values(results).every((result) => result === "Pass")
                    ? `Incoming QC passed on ${orderId} — that gate is clear.`
                    : `Incoming QC saved on ${orderId}.`,
                );
              } catch (err) {
                onError(err instanceof Error ? err.message : "Could not save the QC record.");
              } finally {
                setSaving(false);
              }
            }}
          >
            <SaveIcon className="mr-2 size-4" />
            Save QC
          </Button>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">Recording QC is for Operations.</p>
      )}
    </section>
  );
}
