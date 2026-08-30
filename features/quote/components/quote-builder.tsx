/* Core quote-builder implementation: 
    cable specification, costing, materials, lines, 
    quote state, customer selection, pricing, and quote editing. */
//TODO: use a service layer to encapsulate the quote-building logic and state management, separating it from the UI components.

"use client";

import {
  ArrowLeft,
  ArrowRight,
  Cable,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Eye,
  FileText,
  Info,
  LayoutGrid,
  Link2Off,
  Loader2,
  Pencil,
  Plus,
  RefreshCcw,
  Send,
  ShieldCheck,
  Trash2,
  Users,
  Wand2,
  Zap,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Button, Input, Label } from "@/components/ui";
import { now } from "@/lib/domain/clock";
import { buildCableCode, buildDesignation } from "@/lib/domain/cable";
import {
  computeGst,
  computeLine,
  MARGIN_GATE_PCT,
  ratesForSpec,
  type CostingResult,
} from "@/lib/domain/costing";
import { formatDate, formatINR } from "@/lib/domain/format";
import { can, requiresApproval } from "@/lib/rbac";
import {
  contactsService,
  inquiriesService,
  integrationsService,
  materialsService,
  quotesService,
  specsService,
} from "@/lib/services";
import type {
  ArmourType,
  CableSpec,
  ConductorClass,
  ConductorMaterial,
  CoreConfig,
  Customer,
  FlameClass,
  Inquiry,
  Insulation,
  Material,
  MaterialCategory,
  Quote,
  QuoteLine,
  QuoteStatus,
  Role,
  SheathType,
  VoltageGrade,
} from "@/lib/services/types";
import type { CablePreset } from "@/lib/seed/cable-presets";
import { useSessionStore } from "@/lib/store/session";
import { cn } from "@/lib/utils";

// ── Vocabulary (option lists for the spec form) ───────────────────────────────
const CONDUCTOR_SIZES = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400, 500, 630];
const STANDARDS = ["IS 7098-1", "IS 7098-2", "IS 1554-1", "IS 694", "IEC 60502-1", "IEC 60502-2"] as const;
const VOLTAGES: VoltageGrade[] = [
  "650/1100 V (1.1 kV)",
  "1.9/3.3 kV",
  "3.8/6.6 kV",
  "6.35/11 kV",
  "12.7/22 kV",
  "19/33 kV",
];
const CORES: CoreConfig[] = ["1C", "2C", "3C", "3.5C", "4C", "5C"];
const CLASSES: ConductorClass[] = ["Class 1 (solid)", "Class 2 (stranded)", "Class 2 compacted", "Class 5 (flexible)"];
const INSULATIONS: Insulation[] = ["XLPE", "PVC (Type A)", "PVC (Type C)", "EPR", "XLPO (solar/UV)"];
const ARMOURS: ArmourType[] = ["Unarmoured", "GI round wire (GSW)", "GI strip (GSS)", "Aluminium wire (AWA)", "Aluminium strip"];
const SHEATHS: SheathType[] = ["PVC (ST1)", "PVC (ST2)", "FR PVC", "FRLS PVC", "Zero-halogen (ZHFR/LSZH)", "HDPE"];
const FLAME_CLASSES: FlameClass[] = ["FR", "FRLS", "LSZH", "Standard"];
const MODE_KEY = "cableos2:quote-mode";

// ── Draft line shape (UI-local; converted to a persisted CableSpec + QuoteLine on add) ──
interface LineDraft {
  standard: (typeof STANDARDS)[number];
  voltageGrade: VoltageGrade;
  cores: CoreConfig;
  conductorMaterial: ConductorMaterial;
  conductorClass: ConductorClass;
  conductorSizeSqMm: number;
  neutralSizeSqMm: number;
  insulation: Insulation;
  armour: ArmourType;
  sheath: SheathType;
  flameClass: FlameClass;
  screened: boolean;
  lengthM: number;
  metalRatePerKg: number;
  overheadPerM: number;
  marginPct: number;
}

interface McxRates {
  aluminium: number;
  copper: number;
  at: string;
}

const fallbackDraft: LineDraft = {
  standard: "IS 7098-1",
  voltageGrade: "650/1100 V (1.1 kV)",
  cores: "3.5C",
  conductorMaterial: "Aluminium",
  conductorClass: "Class 2 compacted",
  conductorSizeSqMm: 240,
  neutralSizeSqMm: 120,
  insulation: "XLPE",
  armour: "GI strip (GSS)",
  sheath: "FRLS PVC",
  flameClass: "FRLS",
  screened: false,
  lengthM: 1000,
  metalRatePerKg: 248,
  overheadPerM: 820,
  marginPct: 14,
};

function draftFromPreset(preset: CablePreset, mcx: McxRates | null): LineDraft {
  const material = preset.spec.conductorMaterial;
  return {
    standard: preset.spec.standard as LineDraft["standard"],
    voltageGrade: preset.spec.voltageGrade,
    cores: preset.spec.cores,
    conductorMaterial: material,
    conductorClass: preset.spec.conductorClass,
    conductorSizeSqMm: preset.spec.conductorSizeSqMm,
    neutralSizeSqMm: preset.spec.neutralSizeSqMm ?? 120,
    insulation: preset.spec.insulation,
    armour: preset.spec.armour,
    sheath: preset.spec.sheath,
    flameClass: preset.spec.flameClass,
    screened: preset.spec.screened ?? false,
    lengthM: preset.defaultLengthM ?? 1000,
    metalRatePerKg: mcx ? (material === "Aluminium" ? mcx.aluminium : mcx.copper) : fallbackDraft.metalRatePerKg,
    overheadPerM: preset.defaultOverheadPerM ?? fallbackDraft.overheadPerM,
    marginPct: preset.defaultMarginPct ?? fallbackDraft.marginPct,
  };
}

function specFromDraft(draft: LineDraft, id: string): CableSpec {
  return {
    id,
    standard: draft.standard,
    voltageGrade: draft.voltageGrade,
    cores: draft.cores,
    conductorMaterial: draft.conductorMaterial,
    conductorClass: draft.conductorClass,
    conductorSizeSqMm: draft.conductorSizeSqMm,
    neutralSizeSqMm: draft.cores === "3.5C" ? draft.neutralSizeSqMm : undefined,
    insulation: draft.insulation,
    armour: draft.armour,
    sheath: draft.sheath,
    flameClass: draft.flameClass,
    screened: draft.screened,
    designation: buildDesignation(draft),
    cableCode: buildCableCode(draft),
  };
}

/** A quote line plus its resolved spec — kept together in page state for rendering. */
interface LineWithSpec {
  line: QuoteLine;
  spec: CableSpec;
  costing: CostingResult; // per-component breakdown for the UI
}

/**
 * Cost a draft against the current materials table. This is the single place the UI computes
 * a price — it resolves ₹/kg rates from the materials, then runs the bill-of-materials engine.
 * The metal rate the operator may have overridden in the form wins over the table for the
 * conductor (a "what-if"), keeping the manual override behaviour.
 */
function costDraft(draft: LineDraft, materials: Material[]): CostingResult {
  const spec = specFromDraft(draft, "calc");
  const rates = ratesForSpec(spec, materials);
  return computeLine({
    spec,
    lengthM: draft.lengthM,
    marginPct: draft.marginPct,
    rates: {
      ...rates,
      conductorPerKg: draft.metalRatePerKg || rates.conductorPerKg,
      labourPerM: draft.overheadPerM,
    },
  });
}

function lineFromDraft(draft: LineDraft, seq: number, materials: Material[]): LineWithSpec {
  const specId = `SPEC-Q-${String(seq).padStart(3, "0")}`;
  const costing = costDraft(draft, materials);
  const line: QuoteLine = {
    id: `QL-Q-${String(seq).padStart(3, "0")}`,
    specId,
    lengthM: draft.lengthM,
    metalRatePerKg: draft.metalRatePerKg,
    overheadPerM: draft.overheadPerM,
    marginPct: draft.marginPct,
    metalCostPerM: costing.conductorCostPerM,
    baseCostPerM: costing.baseCostPerM,
    lineSubtotalInr: costing.lineSubtotalInr,
    lineMarginInr: costing.lineMarginInr,
    lineTotalInr: costing.lineTotalInr,
    hsnCode: "8544",
    gstRatePct: 18,
  };
  return { line, spec: specFromDraft(draft, specId), costing };
}

