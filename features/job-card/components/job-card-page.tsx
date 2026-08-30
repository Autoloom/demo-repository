/*  Operator/job-card interface for production jobs, 
    job progress, manufacturing workflow, and associated
    operational actions. */

"use client";

import {
  AlertTriangle,
  Cable,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Inbox,
  LockKeyhole,
  Package,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Trash2,
  Wrench,
} from "lucide-react";
import * as React from "react";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";

import { AlertBadge, Button, Input, Label } from "@/components/ui";
import { formatDate, formatINR } from "@/lib/domain/format";
import {
  dataService,
  jobCardsService,
  ordersService,
  type Actor,
  type CableSpec,
  type Customer,
  type DrumPlanItem,
  type DrumType,
  type JobCard,
  type Order,
  type QualityCheck,
  type Quote,
  type Role,
} from "@/lib/services";
import { cn } from "@/lib/utils";

type NoticeTone = "success" | "error" | "info";

type PageData = {
  orders: Order[];
  jobCards: JobCard[];
  specs: CableSpec[];
  customers: Customer[];
  quotes: Quote[];
};

type Notice = {
  tone: NoticeTone;
  label: string;
};

const actor: Actor = {
  id: "USR-003",
  name: "Meera Ops",
  role: "Operations",
};

const queryClient = new QueryClient();

const emptyPageData: PageData = {
  orders: [],
  jobCards: [],
  specs: [],
  customers: [],
  quotes: [],
};

async function fetchJobCardData(): Promise<PageData> {
  const [orders, jobCards, store] = await Promise.all([
    ordersService.list(),
    jobCardsService.list(),
    dataService.read(),
  ]);

  return {
    orders,
    jobCards,
    specs: store.specs,
    customers: store.customers,
    quotes: store.quotes,
  };
}

const drumTypes = ["Wooden", "Steel", "Steel-Wood"] as const satisfies readonly DrumType[];
const checkResults = ["Pending", "Pass", "Fail"] as const satisfies readonly NonNullable<
  QualityCheck["result"]
>[];

const defaultQualityChecks: QualityCheck[] = [
  { id: "QC-RESISTANCE", label: "Conductor resistance", result: "Pending" },
  { id: "QC-HV", label: "HV/spark test", result: "Pending" },
  { id: "QC-ARMOUR", label: "Armour lay length", result: "Pending" },
  { id: "QC-OD", label: "OD check", result: "Pending" },
  { id: "QC-PRINT", label: "Print legibility", result: "Pending" },
];

function can(role: Role, action: "view" | "edit", resource: "jobcard") {
  if (role === "Owner") return true;
  return role === "Operations" && resource === "jobcard" && ["view", "edit"].includes(action);
}

function FieldSelect({
  id,
  value,
  onChange,
  children,
  disabled,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      id={id}
      onChange={(event) => onChange(event.target.value)}
      value={value}
    >
      {children}
    </select>
  );
}

function FieldTextarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info" | "highlight";
}) {
  const tones = {
    neutral: "border-border bg-muted text-muted-foreground",
    success: "border-success/30 bg-success/10 text-success",
    warning: "border-warning/30 bg-warning/10 text-warning",
    danger: "border-danger/30 bg-danger/10 text-danger",
    info: "border-info/30 bg-info/10 text-info",
    highlight: "border-highlight/30 bg-highlight/10 text-highlight",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-2 py-1 text-xs font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

function MoneyCell({ amountInr }: { amountInr: number }) {
  return <span className="font-mono tabular-nums">{formatINR(amountInr)}</span>;
}

function DateCell({ iso }: { iso: string }) {
  return <span className="font-mono">{formatDate(iso)}</span>;
}

function numberValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function inputNumber(value?: number) {
  return value === undefined ? "" : String(value);
}

function orderSpecId(order: Order, quotes: Quote[]) {
  return quotes.find((quote) => quote.id === order.quoteId)?.lines[0]?.specId;
}

function orderLengthM(order: Order, quotes: Quote[]) {
  return quotes.find((quote) => quote.id === order.quoteId)?.lines[0]?.lengthM;
}

function customerFor(order: Order | undefined, customers: Customer[]) {
  if (!order) return undefined;
  return customers.find((customer) => customer.id === order.customerId);
}

function specFor(order: Order | undefined, card: JobCard | undefined, data: PageData) {
  const specId = card?.specId ?? (order ? orderSpecId(order, data.quotes) : undefined);
  return data.specs.find((spec) => spec.id === specId);
}

function nextJobCardId(cards: JobCard[]) {
  const next =
    cards
      .map((card) => Number(card.id.split("-").at(-1)))
      .filter(Number.isFinite)
      .reduce((highest, value) => Math.max(highest, value), 8813) + 1;

  return `JC-${next}`;
}

function nextRowId(prefix: string, count: number) {
  return `${prefix}-${String(count + 1).padStart(2, "0")}`;
}

function defaultCard(order: Order, data: PageData): JobCard {
  const specId = orderSpecId(order, data.quotes) ?? data.specs[0]?.id ?? "SPEC-PENDING";
  const spec = data.specs.find((candidate) => candidate.id === specId);

  return {
    id: nextJobCardId(data.jobCards),
    orderId: order.id,
    specId,
    conductorDetail: spec
      ? `${spec.conductorMaterial} ${spec.conductorClass}, ${spec.conductorSizeSqMm} sq mm`
      : "Conductor detail pending",
    insulationDetail: spec?.insulation ?? "Insulation detail pending",
    armourDetail: spec?.armour ?? "Armour detail pending",
    sheathDetail: spec?.sheath ?? "Sheath detail pending",
    drumPlan: [],
    operatorNotes: "",
    qualityChecks: defaultQualityChecks.map((check) => ({ ...check })),
    updatedAt: "",
  };
}

function workingCard(order: Order, data: PageData) {
  const existing =
    data.jobCards.find((card) => card.orderId === order.id) ??
    data.jobCards.find((card) => card.id === order.jobCardId);

  return existing ? structuredClone(existing) : defaultCard(order, data);
}

function totalDrumLength(rows: DrumPlanItem[]) {
  return rows.reduce((total, row) => total + row.lengthM, 0);
}

function estimatedGrossWeight(spec: CableSpec | undefined, lengthM: number) {
  if (!spec?.approxWeightKgPerKm) return undefined;
  return Math.round((spec.approxWeightKgPerKm * lengthM) / 1000);
}

function buildDrumMarking(
  order: Order,
  spec: CableSpec | undefined,
  drum: Pick<DrumPlanItem, "drumNo" | "lengthM">,
) {
  if (!spec) return `${drum.drumNo} · Autoloom · ${order.id} · ${drum.lengthM} m`;

  const size = `${spec.cores} x ${spec.conductorSizeSqMm} sq mm ${spec.conductorMaterial}`;
  const typeVoltage = `${spec.cableCode ?? spec.insulation} · ${spec.voltageGrade}`;

  return `${drum.drumNo} · Autoloom · ${size} · ${typeVoltage} · ${drum.lengthM} m`;
}

function CableSpecSummary({ spec }: { spec?: CableSpec }) {
  if (!spec) {
    return (
      <div className="rounded-md border border-border bg-muted p-4 text-sm text-muted-foreground">
        Ordered cable specification is not available for this order.
      </div>
    );
  }

  const facts = [
    ["Standard", spec.standard],
    ["Voltage", spec.voltageGrade],
    ["Cable code", spec.cableCode ?? "Not assigned"],
    ["Conductor", `${spec.cores} x ${spec.conductorSizeSqMm} sq mm ${spec.conductorMaterial}`],
    ["Insulation", spec.insulation],
    ["Armour", spec.armour],
    ["Sheath", spec.sheath],
    ["Weight", spec.approxWeightKgPerKm ? `${spec.approxWeightKgPerKm} kg/km` : "Pending"],
  ];

  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Contracted CableSpec</p>
          <p className="mt-1 text-sm text-muted-foreground">{spec.designation}</p>
        </div>
        <Cable className="size-4 shrink-0 text-muted-foreground" aria-hidden={true} />
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        {facts.map(([label, value]) => (
          <div key={label} className="rounded-md border border-border bg-muted p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-sm">
              {label === "Cable code" ? <span className="font-mono">{value}</span> : value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section className="space-y-4 lg:col-span-2">
        <div className="h-28 animate-pulse rounded-md border border-border bg-muted" />
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              className="h-28 animate-pulse rounded-md border border-border bg-muted"
              key={index}
            />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-md border border-border bg-muted" />
      </section>
      <aside className="space-y-4">
        <div className="h-72 animate-pulse rounded-md border border-border bg-muted" />
        <div className="h-48 animate-pulse rounded-md border border-border bg-muted" />
      </aside>
    </div>
  );
}

function EmptyState({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: typeof Inbox;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-8 text-center">
      <Icon className="mx-auto size-8 text-muted-foreground" aria-hidden={true} />
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-md border border-danger/30 bg-card p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-1 size-5 text-danger" aria-hidden={true} />
          <div>
            <h2 className="font-semibold">Could not load operator card data</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Retry the service request. No local changes were written.
            </p>
          </div>
        </div>
        <Button onClick={onRetry} variant="outline">
          <RefreshCw className="size-4" aria-hidden={true} />
          Retry
        </Button>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  icon: typeof ClipboardList;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className="size-4 text-muted-foreground" aria-hidden={true} />
      </div>
      <div className="mt-3 text-xl font-semibold">{value}</div>
    </div>
  );
}

export default function JobCardPage() {
  return (
    <QueryClientProvider client={queryClient}>
      <JobCardClient />
    </QueryClientProvider>
  );
}

function JobCardClient() {
  const queryClientValue = useQueryClient();
  const query = useQuery({
    queryKey: ["job-card-page"],
    queryFn: fetchJobCardData,
  });
  const data = query.data ?? emptyPageData;
  const [selectedOrderId, setSelectedOrderId] = React.useState(() =>
    typeof window === "undefined"
      ? ""
      : new URLSearchParams(window.location.search).get("orderId") ?? "",
  );
  const [card, setCard] = React.useState<JobCard | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [notice, setNotice] = React.useState<Notice | null>(null);

  const canView = can(actor.role, "view", "jobcard");
  const canEdit = can(actor.role, "edit", "jobcard");

  const selectedOrder = React.useMemo(
    () => data.orders.find((order) => order.id === selectedOrderId),
    [data.orders, selectedOrderId],
  );
  const selectedCustomer = React.useMemo(
    () => customerFor(selectedOrder, data.customers),
    [data.customers, selectedOrder],
  );

  const sourceCard = React.useMemo(
    () => (selectedOrder ? workingCard(selectedOrder, data) : null),
    [data, selectedOrder],
  );
  const activeCard = card ?? sourceCard;
  const selectedSpec = React.useMemo(
    () => specFor(selectedOrder, activeCard ?? undefined, data),
    [activeCard, data, selectedOrder],
  );
  const plannedLengthM = selectedOrder ? orderLengthM(selectedOrder, data.quotes) : undefined;
  const totalLengthM = activeCard ? totalDrumLength(activeCard.drumPlan) : 0;
  const lengthMismatch =
    activeCard && plannedLengthM !== undefined && totalLengthM !== plannedLengthM;
  const checksDone =
    activeCard?.qualityChecks.filter((check) => check.result === "Pass").length ?? 0;
  const checksFailed =
    activeCard?.qualityChecks.filter((check) => check.result === "Fail").length ?? 0;

  function chooseOrder(orderId: string) {
    setSelectedOrderId(orderId);
    const nextOrder = data.orders.find((order) => order.id === orderId);
    setCard(nextOrder ? workingCard(nextOrder, data) : null);
    setNotice(null);
    if (typeof window !== "undefined") {
      const nextUrl = orderId ? `/job-card?orderId=${orderId}` : "/job-card";
      window.history.replaceState(null, "", nextUrl);
    }
  }

  function patchCard(patch: Partial<JobCard>) {
    setCard((current) => {
      const base = current ?? activeCard;
      return base ? { ...base, ...patch } : current;
    });
  }

  function patchDrum(index: number, patch: Partial<DrumPlanItem>) {
    if (!selectedOrder) return;

    setCard((current) => {
      const base = current ?? activeCard;
      if (!base) return current;
      const drumPlan = base.drumPlan.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        const nextRow = { ...row, ...patch };
        return {
          ...nextRow,
          markings:
            patch.markings !== undefined
              ? patch.markings
              : buildDrumMarking(selectedOrder, selectedSpec, nextRow),
        };
      });

      return { ...base, drumPlan };
    });
  }

  function addDrum() {
    if (!selectedOrder) return;

    setCard((current) => {
      const base = current ?? activeCard;
      if (!base) return current;
      const lengthM = 1000;
      const drumNo = `DR-${selectedOrder.id.replace("ORD-", "")}-${String.fromCharCode(
        65 + base.drumPlan.length,
      )}`;
      const row: DrumPlanItem = {
        drumNo,
        drumType: "Steel-Wood",
        lengthM,
        grossWeightKg: estimatedGrossWeight(selectedSpec, lengthM),
        markings: buildDrumMarking(selectedOrder, selectedSpec, { drumNo, lengthM }),
      };

      return { ...base, drumPlan: [...base.drumPlan, row] };
    });
  }

  function removeDrum(index: number) {
    setCard((current) => {
      const base = current ?? activeCard;
      return base
        ? { ...base, drumPlan: base.drumPlan.filter((_, rowIndex) => rowIndex !== index) }
        : current;
    });
  }

  function patchCheck(index: number, patch: Partial<QualityCheck>) {
    setCard((current) => {
      const base = current ?? activeCard;
      return base
        ? {
            ...base,
            qualityChecks: base.qualityChecks.map((check, checkIndex) =>
              checkIndex === index ? { ...check, ...patch } : check,
            ),
          }
        : current;
    });
  }

  function addCheck() {
    setCard((current) => {
      const base = current ?? activeCard;
      return base
        ? {
            ...base,
            qualityChecks: [
              ...base.qualityChecks,
              {
                id: nextRowId("QC", base.qualityChecks.length),
                label: "Additional quality check",
                result: "Pending",
              },
            ],
          }
        : current;
    });
  }

  function removeCheck(index: number) {
    setCard((current) => {
      const base = current ?? activeCard;
      return base
        ? {
            ...base,
            qualityChecks: base.qualityChecks.filter((_, checkIndex) => checkIndex !== index),
          }
        : current;
    });
  }

  async function saveCard() {
    if (!activeCard || !canEdit) return;

    setSaving(true);
    setNotice(null);

    try {
      const saved = await jobCardsService.save(activeCard, actor);
      await queryClientValue.invalidateQueries({ queryKey: ["job-card-page"] });
      setCard(structuredClone(saved));
      setNotice({ tone: "success", label: `${saved.id} saved and activity logged.` });
    } catch {
      setNotice({
        tone: "error",
        label: "Save failed. The operator card was not updated.",
      });
    } finally {
      setSaving(false);
    }
  }

  function printCard() {
    if (typeof window !== "undefined") window.print();
  }

  if (!canView) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6">
        <EmptyState
          description="This page is routed for Operations and Owner. Switch to an authorized role to view job cards."
          icon={LockKeyhole}
          title="Operator card access is restricted"
        />
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-6 print:p-0">
      <header className="flex flex-col gap-4 border-b border-border pb-6 print:hidden lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="highlight">Operations</Badge>
            <Badge tone="info">Job card</Badge>
            {selectedOrder ? <Badge tone="neutral">{selectedOrder.stage}</Badge> : null}
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">Operator Card</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Floor-ready process notes, drum planning, markings, and quality checks for the selected order.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 sm:min-w-64">
            <Label htmlFor="order">Order</Label>
            <FieldSelect id="order" onChange={chooseOrder} value={selectedOrderId}>
              <option value="">Select an order</option>
              {data.orders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.id} · {order.title}
                </option>
              ))}
            </FieldSelect>
          </div>
          <Button disabled={!activeCard} onClick={printCard} type="button" variant="outline">
            <Printer className="size-4" aria-hidden={true} />
            Print this job card
          </Button>
          {canEdit ? (
            <Button disabled={!activeCard || saving} onClick={saveCard} type="button">
              {saving ? (
                <RefreshCw className="size-4 animate-spin" aria-hidden={true} />
              ) : (
                <Save className="size-4" aria-hidden={true} />
              )}
              Save operator card
            </Button>
          ) : null}
        </div>
      </header>

      {notice ? (
        <div className="print:hidden">
          <AlertBadge
            icon={notice.tone === "success" ? CheckCircle2 : AlertTriangle}
            label={notice.label}
            variant={notice.tone === "success" ? "success" : notice.tone === "error" ? "error" : "info"}
          />
        </div>
      ) : null}

      {query.isLoading ? <LoadingState /> : null}
      {query.isError ? <ErrorState onRetry={() => void query.refetch()} /> : null}
      {query.isSuccess && data.orders.length === 0 ? (
        <EmptyState
          description="Orders will appear here after a quote is sent to the order board."
          icon={Inbox}
          title="No production orders are available"
        />
      ) : null}
      {query.isSuccess && data.orders.length > 0 && !selectedOrder ? (
        <EmptyState
          description="Choose an order from the dropdown to load or create its operator job card."
          icon={ClipboardList}
          title="No order selected"
        />
      ) : null}

      {query.isSuccess && selectedOrder && activeCard ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <section className="space-y-6 lg:col-span-2">
            <section className="rounded-md border border-border bg-card p-4 print:border-border">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="font-mono text-sm text-muted-foreground">{activeCard.id}</p>
                  <h2 className="mt-1 text-xl font-semibold">{selectedOrder.title}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {selectedCustomer?.name ?? selectedOrder.customerId} · {selectedSpec?.designation ?? selectedOrder.specSummary}
                  </p>
                </div>
                <div className="grid min-w-0 gap-3 sm:grid-cols-3">
                  <Metric
                    icon={Package}
                    label="Order value"
                    value={<MoneyCell amountInr={selectedOrder.amountInr} />}
                  />
                  <Metric
                    icon={FileText}
                    label="Promised"
                    value={<DateCell iso={selectedOrder.promisedDate} />}
                  />
                  <Metric
                    icon={Wrench}
                    label="Completion"
                    value={<span className="font-mono">{selectedOrder.completionPct}%</span>}
                  />
                </div>
              </div>
            </section>

            {lengthMismatch ? (
              <div className="rounded-md border border-warning/30 bg-card p-4 print:hidden">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-1 size-5 text-warning" aria-hidden={true} />
                  <div>
                    <p className="font-medium">Drum plan length does not match the ordered length.</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Planned drums total{" "}
                      <span className="font-mono">{totalLengthM} m</span>; the order calls for{" "}
                      <span className="font-mono">{plannedLengthM} m</span>. This warning is advisory and does not block save.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            <section className="rounded-md border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Process Spec Fields</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Editable shop-floor working notes, shown beside the contracted spec.
                  </p>
                </div>
                {canEdit ? <Badge tone="success">Editable</Badge> : <Badge tone="neutral">Read-only</Badge>}
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="conductorDetail">Conductor detail</Label>
                  <Input
                    disabled={!canEdit}
                    id="conductorDetail"
                    onChange={(event) => patchCard({ conductorDetail: event.target.value })}
                    value={activeCard.conductorDetail}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="insulationDetail">Insulation</Label>
                  <Input
                    disabled={!canEdit}
                    id="insulationDetail"
                    onChange={(event) => patchCard({ insulationDetail: event.target.value })}
                    value={activeCard.insulationDetail}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="armourDetail">Armour</Label>
                  <Input
                    disabled={!canEdit}
                    id="armourDetail"
                    onChange={(event) => patchCard({ armourDetail: event.target.value })}
                    value={activeCard.armourDetail}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sheathDetail">Sheath</Label>
                  <Input
                    disabled={!canEdit}
                    id="sheathDetail"
                    onChange={(event) => patchCard({ sheathDetail: event.target.value })}
                    value={activeCard.sheathDetail}
                  />
                </div>
              </div>
            </section>

            <section className="rounded-md border border-border bg-card p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-semibold">Drum Plan</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    IS marking text is generated from drum id, brand, size, cores, type, voltage, and length.
                  </p>
                </div>
                {canEdit ? (
                  <Button onClick={addDrum} size="sm" type="button" variant="outline">
                    <Plus className="size-4" aria-hidden={true} />
                    Add drum
                  </Button>
                ) : null}
              </div>

              {activeCard.drumPlan.length === 0 ? (
                <div className="mt-4 rounded-md border border-border bg-muted p-6 text-center">
                  <Package className="mx-auto size-7 text-muted-foreground" aria-hidden={true} />
                  <p className="mt-3 font-medium">No drums planned yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Add rows when production splits are known.
                  </p>
                </div>
              ) : (
                <div className="portal-table-wrap mt-4">
                  <table className="portal-table border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted text-left text-xs text-muted-foreground">
                        <th className="px-2 py-2 font-medium lg:px-3">Drum no.</th>
                        <th className="px-2 py-2 font-medium lg:px-3">Type</th>
                        <th className="px-2 py-2 font-medium lg:px-3">Length</th>
                        <th className="px-2 py-2 font-medium lg:px-3">Gross wt.</th>
                        <th className="px-2 py-2 font-medium lg:px-3">Markings</th>
                        <th className="px-2 py-2 font-medium print:hidden lg:px-3">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeCard.drumPlan.map((row, index) => (
                        <tr className="border-b border-border align-top" key={`${row.drumNo}-${index}`}>
                          <td className="px-2 py-3 lg:px-3">
                            <Input
                              aria-label={`Drum number ${index + 1}`}
                              className="font-mono"
                              disabled={!canEdit}
                              onChange={(event) => patchDrum(index, { drumNo: event.target.value })}
                              value={row.drumNo}
                            />
                          </td>
                          <td className="px-2 py-3 lg:px-3">
                            <FieldSelect
                              aria-label={`Drum type ${index + 1}`}
                              disabled={!canEdit}
                              onChange={(value) => patchDrum(index, { drumType: value as DrumType })}
                              value={row.drumType}
                            >
                              {drumTypes.map((type) => (
                                <option key={type} value={type}>
                                  {type}
                                </option>
                              ))}
                            </FieldSelect>
                          </td>
                          <td className="px-2 py-3 lg:px-3">
                            <Input
                              aria-label={`Length metres ${index + 1}`}
                              disabled={!canEdit}
                              min={0}
                              onChange={(event) => {
                                const lengthM = numberValue(event.target.value);
                                patchDrum(index, {
                                  lengthM,
                                  grossWeightKg: estimatedGrossWeight(selectedSpec, lengthM),
                                });
                              }}
                              type="number"
                              value={row.lengthM}
                            />
                          </td>
                          <td className="px-2 py-3 lg:px-3">
                            <Input
                              aria-label={`Gross weight kilograms ${index + 1}`}
                              disabled={!canEdit}
                              min={0}
                              onChange={(event) =>
                                patchDrum(index, {
                                  grossWeightKg: event.target.value
                                    ? numberValue(event.target.value)
                                    : undefined,
                                })
                              }
                              type="number"
                              value={inputNumber(row.grossWeightKg)}
                            />
                          </td>
                          <td className="px-2 py-3 lg:px-3">
                            <FieldTextarea
                              aria-label={`Markings ${index + 1}`}
                              className="font-mono"
                              disabled={!canEdit}
                              onChange={(event) => patchDrum(index, { markings: event.target.value })}
                              value={row.markings}
                            />
                          </td>
                          <td className="px-2 py-3 print:hidden lg:px-3">
                            {canEdit ? (
                              <Button
                                aria-label={`Remove drum ${row.drumNo}`}
                                onClick={() => removeDrum(index)}
                                size="icon"
                                type="button"
                                variant="ghost"
                              >
                                <Trash2 className="size-4" aria-hidden={true} />
                              </Button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>Total planned length:</span>
                <span className="font-mono text-foreground">{totalLengthM} m</span>
                {plannedLengthM !== undefined ? (
                  <>
                    <span>Ordered:</span>
                    <span className="font-mono text-foreground">{plannedLengthM} m</span>
                  </>
                ) : null}
              </div>
            </section>

            <section className="rounded-md border border-border bg-card p-4">
              <div className="space-y-2">
                <Label htmlFor="operatorNotes">Operator notes</Label>
                <FieldTextarea
                  disabled={!canEdit}
                  id="operatorNotes"
                  onChange={(event) => patchCard({ operatorNotes: event.target.value })}
                  value={activeCard.operatorNotes}
                />
              </div>
            </section>
          </section>

          <aside className="space-y-6">
            <section className="print:hidden">
              <CableSpecSummary spec={selectedSpec} />
            </section>

            <section className="rounded-md border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Quality Checks</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {checksDone} passed · {checksFailed} failed · {activeCard.qualityChecks.length} total
                  </p>
                </div>
                <ClipboardCheck className="size-4 text-muted-foreground" aria-hidden={true} />
              </div>

              <div className="mt-4 space-y-3">
                {activeCard.qualityChecks.map((check, index) => (
                  <div className="rounded-md border border-border bg-muted p-3" key={`${check.id}-${index}`}>
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1 space-y-2">
                        <Label htmlFor={`check-${index}`}>Check label</Label>
                        <Input
                          disabled={!canEdit}
                          id={`check-${index}`}
                          onChange={(event) => patchCheck(index, { label: event.target.value })}
                          value={check.label}
                        />
                      </div>
                      {canEdit ? (
                        <Button
                          aria-label={`Remove quality check ${check.label}`}
                          className="mt-6"
                          onClick={() => removeCheck(index)}
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <Trash2 className="size-4" aria-hidden={true} />
                        </Button>
                      ) : null}
                    </div>
                    <div className="mt-3">
                      <Label htmlFor={`check-result-${index}`}>Result</Label>
                      <FieldSelect
                        disabled={!canEdit}
                        id={`check-result-${index}`}
                        onChange={(value) =>
                          patchCheck(index, {
                            result: value as NonNullable<QualityCheck["result"]>,
                          })
                        }
                        value={check.result ?? "Pending"}
                      >
                        {checkResults.map((result) => (
                          <option key={result} value={result}>
                            {result}
                          </option>
                        ))}
                      </FieldSelect>
                    </div>
                  </div>
                ))}
              </div>

              {canEdit ? (
                <Button className="mt-4 w-full" onClick={addCheck} type="button" variant="outline">
                  <Plus className="size-4" aria-hidden={true} />
                  Add check
                </Button>
              ) : null}
            </section>

            <section className="rounded-md border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-1 size-5 text-success" aria-hidden={true} />
                <div>
                  <h2 className="font-semibold">Print Summary</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The print action hides navigation controls and keeps the job card, drum plan, and checks in a clean floor copy.
                  </p>
                </div>
              </div>
            </section>
          </aside>
        </div>
      ) : null}
    </main>
  );
}
