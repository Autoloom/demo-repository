"use client";

import {
  type DragEndEvent,
} from "@dnd-kit/core";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertTriangle,
  ArrowRight,
  Cable,
  CalendarClock,
  Filter,
  Inbox,
  PackageSearch,
  Plus,
  RefreshCcw,
  Search,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  Button,
  Card,
  Input,
  KanbanBoard,
  KanbanCard as UiKanbanCard,
  KanbanCards,
  KanbanHeader,
  KanbanProvider,
  Label,
} from "@/components/ui";
import { daysUntil } from "@/lib/domain/clock";
import { formatDate, formatINR } from "@/lib/domain/format";
import { cn } from "@/lib/utils";

const inquiryStages = ["New", "Quoting", "Quote sent", "Won", "Lost"] as const;

// One-line context under each column name — orients anyone new to the chain.
const stageSubtitles: Record<(typeof inquiryStages)[number], string> = {
  New: "Fresh inquiries to qualify",
  Quoting: "Costing in progress",
  "Quote sent": "Awaiting customer response",
  Won: "Ready to convert to order",
  Lost: "Closed — kept for reference",
};
const inquirySources = [
  "Repeat order",
  "Tender portal",
  "Website",
  "Distributor call",
  "Referral",
] as const;

type InquiryStage = (typeof inquiryStages)[number];
type InquirySource = (typeof inquirySources)[number];
type Role = "Owner" | "Sales" | "Operations" | "Accounts";
type Action = "view" | "create" | "transition" | "update";
type Resource = "inquiry" | "quote" | "order";

interface Actor {
  id: string;
  name: string;
  role: Role;
}

interface Customer {
  id: string;
  name: string;
  segment: string;
  city: string;
}

interface CableSpec {
  id: string;
  designation: string;
  cableCode: string;
}

interface Inquiry {
  id: string;
  customerId: string;
  requirement: string;
  specId?: string;
  source: InquirySource;
  estimatedValueInr: number;
  stage: InquiryStage;
  ownerRole: Role;
  nextAction: string;
  followUpDate: string;
  convertedOrderId?: string;
  createdAt: string;
}

interface ActivityEvent {
  id: string;
  actorRole: Role;
  type: string;
  recordId: string;
  text: string;
}

type NewInquiryInput = {
  customerId: string;
  requirement: string;
  specId?: string;
  estimatedValueInr: number;
  source: InquirySource;
  followUpDate: string;
};

const actor: Actor = {
  id: "usr-sales-01",
  name: "Asha Mehta",
  role: "Sales",
};

const customers: Customer[] = [
  { id: "cus-prakash", name: "Prakash Infra Projects", segment: "EPC contractor", city: "Pune" },
  { id: "cus-surya", name: "Surya Solar EPC", segment: "Solar installer", city: "Ahmedabad" },
  { id: "cus-narmada", name: "Narmada Utilities", segment: "Government/PSU", city: "Bhopal" },
  { id: "cus-universal", name: "Universal Cable Traders", segment: "Trader/Dealer", city: "Jaipur" },
];

const cableSpecs: CableSpec[] = [
  {
    id: "spec-a2xfy-240",
    designation: "3.5C x 240 sq mm Al, XLPE, GI strip armoured, FRLS, 1.1 kV",
    cableCode: "A2XFY",
  },
  {
    id: "spec-a2xwy-185",
    designation: "3C x 185 sq mm Al, XLPE, GI round wire armoured, FR, 11 kV",
    cableCode: "A2XWY",
  },
  {
    id: "spec-cu-solar-16",
    designation: "1C x 16 sq mm Cu, XLPO solar, unarmoured, LSZH, 1.1 kV",
    cableCode: "CU-XLPO",
  },
];

let inquirySequence = 105;
let orderSequence = 7746;
let activitySequence = 42;