function validUntilIso(): string {
  const date = now();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
}

function nextQuoteId(): string {
  return `Q-${now().toISOString().slice(2, 4)}${now().toISOString().slice(5, 7)}-${Math.floor(
    100 + Math.random() * 900,
  )}`;
}

// ── Shared presentational atoms ──────────────────────────────────────────────
function MoneyCell({ amount }: { amount: number }) {
  return <span className="font-mono tabular-nums">{formatINR(amount)}</span>;
}

function DateCell({ iso }: { iso: string }) {
  return <span className="font-mono">{formatDate(iso)}</span>;
}

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "highlight";
const toneClass: Record<Tone, string> = {
  neutral: "bg-secondary text-secondary-foreground",
  success: "bg-success text-success-foreground",
  warning: "bg-warning text-warning-foreground",
  danger: "bg-danger text-danger-foreground",
  info: "bg-info text-info-foreground",
  highlight: "bg-highlight text-highlight-foreground",
};

function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-sm px-2 py-1 text-xs font-medium", toneClass[tone])}>
      {children}
    </span>
  );
}

function StatusBadge({ status }: { status: QuoteStatus }) {
  const tone: Tone =
    status === "Approved" || status === "On board"
      ? "success"
      : status === "Review"
        ? "warning"
        : status === "Rejected"
          ? "danger"
          : status === "Sent"
            ? "info"
            : "neutral";
  return <Badge tone={tone}>{status}</Badge>;
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
}: {
  title: string;
  description?: string;
  icon?: typeof Cable;
  action?: React.ReactNode;
  children: React.ReactNode;
  /** When false, the panel is always open with no toggle. */
  collapsible?: boolean;
  /** Open state on first render (overridden by a remembered value if storageKey is set). */
  defaultOpen?: boolean;
  /** Remember open/closed across reloads under `cableos2:panel:<key>`. */
  storageKey?: string;
}) {
  const [open, setOpen] = useState(() => {
    if (!collapsible) return true;
    if (storageKey && typeof window !== "undefined") {
      const stored = window.localStorage.getItem(`cableos2:panel:${storageKey}`);
      if (stored === "open") return true;
      if (stored === "closed") return false;
    }
    return defaultOpen;
  });

  function toggle() {
    setOpen((value) => {
      const next = !value;
      if (storageKey && typeof window !== "undefined") {
        window.localStorage.setItem(`cableos2:panel:${storageKey}`, next ? "open" : "closed");
      }
      return next;
    });
  }

  const bodyId = `panel-body-${(storageKey ?? title).replace(/\s+/g, "-").toLowerCase()}`;

  const header = (
    <div className="flex min-w-0 gap-3">
      {Icon ? (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </div>
      ) : null}
      <div className="min-w-0 space-y-1 text-left">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
    </div>
  );

  return (
    <section className="rounded-lg border border-border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-border p-4">
        {collapsible ? (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-controls={bodyId}
            className="flex min-w-0 flex-1 items-start gap-2 text-left"
          >
            <ChevronDown
              className={cn("mt-2.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")}
              aria-hidden="true"
            />
            {header}
          </button>
        ) : (
          header
        )}
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {open ? (
        <div id={bodyId} className="p-4">
          {children}
        </div>
      ) : null}
    </section>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function SelectField<T extends string>({
  id,
  label,
  value,
  options,
  hint,
  disabled,
  big,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  options: readonly T[];
  hint?: string;
  disabled?: boolean;
  big?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <Field id={id} label={label} hint={hint}>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as T)}
        className={cn(
          "flex w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          big ? "h-11 text-base" : "h-9 py-1",
        )}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </Field>
  );
}

function NumberField({
  id,
  label,
  value,
  hint,
  error,
  min,
  step,
  disabled,
  big,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  hint?: string;
  error?: string;
  min?: number;
  step?: number;
  disabled?: boolean;
  big?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <Input
        id={id}
        type="number"
        value={Number.isNaN(value) ? "" : value}
        min={min}
        step={step}
        disabled={disabled}
        className={big ? "h-11 text-base" : undefined}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </Field>
  );
}

/**
 * Customer field by NAME (no codes). Type a name to filter existing customers and pick one,
 * or type a brand-new name to quote a customer not yet on file. Selecting a known customer
 * keeps the tax/credit/sales-board linkage; a new name is quoted as-is.
 */
