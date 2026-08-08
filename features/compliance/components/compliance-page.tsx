/*  Main compliance UI for records, statuses, risks,
    forms, validation, approvals, and compliance actions. */

"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertTriangle,
  BadgeIndianRupee,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  History,
  Loader2,
  LockKeyhole,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { AlertBadge, Button, Input, Label } from "@/components/ui";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { daysUntil } from "@/lib/domain/clock";
import { formatDate, formatINR } from "@/lib/domain/format";
import { cn } from "@/lib/utils";

import {
  type ActivityEvent,
  type Actor,
  type ApprovalRequest,
  type ComplianceInput,
  type ComplianceItem,
  type ComplianceStatus,
  type ComplianceType,
  type Customer,
  type Inquiry,
  type RiskLevel,
  type Role,
  activityService,
  approvalsService,
  complianceService,
  rbac,
  referenceService,
} from "@/features/compliance/compliance-fallback";

const complianceTypes = [
  "EMD",
  "Bank guarantee",
  "Tender document",
  "Security deposit",
] as const satisfies readonly ComplianceType[];

const statuses = [
  "Needs approval",
  "Draft requested",
  "Submitted",
  "Complete",
  "Expired",
] as const satisfies readonly ComplianceStatus[];

const formSchema = z.object({
  type: z.enum(complianceTypes),
  customerId: z.string().min(1, "Choose a customer."),
  inquiryId: z.string().optional(),
  amountInr: z.number().min(0, "Amount cannot be negative."),
  dueDate: z.string().min(1, "Set a due date."),
  status: z.enum(statuses),
  instrumentRef: z.string().optional(),
});

type ComplianceFormValues = z.infer<typeof formSchema>;

type DataState = {
  items: ComplianceItem[];
  customers: Customer[];
  inquiries: Inquiry[];
  approvals: ApprovalRequest[];
  activity: ActivityEvent[];
};

type Notice = {
  variant: "success" | "error" | "info" | "warning";
  label: string;
};

const defaultFormValues: ComplianceFormValues = {
  type: "EMD",
  customerId: "",
  inquiryId: "",
  amountInr: 0,
  dueDate: "2026-06-30",
  status: "Needs approval",
  instrumentRef: "",
};

function moneyCell(amountInr: number) {
  return <span className="font-mono tabular-nums">{formatINR(amountInr)}</span>;
}

function dateCell(iso: string) {
  const remaining = daysUntil(iso);
  const label =
    remaining < 0
      ? `${Math.abs(remaining)}d overdue`
      : remaining === 0
        ? "Due today"
        : `${remaining}d left`;

  return (
    <span className="flex flex-col gap-1">
      <span className="font-mono">{formatDate(iso)}</span>
      <span
        className={cn(
          "text-xs",
          remaining <= 3 ? "text-danger" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
    </span>
  );
}

function toneForRisk(risk: RiskLevel) {
  if (risk === "High") return "bg-danger/10 text-danger border-danger/30";
  if (risk === "Medium") return "bg-warning/10 text-warning border-warning/30";
  return "bg-success/10 text-success border-success/30";
}

function toneForStatus(status: ComplianceStatus) {
  if (status === "Complete") return "bg-success/10 text-success border-success/30";
  if (status === "Submitted") return "bg-info/10 text-info border-info/30";
  if (status === "Expired") return "bg-danger/10 text-danger border-danger/30";
  if (status === "Needs approval") return "bg-danger/10 text-danger border-danger/30";
  return "bg-warning/10 text-warning border-warning/30";
}

function toneForType(type: ComplianceType) {
  if (type === "EMD" || type === "Bank guarantee") {
    return "bg-highlight/10 text-highlight border-highlight/30";
  }

  return "bg-muted text-muted-foreground border-border";
}

function Badge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-2 py-1 text-xs font-medium",
        className,
      )}
    >
      {children}
    </span>
  );
}

function RiskBadge({ risk }: { risk: RiskLevel }) {
  return <Badge className={toneForRisk(risk)}>{risk} risk</Badge>;
}

function StatusBadge({ status }: { status: ComplianceStatus }) {
  return <Badge className={toneForStatus(status)}>{status}</Badge>;
}