let inquiryRows: Inquiry[] = [
  {
    id: "INQ-2606-101",
    customerId: "cus-prakash",
    requirement: "Metro depot feeders with staggered drum delivery",
    specId: "spec-a2xfy-240",
    source: "Repeat order",
    estimatedValueInr: 4850000,
    stage: "New",
    ownerRole: "Sales",
    nextAction: "Qualify delivery split and payment terms",
    followUpDate: "2026-06-24",
    createdAt: "2026-06-19",
  },
  {
    id: "INQ-2606-102",
    customerId: "cus-surya",
    requirement: "Solar DC cable for utility park phase 2",
    specId: "spec-cu-solar-16",
    source: "Website",
    estimatedValueInr: 1260000,
    stage: "Quoting",
    ownerRole: "Sales",
    nextAction: "Lock MCX copper rate and send draft quote",
    followUpDate: "2026-06-23",
    createdAt: "2026-06-20",
  },
  {
    id: "INQ-2606-103",
    customerId: "cus-narmada",
    requirement: "11 kV screened feeder cable for pump station tender",
    specId: "spec-a2xwy-185",
    source: "Tender portal",
    estimatedValueInr: 7900000,
    stage: "Quote sent",
    ownerRole: "Sales",
    nextAction: "Follow up on technical deviation approval",
    followUpDate: "2026-06-26",
    createdAt: "2026-06-17",
  },
  {
    id: "INQ-2606-104",
    customerId: "cus-universal",
    requirement: "Dealer stock replenishment, mixed LT sizes",
    source: "Distributor call",
    estimatedValueInr: 820000,
    stage: "Lost",
    ownerRole: "Sales",
    nextAction: "Archive loss reason and schedule nurture",
    followUpDate: "2026-06-28",
    createdAt: "2026-06-15",
  },
  {
    id: "INQ-2606-099",
    customerId: "cus-prakash",
    requirement: "Urgent 4C LT armoured cable for airport lighting",
    specId: "spec-a2xfy-240",
    source: "Referral",
    estimatedValueInr: 2380000,
    stage: "Won",
    ownerRole: "Sales",
    nextAction: "Converted to order board",
    followUpDate: "2026-06-21",
    convertedOrderId: "ORD-7745",
    createdAt: "2026-06-13",
  },
];

const activityEvents: ActivityEvent[] = [];

const newInquirySchema = z.object({
  customerId: z.string().min(1, "Choose a customer"),
  requirement: z.string().min(12, "Requirement needs a little more detail"),
  specId: z.string().optional(),
  estimatedValueInr: z.number().min(1, "Estimated value is required"),
  source: z.enum(inquirySources),
  followUpDate: z.string().min(1, "Follow-up date is required"),
});

function can(role: Role, action: Action, resource: Resource) {
  if (role === "Owner") return true;
  if (role === "Sales") {
    return (
      (resource === "inquiry" && ["view", "create", "transition", "update"].includes(action)) ||
      (resource === "quote" && ["view", "create"].includes(action)) ||
      (resource === "order" && action === "view")
    );
  }
  return false;
}

function appendActivity(actorValue: Actor, type: string, recordId: string, text: string) {
  activitySequence += 1;
  activityEvents.push({
    id: `ACT-${activitySequence}`,
    actorRole: actorValue.role,
    type,
    recordId,
    text,
  });
}

function cloneInquiries(rows: Inquiry[]) {
  return rows.map((row) => ({ ...row }));
}

function getNextAction(stage: InquiryStage) {
  const nextActions: Record<InquiryStage, string> = {
    New: "Qualify customer requirement",
    Quoting: "Build quote with costing",
    "Quote sent": "Follow up on quote acceptance",
    Won: "Prepare quote-to-order handoff",
    Lost: "Archive loss reason and schedule nurture",
  };
  return nextActions[stage];
}

function delay() {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 180);
  });
}