function CustomerInput({
  id,
  customers,
  value, // current display name
  selectedCustomerId,
  disabled,
  big,
  onSelectExisting,
  onTypeNew,
}: {
  id: string;
  customers: Customer[];
  value: string;
  selectedCustomerId: string;
  disabled?: boolean;
  big?: boolean;
  onSelectExisting: (customer: Customer) => void;
  onTypeNew: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const query = value.trim().toLowerCase();
  const matches = query
    ? customers.filter((c) => c.name.toLowerCase().includes(query))
    : customers;
  const exactMatch = customers.find((c) => c.name.toLowerCase() === query);
  const isNewName = value.trim().length > 0 && !exactMatch;

  return (
    <Field id={id} label="Customer name" hint="Type a name. Pick an existing customer, or enter a new one.">
      <div className="relative">
        <Input
          id={id}
          value={value}
          disabled={disabled}
          autoComplete="off"
          placeholder="e.g. Shakti Infra Projects"
          className={big ? "h-11 text-base" : undefined}
          onChange={(event) => {
            onTypeNew(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        />
        {open && !disabled && (matches.length > 0 || isNewName) ? (
          <div className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-popover shadow-md">
            {matches.map((customer) => (
              <button
                key={customer.id}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  onSelectExisting(customer);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted",
                  customer.id === selectedCustomerId && "bg-muted",
                )}
              >
                <span className="font-medium text-foreground">{customer.name}</span>
                <span className="text-xs text-muted-foreground">
                  {customer.city}, {customer.state}
                </span>
              </button>
            ))}
            {isNewName ? (
              <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                Press Enter / keep typing to quote{" "}
                <span className="font-medium text-foreground">“{value.trim()}”</span> as a new customer.
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Field>
  );
}

/** Quick-pick customers straight from the Sales board (inquiries without a quote yet). */
function SalesBoardPicks({
  picks,
  selectedCustomerId,
  disabled,
  onPick,
}: {
  picks: Array<{ inquiry: Inquiry; customer: Customer }>;
  selectedCustomerId: string;
  disabled?: boolean;
  onPick: (inquiry: Inquiry, customer: Customer) => void;
}) {
  if (picks.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Or pick from the Sales board</p>
      <p className="text-xs text-muted-foreground">Open inquiries that don&apos;t have a quote yet.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {picks.map(({ inquiry, customer }) => (
          <button
            key={inquiry.id}
            type="button"
            disabled={disabled}
            onClick={() => onPick(inquiry, customer)}
            className={cn(
              "rounded-md border p-3 text-left transition-colors disabled:opacity-50",
              customer.id === selectedCustomerId ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted",
            )}
          >
            <p className="text-sm font-medium text-foreground">{customer.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{inquiry.requirement}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Data states ──────────────────────────────────────────────────────────────
function LoadingState() {
  return (
    <div className="grid animate-pulse gap-4 lg:grid-cols-3">
      {[0, 1, 2].map((item) => (
        <div key={item} className="space-y-4 rounded-lg border border-border bg-card p-4">
          <div className="h-4 w-1/2 rounded-md bg-muted" />
          <div className="h-9 rounded-md bg-muted" />
          <div className="h-24 rounded-md bg-muted" />
        </div>
      ))}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-danger bg-card p-4">
      <div className="flex items-start gap-3">
        <CircleAlert className="mt-1 h-4 w-4 text-danger" aria-hidden="true" />
        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Quote data could not load</h2>
            <p className="text-sm text-muted-foreground">{message}</p>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
            <RefreshCcw className="mr-2 h-4 w-4" aria-hidden="true" />
            Retry
          </Button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  title,
  description,
  icon: Icon = Cable,
}: {
  title: string;
  description: string;
  icon?: typeof Cable;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted p-6 text-center">
      <Icon className="mx-auto h-5 w-5 text-muted-foreground" aria-hidden="true" />
      <h3 className="mt-3 text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

// ── Reusable summary card for a built cable ──────────────────────────────────
function CableSpecSummary({ spec }: { spec: CableSpec }) {
  return (
    <div className="space-y-1">
      <p className="font-mono text-xs text-muted-foreground">{spec.cableCode}</p>
      <p className="text-sm font-medium text-foreground">{spec.designation}</p>
    </div>
  );
}

// ── Costing breakdown — shows exactly where each rupee comes from ─────────────
function CostingBreakdown({ lines, gstSplit }: { lines: LineWithSpec[]; gstSplit: ReturnType<typeof computeGst> }) {
  const subtotal = lines.reduce((sum, item) => sum + item.line.lineTotalInr, 0);
  return (
    <div className="space-y-4 rounded-md border border-border bg-muted p-4 text-sm">
      {lines.map(({ line, spec, costing }) => (
        <div key={line.id} className="space-y-2 border-b border-border pb-4 last:border-0 last:pb-0">
          <p className="font-medium text-foreground">{spec.designation}</p>
          <table className="portal-table text-left">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">Component</th>
                <th className="py-1 text-right font-medium">kg / m</th>
                <th className="py-1 text-right font-medium">₹ / kg</th>
                <th className="py-1 text-right font-medium">₹ / m</th>
              </tr>
            </thead>
            <tbody>
              {costing.components.map((component) => (
                <tr key={component.label} className="border-t border-border/50">
                  <td className="py-1.5">{component.label}</td>
                  <td className="py-1.5 text-right font-mono">{component.kgPerM > 0 ? component.kgPerM.toFixed(3) : "—"}</td>
                  <td className="py-1.5 text-right font-mono">{component.ratePerKg > 0 ? formatINR(component.ratePerKg) : "—"}</td>
                  <td className="py-1.5 text-right font-mono">{formatINR(Math.round(component.costPerM))}</td>
                </tr>
              ))}
              <tr className="border-t border-border font-medium">
                <td className="py-1.5">Cost per metre</td>
                <td />
                <td />
                <td className="py-1.5 text-right font-mono">{formatINR(Math.round(costing.baseCostPerM))}</td>
              </tr>
            </tbody>
          </table>
          <div className="grid grid-cols-3 gap-2 pt-1">
            <Stat label={`× ${line.lengthM} m`} value={Math.round(costing.lineSubtotalInr)} />
            <Stat label={`+ margin ${line.marginPct}%`} value={Math.round(costing.lineMarginInr)} />
            <Stat label="Line total" value={line.lineTotalInr} />
          </div>
        </div>
      ))}
      <div className="space-y-1 pt-1">
        <Row label="Subtotal" value={subtotal} />
        {gstSplit.interstate ? (
          <Row label="IGST 18%" value={gstSplit.gstInr} />
        ) : (
          <>
            <Row label="CGST 9%" value={gstSplit.cgstInr ?? 0} />
            <Row label="SGST 9%" value={gstSplit.sgstInr ?? 0} />
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-foreground">
        <MoneyCell amount={value} />
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <MoneyCell amount={value} />
    </div>
  );
}

// ── The rich spec form (shared by guided "More options" + advanced) ──────────
function SpecForm({
  draft,
  mcx,
  readOnly,
  big,
  onChange,
}: {
  draft: LineDraft;
  mcx: McxRates | null;
  readOnly: boolean;
  big?: boolean;
  onChange: (next: LineDraft) => void;
}) {
  function patch(next: Partial<LineDraft>) {
    onChange({ ...draft, ...next });
  }
  function setMaterial(material: ConductorMaterial) {
    patch({
      conductorMaterial: material,
      metalRatePerKg: mcx ? (material === "Aluminium" ? mcx.aluminium : mcx.copper) : draft.metalRatePerKg,
    });
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <SelectField id="material" label="Metal" value={draft.conductorMaterial} options={["Aluminium", "Copper"] as const} hint="Aluminium (cheaper) or Copper (carries more)" disabled={readOnly} big={big} onChange={setMaterial} />
      <SelectField id="size" label="Thickness (size)" value={String(draft.conductorSizeSqMm)} options={CONDUCTOR_SIZES.map(String)} hint="Bigger number = thicker cable (sq mm)" disabled={readOnly} big={big} onChange={(size) => patch({ conductorSizeSqMm: Number(size) })} />
      <SelectField id="cores" label="How many cores" value={draft.cores} options={CORES} hint="Most jobs use 3.5 or 4" disabled={readOnly} big={big} onChange={(cores) => patch({ cores })} />
      {draft.cores === "3.5C" ? (
        <SelectField id="neutral" label="Reduced neutral size" value={String(draft.neutralSizeSqMm)} options={CONDUCTOR_SIZES.map(String)} hint="The thinner 4th core in a 3.5-core cable" disabled={readOnly} big={big} onChange={(n) => patch({ neutralSizeSqMm: Number(n) })} />
      ) : null}
      <SelectField id="insulation" label="Insulation" value={draft.insulation} options={INSULATIONS} hint="XLPE handles more heat; PVC is cheaper" disabled={readOnly} big={big} onChange={(insulation) => patch({ insulation })} />
      <SelectField id="armour" label="Armour" value={draft.armour} options={ARMOURS} hint="Mechanical protection for buried/outdoor runs" disabled={readOnly} big={big} onChange={(armour) => patch({ armour })} />
      <SelectField id="sheath" label="Outer covering (sheath)" value={draft.sheath} options={SHEATHS} hint="FRLS / LSZH = safer in a fire" disabled={readOnly} big={big} onChange={(sheath) => patch({ sheath })} />
      <SelectField id="flame" label="Fire rating" value={draft.flameClass} options={FLAME_CLASSES} disabled={readOnly} big={big} onChange={(flameClass) => patch({ flameClass })} />
    </div>
  );
}

function CostingFields({
  draft,
  readOnly,
  big,
  onChange,
}: {
  draft: LineDraft;
  readOnly: boolean;
  big?: boolean;
  onChange: (next: LineDraft) => void;
}) {
  function patch(next: Partial<LineDraft>) {
    onChange({ ...draft, ...next });
  }
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <NumberField id="length" label="How many metres" value={draft.lengthM} min={1} hint="Total length the customer wants" disabled={readOnly} big={big} onChange={(lengthM) => patch({ lengthM })} error={draft.lengthM <= 0 ? "Enter a length above zero." : undefined} />
      <NumberField id="margin" label="Your profit %" value={draft.marginPct} min={0} step={0.5} hint="How much you add on top of cost" disabled={readOnly} big={big} onChange={(marginPct) => patch({ marginPct })} error={draft.marginPct < 0 ? "Profit cannot be negative." : undefined} />
      <NumberField id="metal-rate" label="Metal price per kg" value={draft.metalRatePerKg} min={1} hint="Filled from today's market rate — change only for a what-if" disabled={readOnly} big={big} onChange={(metalRatePerKg) => patch({ metalRatePerKg })} error={draft.metalRatePerKg <= 0 ? "Metal rate is required." : undefined} />
      <NumberField id="overhead" label="Overhead per metre" value={draft.overheadPerM} min={0} hint="Process, drum and freight cost per metre" disabled={readOnly} big={big} onChange={(overheadPerM) => patch({ overheadPerM })} error={draft.overheadPerM < 0 ? "Overhead cannot be negative." : undefined} />
    </div>
  );
}

// ── More options expander (advanced-spec fields hidden in guided mode) ────────
function MoreOptions({
  draft,
  readOnly,
  onChange,
}: {
  draft: LineDraft;
  readOnly: boolean;
  onChange: (next: LineDraft) => void;
}) {
  const [open, setOpen] = useState(false);
  function patch(next: Partial<LineDraft>) {
    onChange({ ...draft, ...next });
  }
  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 p-3 text-sm font-medium text-foreground"
      >
        <span>More options (standard, voltage, conductor class, HT screening)</span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open ? (
        <div className="grid gap-4 border-t border-border p-4 md:grid-cols-2">
          <SelectField id="standard" label="Standard" value={draft.standard} options={STANDARDS} disabled={readOnly} onChange={(standard) => patch({ standard })} />
          <SelectField id="voltage" label="Voltage grade" value={draft.voltageGrade} options={VOLTAGES} disabled={readOnly} onChange={(voltageGrade) => patch({ voltageGrade })} />
          <SelectField id="conductor-class" label="Conductor class" value={draft.conductorClass} options={CLASSES} disabled={readOnly} onChange={(conductorClass) => patch({ conductorClass })} />
          <div className="space-y-1.5">
            <Label>HT screening</Label>
            <Button type="button" variant={draft.screened ? "default" : "secondary"} disabled={readOnly} aria-pressed={draft.screened} onClick={() => patch({ screened: !draft.screened })}>
              <Zap className="mr-2 h-4 w-4" aria-hidden="true" />
              {draft.screened ? "Screened" : "Not screened"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// GUIDED WIZARD (default experience)
// ══════════════════════════════════════════════════════════════════════════════
const STEP_TITLES = ["Who is this quote for?", "What cable do they need?", "Here's the price.", "Send it."];

function WizardProgress({ step }: { step: number }) {
  return (
    <div className="space-y-2">
      <p className="font-mono text-xs text-muted-foreground">Step {step + 1} of 4</p>
      <h2 className="text-2xl font-semibold tracking-tight text-foreground">{STEP_TITLES[step]}</h2>
      <div className="flex gap-1.5" aria-hidden="true">
        {STEP_TITLES.map((_, index) => (
          <span key={index} className={cn("h-1.5 flex-1 rounded-full", index <= step ? "bg-primary" : "bg-muted")} />
        ))}
      </div>
    </div>
  );
}

function GuidedWizard(props: BuilderShared) {
  const {
    customers,
    selectedCustomerId,
    customerName,
    selectedCustomer,
    onSelectExistingCustomer,
    onTypeCustomerName,
    openInquiryPicks,
    onPickFromSalesBoard,
    hasCustomer,
    draft,
    setDraft,
    presets,
    mcx,
    materials,
    lines,
    addLine,
    removeLine,
    editLine,
    readOnly,
    gstSplit,
    totalInr,
    sendLabel,
    sendIcon,
    sendDisabled,
    onSend,
    onSaveDraft,
    saving,
    sending,
    gateReason,
  } = props;

  const [step, setStep] = useState(0);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [editingPreset, setEditingPreset] = useState(false);

  const canGoNext = step === 0 ? hasCustomer : step === 1 ? lines.length > 0 : true;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      <WizardProgress step={step} />

      {step === 0 ? (
        <div className="space-y-6">
          <CustomerInput
            id="wizard-customer"
            customers={customers}
            value={customerName}
            selectedCustomerId={selectedCustomerId}
            disabled={readOnly}
            big
            onSelectExisting={onSelectExistingCustomer}
            onTypeNew={onTypeCustomerName}
          />
          {selectedCustomer ? (
            <div className="rounded-md border border-border bg-muted p-4 text-sm">
              <p className="font-medium text-foreground">{selectedCustomer.name}</p>
              <p className="text-muted-foreground">
                {[selectedCustomer.city, selectedCustomer.state].filter(Boolean).join(", ")}
                {selectedCustomer.paymentTerms ? ` · ${selectedCustomer.paymentTerms}` : ""}
              </p>
            </div>
          ) : customerName.trim() ? (
            <p className="text-sm text-muted-foreground">
              New customer <span className="font-medium text-foreground">“{customerName.trim()}”</span> will be created when you save or send.
            </p>
          ) : null}
          <SalesBoardPicks picks={openInquiryPicks} selectedCustomerId={selectedCustomerId} disabled={readOnly} onPick={onPickFromSalesBoard} />
        </div>
      ) : null}

      {step === 1 ? (
        <div className="space-y-6">
          <div>
            <p className="text-sm font-medium text-foreground">Pick a cable you usually sell</p>
            <p className="text-sm text-muted-foreground">Choosing one fills in everything for you — you can change it after.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {presets.map((preset) => {
                const active = isSamePreset(draft, preset);
                return (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={readOnly}
                    onClick={() => {
                      setDraft(draftFromPreset(preset, mcx));
                      setEditingPreset(false);
                    }}
                    className={cn(
                      "rounded-md border p-4 text-left transition-colors disabled:opacity-50",
                      active ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted",
                    )}
                  >
                    <p className="text-sm font-medium text-foreground">{preset.displayName}</p>
                    {preset.description ? <p className="mt-1 text-xs text-muted-foreground">{preset.description}</p> : null}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setEditingPreset((value) => !value)}
            aria-expanded={editingPreset}
            className="flex items-center gap-2 text-sm font-medium text-primary"
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Need to change something?
          </button>

          {editingPreset ? (
            <div className="space-y-6 rounded-md border border-border p-4">
              <SpecForm draft={draft} mcx={mcx} readOnly={readOnly} big onChange={setDraft} />
              <CostingFields draft={draft} readOnly={readOnly} big onChange={setDraft} />
              {draft.marginPct < MARGIN_GATE_PCT ? (
                <p className="flex items-center gap-2 text-xs font-medium text-warning">
                  <Info className="h-3.5 w-3.5" aria-hidden="true" />
                  A profit below {MARGIN_GATE_PCT}% needs the owner to approve before it can go to the factory.
                </p>
              ) : null}
              <MoreOptions draft={draft} readOnly={readOnly} onChange={setDraft} />
            </div>
          ) : null}

          <div className="rounded-md border border-border bg-muted p-4">
            <CableSpecSummary spec={specFromDraft(draft, "preview")} />
            <p className="mt-2 text-sm text-muted-foreground">
              {draft.lengthM} m · profit {draft.marginPct}% · this cable ≈ <MoneyCell amount={costDraft(draft, materials).lineTotalInr} />
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button type="button" disabled={readOnly || draft.lengthM <= 0} onClick={() => addLine(draft)}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Add this cable
            </Button>
            {lines.length > 0 ? <Badge tone="success">{lines.length} cable{lines.length > 1 ? "s" : ""} added</Badge> : null}
          </div>

          {lines.length > 0 ? (
            <div className="space-y-3">
              {lines.map(({ line, spec }) => (
                <div key={line.id} className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
                  <CableSpecSummary spec={spec} />
                  <div className="flex shrink-0 items-center gap-2">
                    <MoneyCell amount={line.lineTotalInr} />
                    <Button type="button" variant="ghost" size="sm" disabled={readOnly} onClick={() => editLine(line.id)} aria-label={`Edit ${line.id}`}>
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" disabled={readOnly} onClick={() => removeLine(line.id)} aria-label={`Remove ${line.id}`}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-6">
          <div className="rounded-lg border border-border bg-card p-6 text-center">
            <p className="text-sm text-muted-foreground">Total price (including GST)</p>
            <p className="mt-2 text-4xl font-semibold tracking-tight text-foreground">{formatINR(totalInr)}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {gstSplit.interstate ? "IGST" : "CGST + SGST"} · valid until <DateCell iso={validUntilIso()} />
            </p>
          </div>

          <button type="button" onClick={() => setShowBreakdown((value) => !value)} aria-expanded={showBreakdown} className="flex items-center gap-2 text-sm font-medium text-primary">
            <ChevronDown className={cn("h-4 w-4 transition-transform", showBreakdown && "rotate-180")} aria-hidden="true" />
            Show me how this was worked out
          </button>
          {showBreakdown ? <CostingBreakdown lines={lines} gstSplit={gstSplit} /> : null}

          <div className="space-y-3">
            {lines.map(({ line, spec }) => (
              <div key={line.id} className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
                <CableSpecSummary spec={spec} />
                <div className="flex shrink-0 items-center gap-2">
                  <MoneyCell amount={line.lineTotalInr} />
                  <Button type="button" variant="ghost" size="sm" disabled={readOnly} onClick={() => { editLine(line.id); setStep(1); }} aria-label={`Edit ${line.id}`}>
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button type="button" variant="ghost" size="sm" disabled={readOnly} onClick={() => removeLine(line.id)} aria-label={`Remove ${line.id}`}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-4">
          {gateReason ? (
            <div className="flex items-start gap-3 rounded-md border border-warning bg-warning/10 p-4 text-sm">
              <ShieldCheck className="mt-0.5 h-4 w-4 text-warning" aria-hidden="true" />
              <p className="text-foreground">{gateReason}</p>
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={readOnly || saving || lines.length === 0}
              onClick={onSaveDraft}
              className="rounded-lg border border-border bg-card p-5 text-left transition-colors hover:bg-muted disabled:opacity-50"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileText className="h-4 w-4" aria-hidden="true" />}
                Save for later
              </div>
              <p className="mt-2 text-sm text-muted-foreground">Keeps it; doesn&apos;t start the factory.</p>
            </button>
            <button
              type="button"
              disabled={sendDisabled || lines.length === 0}
              onClick={onSend}
              className="rounded-lg border border-primary bg-primary/10 p-5 text-left transition-colors hover:bg-primary/20 disabled:opacity-50"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : sendIcon}
                {sendLabel}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {gateReason ? "The owner will review it before anything starts." : "Locks the price and starts production, dispatch, and the invoice."}
              </p>
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button type="button" variant="ghost" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
          Back
        </Button>
        {step < 3 ? (
          <Button type="button" disabled={!canGoNext} onClick={() => setStep((s) => Math.min(3, s + 1))}>
            Next
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">Choose an option above.</span>
        )}
      </div>
    </div>
  );
}

function isSamePreset(draft: LineDraft, preset: CablePreset): boolean {
  return (
    draft.conductorMaterial === preset.spec.conductorMaterial &&
    draft.conductorSizeSqMm === preset.spec.conductorSizeSqMm &&
    draft.cores === preset.spec.cores &&
    draft.insulation === preset.spec.insulation &&
    draft.armour === preset.spec.armour
  );
}

// ── Materials & rates — add a material and edit ₹/kg; costing reads from here ──
function MaterialsPanel({
  materials,
  readOnly,
  onSave,
  onRefreshMcx,
}: {
  materials: Material[];
  readOnly: boolean;
  onSave: (material: Material) => void;
  onRefreshMcx: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<MaterialCategory>("Insulation");
  const [newRate, setNewRate] = useState(100);
  const categories: MaterialCategory[] = ["Conductor", "Insulation", "Armour", "Sheath"];

  function saveNew() {
    if (!newName.trim()) return;
    onSave({
      id: `MAT-${Date.now()}`,
      name: newName.trim(),
      category: newCategory,
      ratePerKg: newRate,
      source: "Manual",
      updatedAt: now().toISOString(),
    });
    setNewName("");
    setNewRate(100);
    setAdding(false);
  }

  return (
    <Panel
      title="Materials & rates"
      description="₹/kg used to cost every cable. Edit a rate and quotes update."
      icon={Zap}
      storageKey="adv-materials"
      defaultOpen={false}
      action={
        <Button type="button" variant="secondary" size="sm" disabled={readOnly} onClick={onRefreshMcx}>
          <RefreshCcw className="mr-2 h-4 w-4" aria-hidden="true" />
          Refresh MCX
        </Button>
      }
    >
      <div className="space-y-4">
        {categories.map((category) => {
          const rows = materials.filter((m) => m.category === category);
          if (rows.length === 0) return null;
          return (
            <div key={category} className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{category}</p>
              {rows.map((material) => (
                <div key={material.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{material.name}</p>
                    <p className="text-xs text-muted-foreground">{material.source === "MCX" ? "Auto (MCX)" : "Manual"}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">₹</span>
                    <Input
                      type="number"
                      min={0}
                      aria-label={`${material.name} rate per kg`}
                      value={material.ratePerKg}
                      disabled={readOnly}
                      className="h-8 w-24 text-right font-mono"
                      onChange={(event) => onSave({ ...material, ratePerKg: Number(event.target.value), source: "Manual" })}
                    />
                    <span className="text-xs text-muted-foreground">/kg</span>
                  </div>
                </div>
              ))}
            </div>
          );
        })}

        {adding ? (
          <div className="space-y-3 rounded-md border border-border p-3">
            <Field id="new-mat-name" label="Material name">
              <Input id="new-mat-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. EPR compound" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <SelectField id="new-mat-cat" label="Category" value={newCategory} options={categories} onChange={setNewCategory} />
              <NumberField id="new-mat-rate" label="Rate (₹/kg)" value={newRate} min={0} onChange={setNewRate} />
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={saveNew} disabled={!newName.trim()}>
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Add material
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" variant="secondary" size="sm" disabled={readOnly} onClick={() => setAdding(true)}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Add a material
          </Button>
        )}
      </div>
    </Panel>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ADVANCED MODE (classic two-column power layout)
// ══════════════════════════════════════════════════════════════════════════════
function AdvancedLayout(props: BuilderShared) {
  const {
    customers,
    selectedCustomerId,
    customerName,
    selectedCustomer,
    onSelectExistingCustomer,
    onTypeCustomerName,
    openInquiryPicks,
    onPickFromSalesBoard,
    draft,
    setDraft,
    mcx,
    materials,
    onSaveMaterial,
    onRefreshMcx,
    lines,
    addLine,
    removeLine,
    readOnly,
    gstSplit,
    subtotalInr,
    totalInr,
    marginGate,
  } = props;

  const liveCosting = costDraft(draft, materials);

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <div className="space-y-6 xl:col-span-2">
        <Panel title="Step 1 — Customer" description="Type a name or pick from the Sales board. Drives tax and preview." icon={Users} storageKey="adv-customer">
          <div className="space-y-4">
            <CustomerInput
              id="adv-customer"
              customers={customers}
              value={customerName}
              selectedCustomerId={selectedCustomerId}
              disabled={readOnly}
              onSelectExisting={onSelectExistingCustomer}
              onTypeNew={onTypeCustomerName}
            />
            {selectedCustomer ? (
              <p className="text-xs text-muted-foreground">
                {[selectedCustomer.city, selectedCustomer.state].filter(Boolean).join(", ")}
                {selectedCustomer.gstin ? ` · ${selectedCustomer.gstin}` : ""}
              </p>
            ) : customerName.trim() ? (
              <p className="text-xs text-muted-foreground">
                New customer — saved to Contacts when you save or send.
              </p>
            ) : null}
            <SalesBoardPicks picks={openInquiryPicks} selectedCustomerId={selectedCustomerId} disabled={readOnly} onPick={onPickFromSalesBoard} />
          </div>
        </Panel>

        <Panel title="Step 2 — Configure a cable" description="Rich CableSpec form with live designation, code, and costing." icon={Wand2} storageKey="adv-configure">
          <div className="space-y-6">
            <SpecForm draft={draft} mcx={mcx} readOnly={readOnly} onChange={setDraft} />
            <MoreOptions draft={draft} readOnly={readOnly} onChange={setDraft} />
            <div className="rounded-md border border-border bg-muted p-4">
              <CableSpecSummary spec={specFromDraft(draft, "live")} />
            </div>
            <CostingFields draft={draft} readOnly={readOnly} onChange={setDraft} />
            <div className="space-y-2 rounded-md border border-border bg-muted p-3 text-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cost per metre, by component</p>
              {liveCosting.components.map((component) => (
                <div key={component.label} className="flex justify-between">
                  <span className="text-muted-foreground">{component.label}</span>
                  <MoneyCell amount={Math.round(component.costPerM)} />
                </div>
              ))}
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <Stat label="Conductor/m" value={liveCosting.conductorCostPerM} />
              <Stat label="Base cost/m" value={liveCosting.baseCostPerM} />
              <Stat label={`Margin @ ${draft.marginPct}%`} value={liveCosting.lineMarginInr} />
              <Stat label="Line total" value={liveCosting.lineTotalInr} />
            </div>
            <Button type="button" disabled={readOnly || draft.lengthM <= 0} onClick={() => addLine(draft)}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Add this cable to the quote
            </Button>
          </div>
        </Panel>

        <Panel title="Cables in this quote" description="Line totals include metal, overhead, margin; GST applied at quote level." icon={Cable} storageKey="adv-lines">
          {lines.length === 0 ? (
            <EmptyState title="No quote lines yet" description="Configure a cable above, then add it to this quote." />
          ) : (
            <div className="portal-table-wrap rounded-md border border-border">
              <table className="portal-table border-collapse text-left text-sm">
                <thead className="bg-muted text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2 font-medium lg:p-3">Line</th>
                    <th className="p-2 font-medium lg:p-3">Designation</th>
                    <th className="p-2 font-medium lg:p-3">Material</th>
                    <th className="p-2 font-medium lg:p-3">Length</th>
                    <th className="p-2 font-medium lg:p-3">Margin</th>
                    <th className="p-2 font-medium lg:p-3">Total</th>
                    <th className="p-2 font-medium lg:p-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map(({ line, spec }) => (
                    <tr key={line.id} className="border-t border-border">
                      <td className="p-2 font-mono text-xs lg:p-3">{line.id}</td>
                      <td className="min-w-0 p-2 lg:p-3">
                        <p className="font-medium text-foreground">{spec.designation}</p>
                        <p className="font-mono text-xs text-muted-foreground">{spec.cableCode}</p>
                      </td>
                      <td className="p-2 lg:p-3">{spec.conductorMaterial}</td>
                      <td className="p-2 font-mono lg:p-3">{line.lengthM} m</td>
                      <td className="p-2 lg:p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono">{line.marginPct}%</span>
                          {line.marginPct < MARGIN_GATE_PCT ? <Badge tone="warning">Low margin</Badge> : null}
                        </div>
                      </td>
                      <td className="p-2 lg:p-3">
                        <MoneyCell amount={line.lineTotalInr} />
                      </td>
                      <td className="p-2 lg:p-3">
                        <Button type="button" variant="ghost" size="sm" disabled={readOnly} onClick={() => removeLine(line.id)} aria-label={`Remove ${line.id}`}>
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <div className="space-y-6">
        <Panel title="Quote preview" description="Live commercial document preview." icon={FileText} storageKey="adv-preview">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{selectedCustomer?.name ?? (customerName.trim() || "Enter a customer name")}</p>
                <p className="text-xs text-muted-foreground">{selectedCustomer ? [selectedCustomer.gstin, selectedCustomer.state].filter(Boolean).join(" · ") || "Details pending" : "GST split appears after selection."}</p>
              </div>
              <Badge tone={gstSplit.interstate ? "info" : "highlight"}>{gstSplit.interstate ? "IGST" : "CGST + SGST"}</Badge>
            </div>
            {lines.length === 0 ? (
              <EmptyState title="No cables in this draft" description="Add at least one cable to enable save and send." />
            ) : (
              <CostingBreakdown lines={lines} gstSplit={gstSplit} />
            )}
            <div className="flex justify-between border-t border-border pt-3 text-base font-semibold">
              <span>Total</span>
              <MoneyCell amount={totalInr} />
            </div>
            <p className="text-xs text-muted-foreground">
              Subtotal <MoneyCell amount={subtotalInr} /> · valid until <DateCell iso={validUntilIso()} />
            </p>
          </div>
        </Panel>

        <MaterialsPanel materials={materials} readOnly={readOnly} onSave={onSaveMaterial} onRefreshMcx={onRefreshMcx} />

        <Panel title="Approval gate" description="Low-margin quotes need owner approval before they go to the factory." icon={ShieldCheck} storageKey="adv-gates" defaultOpen={false}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Margin gate (≥ {MARGIN_GATE_PCT}%)</span>
            {marginGate ? <Badge tone="warning">Low margin</Badge> : <CheckCircle2 className="h-4 w-4 text-success" aria-label="Margin gate clear" />}
          </div>
        </Panel>
      </div>
    </div>
  );
}

// Props shared by both presentation modes (same data/services underneath).
interface BuilderShared {
  customers: Customer[];
  selectedCustomerId: string;
  customerName: string;
  selectedCustomer?: Customer;
  onSelectExistingCustomer: (customer: Customer) => void;
  onTypeCustomerName: (name: string) => void;
  openInquiryPicks: Array<{ inquiry: Inquiry; customer: Customer }>;
  onPickFromSalesBoard: (inquiry: Inquiry, customer: Customer) => void;
  hasCustomer: boolean;
  draft: LineDraft;
  setDraft: (next: LineDraft) => void;
  presets: CablePreset[];
  mcx: McxRates | null;
  materials: Material[];
  onSaveMaterial: (material: Material) => void;
  onRefreshMcx: () => void;
  lines: LineWithSpec[];
  addLine: (draft: LineDraft) => void;
  removeLine: (lineId: string) => void;
  editLine: (lineId: string) => void;
  readOnly: boolean;
  gstSplit: ReturnType<typeof computeGst>;
  subtotalInr: number;
  totalInr: number;
  marginGate: boolean;
  sendLabel: string;
  sendIcon: React.ReactNode;
  sendDisabled: boolean;
  gateReason: string | null;
  onSend: () => void;
  onSaveDraft: () => void;
  saving: boolean;
  sending: boolean;
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN CLIENT
// ══════════════════════════════════════════════════════════════════════════════
export function QuoteBuilderClient({ quoteId }: { quoteId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const role = useSessionStore((state) => state.role) as Role;
  const user = useSessionStore((state) => state.user);
  const actor = { id: user.id, name: user.name, role: user.role };

  const [mode, setMode] = useState<"guided" | "advanced">(() => {
    if (typeof window === "undefined") return "guided";
    const stored = window.localStorage.getItem(MODE_KEY);
    return stored === "advanced" ? "advanced" : "guided";
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [presets, setPresets] = useState<CablePreset[]>([]);
  const [savedQuotes, setSavedQuotes] = useState<Quote[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [mcx, setMcx] = useState<McxRates | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [draft, setDraft] = useState<LineDraft>(fallbackDraft);
  const [lines, setLines] = useState<LineWithSpec[]>([]);
  const [seq, setSeq] = useState(1);
  const [linkedInquiryId, setLinkedInquiryId] = useState<string | null>(searchParams.get("inquiryId"));
  const [feedback, setFeedback] = useState<{ tone: Tone; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  const readOnly = !can(role, "edit", "quote");
  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  const subtotalInr = useMemo(() => lines.reduce((sum, item) => sum + item.line.lineTotalInr, 0), [lines]);
  const gstSplit = useMemo(() => computeGst(subtotalInr, selectedCustomer?.stateCode), [subtotalInr, selectedCustomer]);
  const totalInr = subtotalInr + gstSplit.gstInr;

  const hasCustomer = Boolean(selectedCustomerId) || customerName.trim().length > 0;
  const marginGate = lines.some((item) => item.line.marginPct < MARGIN_GATE_PCT);
  const permissionCtx = { record: { marginReviewRequired: marginGate, amountInr: totalInr } };
  const needsMarginApproval = requiresApproval(role, "transition", "quote", permissionCtx);
  const needsApproval = needsMarginApproval;
  const canTransition = can(role, "transition", "quote", permissionCtx);

  const gateReason = needsMarginApproval
    ? `Your profit is below the company minimum (${MARGIN_GATE_PCT}%), so the owner needs to okay it first.`
    : null;

  // ── data load ────────────────────────────────────────────────────────────
  async function loadPage() {
    setLoading(true);
    setError(null);
    try {
      const [loadedCustomers, loadedInquiries, loadedPresets, loadedQuotes, loadedMaterials, rates] = await Promise.all([
        contactsService.list(),
        inquiriesService.list(),
        quotesService.listPresets(),
        quotesService.list(),
        materialsService.list(),
        integrationsService.fetchMcxRates(),
      ]);
      setCustomers(loadedCustomers);
      setInquiries(loadedInquiries);
      setPresets(loadedPresets);
      setSavedQuotes(loadedQuotes);
      setMaterials(loadedMaterials);
      setMcx(rates);

      const conductorRate = (material: ConductorMaterial) =>
        loadedMaterials.find((m) => m.category === "Conductor" && m.matchMaterial === material)?.ratePerKg;

      const nameForId = (customerId: string) =>
        loadedCustomers.find((c) => c.id === customerId)?.name ?? "";

      const existing = quoteId ? loadedQuotes.find((q) => q.id === quoteId) : undefined;
      const inquiryCustomerId = searchParams.get("customerId");
      if (existing) {
        const specs = await specsService.list();
        setSelectedCustomerId(existing.customerId);
        setCustomerName(nameForId(existing.customerId));
        setLinkedInquiryId(existing.inquiryId ?? null);
        setLines(
          existing.lines.map((line) => {
            const spec = specs.find((s) => s.id === line.specId) ?? specFromDraft(fallbackDraft, line.specId);
            const costing = computeLine({
              spec,
              lengthM: line.lengthM,
              marginPct: line.marginPct,
              rates: {
                ...ratesForSpec(spec, loadedMaterials),
                conductorPerKg: line.metalRatePerKg || conductorRate(spec.conductorMaterial) || 0,
                labourPerM: line.overheadPerM,
              },
            });
            return { line, spec, costing };
          }),
        );
      } else {
        // New quote: start blank so the user types a name, unless arriving from an inquiry.
        if (inquiryCustomerId) {
          setSelectedCustomerId(inquiryCustomerId);
          setCustomerName(nameForId(inquiryCustomerId));
        }
        setDraft((current) => ({ ...current, metalRatePerKg: conductorRate(current.conductorMaterial) ?? current.metalRatePerKg }));
      }
    } catch {
      setError("The local service layer failed while loading contacts, presets, and quotes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Defer so the synchronous setLoading(true) inside loadPage runs after commit,
    // not within the effect body (avoids cascading-render lint rule).
    const handle = window.setTimeout(() => void loadPage(), 0);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId]);

  function switchMode(next: "guided" | "advanced") {
    setMode(next);
    if (typeof window !== "undefined") window.localStorage.setItem(MODE_KEY, next);
  }

  // ── customer selection ─────────────────────────────────────────────────────
  function selectExistingCustomer(customer: Customer) {
    setSelectedCustomerId(customer.id);
    setCustomerName(customer.name);
  }

  function typeCustomerName(name: string) {
    setCustomerName(name);
    // Typing a name that exactly matches a customer re-links to it; otherwise it's a new name.
    const match = customers.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
    setSelectedCustomerId(match ? match.id : "");
  }

  /** Sales-board inquiries whose customer has no quote yet — quick-pick source. */
  const openInquiryPicks = useMemo(() => {
    const customerIdsWithQuote = new Set(savedQuotes.map((q) => q.customerId));
    return inquiries
      .filter((inq) => inq.stage !== "Won" && inq.stage !== "Lost")
      .filter((inq) => !inq.convertedOrderId && !customerIdsWithQuote.has(inq.customerId))
      .map((inq) => ({ inquiry: inq, customer: customers.find((c) => c.id === inq.customerId) }))
      .filter((row): row is { inquiry: Inquiry; customer: Customer } => Boolean(row.customer));
  }, [inquiries, savedQuotes, customers]);

  function pickFromSalesBoard(inquiry: Inquiry, customer: Customer) {
    selectExistingCustomer(customer);
    setLinkedInquiryId(inquiry.id);
    setFeedback({ tone: "info", message: `Linked Sales inquiry ${inquiry.id} for ${customer.name}.` });
  }

  // ── line ops ───────────────────────────────────────────────────────────────
  function addLine(source: LineDraft) {
    const built = lineFromDraft(source, seq, materials);
    setLines((current) => [...current, built]);
    setSeq((value) => value + 1);
    setFeedback({ tone: "success", message: `${built.spec.designation} added to the quote.` });
  }

  /** Recompute a stored line's costing against a given materials list. */
  function recostLine({ line, spec }: LineWithSpec, mats: Material[]): LineWithSpec {
    const rates = ratesForSpec(spec, mats);
    return {
      line,
      spec,
      costing: computeLine({
        spec,
        lengthM: line.lengthM,
        marginPct: line.marginPct,
        rates: { ...rates, conductorPerKg: line.metalRatePerKg || rates.conductorPerKg, labourPerM: line.overheadPerM },
      }),
    };
  }

  async function saveMaterial(material: Material) {
    const saved = await materialsService.upsert(material, actor);
    const exists = materials.some((m) => m.id === saved.id);
    const nextMaterials = exists ? materials.map((m) => (m.id === saved.id ? saved : m)) : [saved, ...materials];
    setMaterials(nextMaterials);
    setLines((current) => current.map((item) => recostLine(item, nextMaterials)));
  }

  async function refreshMcx() {
    const updated = await materialsService.refreshMcx(actor);
    setMaterials(updated);
    setLines((current) => current.map((item) => recostLine(item, updated)));
    setFeedback({ tone: "info", message: "MCX metal rates refreshed. Quotes now use the updated ₹/kg." });
  }

  function removeLine(lineId: string) {
    setLines((current) => current.filter((item) => item.line.id !== lineId));
    setFeedback({ tone: "info", message: "Cable removed from this draft." });
  }

  function editLine(lineId: string) {
    const target = lines.find((item) => item.line.id === lineId);
    if (!target) return;
    setDraft({
      standard: target.spec.standard as LineDraft["standard"],
      voltageGrade: target.spec.voltageGrade,
      cores: target.spec.cores,
      conductorMaterial: target.spec.conductorMaterial,
      conductorClass: target.spec.conductorClass,
      conductorSizeSqMm: target.spec.conductorSizeSqMm,
      neutralSizeSqMm: target.spec.neutralSizeSqMm ?? 120,
      insulation: target.spec.insulation,
      armour: target.spec.armour,
      sheath: target.spec.sheath,
      flameClass: target.spec.flameClass,
      screened: target.spec.screened ?? false,
      lengthM: target.line.lengthM,
      metalRatePerKg: target.line.metalRatePerKg,
      overheadPerM: target.line.overheadPerM,
      marginPct: target.line.marginPct,
    });
    removeLine(lineId);
  }

  /**
   * Resolve the customer id to store on the quote. If an existing customer is selected, use it.
   * If only a name was typed, create a lightweight customer record on the fly so the quote (and
   * the order chain) still references a real customer.
   */
  async function ensureCustomerId(): Promise<string> {
    if (selectedCustomerId) return selectedCustomerId;
    const name = customerName.trim();
    if (!name) throw new Error("No customer name");
    const created = await contactsService.create(
      {
        id: `CUS-NEW-${customers.length + 1}-${now().getTime()}`,
        name,
        segment: "Trader/Dealer",
        contactName: name,
        phone: "",
        email: "",
        billingAddress: "",
        city: "",
        state: "",
        pincode: "",
        gstin: "",
        stateCode: "", // unknown → treated as interstate (IGST) until completed in Contacts
        paymentTerms: "To be confirmed",
        creditLimitInr: 0,
        createdAt: now().toISOString(),
      },
      actor,
    );
    setCustomers((current) => [created, ...current]);
    setSelectedCustomerId(created.id);
    return created.id;
  }

  function buildQuoteRecord(status: QuoteStatus, customerId: string): Quote {
    return {
      id: quoteId ?? nextQuoteId(),
      inquiryId: linkedInquiryId ?? undefined,
      customerId,
      lines: lines.map((item) => item.line),
      subtotalInr,
      gstInr: gstSplit.gstInr,
      totalInr,
      status,
      validUntil: validUntilIso(),
      marginReviewRequired: marginGate,
      convertedOrderId: undefined,
      createdAt: now().toISOString(),
    };
  }

  /** Persist every line's spec so quote lines resolve by specId in the store. */
  async function persistSpecs() {
    await Promise.all(lines.map((item) => specsService.upsert(item.spec)));
  }

  async function saveDraft() {
    if (lines.length === 0 || !can(role, "create", "quote") || !hasCustomer) return;
    setSaving(true);
    try {
      const customerId = await ensureCustomerId();
      await persistSpecs();
      const saved = await quotesService.saveDraft(buildQuoteRecord("Draft", customerId), actor);
      setSavedQuotes((current) => [saved, ...current.filter((q) => q.id !== saved.id)]);
      setFeedback({ tone: "success", message: `${saved.id} saved as a draft. The factory has not started.` });
    } catch {
      setFeedback({ tone: "danger", message: "Could not save the draft. Nothing was changed." });
    } finally {
      setSaving(false);
    }
  }

  async function sendCurrent() {
    if (lines.length === 0) return;
    if (needsApproval) {
      // Persist as Review + raise approval via the service transaction (no order created).
      setSending(true);
      try {
        const customerId = await ensureCustomerId();
        await persistSpecs();
        const quote = await quotesService.saveDraft(buildQuoteRecord("Review", customerId), actor);
        await quotesService.sendToOrderBoard(quote.id, actor); // service raises the ApprovalRequest
        setSavedQuotes((current) => [{ ...quote, status: "Review" }, ...current.filter((q) => q.id !== quote.id)]);
        setFeedback({
          tone: "warning",
          message: `Owner approval requested for ${quote.id}. ${gateReason ?? ""} No order was created yet.`,
        });
      } catch {
        setFeedback({ tone: "danger", message: "Could not raise the approval request." });
      } finally {
        setSending(false);
      }
      return;
    }

    if (!canTransition) {
      setFeedback({ tone: "danger", message: "Your role cannot send quotes to the order board." });
      return;
    }

    setSending(true);
    try {
      const customerId = await ensureCustomerId();
      await persistSpecs();
      const quote = await quotesService.saveDraft(buildQuoteRecord("Approved", customerId), actor);
      const result = await quotesService.sendToOrderBoard(quote.id, actor);
      const order = "order" in result ? result.order : undefined;
      setFeedback({
        tone: "success",
        message: order
          ? `${quote.id} sent to the factory as ${order.id}. Dispatch, draft invoice, and job card were created.`
          : `${quote.id} sent for approval.`,
      });
      router.push(can(role, "view", "order") ? "/orders" : "/dashboard");
    } catch {
      setFeedback({ tone: "danger", message: "Send failed. The quote was not converted." });
    } finally {
      setSending(false);
    }
  }

  async function sendSaved(quote: Quote) {
    setSending(true);
    try {
      const result = await quotesService.sendToOrderBoard(quote.id, actor);
      const updated = await quotesService.list();
      setSavedQuotes(updated);
      const order = "order" in result ? result.order : undefined;
      setFeedback({
        tone: order ? "success" : "warning",
        message: order ? `${quote.id} sent to the factory as ${order.id}.` : `${quote.id} needs owner approval first.`,
      });
    } catch {
      setFeedback({ tone: "danger", message: `Could not send ${quote.id}.` });
    } finally {
      setSending(false);
    }
  }

  if (loading) return <main className="min-h-screen bg-background p-6"><LoadingState /></main>;
  if (error) return <main className="min-h-screen bg-background p-6"><ErrorState message={error} onRetry={() => void loadPage()} /></main>;

  const sendLabel = needsApproval ? "Ask owner to approve" : "Approve & send to factory";
  const sendIcon = needsApproval ? <ShieldCheck className="h-4 w-4" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />;
  const sendDisabled = readOnly || sending || !hasCustomer || (!canTransition && !needsApproval);

  const shared: BuilderShared = {
    customers,
    selectedCustomerId,
    customerName,
    selectedCustomer,
    onSelectExistingCustomer: selectExistingCustomer,
    onTypeCustomerName: typeCustomerName,
    openInquiryPicks,
    onPickFromSalesBoard: pickFromSalesBoard,
    hasCustomer,
    draft,
    setDraft,
    presets,
    mcx,
    materials,
    onSaveMaterial: (material) => void saveMaterial(material),
    onRefreshMcx: () => void refreshMcx(),
    lines,
    addLine,
    removeLine,
    editLine,
    readOnly,
    gstSplit,
    subtotalInr,
    totalInr,
    marginGate,
    sendLabel,
    sendIcon,
    sendDisabled,
    gateReason,
    onSend: () => void sendCurrent(),
    onSaveDraft: () => void saveDraft(),
    saving,
    sending,
  };

  const feedbackToneClass: Record<Tone, string> = {
    success: "border-success bg-success/10",
    warning: "border-warning bg-warning/10",
    danger: "border-danger bg-danger/10",
    info: "border-info bg-info/10",
    neutral: "border-border bg-muted",
    highlight: "border-highlight bg-highlight/10",
  };

  return (
    <main className="min-h-screen bg-background p-4 text-foreground sm:p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{quoteId ?? "New quote"}</span>
              <span className="font-mono text-xs text-muted-foreground">Role {role}</span>
              {readOnly ? (
                <Badge tone="neutral">
                  <Eye className="mr-1 h-3 w-3" aria-hidden="true" /> View only
                </Badge>
              ) : null}
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">Quote Builder</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Build a cable quote from common presets, see the price update live, and send approved work into the order chain.
              </p>
            </div>
          </div>
          <div className="inline-flex rounded-md border border-border p-1">
            <button
              type="button"
              onClick={() => switchMode("guided")}
              className={cn("inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-medium", mode === "guided" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
            >
              <Wand2 className="h-4 w-4" aria-hidden="true" /> Guided
            </button>
            <button
              type="button"
              onClick={() => switchMode("advanced")}
              className={cn("inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-medium", mode === "advanced" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
            >
              <LayoutGrid className="h-4 w-4" aria-hidden="true" /> Advanced
            </button>
          </div>
        </header>

        {linkedInquiryId ? (
          <div className="flex flex-col gap-3 rounded-lg border border-info bg-info/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Users className="mt-1 h-4 w-4 text-info" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-foreground">From Sales inquiry <span className="font-mono">{linkedInquiryId}</span></p>
                <p className="text-sm text-muted-foreground">Converting this quote will mark the inquiry Won.</p>
              </div>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setLinkedInquiryId(null)}>
              <Link2Off className="mr-2 h-4 w-4" aria-hidden="true" /> Clear link
            </Button>
          </div>
        ) : null}

        {feedback ? (
          <div className={cn("rounded-lg border p-4 text-sm text-foreground", feedbackToneClass[feedback.tone])} role="status">
            {feedback.message}
          </div>
        ) : null}

        {mode === "guided" ? <GuidedWizard {...shared} /> : <AdvancedLayout {...shared} />}

        <Panel title="Saved quotes" description="Saved and locked quotes can be sent to the order board from here." icon={FileText} storageKey="saved-quotes" defaultOpen={false}>
          {savedQuotes.length === 0 ? (
            <EmptyState icon={FileText} title="No saved quotes" description="Drafts and locked quotes appear here after saving." />
          ) : (
            <div className="portal-table-wrap rounded-md border border-border">
              <table className="portal-table border-collapse text-left text-sm">
                <thead className="bg-muted text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2 font-medium lg:p-3">Quote</th>
                    <th className="p-2 font-medium lg:p-3">Customer</th>
                    <th className="p-2 font-medium lg:p-3">Lines</th>
                    <th className="p-2 font-medium lg:p-3">Status</th>
                    <th className="p-2 font-medium lg:p-3">Total</th>
                    <th className="p-2 font-medium lg:p-3">Valid until</th>
                    <th className="p-2 font-medium lg:p-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {savedQuotes.map((quote) => {
                    const customer = customers.find((c) => c.id === quote.customerId);
                    return (
                      <tr key={quote.id} className="border-t border-border">
                        <td className="p-2 font-mono text-xs lg:p-3">{quote.id}</td>
                        <td className="p-2 lg:p-3">{customer?.name ?? quote.customerId}</td>
                        <td className="p-2 font-mono lg:p-3">{quote.lines.length}</td>
                        <td className="p-2 lg:p-3"><StatusBadge status={quote.status} /></td>
                        <td className="p-2 lg:p-3"><MoneyCell amount={quote.totalInr} /></td>
                        <td className="p-2 lg:p-3"><DateCell iso={quote.validUntil} /></td>
                        <td className="p-2 lg:p-3">
                          {quote.convertedOrderId ? (
                            <span className="font-mono text-xs text-muted-foreground">On board {quote.convertedOrderId}</span>
                          ) : (
                            <Button type="button" variant="secondary" size="sm" disabled={readOnly || sending} onClick={() => void sendSaved(quote)}>
                              <ArrowRight className="mr-2 h-4 w-4" aria-hidden="true" /> Send
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </main>
  );
}