function TypeBadge({ type }: { type: ComplianceType }) {
  return <Badge className={toneForType(type)}>{type}</Badge>;
}

function customerName(customers: Customer[], customerId: string) {
  return customers.find((customer) => customer.id === customerId)?.name ?? customerId;
}

function inquiryLabel(inquiries: Inquiry[], inquiryId?: string) {
  if (!inquiryId) return "Unlinked";
  const inquiry = inquiries.find((candidate) => candidate.id === inquiryId);
  if (!inquiry) return inquiryId;
  return `${inquiry.id} · ${inquiry.tenderRef ?? inquiry.requirement}`;
}

function pendingApprovalFor(approvals: ApprovalRequest[], recordId: string) {
  return approvals.find(
    (approval) => approval.recordId === recordId && approval.status === "Pending",
  );
}

function SummaryMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ClipboardList;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className="size-4 text-muted-foreground" aria-hidden={true} />
      </div>
      <p className="mt-3 font-mono text-2xl font-semibold">{value}</p>
    </div>
  );
}

function DataSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section className="space-y-4 lg:col-span-2">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              className="h-24 animate-pulse rounded-md border border-border bg-muted"
              key={index}
            />
          ))}
        </div>
        <div className="rounded-md border border-border bg-card">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              className="h-16 animate-pulse border-b border-border bg-muted"
              key={index}
            />
          ))}
        </div>
      </section>
      <aside className="space-y-4">
        <div className="h-48 animate-pulse rounded-md border border-border bg-muted" />
        <div className="h-80 animate-pulse rounded-md border border-border bg-muted" />
      </aside>
    </div>
  );
}

function EmptyState({
  canCreate,
}: {
  canCreate: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-8 text-center">
      <ClipboardList className="mx-auto size-8 text-muted-foreground" aria-hidden={true} />
      <h2 className="mt-4 text-lg font-semibold">No compliance items yet</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
        Add an EMD, bank guarantee, tender document, or security deposit to start tracking
        deadlines and approval gates.
      </p>
      {canCreate && (
        <a
          className="mt-4 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
          href="#add-compliance-item"
        >
          Go to add item form
        </a>
      )}
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-md border border-danger/30 bg-card p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="size-5 text-danger" aria-hidden={true} />
        <div className="space-y-3">
          <div>
            <h2 className="font-semibold">Compliance data could not load</h2>
            <p className="text-sm text-muted-foreground">{message}</p>
          </div>
          <Button onClick={onRetry} size="sm" type="button" variant="outline">
            <RefreshCw className="mr-2 size-4" aria-hidden={true} />
            Retry
          </Button>
        </div>
      </div>
    </div>
  );
}

function RoleControl({
  role,
  onChange,
}: {
  role: Role;
  onChange: (role: Role) => void;
}) {
  const roles: Role[] = ["Owner", "Sales", "Accounts"];

  return (
    <div className="rounded-md border border-border bg-card p-1" aria-label="Demo role">
      <div className="flex gap-1">
        {roles.map((candidate) => (
          <Button
            aria-pressed={role === candidate}
            key={candidate}
            onClick={() => onChange(candidate)}
            size="sm"
            type="button"
            variant={role === candidate ? "default" : "ghost"}
          >
            {candidate}
          </Button>
        ))}
      </div>
    </div>
  );
}