const localInquiriesService = {
  async list() {
    await delay();
    return cloneInquiries(inquiryRows);
  },
  async create(input: NewInquiryInput, actorValue: Actor) {
    await delay();
    inquirySequence += 1;
    const inquiry: Inquiry = {
      id: `INQ-2606-${inquirySequence}`,
      customerId: input.customerId,
      requirement: input.requirement,
      specId: input.specId || undefined,
      source: input.source,
      estimatedValueInr: input.estimatedValueInr,
      stage: "New",
      ownerRole: actorValue.role,
      nextAction: "Qualify customer requirement",
      followUpDate: input.followUpDate,
      createdAt: "2026-06-23",
    };
    inquiryRows = [inquiry, ...inquiryRows];
    appendActivity(actorValue, "inquiry.created", inquiry.id, "New inquiry created");
    return { ...inquiry };
  },
  async transition(id: string, stage: InquiryStage, actorValue: Actor) {
    await delay();
    let transitioned: Inquiry | undefined;
    inquiryRows = inquiryRows.map((row) => {
      if (row.id !== id) return row;
      transitioned = {
        ...row,
        stage,
        nextAction: getNextAction(stage),
      };
      return transitioned;
    });
    if (!transitioned) throw new Error("Inquiry not found");
    appendActivity(actorValue, "inquiry.stage_changed", id, `Inquiry moved to ${stage}`);
    return { ...transitioned };
  },
  async updateTitle(id: string, title: string, actorValue: Actor) {
    await delay();
    let updated: Inquiry | undefined;
    inquiryRows = inquiryRows.map((row) => {
      if (row.id !== id) return row;
      updated = {
        ...row,
        requirement: title,
      };
      return updated;
    });
    if (!updated) throw new Error("Inquiry not found");
    appendActivity(actorValue, "inquiry.title_updated", id, "Inquiry title updated");
    return { ...updated };
  },
  async startQuote(id: string, actorValue: Actor) {
    await delay();
    let inquiry: Inquiry | undefined;
    inquiryRows = inquiryRows.map((row) => {
      if (row.id !== id) return row;
      inquiry = {
        ...row,
        stage: row.stage === "New" ? "Quoting" : row.stage,
        nextAction: "Draft quote in progress",
      };
      return inquiry;
    });
    if (!inquiry) throw new Error("Inquiry not found");
    appendActivity(actorValue, "inquiry.quote_started", id, "Quote draft started");
    return { inquiry: { ...inquiry }, quoteDraftLink: `/quote?inquiryId=${id}` };
  },
  async convertToOrder(id: string, actorValue: Actor) {
    await delay();
    orderSequence += 1;
    const convertedOrderId = `ORD-${orderSequence}`;
    let converted: Inquiry | undefined;
    inquiryRows = inquiryRows.map((row) => {
      if (row.id !== id) return row;
      converted = {
        ...row,
        stage: "Won",
        convertedOrderId,
        nextAction: "Converted to order board",
      };
      return converted;
    });
    if (!converted) throw new Error("Inquiry not found");
    appendActivity(actorValue, "inquiry.converted", id, `Converted to ${convertedOrderId}`);
    return { inquiry: { ...converted }, orderLink: "/orders" };
  },
};

