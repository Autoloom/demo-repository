"use client";

import { ArrowLeft, ArrowRight, ChevronDown, FileText, Info, Loader2, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { Button, Input, Label } from "@/components/ui";
import { computeGst, MARGIN_GATE_PCT, type CostingResult } from "@/lib/domain/costing";
import { formatDate, formatINR } from "@/lib/domain/format";
import type {
  ArmourType,
  CableSpec,
  CableStandard,
  ConductorClass,
  ConductorMaterial,
  CoreConfig,
  Customer,
  FlameClass,
  Inquiry,
  Insulation,
  Material,
  QuoteLine,
  SheathType,
  VoltageGrade,
} from "@/lib/services/types";
import type { CablePreset } from "@/lib/seed/cable-presets";
import { cn } from "@/lib/utils";

export interface LineDraft {
  standard: CableStandard;
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

export interface LineWithSpec {
  line: QuoteLine;
  spec: CableSpec;
  costing: CostingResult;
}

export interface McxRates {
  aluminium: number;
  copper: number;
  at: string;
}

export interface BuilderShared {
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
  sendIcon: ReactNode;
  sendDisabled: boolean;
  gateReason: string | null;
  onSend: () => void;
  onSaveDraft: () => void;
  saving: boolean;
  sending: boolean;
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function SelectField<T extends string>({
  id,
  label,
  value,
  options,
  disabled,
  big,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  options: readonly T[];
  disabled?: boolean;
  big?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <Field id={id} label={label}>
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
  min,
  disabled,
  big,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min?: number;
  disabled?: boolean;
  big?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <Field id={id} label={label}>
      <Input
        id={id}
        type="number"
        value={Number.isNaN(value) ? "" : value}
        min={min}
        disabled={disabled}
        className={big ? "h-11 text-base" : undefined}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </Field>
  );
}

function CustomerInput({
  id,
  customers,
  value,
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
  const matches = query ? customers.filter((customer) => customer.name.toLowerCase().includes(query)) : customers;
  const exactMatch = customers.find((customer) => customer.name.toLowerCase() === query);
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
                Press Enter / keep typing to quote <span className="font-medium text-foreground">“{value.trim()}”</span> as a new customer.
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Field>
  );
}

function WizardProgress({ step }: { step: number }) {
  return (
    <div className="space-y-2">
      <p className="font-mono text-xs text-muted-foreground">Step {step + 1} of 4</p>
      <div className="flex gap-1.5" aria-hidden="true">
        {[0, 1, 2, 3].map((index) => (
          <span key={index} className={cn("h-1.5 flex-1 rounded-full", index <= step ? "bg-primary" : "bg-muted")} />
        ))}
      </div>
    </div>
  );
}

function MoneyCell({ amount }: { amount: number }) {
  return <span className="font-mono tabular-nums">{formatINR(amount)}</span>;
}

function DateCell({ iso }: { iso: string }) {
  return <span className="font-mono">{formatDate(iso)}</span>;
}

function CableSpecSummary({ spec }: { spec: CableSpec }) {
  return (
    <div className="space-y-1">
      <p className="font-mono text-xs text-muted-foreground">{spec.cableCode}</p>
      <p className="text-sm font-medium text-foreground">{spec.designation}</p>
    </div>
  );
}

function CostingBreakdown({ lines, gstSplit }: { lines: LineWithSpec[]; gstSplit: ReturnType<typeof computeGst> }) {
  const subtotal = lines.reduce((sum, item) => sum + item.line.lineTotalInr, 0);
  return (
    <div className="space-y-4 rounded-md border border-border bg-muted p-4 text-sm">
      {lines.map(({ line, spec }) => (
        <div key={line.id} className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
          <CableSpecSummary spec={spec} />
          <div className="text-right">
            <div className="font-mono">{formatINR(line.lineTotalInr)}</div>
            <div className="text-xs text-muted-foreground">{line.lengthM} m · {line.marginPct}%</div>
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
        <span className="text-muted-foreground">Subtotal</span>
        <span className="font-mono">{formatINR(subtotal)}</span>
      </div>
      {gstSplit.interstate ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">IGST 18%</span>
          <span className="font-mono">{formatINR(gstSplit.gstInr)}</span>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">CGST 9%</span>
            <span className="font-mono">{formatINR(gstSplit.cgstInr ?? 0)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">SGST 9%</span>
            <span className="font-mono">{formatINR(gstSplit.sgstInr ?? 0)}</span>
          </div>
        </>
      )}
    </div>
  );
}

function SpecForm({ draft, mcx, readOnly, big, onChange }: { draft: LineDraft; mcx: McxRates | null; readOnly: boolean; big?: boolean; onChange: (next: LineDraft) => void }) {
  const standards = ["IS 7098-1", "IS 7098-2", "IS 1554-1", "IS 694", "IEC 60502-1", "IEC 60502-2"] as const;
  const voltages = ["650/1100 V (1.1 kV)", "1.9/3.3 kV", "3.8/6.6 kV", "6.35/11 kV", "12.7/22 kV", "19/33 kV"] as const;
  const cores = ["1C", "2C", "3C", "3.5C", "4C", "5C"] as const;
  const classes = ["Class 1 (solid)", "Class 2 (stranded)", "Class 2 compacted", "Class 5 (flexible)"] as const;
  const insulations = ["XLPE", "PVC (Type A)", "PVC (Type C)", "EPR", "XLPO (solar/UV)"] as const;
  const armours = ["Unarmoured", "GI round wire (GSW)", "GI strip (GSS)", "Aluminium wire (AWA)", "Aluminium strip"] as const;
  const sheaths = ["PVC (ST1)", "PVC (ST2)", "FR PVC", "FRLS PVC", "Zero-halogen (ZHFR/LSZH)", "HDPE"] as const;
  const flameClasses = ["FR", "FRLS", "LSZH", "Standard"] as const;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <SelectField id="standard" label="Standard" value={draft.standard} options={standards} disabled={readOnly} big={big} onChange={(value) => onChange({ ...draft, standard: value })} />
      <SelectField id="voltage" label="Voltage grade" value={draft.voltageGrade} options={voltages} disabled={readOnly} big={big} onChange={(value) => onChange({ ...draft, voltageGrade: value })} />
      <SelectField id="cores" label="Cores" value={draft.cores} options={cores} disabled={readOnly} big={big} onChange={(value) => onChange({ ...draft, cores: value })} />
      <SelectField id="conductor-material" label="Conductor material" value={draft.conductorMaterial} options={["Aluminium", "Copper"] as const} disabled={readOnly} big={big} onChange={(value) => onChange({ ...draft, conductorMaterial: value })} />
      <SelectField id="conductor-class" label="Conductor class" value={draft.conductorClass} options={classes} disabled={readOnly} big={big} onChange={(value) => onChange({ ...draft, conductorClass: value })} />
      <NumberField id="length" label="Length (m)" value={draft.lengthM} min={1} disabled={readOnly} big={big} onChange={(value) => onChange({ ...draft, lengthM: value })} />
      <NumberField id="metal-rate" label="Metal rate (₹/kg)" value={draft.metalRatePerKg} min={0} disabled={readOnly} big={big} onChange={(value) => onChange({ ...draft, metalRatePerKg: value })} />
      <NumberField id="overhead" label="Overhead (₹/m)" value={draft.overheadPerM} min={0} disabled={readOnly} big={big} onChange={(value) => onChange({ ...draft, overheadPerM: value })} />
      <NumberField id="margin" label="Margin (%)" value={draft.marginPct} min={0} disabled={readOnly} big={big} onChange={(value) => onChange({ ...draft, marginPct: value })} />
      <SelectField id="insulation" label="Insulation" value={draft.insulation} options={insulations} disabled={readOnly} big={big} onChange={(value) => onChange({ ...draft, insulation: value })} />
      <SelectField id="armour" label="Armour" value={draft.armour} options={armours} disabled={readOnly} big={big} onChange={(value) => onChange({ ...draft, armour: value })} />
      <SelectField id="sheath" label="Sheath" value={draft.sheath} options={sheaths} disabled={readOnly} big={big} onChange={(value) => onChange({ ...draft, sheath: value })} />
      <SelectField id="flame-class" label="Flame class" value={draft.flameClass} options={flameClasses} disabled={readOnly} big={big} onChange={(value) => onChange({ ...draft, flameClass: value })} />
      <div className="md:col-span-2">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={draft.screened} disabled={readOnly} onChange={(event) => onChange({ ...draft, screened: event.target.checked })} />
          Screened
        </label>
      </div>
      {mcx ? <p className="md:col-span-2 text-xs text-muted-foreground">Live MCX: aluminium ₹{mcx.aluminium}/kg · copper ₹{mcx.copper}/kg as of {mcx.at}</p> : null}
    </div>
  );
}

export function GuidedWizard(props: BuilderShared) {
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
  const validUntil = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date.toISOString().slice(0, 10);
  }, []);
  const canGoNext = step === 0 ? hasCustomer : step === 1 ? lines.length > 0 : true;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      <WizardProgress step={step} />
      {step === 0 ? (
        <div className="space-y-6">
          <CustomerInput id="wizard-customer" customers={customers} value={customerName} selectedCustomerId={selectedCustomerId} disabled={readOnly} big onSelectExisting={onSelectExistingCustomer} onTypeNew={onTypeCustomerName} />
          {selectedCustomer ? (
            <div className="rounded-md border border-border bg-muted p-4 text-sm">
              <p className="font-medium text-foreground">{selectedCustomer.name}</p>
              <p className="text-muted-foreground">{selectedCustomer.city}, {selectedCustomer.state}</p>
            </div>
          ) : customerName.trim() ? (
            <p className="text-sm text-muted-foreground">New customer “{customerName.trim()}” will be created when you save or send.</p>
          ) : null}
          {openInquiryPicks.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Or pick from the Sales board</p>
              {openInquiryPicks.map(({ inquiry, customer }) => (
                <button key={inquiry.id} type="button" disabled={readOnly} onClick={() => onPickFromSalesBoard(inquiry, customer)} className="flex w-full items-start justify-between rounded-md border border-border bg-card p-3 text-left text-sm hover:bg-muted disabled:opacity-50">
                  <span>{customer.name}</span>
                  <span className="text-muted-foreground">{inquiry.requirement}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 1 ? (
        <div className="space-y-6">
          <div>
            <p className="text-sm font-medium text-foreground">Pick a cable you usually sell</p>
            <p className="text-sm text-muted-foreground">Choose a preset or tweak the spec for a custom run.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {presets.map((preset) => (
                <button key={preset.id} type="button" disabled={readOnly} onClick={() => setDraft({ ...draft, conductorMaterial: preset.spec.conductorMaterial, conductorSizeSqMm: preset.spec.conductorSizeSqMm, cores: preset.spec.cores, insulation: preset.spec.insulation, armour: preset.spec.armour, metalRatePerKg: draft.metalRatePerKg || 200, overheadPerM: draft.overheadPerM || 700, marginPct: draft.marginPct || 14 })} className="rounded-md border border-border bg-card p-4 text-left hover:bg-muted disabled:opacity-50">
                  <p className="text-sm font-medium text-foreground">{preset.displayName}</p>
                  {preset.description ? <p className="mt-1 text-xs text-muted-foreground">{preset.description}</p> : null}
                </button>
              ))}
            </div>
          </div>

          <button type="button" onClick={() => setEditingPreset((value) => !value)} aria-expanded={editingPreset} className="flex items-center gap-2 text-sm font-medium text-primary">
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Need to change something?
          </button>

          {editingPreset ? (
            <div className="space-y-6 rounded-md border border-border p-4">
              <SpecForm draft={draft} mcx={mcx} readOnly={readOnly} big onChange={setDraft} />
              {draft.marginPct < MARGIN_GATE_PCT ? (
                <p className="flex items-center gap-2 text-xs font-medium text-warning">
                  <Info className="h-3.5 w-3.5" aria-hidden="true" />
                  A profit below {MARGIN_GATE_PCT}% needs the owner to approve before it can go to the factory.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button type="button" disabled={readOnly || draft.lengthM <= 0} onClick={() => addLine(draft)}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Add this cable
            </Button>
            {lines.length > 0 ? <span className="rounded-sm bg-success/10 px-2 py-1 text-xs font-medium text-success">{lines.length} cable{lines.length > 1 ? "s" : ""} added</span> : null}
          </div>

          {lines.length > 0 ? (
            <div className="space-y-3">
              {lines.map(({ line, spec }) => (
                <div key={line.id} className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
                  <CableSpecSummary spec={spec} />
                  <div className="flex shrink-0 items-center gap-2">
                    <MoneyCell amount={line.lineTotalInr} />
                    <Button type="button" variant="ghost" size="sm" disabled={readOnly} onClick={() => editLine(line.id)}>
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" disabled={readOnly} onClick={() => removeLine(line.id)}>
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
            <p className="mt-2 text-xs text-muted-foreground">{gstSplit.interstate ? "IGST" : "CGST + SGST"} · valid until <DateCell iso={validUntil} /></p>
          </div>
          <button type="button" onClick={() => setShowBreakdown((value) => !value)} aria-expanded={showBreakdown} className="flex items-center gap-2 text-sm font-medium text-primary">
            <ChevronDown className={cn("h-4 w-4 transition-transform", showBreakdown && "rotate-180")} aria-hidden="true" />
            Show me how this was worked out
          </button>
          {showBreakdown ? <CostingBreakdown lines={lines} gstSplit={gstSplit} /> : null}
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
            <button type="button" disabled={readOnly || saving || lines.length === 0} onClick={onSaveDraft} className="rounded-lg border border-border bg-card p-5 text-left transition-colors hover:bg-muted disabled:opacity-50">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileText className="h-4 w-4" aria-hidden="true" />}
                Save for later
              </div>
              <p className="mt-2 text-sm text-muted-foreground">Keeps it; doesn&apos;t start the factory.</p>
            </button>
            <button type="button" disabled={sendDisabled || lines.length === 0} onClick={onSend} className="rounded-lg border border-primary bg-primary/10 p-5 text-left transition-colors hover:bg-primary/20 disabled:opacity-50">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : sendIcon}
                {sendLabel}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{gateReason ? "The owner will review it before anything starts." : "Locks the price and starts production, dispatch, and the invoice."}</p>
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button type="button" variant="ghost" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}>
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
          Back
        </Button>
        {step < 3 ? (
          <Button type="button" disabled={!canGoNext} onClick={() => setStep((value) => Math.min(3, value + 1))}>
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