function AddItemForm({
  actor,
  customers,
  inquiries,
  onSubmit,
  pending,
}: {
  actor: Actor;
  customers: Customer[];
  inquiries: Inquiry[];
  onSubmit: (values: ComplianceInput) => Promise<void>;
  pending: boolean;
}) {
  const canCreate = rbac.can(actor.role, "create", "compliance");
  const {
    formState: { errors, isValid },
    handleSubmit,
    register,
    reset,
  } = useForm<ComplianceFormValues>({
    defaultValues: defaultFormValues,
    mode: "onChange",
    resolver: zodResolver(formSchema),
  });

  async function submit(values: ComplianceFormValues) {
    await onSubmit(values);
    reset(defaultFormValues);
  }

  if (!canCreate) {
    return (
      <section className="rounded-md border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <LockKeyhole className="size-5 text-muted-foreground" aria-hidden={true} />
          <div>
            <h2 className="font-semibold">Add item</h2>
            <p className="text-sm text-muted-foreground">
              {actor.role} can view compliance deadlines, but only Sales and Owner can create
              or edit tracker records.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-md border border-border bg-card p-4" id="add-compliance-item">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Add item</h2>
          <p className="text-sm text-muted-foreground">
            Create EMD, BG, tender document, and deposit controls from one inline form.
          </p>
        </div>
        <Plus className="size-5 text-muted-foreground" aria-hidden={true} />
      </div>
      <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit(submit)}>
        <div className="space-y-2">
          <Label htmlFor="type">Type</Label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            id="type"
            {...register("type")}
          >
            {complianceTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="customerId">Customer</Label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            id="customerId"
            {...register("customerId")}
          >
            <option value="">Choose customer</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
          {errors.customerId && (
            <p className="text-xs text-danger">{errors.customerId.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="inquiryId">Linked inquiry</Label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            id="inquiryId"
            {...register("inquiryId")}
          >
            <option value="">No linked inquiry</option>
            {inquiries.map((inquiry) => (
              <option key={inquiry.id} value={inquiry.id}>
                {inquiry.id} · {inquiry.tenderRef ?? inquiry.requirement}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="amountInr">Amount</Label>
          <Input
            id="amountInr"
            min={0}
            placeholder="0"
            type="number"
            {...register("amountInr", { valueAsNumber: true })}
          />
          {errors.amountInr && (
            <p className="text-xs text-danger">{errors.amountInr.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="dueDate">Due date</Label>
          <Input id="dueDate" type="date" {...register("dueDate")} />
          {errors.dueDate && <p className="text-xs text-danger">{errors.dueDate.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            id="status"
            {...register("status")}
          >
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="instrumentRef">Instrument reference</Label>
          <Input
            id="instrumentRef"
            placeholder="BG no., DD no., UTR, portal ref"
            {...register("instrumentRef")}
          />
        </div>

        <div className="flex items-center justify-end gap-2 md:col-span-2">
          <Button
            disabled={pending}
            onClick={() => reset(defaultFormValues)}
            type="button"
            variant="ghost"
          >
            Cancel
          </Button>
          <Button disabled={!isValid || pending} type="submit">
            {pending && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden={true} />}
            Add item
          </Button>
        </div>
      </form>
    </section>
  );
}

function StatusControl({
  actor,
  item,
  onRequestApproval,
  pending,
}: {
  actor: Actor;
  item: ComplianceItem;
  onRequestApproval: (item: ComplianceItem) => Promise<void>;
  pending: boolean;
}) {
  const canTransition = rbac.can(actor.role, "transition", "compliance");
  const gated = rbac.requiresApproval(actor.role, item);

  if (!canTransition) return null;

  if (gated) {
    return (
      <Button
        disabled={pending}
        onClick={() => onRequestApproval(item)}
        size="sm"
        type="button"
        variant="outline"
      >
        <LockKeyhole className="mr-2 size-4" aria-hidden={true} />
        Request approval
      </Button>
    );
  }

  return (
    <label className="sr-only" htmlFor={`${item.id}-status`}>
      Move status for {item.id}
    </label>
  );
}

function StatusDropdown({
  actor,
  item,
  onTransition,
  pending,
}: {
  actor: Actor;
  item: ComplianceItem;
  onTransition: (item: ComplianceItem, status: ComplianceStatus) => Promise<void>;
  pending: boolean;
}) {
  const canTransition = rbac.can(actor.role, "transition", "compliance");
  const gated = rbac.requiresApproval(actor.role, item);

  if (!canTransition || gated) return null;

  return (
    <select
      aria-label={`Move status for ${item.id}`}
      className="h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      disabled={pending}
      id={`${item.id}-status`}
      onChange={(event) =>
        onTransition(item, event.currentTarget.value as ComplianceStatus)
      }
      value={item.status}
    >
      {statuses.map((status) => (
        <option key={status} value={status}>
          {status}
        </option>
      ))}
    </select>
  );
}

function ComplianceTable({
  actor,
  approvals,
  customers,
  inquiries,
  items,
  onApprove,
  onOpen,
  onRequestApproval,
  onTransition,
  pending,
}: {
  actor: Actor;
  approvals: ApprovalRequest[];
  customers: Customer[];
  inquiries: Inquiry[];
  items: ComplianceItem[];
  onApprove: (item: ComplianceItem) => Promise<void>;
  onOpen: (item: ComplianceItem) => void;
  onRequestApproval: (item: ComplianceItem) => Promise<void>;
  onTransition: (item: ComplianceItem, status: ComplianceStatus) => Promise<void>;
  pending: boolean;
}) {
  return (
    <div className="portal-table-wrap rounded-md border border-border bg-card">
      <table className="portal-table text-left text-sm">
        <thead className="bg-muted text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-2 py-3 font-medium lg:px-4">ID</th>
            <th className="px-2 py-3 font-medium lg:px-4">Customer</th>
            <th className="px-2 py-3 font-medium lg:px-4">Key facts</th>
            <th className="px-2 py-3 font-medium lg:px-4">Status / risk</th>
            <th className="px-2 py-3 font-medium lg:px-4">Amount</th>
            <th className="px-2 py-3 font-medium lg:px-4">Due</th>
            <th className="px-2 py-3 font-medium lg:px-4">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((item) => {
            const due = daysUntil(item.dueDate);
            const overdue = item.status === "Expired" || due < 0;
            const pendingApproval = pendingApprovalFor(approvals, item.id);
            const canApprove =
              rbac.can(actor.role, "approve", "compliance") &&
              (item.type === "EMD" || item.type === "Bank guarantee") &&
              item.status === "Needs approval";

            return (
              <tr
                className={cn(
                  "align-top transition-colors hover:bg-muted",
                  overdue && "bg-danger/10",
                )}
                key={item.id}
              >
                <td className="px-2 py-3 font-mono text-xs font-medium lg:px-4">{item.id}</td>
                <td className="px-2 py-3 lg:px-4">
                  <Button
                    className="h-auto justify-start p-0 text-left font-medium text-foreground"
                    onClick={() => onOpen(item)}
                    type="button"
                    variant="link"
                  >
                    {customerName(customers, item.customerId)}
                  </Button>
                  <p className="mt-1 text-xs text-muted-foreground">{item.customerId}</p>
                </td>
                <td className="space-y-2 px-2 py-3 lg:px-4">
                  <TypeBadge type={item.type} />
                  <p className="font-mono text-xs text-muted-foreground">
                    {inquiryLabel(inquiries, item.inquiryId)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.instrumentRef ?? "Instrument not captured"}
                  </p>
                </td>
                <td className="space-y-2 px-2 py-3 lg:px-4">
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge status={item.status} />
                    <RiskBadge risk={item.risk} />
                  </div>
                  {pendingApproval && (
                    <p className="text-xs text-muted-foreground">
                      Approval {pendingApproval.id} pending
                    </p>
                  )}
                </td>
                <td className="px-2 py-3 lg:px-4">{moneyCell(item.amountInr)}</td>
                <td className="px-2 py-3 lg:px-4">{dateCell(item.dueDate)}</td>
                <td className="space-y-2 px-2 py-3 lg:px-4">
                  <div className="flex flex-wrap gap-2">
                    <StatusDropdown
                      actor={actor}
                      item={item}
                      onTransition={onTransition}
                      pending={pending}
                    />
                    <StatusControl
                      actor={actor}
                      item={item}
                      onRequestApproval={onRequestApproval}
                      pending={pending}
                    />
                    {canApprove && (
                      <Button
                        disabled={pending}
                        onClick={() => onApprove(item)}
                        size="sm"
                        type="button"
                      >
                        <ShieldCheck className="mr-2 size-4" aria-hidden={true} />
                        Approve
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SuggestedControls({
  dueSoon,
  pendingApprovals,
}: {
  dueSoon: number;
  pendingApprovals: number;
}) {
  return (
    <section className="rounded-md border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <ShieldCheck className="size-5 text-primary" aria-hidden={true} />
        <div>
          <h2 className="font-semibold">Suggested controls</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Prioritize Owner release for EMD/BG items before bank cutoff, then complete
            draft references and portal submission evidence.
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-3">
        <AlertBadge
          icon={LockKeyhole}
          label={`${pendingApprovals} pending Owner approvals`}
          variant={pendingApprovals > 0 ? "warning" : "success"}
        />
        <AlertBadge
          icon={CalendarClock}
          label={`${dueSoon} controls due within 3 days`}
          variant={dueSoon > 0 ? "error" : "success"}
        />
        <AlertBadge icon={FileCheck2} label="Attach instrument refs before Complete" variant="info" />
      </div>
    </section>
  );
}

function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  return (
    <section className="rounded-md border border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Activity feed</h2>
          <p className="text-sm text-muted-foreground">Compliance actions and approvals.</p>
        </div>
        <History className="size-5 text-muted-foreground" aria-hidden={true} />
      </div>
      <ol className="space-y-4">
        {events.map((event) => (
          <li className="border-l border-border pl-4" key={event.id}>
            <p className="text-sm">{event.text}</p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {event.id} · {event.actorRole} · {formatDate(event.at.slice(0, 10))}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function DetailSheet({
  approvals,
  customers,
  inquiries,
  item,
  onClose,
}: {
  approvals: ApprovalRequest[];
  customers: Customer[];
  inquiries: Inquiry[];
  item: ComplianceItem | null;
  onClose: () => void;
}) {
  const approval = item ? pendingApprovalFor(approvals, item.id) : undefined;

  return (
    <Sheet onOpenChange={(open) => !open && onClose()} open={Boolean(item)}>
      <SheetContent className="sm:max-w-lg">
        {item && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2">
                <SheetTitle className="font-mono">{item.id}</SheetTitle>
                <StatusBadge status={item.status} />
              </div>
              <SheetDescription>
                {item.type} for {customerName(customers, item.customerId)}
              </SheetDescription>
            </SheetHeader>
            <div className="grid gap-4 px-4">
              <div className="rounded-md border border-border bg-muted p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">Linked inquiry</p>
                <p className="mt-2 font-mono text-sm">{inquiryLabel(inquiries, item.inquiryId)}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-border p-4">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Amount</p>
                  <p className="mt-2">{moneyCell(item.amountInr)}</p>
                </div>
                <div className="rounded-md border border-border p-4">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Due</p>
                  <p className="mt-2">{dateCell(item.dueDate)}</p>
                </div>
                <div className="rounded-md border border-border p-4">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Risk</p>
                  <div className="mt-2">
                    <RiskBadge risk={item.risk} />
                  </div>
                </div>
                <div className="rounded-md border border-border p-4">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Created</p>
                  <p className="mt-2 font-mono text-sm">{formatDate(item.createdAt.slice(0, 10))}</p>
                </div>
              </div>
              <div className="rounded-md border border-border p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">Instrument ref</p>
                <p className="mt-2 text-sm">{item.instrumentRef ?? "Not captured"}</p>
              </div>
              {approval && (
                <AlertBadge
                  icon={LockKeyhole}
                  label={`${approval.id} awaiting Owner approval`}
                  variant="warning"
                />
              )}
            </div>
            <SheetFooter>
              <a
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                href={`/records/${item.id}`}
              >
                View journey
              </a>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function CompliancePage() {
  const [role, setRole] = useState<Role>("Sales");
  const [data, setData] = useState<DataState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pending, setPending] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const actor = useMemo(() => rbac.actors[role], [role]);
  const selectedItem =
    data?.items.find((item) => item.id === selectedId) ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [items, customers, inquiries, approvals, activity] = await Promise.all([
        complianceService.list(),
        referenceService.listCustomers(),
        referenceService.listInquiries(),
        approvalsService.list(),
        activityService.list(),
      ]);
      setData({ items, customers, inquiries, approvals, activity });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unexpected loading error.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [load]);

  async function runMutation(action: () => Promise<void>, success: string) {
    setPending(true);
    setNotice(null);
    try {
      await action();
      setNotice({ label: success, variant: "success" });
      await load();
    } catch (caught) {
      setNotice({
        label: caught instanceof Error ? caught.message : "Action failed.",
        variant: "error",
      });
    } finally {
      setPending(false);
    }
  }

  async function handleCreate(values: ComplianceInput) {
    await runMutation(
      async () => {
        await complianceService.create(values, actor);
      },
      "Compliance item created and activity logged.",
    );
  }

  async function handleTransition(item: ComplianceItem, status: ComplianceStatus) {
    if (status === item.status) return;
    await runMutation(
      async () => {
        await complianceService.transition(item.id, status, actor);
      },
      `${item.id} moved to ${status}.`,
    );
  }

  async function handleRequestApproval(item: ComplianceItem) {
    await runMutation(
      async () => {
        await complianceService.requestApproval(item.id, actor);
      },
      `Approval requested for ${item.id}.`,
    );
  }

  async function handleApprove(item: ComplianceItem) {
    await runMutation(
      async () => {
        await complianceService.approve(item.id, actor);
      },
      `${item.id} approved and moved to Submitted.`,
    );
  }

  if (loading && !data) {
    return (
      <main className="min-h-screen bg-background p-6 text-foreground">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
          <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Sales / Compliance</p>
              <h1 className="text-3xl font-semibold tracking-tight">EMD & BG Tracker</h1>
            </div>
          </header>
          <DataSkeleton />
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-background p-6 text-foreground">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
          <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Sales / Compliance</p>
              <h1 className="text-3xl font-semibold tracking-tight">EMD & BG Tracker</h1>
            </div>
          </header>
          <ErrorState message={error} onRetry={load} />
        </div>
      </main>
    );
  }

  const items = data?.items ?? [];
  const customers = data?.customers ?? [];
  const inquiries = data?.inquiries ?? [];
  const approvals = data?.approvals ?? [];
  const activity = data?.activity ?? [];
  const canCreate = rbac.can(role, "create", "compliance");
  const pendingApprovalCount = approvals.filter(
    (approval) => approval.status === "Pending",
  ).length;
  const dueSoonCount = items.filter((item) => {
    const remaining = daysUntil(item.dueDate);
    return remaining <= 3 && item.status !== "Complete";
  }).length;
  const exposure = items.reduce((total, item) => total + item.amountInr, 0);
  const highRiskCount = items.filter((item) => item.risk === "High").length;

  return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Sales / Compliance</p>
            <h1 className="text-3xl font-semibold tracking-tight">EMD & BG Tracker</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Track tender deposits, bank guarantees, documents, and security deposits with
              Owner approval gates where money leaves the business.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <RoleControl role={role} onChange={setRole} />
            <Button onClick={load} type="button" variant="outline">
              <RefreshCw className="mr-2 size-4" aria-hidden={true} />
              Refresh
            </Button>
          </div>
        </header>

        {notice && (
          <AlertBadge
            icon={notice.variant === "success" ? CheckCircle2 : AlertTriangle}
            label={notice.label}
            variant={notice.variant}
          />
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <section className="flex flex-col gap-6 lg:col-span-2">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryMetric icon={ClipboardList} label="Open controls" value={String(items.length)} />
              <SummaryMetric icon={LockKeyhole} label="Pending approvals" value={String(pendingApprovalCount)} />
              <SummaryMetric icon={AlertTriangle} label="High risk" value={String(highRiskCount)} />
              <SummaryMetric icon={BadgeIndianRupee} label="Exposure" value={formatINR(exposure)} />
            </div>

            <AddItemForm
              actor={actor}
              customers={customers}
              inquiries={inquiries}
              onSubmit={handleCreate}
              pending={pending}
            />

            {items.length === 0 ? (
              <EmptyState canCreate={canCreate} />
            ) : (
              <ComplianceTable
                actor={actor}
                approvals={approvals}
                customers={customers}
                inquiries={inquiries}
                items={items}
                onApprove={handleApprove}
                onOpen={(item) => setSelectedId(item.id)}
                onRequestApproval={handleRequestApproval}
                onTransition={handleTransition}
                pending={pending}
              />
            )}
          </section>

          <aside className="flex flex-col gap-6">
            <SuggestedControls
              dueSoon={dueSoonCount}
              pendingApprovals={pendingApprovalCount}
            />
            <ActivityFeed events={activity} />
          </aside>
        </div>
      </div>

      <DetailSheet
        approvals={approvals}
        customers={customers}
        inquiries={inquiries}
        item={selectedItem}
        onClose={() => setSelectedId(null)}
      />
    </main>
  );
}