export default function SalesBoardPage() {
  const [rows, setRows] = React.useState<Inquiry[]>([]);
  const [loadState, setLoadState] = React.useState<"loading" | "error" | "ready">("loading");
  const [notice, setNotice] = React.useState<string>("");
  const [showCreate, setShowCreate] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [customerFilter, setCustomerFilter] = React.useState("all");
  const [sourceFilter, setSourceFilter] = React.useState("all");
  const [ownerFilter, setOwnerFilter] = React.useState("all");

  const form = useForm<NewInquiryInput>({
    resolver: zodResolver(newInquirySchema),
    mode: "onChange",
    defaultValues: {
      customerId: customers[0]?.id ?? "",
      requirement: "",
      specId: "",
      estimatedValueInr: 0,
      source: "Repeat order",
      followUpDate: "2026-06-24",
    },
  });

  const reload = React.useCallback(async () => {
    setLoadState("loading");
    setNotice("");
    try {
      const nextRows = await localInquiriesService.list();
      setRows(nextRows);
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    async function loadInitialRows() {
      try {
        const nextRows = await localInquiriesService.list();
        if (cancelled) return;
        setRows(nextRows);
        setLoadState("ready");
      } catch {
        if (!cancelled) setLoadState("error");
      }
    }

    void loadInitialRows();

    return () => {
      cancelled = true;
    };
  }, []);

  const customerById = React.useMemo(
    () => new Map(customers.map((customer) => [customer.id, customer])),
    [],
  );
  const convertedCount = React.useMemo(
    () => rows.filter((inquiry) => Boolean(inquiry.convertedOrderId)).length,
    [rows],
  );

  const filteredRows = React.useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return rows
      .filter((inquiry) => !inquiry.convertedOrderId)
      .filter((inquiry) => {
        const customer = customerById.get(inquiry.customerId);
        const matchesSearch =
          normalizedSearch.length === 0 ||
          inquiry.requirement.toLowerCase().includes(normalizedSearch) ||
          inquiry.id.toLowerCase().includes(normalizedSearch) ||
          customer?.name.toLowerCase().includes(normalizedSearch);
        const matchesCustomer = customerFilter === "all" || inquiry.customerId === customerFilter;
        const matchesSource = sourceFilter === "all" || inquiry.source === sourceFilter;
        const matchesOwner = ownerFilter === "all" || inquiry.ownerRole === ownerFilter;
        return matchesSearch && matchesCustomer && matchesSource && matchesOwner;
      });
  }, [customerById, customerFilter, ownerFilter, rows, search, sourceFilter]);

  const groupedRows = React.useMemo(() => {
    return inquiryStages.reduce<Record<InquiryStage, Inquiry[]>>(
      (columns, stage) => ({
        ...columns,
        [stage]: filteredRows.filter((inquiry) => inquiry.stage === stage),
      }),
      {
        New: [],
        Quoting: [],
        "Quote sent": [],
        Won: [],
        Lost: [],
      },
    );
  }, [filteredRows]);

  async function refreshAfterMutation(message: string) {
    const nextRows = await localInquiriesService.list();
    setRows(nextRows);
    setNotice(message);
  }

  async function handleCreate(input: NewInquiryInput) {
    if (!can(actor.role, "create", "inquiry")) return;
    await localInquiriesService.create(input, actor);
    await refreshAfterMutation("Inquiry created and logged.");
    form.reset({
      customerId: customers[0]?.id ?? "",
      requirement: "",
      specId: "",
      estimatedValueInr: 0,
      source: "Repeat order",
      followUpDate: "2026-06-24",
    });
    setShowCreate(false);
  }

  async function handleTransition(id: string, stage: InquiryStage) {
    if (!can(actor.role, "transition", "inquiry")) return;
    const previousRows = rows;
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.id === id
          ? {
              ...row,
              stage,
              nextAction: getNextAction(stage),
            }
          : row,
      ),
    );

    try {
      await localInquiriesService.transition(id, stage, actor);
      await refreshAfterMutation(`Inquiry moved to ${stage}.`);
    } catch {
      setRows(previousRows);
      setLoadState("error");
    }
  }

  async function handleUpdateTitle(id: string, title: string) {
    if (!can(actor.role, "update", "inquiry")) return;
    const nextTitle = title.trim();
    if (!nextTitle) return;

    const previousRows = rows;
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.id === id
          ? {
              ...row,
              requirement: nextTitle,
            }
          : row,
      ),
    );

    try {
      await localInquiriesService.updateTitle(id, nextTitle, actor);
      await refreshAfterMutation("Inquiry title updated.");
    } catch {
      setRows(previousRows);
      setLoadState("error");
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const nextStage = event.over?.id;
    const inquiryId = event.active.id;
    if (
      typeof inquiryId === "string" &&
      inquiryStages.includes(nextStage as InquiryStage) &&
      event.active.data.current?.parent !== nextStage
    ) {
      void handleTransition(inquiryId, nextStage as InquiryStage);
    }
  }

  if (!can(actor.role, "view", "inquiry")) {
    return (
      <main className="min-h-screen bg-background p-6 text-foreground">
        <EmptyState
          icon={<AlertTriangle className="size-5" aria-hidden="true" />}
          title="Sales Board is unavailable"
          description="This workspace is restricted to Owner and Sales roles."
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-6 p-6">
        <PipelineStrip current="Inquiry" />

        <section className="flex flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <StageBadge stage="New" label="Inquiry" />
              <span>Sales entry point</span>
            </div>
            <div>
              <h1 className="text-3xl font-semibold">Sales Board</h1>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Track inquiries from first contact through quote handoff, with converted deals leaving
                this board for Orders.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <ConvertedBadge count={convertedCount} canViewOrders={can(actor.role, "view", "order")} />
            <Button
              type="button"
              onClick={() => setShowCreate((current) => !current)}
              disabled={!can(actor.role, "create", "inquiry")}
            >
              <Plus className="mr-2 size-4" aria-hidden="true" />
              New inquiry
            </Button>
          </div>
        </section>

        {showCreate ? (
          <CreateInquiryForm
            form={form}
            onSubmit={(event) => {
              void form.handleSubmit(handleCreate)(event);
            }}
            onCancel={() => {
              form.reset();
              setShowCreate(false);
            }}
          />
        ) : null}

        <Toolbar
          search={search}
          customerFilter={customerFilter}
          sourceFilter={sourceFilter}
          ownerFilter={ownerFilter}
          onSearchChange={setSearch}
          onCustomerFilterChange={setCustomerFilter}
          onSourceFilterChange={setSourceFilter}
          onOwnerFilterChange={setOwnerFilter}
        />

        {notice ? (
          <div
            className="flex items-center gap-2 rounded-md border border-success bg-card px-4 py-3 text-sm text-success"
            role="status"
            aria-live="polite"
          >
            <Inbox className="size-4" aria-hidden="true" />
            {notice}
          </div>
        ) : null}

        {loadState === "loading" ? <LoadingBoard /> : null}
        {loadState === "error" ? <ErrorState onRetry={() => void reload()} /> : null}
        {loadState === "ready" && filteredRows.length === 0 ? (
          <EmptyState
            icon={<Inbox className="size-5" aria-hidden="true" />}
            title="No inquiries match this board"
            description="Clear filters or add a new inquiry to start the sales chain."
            action={
              <Button type="button" onClick={() => setShowCreate(true)}>
                <Plus className="mr-2 size-4" aria-hidden="true" />
                New inquiry
              </Button>
            }
          />
        ) : null}
        {loadState === "ready" && filteredRows.length > 0 ? (
          <KanbanProvider
            onDragEnd={handleDragEnd}
            renderOverlay={(activeId) => {
              const inquiry = filteredRows.find((row) => row.id === activeId);
              if (!inquiry) return null;

              return (
                <Card className="w-80 rounded-md border-border bg-card p-3 shadow-lg outline outline-2 outline-ring">
                  <InquiryCardContent
                    customer={customerById.get(inquiry.customerId)}
                    inquiry={inquiry}
                  />
                </Card>
              );
            }}
          >
            {inquiryStages.map((stage) => (
              <KanbanColumn
                key={stage}
                stage={stage}
                inquiries={groupedRows[stage]}
                customerById={customerById}
                canTransition={can(actor.role, "transition", "inquiry")}
                canEditTitle={can(actor.role, "update", "inquiry")}
                onUpdateTitle={handleUpdateTitle}
              />
            ))}
          </KanbanProvider>
        ) : null}
      </div>
    </main>
  );
}

function PipelineStrip({ current }: { current: "Inquiry" | "Quote" | "Order" | "Dispatch" | "Invoice" }) {
  const stages = ["Inquiry", "Quote", "Order", "Dispatch", "Invoice"] as const;
  return (
    <nav className="rounded-lg border border-border bg-card p-3" aria-label="Cable OS pipeline">
      <ol className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-5">
        {stages.map((stage) => (
          <li
            key={stage}
            className={cn(
              "flex items-center justify-between rounded-md border border-border bg-background px-3 py-2",
              stage === current && "border-primary text-primary",
            )}
          >
            <span className="font-medium">{stage}</span>
            <ArrowRight className="size-3 text-muted-foreground" aria-hidden="true" />
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Toolbar({
  search,
  customerFilter,
  sourceFilter,
  ownerFilter,
  onSearchChange,
  onCustomerFilterChange,
  onSourceFilterChange,
  onOwnerFilterChange,
}: {
  search: string;
  customerFilter: string;
  sourceFilter: string;
  ownerFilter: string;
  onSearchChange: (value: string) => void;
  onCustomerFilterChange: (value: string) => void;
  onSourceFilterChange: (value: string) => void;
  onOwnerFilterChange: (value: string) => void;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="sales-search">Search</Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="sales-search"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              className="pl-8"
              placeholder="Customer, inquiry, requirement"
            />
          </div>
        </div>
        <SelectControl
          id="customer-filter"
          label="Customer"
          icon={<Filter className="size-4" aria-hidden="true" />}
          value={customerFilter}
          onChange={onCustomerFilterChange}
          options={[
            { value: "all", label: "All customers" },
            ...customers.map((customer) => ({ value: customer.id, label: customer.name })),
          ]}
        />
        <SelectControl
          id="source-filter"
          label="Source"
          value={sourceFilter}
          onChange={onSourceFilterChange}
          options={[
            { value: "all", label: "All sources" },
            ...inquirySources.map((source) => ({ value: source, label: source })),
          ]}
        />
        <SelectControl
          id="owner-filter"
          label="Owner"
          value={ownerFilter}
          onChange={onOwnerFilterChange}
          options={[
            { value: "all", label: "All owners" },
            { value: "Sales", label: "Sales" },
            { value: "Owner", label: "Owner" },
          ]}
        />
      </div>
    </section>
  );
}

function CreateInquiryForm({
  form,
  onSubmit,
  onCancel,
}: {
  form: ReturnType<typeof useForm<NewInquiryInput>>;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  onCancel: () => void;
}) {
  const errors = form.formState.errors;
  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h2 className="text-lg font-semibold">New inquiry</h2>
            <p className="text-sm text-muted-foreground">
              Capture the customer requirement and first follow-up.
            </p>
          </div>
          <StageBadge stage="New" />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <FormSelect
            id="new-customer"
            label="Customer"
            registration={form.register("customerId")}
            error={errors.customerId?.message}
            options={customers.map((customer) => ({ value: customer.id, label: customer.name }))}
          />
          <FormSelect
            id="new-source"
            label="Source"
            registration={form.register("source")}
            error={errors.source?.message}
            options={inquirySources.map((source) => ({ value: source, label: source }))}
          />
          <FormSelect
            id="new-spec"
            label="Quick spec"
            registration={form.register("specId")}
            error={errors.specId?.message}
            options={[
              { value: "", label: "No spec yet" },
              ...cableSpecs.map((spec) => ({ value: spec.id, label: spec.cableCode })),
            ]}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-2 lg:col-span-2">
            <Label htmlFor="new-requirement">Requirement</Label>
            <textarea
              id="new-requirement"
              className="min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Cable construction, length, delivery, commercial context"
              {...form.register("requirement")}
            />
            <FieldError message={errors.requirement?.message} />
          </div>
          <div className="grid grid-cols-1 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-value">Estimated value</Label>
              <Input
                id="new-value"
                type="number"
                inputMode="numeric"
                {...form.register("estimatedValueInr", { valueAsNumber: true })}
              />
              <FieldError message={errors.estimatedValueInr?.message} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-follow-up">Follow-up date</Label>
              <Input id="new-follow-up" type="date" {...form.register("followUpDate")} />
              <FieldError message={errors.followUpDate?.message} />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={!form.formState.isValid || form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Adding..." : "Add inquiry"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function KanbanColumn({
  stage,
  inquiries,
  customerById,
  canTransition,
  canEditTitle,
  onUpdateTitle,
}: {
  stage: InquiryStage;
  inquiries: Inquiry[];
  customerById: Map<string, Customer>;
  canTransition: boolean;
  canEditTitle: boolean;
  onUpdateTitle: (id: string, title: string) => void;
}) {
  return (
    <KanbanBoard id={stage}>
      <KanbanHeader
        name={stage}
        count={inquiries.length}
        subtitle={stageSubtitles[stage]}
        indicatorClassName={stageIndicatorClass(stage)}
      />
      <KanbanCards className="max-h-dvh pr-1">
        {inquiries.length === 0 ? (
          <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-md border border-dashed p-4 text-center">
            <PackageSearch className="size-5 text-muted-foreground/60" aria-hidden="true" />
            <p className="m-0 text-xs text-muted-foreground">No inquiries in {stage.toLowerCase()}</p>
          </div>
        ) : (
          inquiries.map((inquiry, index) => (
            <InquiryKanbanCard
              key={inquiry.id}
              index={index}
              stage={stage}
              inquiry={inquiry}
              customer={customerById.get(inquiry.customerId)}
              canTransition={canTransition}
              canEditTitle={canEditTitle}
              onUpdateTitle={onUpdateTitle}
            />
          ))
        )}
      </KanbanCards>
    </KanbanBoard>
  );
}

function InquiryKanbanCard({
  index,
  stage,
  inquiry,
  customer,
  canTransition,
  canEditTitle,
  onUpdateTitle,
}: {
  index: number;
  stage: InquiryStage;
  inquiry: Inquiry;
  customer?: Customer;
  canTransition: boolean;
  canEditTitle: boolean;
  onUpdateTitle: (id: string, title: string) => void;
}) {
  return (
    <UiKanbanCard
      id={inquiry.id}
      name={customer?.name ?? inquiry.requirement}
      parent={stage}
      className={cn("cursor-grab border-border bg-card p-3", !canTransition && "cursor-default")}
      index={index}
      disabled={!canTransition}
    >
      <InquiryCardContent
        customer={customer}
        inquiry={inquiry}
        editable={canEditTitle}
        onUpdateTitle={onUpdateTitle}
      />
    </UiKanbanCard>
  );
}

function InquiryCardContent({
  inquiry,
  customer,
  editable = false,
  onUpdateTitle,
}: {
  inquiry: Inquiry;
  customer?: Customer;
  editable?: boolean;
  onUpdateTitle?: (id: string, title: string) => void;
}) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [draftTitle, setDraftTitle] = React.useState(inquiry.requirement);

  function stopDrag(event: React.SyntheticEvent) {
    event.stopPropagation();
  }

  function cancelEdit() {
    setDraftTitle(inquiry.requirement);
    setIsEditing(false);
  }

  function commitEdit() {
    const nextTitle = draftTitle.trim();
    if (!nextTitle) {
      cancelEdit();
      return;
    }

    setIsEditing(false);
    if (nextTitle !== inquiry.requirement) {
      onUpdateTitle?.(inquiry.id, nextTitle);
    }
  }

  const spec = inquiry.specId ? cableSpecs.find((item) => item.id === inquiry.specId) : undefined;
  const risk = followUpRisk(inquiry.followUpDate, inquiry.stage);
  const closed = inquiry.stage === "Won" || inquiry.stage === "Lost";

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold">{customer?.name ?? "Unknown customer"}</p>
        <span className="shrink-0 rounded-sm border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {inquiry.source}
        </span>
      </div>

      {isEditing ? (
        <input
          aria-label={`Edit title for ${inquiry.id}`}
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
          aria-label={`Edit title for ${inquiry.id}`}
          className={cn(
            "line-clamp-1 w-full rounded-sm text-left text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            editable && "cursor-text hover:text-foreground",
          )}
          disabled={!editable}
          onClick={(event) => {
            stopDrag(event);
            if (editable) {
              setDraftTitle(inquiry.requirement);
              setIsEditing(true);
            }
          }}
          onPointerDown={stopDrag}
          type="button"
        >
          {inquiry.requirement}
        </button>
      )}

      {/* Cable spec — same treatment as the order board so the chain reads consistently. */}
      {spec ? (
        <div className="flex items-start gap-1.5 rounded-md border bg-muted/40 px-2 py-1.5">
          <Cable className="mt-0.5 size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="m-0 line-clamp-2 font-mono text-[11px] leading-snug text-foreground/90">
            {spec.designation}
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md border bg-background p-2">
          <p className="text-muted-foreground">Est. value</p>
          <p className="mt-1 truncate font-mono font-semibold">{formatINR(inquiry.estimatedValueInr)}</p>
        </div>
        <div className={cn("rounded-md border p-2", followUpToneClass[risk])}>
          <p className={cn(risk === "ok" ? "text-muted-foreground" : "opacity-80")}>Follow-up</p>
          <p className="mt-1 flex items-center gap-1 truncate font-medium">
            {risk !== "ok" ? <AlertTriangle className="size-3 shrink-0" aria-hidden="true" /> : null}
            {followUpLabel(inquiry.followUpDate, inquiry.stage)}
          </p>
        </div>
      </div>

      {!closed && inquiry.nextAction ? (
        <p className="m-0 flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
          <CalendarClock className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
          <span className="line-clamp-2">Next: {inquiry.nextAction}</span>
        </p>
      ) : null}
    </div>
  );
}

function stageIndicatorClass(stage: InquiryStage) {
  const tones: Record<InquiryStage, string> = {
    New: "bg-stage-inquiry",
    Quoting: "bg-stage-quote",
    "Quote sent": "bg-stage-quote",
    Won: "bg-success",
    Lost: "bg-danger",
  };

  return tones[stage];
}

// Follow-up risk — the signal a sales user actually chases the board by.
type FollowUpRisk = "overdue" | "due-soon" | "ok";

function followUpRisk(iso: string, stage: InquiryStage): FollowUpRisk {
  if (stage === "Won" || stage === "Lost") return "ok";
  const remaining = daysUntil(iso);
  if (remaining < 0) return "overdue";
  if (remaining <= 1) return "due-soon";
  return "ok";
}

function followUpLabel(iso: string, stage: InquiryStage): string {
  if (stage === "Won" || stage === "Lost") return formatDate(iso);
  const remaining = daysUntil(iso);
  if (remaining < 0) return `${Math.abs(remaining)}d overdue`;
  if (remaining === 0) return "Due today";
  if (remaining === 1) return "Due in 1d";
  return formatDate(iso);
}

const followUpToneClass: Record<FollowUpRisk, string> = {
  overdue: "border-danger/30 bg-danger-muted text-danger",
  "due-soon": "border-warning/30 bg-warning-muted text-warning",
  ok: "border-border bg-background text-foreground",
};

function StageBadge({ stage, label }: { stage: InquiryStage | "New"; label?: string }) {
  const tone: Record<InquiryStage, string> = {
    New: "border-stage-inquiry text-stage-inquiry",
    Quoting: "border-stage-quote text-stage-quote",
    "Quote sent": "border-stage-quote text-stage-quote",
    Won: "border-success text-success",
    Lost: "border-danger text-danger",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border bg-card px-2 py-1 text-xs font-medium",
        tone[stage],
      )}
    >
      {label ?? stage}
    </span>
  );
}

function ConvertedBadge({ count, canViewOrders }: { count: number; canViewOrders: boolean }) {
  const content = (
    <span className="inline-flex items-center gap-2 rounded-sm border border-highlight bg-card px-3 py-2 text-sm font-medium text-highlight">
      <ArrowRight className="size-4" aria-hidden="true" />
      <span className="font-mono">{count}</span> converted to orders
    </span>
  );

  if (count === 0) {
    return (
      <span className="inline-flex items-center gap-2 rounded-sm border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
        <span className="font-mono">0</span> converted to orders
      </span>
    );
  }

  return canViewOrders ? <Link href="/orders">{content}</Link> : content;
}

function LoadingBoard() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5" aria-label="Loading sales board">
      {inquiryStages.map((stage) => (
        <section key={stage} className="flex min-h-80 flex-col gap-3 rounded-lg border border-border bg-muted p-3">
          <div className="h-8 rounded-md bg-card" />
          <div className="h-32 rounded-lg border border-border bg-card" />
          <div className="h-40 rounded-lg border border-border bg-card" />
          <div className="h-24 rounded-lg border border-border bg-card" />
        </section>
      ))}
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="rounded-lg border border-danger bg-card p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-1 size-5 text-danger" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-semibold">Could not load inquiries</h2>
            <p className="text-sm text-muted-foreground">
              Retry the service call. The board keeps mutations behind the inquiry service boundary.
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" onClick={onRetry}>
          <RefreshCcw className="mr-2 size-4" aria-hidden="true" />
          Retry
        </Button>
      </div>
    </section>
  );
}

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-8 text-center shadow-sm">
      <div className="mx-auto flex size-12 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
        {icon}
      </div>
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </section>
  );
}

function SelectControl({
  id,
  label,
  value,
  onChange,
  options,
  icon,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        {icon ? <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</span> : null}
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            icon && "pl-8",
          )}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function FormSelect({
  id,
  label,
  registration,
  error,
  options,
}: {
  id: string;
  label: string;
  registration: ReturnType<ReturnType<typeof useForm<NewInquiryInput>>["register"]>;
  error?: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        {...registration}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldError message={error} />
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-sm text-danger">{message}</p> : null;
}
