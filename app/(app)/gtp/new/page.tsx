"use client";

/**
 * GTP Builder — the five-moment flow (PRD §5.1 / design-doc §3), wired to the tested engine
 * (parseSizeString → deriveFields → validateGtp). One page, progressive disclosure, no wizard
 * step-counters. Plain language for the user; jargon only in the field table / eventual PDF.
 *
 * This is the engine-backed builder. It lives at /gtp/new so the prior /gtp page stays intact
 * until we consolidate.
 */
import {
  ArrowRight,  CheckCircle2,
  ChevronDown,
  CircleAlert,
  FileText,
  LayoutTemplate,
  Link as LinkIcon,
  Lock,
  Save,
  Users,
  X,
  Eye,
  EyeOff,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buildSizeString,
  constructionFromSelection,
  CORE_COUNT_OPTIONS,
  defaultSelection,
  describeSelection,
  MESSENGER_SIZE_OPTIONS,
  pairedMessengerFor,
  PHASE_SIZE_OPTIONS,
  selectionFromSizeString,
  STREET_LIGHT_SIZE_OPTIONS,
  type SizeSelection,
} from "@/lib/domain/gtp/compose-size";
import { deriveFields } from "@/lib/domain/gtp/derive";
import { deriveLtFields } from "@/lib/domain/gtp/derive-lt-fields";
import { CHAIN_INPUT_FIELD_KEYS, DEFAULT_HIDDEN_FIELD_KEYS, chainInputOverrideMessage } from "@/lib/domain/gtp/types";
import { specFromAbConstruction, specFromSolarConstruction } from "@/lib/domain/gtp/spec-from-construction";
import { deriveSolarMass, isMassGap } from "@/lib/domain/gtp/mass";
import { conductorClassFor, solarDimensions } from "@/lib/domain/standards/is17293-2020";
import { deriveSolarFields } from "@/lib/domain/gtp/derive-solar-fields";
import { appendAuditEntry, reassignAuditEntries } from "@/lib/domain/gtp/audit-log";
import { buildGtpPdfDocument, sectionSourceFor } from "@/lib/domain/gtp/pdf-document";
import { CABLE_TYPES } from "@/lib/domain/gtp/cable-types";
import { CUSTOMER_PROFILES, findProfile, type CustomerProfile } from "@/lib/domain/gtp/profiles";
import {
  customParameterKey,
  loadTemplates,
  recordTemplateUse,
  saveTemplate,
  templatesForProfile,
  type CustomParameter,
  type GtpTemplate,
} from "@/lib/domain/gtp/templates";
import type { ConductorMaterialCode } from "@/lib/domain/standards/is8130-2013";
import { IS1554_1_SIZES } from "@/lib/domain/standards/is1554-1-1988";
import { IS7098_1_SIZES } from "@/lib/domain/standards/is7098-1-2025";
import { IS17293_CLASS2_SIZES, IS17293_CLASS5_SIZES } from "@/lib/domain/standards/is17293-2020";
import { specFromFields } from "@/lib/domain/gtp/spec-from-fields";
import { deriveLtCable, type LtCableConfig } from "@/lib/domain/gtp/derive-lt";
import { manualTolerance } from "@/lib/domain/gtp/tolerance";
import { TOLERANCE_NA } from "@/lib/domain/gtp/types";
import type { ProductLine, ResolvedField } from "@/lib/domain/gtp/types";
import { validateGtp } from "@/lib/domain/gtp/validate";
import { downloadPdf } from "@/lib/domain/pdf";
import { gtpService, specsService, type Gtp } from "@/lib/services";
import { actorFromSession } from "@/lib/store/session";
import { cn } from "@/lib/utils";

const TAG_TONE: Record<ResolvedField["tag"], string> = {
  LOOKUP: "bg-info/10 text-info border-info/30",
  CALC: "bg-highlight/10 text-highlight border-highlight/30",
  CHOICE: "bg-primary/10 text-primary border-primary/30",
  QUIRK: "bg-warning/10 text-warning border-warning/30",
  FIXED: "bg-muted text-muted-foreground border-border",
  // Warning-toned on purpose: a hand-entered value carries no standards backing, and should
  // not sit visually alongside values the engine can defend.
  MANUAL: "bg-warning/10 text-warning border-warning/30",
};

/**
 * The CHOICE answers still asked of the operator. Supplier fields are deliberately absent
 * (build-plan-v2 D8) — see the note in Moment 3.
 */
interface Choices {
  curing: string;
  drumLength: string;
}

/**
 * Order-specific quantities. Distinct from the cable's construction: the same cable can be sold
 * in any quantity, on any drum length, against any PO. These feed the drum-vs-quantity validation
 * — a real-world failure the corpus notes as "someone was burned by that".
 */
interface OrderDetails {
  totalLengthM: number;
  drumLengthM: number;
  poReference: string;
}

/** Core counts LT power and control are built in. 3.5 = three cores plus a reduced neutral. */
const LT_CORE_OPTIONS = [1, 2, 3, 3.5, 4, 5] as const;

/** IS 17293 Table 8 ambients. Not a free number — the standard tabulates these eight. */
const SOLAR_AMBIENT_OPTIONS = [0, 10, 20, 30, 40, 50, 60, 70] as const;

const DEFAULT_ORDER_DETAILS: OrderDetails = { totalLengthM: 1000, drumLengthM: 1000, poReference: "" };

/** Drums needed to ship the ordered length — whole drums, so the last one may be partial. */
function drumCount(details: OrderDetails): number {
  if (details.drumLengthM <= 0) return 0;
  return Math.ceil(details.totalLengthM / details.drumLengthM);
}

/**
 * Human label for a cable type, from the registry rather than a hardcoded string.
 *
 * The record used to hardcode "LT Aerial Bunched, XLPE" for every type, so an LT power or solar
 * GTP was filed on the board as AB cable.
 */
function activeCableTypeLabel(id: ProductLine): string {
  return CABLE_TYPES.find((t) => t.id === id)?.label ?? id;
}

/** DOM id for a field's row, so validation issues can link straight to it. */
function fieldRowId(key: string): string {
  return `field-${key.replace(/\./g, "-")}`;
}

/** Stable empty array so the SSR snapshot never changes identity between renders. */
const EMPTY_TEMPLATES: GtpTemplate[] = [];

/** Templates only change via this page's own actions, so no external subscription is needed. */
function subscribeToTemplates(): () => void {
  return () => {};
}

/** Cached snapshot — useSyncExternalStore requires referential stability between versions. */
let templatesCache: { version: number; value: GtpTemplate[] } | null = null;
function getTemplatesSnapshot(version: number): GtpTemplate[] {
  if (!templatesCache || templatesCache.version !== version) {
    templatesCache = { version, value: loadTemplates() };
  }
  return templatesCache.value;
}

/** A fixed symbol printed between the size pickers (the "C x" and "+" the user never types). */
function Symbol({ children }: { children: React.ReactNode }) {
  return (
    <span aria-hidden="true" className="pb-2 text-base font-medium text-muted-foreground">
      {children}
    </span>
  );
}

/** One part of the cable designation. Closed set — an unsupported size can't be expressed. */
function SizePicker({
  id,
  label,
  value,
  options,
  allowNone,
  format,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  options: readonly number[];
  /** Adds a "None" option (value 0) — used by the optional street-light core. */
  allowNone?: boolean;
  /** Display override, e.g. 3.5 → "3½". The VALUE stays numeric. */
  format?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 min-w-20 rounded-md border border-input bg-background px-3 text-center font-mono text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {allowNone ? <option value={0}>None</option> : null}
        {options.map((o) => (
          <option key={o} value={o}>
            {format ? format(o) : o}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Conductor material control.
 *
 * Deliberately renders in two different SHAPES rather than one control with a disabled state:
 *
 *  • Where the standard fixes the material (AB cable — IS 14255 is an aluminium-conductor
 *    specification throughout), it renders as a read-only fact with its citation. A greyed-out
 *    dropdown would imply a choice exists and is merely unavailable, which is the wrong idea:
 *    there is nothing to unlock here. `read-only-distinction` — read-only is not disabled.
 *
 *  • Where both are genuinely offered (LT power, control), it renders as a real picker. The
 *    minimum wire count and resistance both change with the choice, so this is a live input.
 */
function MaterialControl({
  value,
  fixedBy,
  onChange,
}: {
  value: ConductorMaterialCode;
  /** Citation for why the material is fixed. Presence of this switches the control to read-only. */
  fixedBy?: string;
  onChange?: (value: ConductorMaterialCode) => void;
}) {
  const labels: Record<ConductorMaterialCode, string> = { AL: "Aluminium", CU: "Copper" };

  if (fixedBy) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Conductor</span>
        <div className="flex h-11 items-center gap-2 rounded-md border border-dashed border-border bg-muted/60 px-3">
          <Lock aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="text-base">{labels[value]}</span>
        </div>
        <span className="text-[11px] text-muted-foreground">Set by {fixedBy}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor="conductor-material" className="text-xs text-muted-foreground">
        Conductor
      </Label>
      <select
        id="conductor-material"
        value={value}
        onChange={(e) => onChange?.(e.target.value as ConductorMaterialCode)}
        className="h-11 rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="CU">Copper</option>
        <option value="AL">Aluminium</option>
      </select>
    </div>
  );
}

/**
 * A field's value cell.
 *
 * CHOICE/QUIRK fields are editable directly. LOOKUP/CALC fields are locked and need two
 * deliberate actions plus a written reason before they can be changed — overriding a standards
 * value should be rare and always leave a trace (design-doc §3.4, "two-speed friction").
 */
function FieldValueCell({
  field,
  override,
  unlocked,
  reason,
  onEdit,
  onRequestUnlock,
  onReasonChange,
  onReasonCommit,
  onRevert,
}: {
  field: ResolvedField;
  override: string | undefined;
  unlocked: boolean;
  reason: string;
  onEdit: (value: string) => void;
  onRequestUnlock: () => void;
  onReasonChange: (reason: string) => void;
  /** Fired on blur — the point at which the change is worth recording in the audit trail. */
  onReasonCommit?: () => void;
  onRevert: () => void;
}) {
  const isOverridden = override !== undefined;
  const canEditNow = field.editable || unlocked;

  if (!canEditNow) {
    return (
      <div className="flex items-center gap-2">
        <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="font-mono">{String(field.value)}</span>
        <button
          type="button"
          onClick={onRequestUnlock}
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Input
          value={override ?? String(field.value)}
          onChange={(e) => onEdit(e.target.value)}
          className="h-9 max-w-56 font-mono text-sm"
          aria-label={`${field.label} value`}
        />
        {isOverridden ? (
          <button
            type="button"
            onClick={onRevert}
            className="shrink-0 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Undo
          </button>
        ) : null}
      </div>
      {/* A locked field that's been unlocked must say why it was changed. */}
      {!field.editable ? (
        <div>
          <Input
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            onBlur={() => onReasonCommit?.()}
            placeholder="Why are you changing this? (required)"
            className={cn("h-8 max-w-72 text-xs", isOverridden && !reason.trim() && "border-danger")}
            aria-label={`Reason for changing ${field.label}`}
          />
          {isOverridden && !reason.trim() ? (
            <p className="mt-1 text-xs text-danger">A reason is required to override a standards value.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The tolerance cell.
 *
 * Structurally a sibling of FieldValueCell rather than a mode of it: the two columns gate edits
 * on different questions, and folding both into one component would make the branching
 * unreadable.
 *
 * The gate here is not `editable` but where the tolerance came from:
 *   • no tolerance at all — most rows. The standards specify none, so there is nothing to
 *     contradict; the operator types freely and it is marked manual. Demanding "why are you
 *     changing this?" for a cell that was empty would be a nonsense prompt.
 *   • an `is-rule` floor — a published acceptance limit. Overwriting it is exactly as serious as
 *     overwriting a standards value, so it keeps the lock and the mandatory reason.
 *   • a works estimate or a customer band — ours or the buyer's to adjust, no reason required.
 */
function FieldToleranceCell({
  field,
  override,
  unlocked,
  reason,
  onEdit,
  onRequestUnlock,
  onReasonChange,
  onReasonCommit,
  onRevert,
}: {
  field: ResolvedField;
  override: string | undefined;
  unlocked: boolean;
  reason: string;
  onEdit: (value: string) => void;
  onRequestUnlock: () => void;
  onReasonChange: (reason: string) => void;
  onReasonCommit?: () => void;
  onRevert: () => void;
}) {
  const isOverridden = override !== undefined;
  // Read the ORIGINAL origin: once overridden, `origin` is "manual" and would unlock itself.
  const derivedOrigin = field.tolerance?.override?.previousOrigin ?? field.tolerance?.origin;
  const isStandardsFloor = derivedOrigin === "is-rule";
  const canEditNow = !isStandardsFloor || unlocked;

  if (!canEditNow) {
    return (
      <div className="flex items-center gap-2">
        <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="font-mono text-sm">{field.tolerance?.value}</span>
        <button
          type="button"
          onClick={onRequestUnlock}
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Input
          value={override ?? field.tolerance?.value ?? ""}
          onChange={(e) => onEdit(e.target.value)}
          onBlur={() => onReasonCommit?.()}
          // Tolerance is a mandatory input, so an empty box is an unfinished one. The placeholder
          // names the two shapes a valid answer takes rather than suggesting blank is acceptable.
          placeholder="e.g. ±5% or N/A"
          className={cn(
            "h-9 max-w-40 font-mono text-sm",
            // Only flag a box the operator actually emptied — an untouched derived value is fine.
            isOverridden && !(override ?? "").trim() && "border-danger",
          )}
          aria-label={`${field.label} tolerance`}
        />
        {/* One click for the common answer, so "no tolerance here" doesn't cost eight keystrokes
            on the majority of rows. */}
        {(override ?? field.tolerance?.value) !== TOLERANCE_NA ? (
          <button
            type="button"
            onClick={() => onEdit(TOLERANCE_NA)}
            className="shrink-0 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            N/A
          </button>
        ) : null}
        {isOverridden ? (
          <button
            type="button"
            onClick={onRevert}
            className="shrink-0 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Undo
          </button>
        ) : null}
      </div>
      {isOverridden && !(override ?? "").trim() ? (
        <p className="text-xs text-danger">
          A tolerance is required. Enter a value or mark it N/A.
        </p>
      ) : null}
      {isStandardsFloor ? (
        <div>
          <Input
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            onBlur={() => onReasonCommit?.()}
            placeholder="Why are you changing this? (required)"
            className={cn("h-8 max-w-72 text-xs", isOverridden && !reason.trim() && "border-danger")}
            aria-label={`Reason for changing the tolerance on ${field.label}`}
          />
          {isOverridden && !reason.trim() ? (
            <p className="mt-1 text-xs text-danger">A reason is required to override a standards tolerance.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Moment({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
          {n}
        </span>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function GtpBuilderInner() {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  // The size is chosen via pickers; `sizeInput` is the composed designation the parser reads.
  const [selection, setSelection] = useState<SizeSelection>(defaultSelection);
  // AB cable is aluminium by standard (IS 14255); LT power and control offer both. Held here so
  // the choice survives template loading and flows into derivation as a quirk.
  const [conductorMaterial, setConductorMaterial] = useState<ConductorMaterialCode>("AL");
  /**
   * Messenger construction for AB cable. Both are IS 14255 constructions and they are materially
   * different cables — bare drops an insulation wall, so the bundle gets lighter and thinner.
   * Undefined means "take the customer profile's", which is how DHBVN (bare) and WBSEDCL
   * (covered) have always differed; picking here overrides it for this GTP.
   */
  const [messengerConstruction, setMessengerConstruction] = useState<"bare" | "covered" | undefined>(undefined);
  /**
   * LT power / control configuration. Distinct from `selection` (the AB size pickers) because
   * these are different cables: an LT cable has no messenger and no street-light core, so the
   * two types genuinely need different inputs rather than a shared shape.
   */
  const [ltConfig, setLtConfig] = useState<{
    csaSqMm: number;
    coreCount: number;
    armoured: boolean;
    /** Undefined means "whatever this cable type conventionally uses" — see effectiveArmourForm. */
    armourForm?: "round-wire" | "formed-wire";
    armourMethod?: "A" | "B";
  }>({
    csaSqMm: 300,
    coreCount: 3.5,
    armoured: true,
  });
  /**
   * Solar DC configuration. Conductor class is absent on purpose — IS 17293 §4.1 derives it
   * from whether the cable connects directly to the modules, so that is the question asked.
   */
  const [solarConfig, setSolarConfig] = useState<{
    csaSqMm: number;
    directlyConnectedToModules: boolean;
    installationMethod: "free-in-air" | "on-surface" | "two-touching";
    ambientC: number;
  }>({ csaSqMm: 4, directlyConnectedToModules: true, installationMethod: "free-in-air", ambientC: 40 });

  const sizeInput = buildSizeString(selection);

  const [orderDetails, setOrderDetails] = useState<OrderDetails>(DEFAULT_ORDER_DETAILS);
  const [choices, setChoices] = useState<Choices | null>(null);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [ackWarnings, setAckWarnings] = useState(false);

  // Templates = saved starting points (customer + size + choices), persisted in localStorage.
  // useSyncExternalStore keeps SSR (empty) and client (stored) in step without a hydration
  // mismatch; `version` bumps re-read the store after a save/delete/use.
  const [version, setVersion] = useState(0);
  const templates = useSyncExternalStore(
    subscribeToTemplates,
    () => getTemplatesSnapshot(version),
    () => EMPTY_TEMPLATES,
  );
  const [templateName, setTemplateName] = useState("");
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  /** Field key the user was last sent to from a validation issue — briefly highlighted. */
  const [highlightedField, setHighlightedField] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  // Only AB cable is derivable today; the other lines render as disabled placeholders.
  const [productLine, setProductLine] = useState<ProductLine>("AB_CABLE");

  /**
   * Armour form, with the per-type convention applied until an operator says otherwise.
   *
   * XLPE power defaults to strip — the manufacturer's Sept 2026 correction, "Instead of Wire
   * Armour used for 3.5 Core Cables the Galvanised Steel Strip Armour size 4 × 0.8 mm shall be
   * placed". Control cable stays round wire, which is its convention and what the standard
   * forces anyway at the diameters control cables reach. Resolved here rather than in an effect
   * so switching cable type needs no state reset.
   */
  const effectiveArmourForm: "round-wire" | "formed-wire" =
    ltConfig.armourForm ?? (productLine === "XLPE_POWER" ? "formed-wire" : "round-wire");
  const effectiveArmourMethod: "A" | "B" = ltConfig.armourMethod ?? "A";


  /**
   * The designation for the cable ACTUALLY selected.
   *
   * `sizeInput` is the AB composed string and is only correct for AB cable. Everything that
   * identifies the finished record — the stored GTP, the PDF subtitle, the kanban card — must
   * use this instead, or an LT power cable is filed as "LT Aerial Bunched, XLPE — 3Cx70",
   * describing a cable nobody selected.
   */
  const designation = useMemo(() => {
    if (productLine === "SOLAR_DC") {
      return `1Cx${solarConfig.csaSqMm} (${solarConfig.directlyConnectedToModules ? "Class 5" : "Class 2"})`;
    }
    if (productLine === "XLPE_POWER" || productLine === "PVC_CONTROL") {
      const cores = ltConfig.coreCount === 3.5 ? "3.5" : String(ltConfig.coreCount);
      return `${cores}Cx${ltConfig.csaSqMm}`;
    }
    return sizeInput;
  }, [productLine, sizeInput, ltConfig, solarConfig]);

  /** Full cable description for the stored record — type AND size, both following the selection. */
  const cableTypeLabel = useMemo(() => {
    const label = activeCableTypeLabel(productLine);
    return `${label} — ${designation}`;
  }, [productLine, designation]);
  const router = useRouter();
  // Arriving from an order card: link the GTP to that order so it lands on the board and the
  // production gate can see it.
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId") ?? "";
  const [cableSpecId] = useState(() => `SPEC-GTP-${crypto.randomUUID()}`);
  const [persistedCable, setPersistedCable] = useState<{ signature: string; id: string } | null>(null);
  const [cableSaveError, setCableSaveError] = useState<string | null>(null);
  /** Manual edits, keyed by field. Applied over the derived values. */
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  /** Reasons for overriding a LOOKUP/CALC field — required, stored in the audit trail. */
  const [overrideReasons, setOverrideReasons] = useState<Record<string, string>>({});
  /**
   * Manual edits to the TOLERANCE column, kept separate from `overrides` rather than sharing the
   * map under a suffixed key. A field's value and its tolerance are independently editable, and
   * separate maps mean every existing consumer of `overrides` — the fields memo, the revert
   * handler, the generate gate, the template writer — keeps working untouched.
   */
  const [toleranceOverrides, setToleranceOverrides] = useState<Record<string, string>>({});
  const [toleranceReasons, setToleranceReasons] = useState<Record<string, string>>({});
  const [unlockedTolerances, setUnlockedTolerances] = useState<string[]>([]);
  /**
   * Fields hidden from the printed GTP.
   *
   * Buyers ask for different schedules — some want the full build-up, others only the finished
   * dimensions — so an operator can trim what prints. Hiding is NOT deleting: the value stays
   * derived, stays visible in the builder (struck through), and stays in the stored record;
   * only the PDF omits it. A field carrying an unresolved gap can never be hidden, because
   * hiding a known-missing value would turn a visible problem into an invisible one.
   */
  const [hiddenFields, setHiddenFields] = useState<string[]>([...DEFAULT_HIDDEN_FIELD_KEYS]);
  /**
   * Parameters the operator added by hand. Buyers ask for tender clauses and project codes that
   * no cable standard covers; the alternative to supporting them is someone editing the PDF
   * afterwards, unlogged.
   */
  const [customParameters, setCustomParameters] = useState<CustomParameter[]>([]);
  const [addingParameter, setAddingParameter] = useState(false);
  const [newParamLabel, setNewParamLabel] = useState("");
  const [newParamValue, setNewParamValue] = useState("");
  /** Optional — blank means the operator stated no tolerance, which prints as N/A. */
  const [newParamTolerance, setNewParamTolerance] = useState("");
  /**
   * Identifies this draft in the audit log before a GTP id exists. Reassigned to the real id on
   * generate, so the trail follows the document.
   */
  const [draftId] = useState(() => `DRAFT-${Date.now().toString(36).toUpperCase()}`);
  /** Fields already recorded once, so a second edit logs as an amend rather than a duplicate. */
  const auditedKeys = useRef<Set<string>>(new Set());
  /** Locked fields the user has deliberately unlocked (two actions before editing). */
  const [unlockedFields, setUnlockedFields] = useState<string[]>([]);

  const activeCableType = useMemo(() => CABLE_TYPES.find((t) => t.id === productLine), [productLine]);
  const isLtType = productLine === "XLPE_POWER" || productLine === "PVC_CONTROL";
  const isSolarType = productLine === "SOLAR_DC";
  /** IS 17293 Table 1 (class 5) runs from 1.5; Table 2 (class 2) starts at 16. */
  const solarSizeOptions = useMemo(
    () => (solarConfig.directlyConnectedToModules ? IS17293_CLASS5_SIZES : IS17293_CLASS2_SIZES),
    [solarConfig.directlyConnectedToModules],
  );
  /** Sizes this standard actually has an insulation row for. */
  const ltSizeOptions = useMemo(
    () => (productLine === "PVC_CONTROL" ? IS1554_1_SIZES : IS7098_1_SIZES),
    [productLine],
  );
  /** Plain-language playback, per cable type — the operator confirms what they meant. */
  const cableDescription = useMemo(() => {
    if (isSolarType) {
      const klass = solarConfig.directlyConnectedToModules ? "Class 5 (flexible)" : "Class 2 (fixed)";
      return `**1 core** × **${solarConfig.csaSqMm} sq mm** tinned copper, **${klass}**, 1.5 kV DC solar.`;
    }
    if (!isLtType) return describeSelection(selection);
    const cores = ltConfig.coreCount === 3.5 ? "3½" : String(ltConfig.coreCount);
    const material = (activeCableType?.fixedConductorMaterial?.material ?? conductorMaterial) === "AL" ? "aluminium" : "copper";
    const kind = productLine === "XLPE_POWER" ? "XLPE insulated" : "PVC insulated";
    return `**${cores} core** × **${ltConfig.csaSqMm} sq mm** ${material}, ${kind}, ${ltConfig.armoured ? "**armoured**" : "**unarmoured**"}.`;
  }, [isLtType, isSolarType, selection, ltConfig, solarConfig, productLine, conductorMaterial, activeCableType]);

  // Moment 2 — built directly from the pickers — no string parsing, so no role guessing (see compose-size).
  const construction = useMemo(() => constructionFromSelection(selection), [selection]);

  /**
   * How many customer-specific fields each profile contributes, for the selection cards.
   *
   * Derived by running the engine for the CURRENT cable type, so the number is true for the
   * cable being built — an AB cable picks up sag and messenger construction that an underground
   * LT cable has no equivalent for, and the card should not promise fields that will not appear.
   */
  const quirkFieldCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of CUSTOMER_PROFILES) {
      try {
        const derived =
          productLine === "SOLAR_DC"
            ? deriveSolarFields(solarConfig, { quirks: p.quirks })
            : productLine === "XLPE_POWER" || productLine === "PVC_CONTROL"
              ? deriveLtFields(
                  {
                    standard: productLine === "XLPE_POWER" ? "IS7098-1" : "IS1554-1",
                    csaSqMm: ltConfig.csaSqMm,
                    coreCount: ltConfig.coreCount,
                    material: conductorMaterial,
                    armoured: ltConfig.armoured,
                    armourForm: effectiveArmourForm,
                    armourMethod: effectiveArmourMethod,
                  },
                  { quirks: p.quirks },
                )
              : deriveFields(construction, p.quirks);
        counts[p.id] = derived.filter((f) => f.tag === "QUIRK").length;
      } catch {
        // An unsupported combination is not this card's problem to report.
        counts[p.id] = 0;
      }
    }
    return counts;
  }, [productLine, construction, ltConfig, solarConfig, conductorMaterial, effectiveArmourForm, effectiveArmourMethod]);


  // Moment 4 — derive the full field map as soon as a customer is chosen, then lay any manual
  // overrides on top (the "order" layer of the three-layer cascade).
  //
  // There is deliberately NO confirmation gate. It existed when the size was free text and the
  // parser had to guess roles from a designation string; the pickers are closed sets fed
  // straight into constructionFromSelection, so there is nothing left to misread. Gating on a
  // click just made the page look broken until it was pressed. The plain-language playback
  // stays — as a readback of what was built, not a checkpoint before building it.
  const fields = useMemo<ResolvedField[]>(() => {
    if (!profile) return [];
    // The order's drum length overrides the customer's default — it's the more specific layer.
    // A standard-pinned material always wins over the picker state — the operator cannot
    // choose copper for an AB cable, so the engine must never be told they did.
    const material = activeCableType?.fixedConductorMaterial?.material ?? conductorMaterial;

    // Route by cable type. These are DIFFERENT SCHEDULES, not the same fields with different
    // numbers: an LT GTP has an armour and an inner sheath where an AB GTP has a messenger and
    // a street-light core, so the field keys differ by design.
    let derived: ResolvedField[];
    if (productLine === "SOLAR_DC") {
      try {
        derived = deriveSolarFields(solarConfig, { customerName: profile.name, quirks: profile.quirks });
      } catch (err) {
        return [
          {
            key: "cable.unsupported",
            label: "Cannot derive this cable",
            value: err instanceof Error ? err.message : String(err),
            tag: "LOOKUP",
            source: "is-table",
            trace: "No standards row for this combination",
            editable: false,
            gap: true,
          },
        ];
      }
    } else if (productLine === "XLPE_POWER" || productLine === "PVC_CONTROL") {
      try {
        derived = deriveLtFields(
          {
            standard: productLine === "XLPE_POWER" ? "IS7098-1" : "IS1554-1",
            csaSqMm: ltConfig.csaSqMm,
            coreCount: ltConfig.coreCount,
            material,
            armoured: ltConfig.armoured,
            armourForm: effectiveArmourForm,
            armourMethod: effectiveArmourMethod,
          },
          { customerName: profile.name, quirks: profile.quirks },
        );
      } catch (err) {
        // The standards do not cover this combination. Surface it rather than emitting a GTP.
        return [
          {
            key: "cable.unsupported",
            label: "Cannot derive this cable",
            value: err instanceof Error ? err.message : String(err),
            tag: "LOOKUP",
            source: "is-table",
            trace: "No standards row for this combination",
            editable: false,
            gap: true,
          },
        ];
      }
    } else {
      derived = deriveFields(construction, {
        ...profile.quirks,
        drumLengthM: orderDetails.drumLengthM || profile.quirks.drumLengthM,
        conductorMaterial: material,
        messengerConstruction: messengerConstruction ?? profile.quirks.messengerConstruction,
      });
    }
    // Hand-added parameters join the derived list rather than living beside it, so hide/show,
    // validation, the PDF and the stored record treat them identically. They carry tag MANUAL
    // and no standards ref — a reviewer can see instantly that a person put them there.
    const withCustom: ResolvedField[] = [
      ...derived,
      ...customParameters.map((c) => ({
        key: c.key,
        label: c.label,
        value: c.value,
        tag: "MANUAL" as const,
        source: "override" as const,
        trace: "Added manually — not derived from any standard",
        editable: true,
        // Custom parameters are appended AFTER the engines run, so they never pass through
        // withMandatoryTolerance(). Without this they arrived with no tolerance at all and the
        // PDF's `?? TOLERANCE_NA` fallback — documented as unreachable — supplied one silently.
        // Now the row states its own answer, typed or explicitly unstated.
        tolerance: manualTolerance(c.tolerance ?? ""),
      })),
    ];

    return withCustom.map((f) => {
      let out = f;

      // Tolerance edits are applied first and independently: a row may have an edited tolerance
      // against a derived value, or the reverse, or both.
      const toleranceValue = toleranceOverrides[f.key];
      if (toleranceValue !== undefined) {
        out = {
          ...out,
          tolerance: {
            value: toleranceValue,
            origin: "manual" as const,
            trace: "Entered manually — not derived from any standard",
            override: {
              previous: f.tolerance?.value ?? "",
              // Kept because `origin` is now "manual": without this the UI could not tell an
              // edited standards floor from a freely-typed one, and would stop asking for a
              // reason the moment the first character was typed.
              previousOrigin: f.tolerance?.origin ?? "manual",
              reason: toleranceReasons[f.key] ?? "",
              by: "current user",
              at: new Date().toISOString(),
            },
          },
        };
      }

      const value = overrides[f.key];
      if (value === undefined) return out;
      return {
        ...out,
        value,
        source: "override" as const,
        // An overridden field is no longer an unsourced gap — the user supplied the value.
        gap: false,
        override: {
          previous: f.value,
          reason: overrideReasons[f.key] ?? "",
          by: "current user",
          at: new Date().toISOString(),
        },
      };
    });
  }, [profile, construction, overrides, overrideReasons, toleranceOverrides, toleranceReasons, orderDetails.drumLengthM, conductorMaterial, activeCableType, productLine, ltConfig, solarConfig, customParameters, messengerConstruction, effectiveArmourForm, effectiveArmourMethod]);

  const cableCandidate = useMemo(() => {
    // AB and solar build their spec from their own construction — see spec-from-construction.ts.
    // Until this existed, both derived a perfect GTP and then could not be quoted at all.
    if (productLine === "AB_CABLE") {
      if (!construction) return null;
      try {
        return specFromAbConstruction({
          specId: cableSpecId, designation, construction, fields,
          messengerConstruction: messengerConstruction ?? profile?.quirks.messengerConstruction ?? "covered",
        });
      } catch (error) {
        return { gap: true as const, reason: error instanceof Error ? error.message : String(error) };
      }
    }
    if (productLine === "SOLAR_DC") {
      try {
        const { klass } = conductorClassFor(solarConfig.directlyConnectedToModules);
        const dims = solarDimensions(solarConfig.csaSqMm, klass);
        const conductorDiaMm =
          dims.values.meanOverallDiaMm - 2 * (dims.values.insulationThicknessMm + dims.values.sheathThicknessMm);
        const mass = deriveSolarMass({
          csaSqMm: solarConfig.csaSqMm,
          insulationThicknessMm: dims.values.insulationThicknessMm,
          sheathThicknessMm: dims.values.sheathThicknessMm,
          conductorDiaMm,
        });
        if (isMassGap(mass)) return { gap: true as const, reason: mass.missing };
        return specFromSolarConstruction({
          specId: cableSpecId, designation, fields,
          csaSqMm: solarConfig.csaSqMm,
          directlyConnectedToModules: solarConfig.directlyConnectedToModules,
          insulationThicknessMm: dims.values.insulationThicknessMm,
          sheathThicknessMm: dims.values.sheathThicknessMm,
          conductorDiaMm,
          overallDiaMm: dims.values.meanOverallDiaMm,
          massKgPerKm: mass.totalKgPerKm,
        });
      } catch (error) {
        return { gap: true as const, reason: error instanceof Error ? error.message : String(error) };
      }
    }
    if (productLine !== "XLPE_POWER" && productLine !== "PVC_CONTROL") return null;
    const config: LtCableConfig = {
      ...ltConfig, standard: productLine === "XLPE_POWER" ? "IS7098-1" : "IS1554-1",
      material: conductorMaterial, conductorClass: "Class 2",
      armourForm: effectiveArmourForm, armourMethod: effectiveArmourMethod,
    };
    try {
      return specFromFields({ specId: cableSpecId, productLine, config,
        armourForm: deriveLtCable(config).armourForm, fields, designation });
    } catch (error) {
      return { gap: true as const, reason: error instanceof Error ? error.message : String(error) };
    }
  }, [productLine, ltConfig, conductorMaterial, cableSpecId, fields, designation, effectiveArmourForm, effectiveArmourMethod, construction, messengerConstruction, profile, solarConfig]);

  /**
   * Identity of the cable by VALUE, not by object reference.
   *
   * `cableCandidate` is rebuilt whenever `fields` is, and `fields` gets a fresh array on every
   * override or tolerance edit. Comparing the saved cable by reference therefore went stale on
   * edits that did not change the cable at all, which dropped `readySpecId` back to null — the
   * "Create quote" link vanished and the GTP was stamped with `specId: ""` again. Comparing the
   * serialised cable keeps the handoff alive for as long as the SAVED cable still matches what
   * is on screen, and still invalidates the moment a real construction value moves.
   */
  const cableSignature = useMemo(
    () => (cableCandidate && !("gap" in cableCandidate) ? JSON.stringify(cableCandidate) : null),
    [cableCandidate],
  );

  useEffect(() => {
    if (!cableCandidate || "gap" in cableCandidate || !cableSignature) return;
    let cancelled = false;
    void specsService.upsert(cableCandidate).then((saved) => {
      if (!cancelled) { setPersistedCable({ signature: cableSignature, id: saved.id }); setCableSaveError(null); }
    }).catch((error: unknown) => {
      if (!cancelled) setCableSaveError(error instanceof Error ? error.message : "Could not save cable");
    });
    return () => { cancelled = true; };
  }, [cableCandidate, cableSignature]);
  const readySpecId = cableSignature && persistedCable?.signature === cableSignature ? persistedCable.id : null;

  /**
   * What actually prints. A hidden field is dropped from the PDF but never from `fields`, so
   * the builder keeps showing it and the audit trail keeps recording it.
   */
  const printedFields = useMemo(
    () => fields.filter((f) => !hiddenFields.includes(f.key)),
    [fields, hiddenFields],
  );

  /**
   * A field can be hidden unless it is an unresolved gap.
   *
   * Hiding a gap would remove the one visible sign that a value is missing — the operator would
   * see a tidy document and sign it. Gaps must be filled or overridden, never hidden.
   */
  function canHide(field: ResolvedField): boolean {
    return !field.gap;
  }

  /**
   * Hide or restore a field on the printed document — and record that it happened.
   *
   * Takes the whole field rather than the key so the trail carries a readable label; a reviewer
   * months later should not have to resolve "power.massPerKm" by hand.
   *
   * No reason is demanded, unlike an override. Most hides are a buyer's format preference, and
   * requiring a justification for each would produce a log full of "n/a". But the decision is
   * recorded, because `saveTemplate` persists `hiddenFields` — so an unrecorded omission
   * propagates silently into every future document built from that sheet.
   */
  function toggleFieldHidden(field: ResolvedField) {
    const nowHidden = !hiddenFields.includes(field.key);
    setHiddenFields((prev) =>
      prev.includes(field.key) ? prev.filter((k) => k !== field.key) : [...prev, field.key],
    );
    appendAuditEntry({
      gtpId: draftId,
      fieldKey: field.key,
      fieldLabel: field.label,
      action: nowHidden ? "hide" : "unhide",
      previousValue: nowHidden ? "shown" : "hidden",
      newValue: nowHidden ? "hidden" : "shown",
      reason: "",
      actor: actorFromSession().name,
      context: { customerName: profile?.name, designation },
    });
  }

  // Moment 5 — validation gate. Clean de-rating ladder assumed for the demo.
  const validation = useMemo(() => {
    if (fields.length === 0) return null;
    return validateGtp(fields, {
      deratingFactors: [1.22, 1.16, 1.09, 1.0, 0.9],
      // Real order quantities, so the drum-vs-quantity check can actually fire. These were
      // hardcoded to 1000/1000, which made the rule always pass — dead safety.
      drumLengthM: orderDetails.drumLengthM,
      orderedLengthM: orderDetails.totalLengthM,
    });
  }, [fields, orderDetails.drumLengthM, orderDetails.totalLengthM]);

  function pickProfile(p: CustomerProfile) {
    setProfile(p);
    // Seed the template defaults from the customer. These used to be set by confirmSize(); they
    // are the customer's own defaults, so selecting the customer is where they belong.
    setChoices({
      curing: p.choices.curingMethods[0],
      drumLength: p.choices.drumLengthOptions[0],
    });
    setSelection(defaultSelection());
    setAckWarnings(false);
    setHighlightedField(null);
  }

  function setOverride(key: string, value: string) {
    setOverrides((current) => ({ ...current, [key]: value }));
  }

  /**
   * Record an override in the audit trail.
   *
   * Called on blur rather than on every keystroke: the trail should read as decisions, not as
   * typing. An edit to an already-overridden field is an `amend`, so re-edits stay visible
   * rather than overwriting the earlier entry.
   */
  function commitOverride(field: ResolvedField, value: string, reason: string) {
    if (!value.trim() || !reason.trim()) return;
    const already = auditedKeys.current.has(field.key);
    auditedKeys.current.add(field.key);
    appendAuditEntry({
      gtpId: draftId,
      fieldKey: field.key,
      fieldLabel: field.label,
      action: already ? "amend" : "override",
      previousValue: String(field.override?.previous ?? field.value),
      newValue: value,
      reason,
      actor: actorFromSession().name,
      context: { customerName: profile?.name, designation },
    });
  }

  /**
   * Record a tolerance edit.
   *
   * Logged under a `#tolerance` suffix so the trail distinguishes "the tolerance was changed"
   * from "the value was changed" — two different facts about the same row. Unlike a value
   * override this does not require a reason: most tolerance cells start empty because no
   * standard specifies one, and filling one in contradicts nothing.
   */
  function commitToleranceOverride(field: ResolvedField, value: string, reason: string) {
    const auditKey = `${field.key}#tolerance`;
    const derivedOrigin = field.tolerance?.override?.previousOrigin ?? field.tolerance?.origin;
    // Overwriting a published acceptance limit is the one case that does demand justification.
    if (derivedOrigin === "is-rule" && !reason.trim()) return;

    const already = auditedKeys.current.has(auditKey);
    auditedKeys.current.add(auditKey);
    appendAuditEntry({
      gtpId: draftId,
      fieldKey: auditKey,
      fieldLabel: `${field.label} — tolerance`,
      action: already ? "amend" : "override",
      previousValue: field.tolerance?.override?.previous ?? field.tolerance?.value ?? "",
      newValue: value,
      reason,
      actor: actorFromSession().name,
      context: { customerName: profile?.name, designation },
    });
  }

  /** Undo a tolerance edit and go back to whatever the engine derived — often nothing at all. */
  function revertToleranceOverride(key: string) {
    const auditKey = `${key}#tolerance`;
    const field = fields.find((f) => f.key === key);
    if (field && toleranceOverrides[key] !== undefined) {
      appendAuditEntry({
        gtpId: draftId,
        fieldKey: auditKey,
        fieldLabel: `${field.label} — tolerance`,
        action: "revert",
        previousValue: toleranceOverrides[key],
        newValue: "",
        reason: "",
        actor: actorFromSession().name,
        context: { customerName: profile?.name, designation },
      });
      auditedKeys.current.delete(auditKey);
    }
    setToleranceOverrides(({ [key]: _removed, ...rest }) => rest);
    setToleranceReasons(({ [key]: _r, ...rest }) => rest);
    setUnlockedTolerances((keys) => keys.filter((k) => k !== key));
  }

  /** Undo a manual edit and go back to the standards-derived value. */
  function revertOverride(key: string) {
    const field = fields.find((f) => f.key === key);
    if (field && overrides[key] !== undefined) {
      // A revert is itself a change worth recording — "this was edited then put back" is
      // exactly the history a reviewer needs, and it is lost if only the end state is stored.
      appendAuditEntry({
        gtpId: draftId,
        fieldKey: key,
        fieldLabel: field.label,
        action: "revert",
        previousValue: overrides[key],
        newValue: "",
        reason: "",
        actor: actorFromSession().name,
        context: { customerName: profile?.name, designation },
      });
      auditedKeys.current.delete(key);
    }
    setOverrides(({ [key]: _removed, ...rest }) => rest);
    setOverrideReasons(({ [key]: _r, ...rest }) => rest);
    setUnlockedFields((keys) => keys.filter((k) => k !== key));
  }

  /** Add a parameter no standard covers. Tagged MANUAL so its origin is unmistakable. */
  function addCustomParameter(label: string, value: string, tolerance: string) {
    if (!label.trim() || !value.trim()) return;
    // The tolerance is deliberately NOT required: most added parameters are compliance
    // statements where none exists, and demanding one would train people to type "N/A" by hand
    // on every row. Blank is stored as absent and rendered as N/A with its own reason.
    const trimmed = tolerance.trim();
    setCustomParameters((current) => [
      ...current,
      {
        key: customParameterKey(),
        label: label.trim(),
        value: value.trim(),
        ...(trimmed ? { tolerance: trimmed } : {}),
      },
    ]);
  }

  function removeCustomParameter(key: string) {
    setCustomParameters((current) => current.filter((c) => c.key !== key));
  }

  /** Change one part of the size. Fields re-derive immediately — there is nothing to re-confirm. */
  function updateSelection(patch: Partial<SizeSelection>) {
    setSelection((current) => ({ ...current, ...patch }));
  }

  /** Start from a saved template: restore its inputs, then re-derive from live IS tables. */
  function startFromTemplate(template: GtpTemplate) {
    const p = findProfile(template.profileId);
    if (!p) return;
    setProfile(p);
    // Restore the cable type FIRST — it decides which engine runs and which inputs are shown.
    // Templates saved before cable types existed have none, and were AB.
    const line = template.productLine ?? "AB_CABLE";
    setProductLine(line);
    // Recover the picker state. Only AB round-trips through a designation string; LT and solar
    // keep their own config, so a template for those restores the type and the customer and
    // leaves the current construction rather than forcing a wrong one.
    if (line === "AB_CABLE") {
      setSelection(selectionFromSizeString(template.sizeInput) ?? defaultSelection());
    }
    // LT and solar keep their own config — a designation string cannot express armour, ambient
    // or conductor class, so those round-trip as objects.
    if (template.ltConfig) setLtConfig(template.ltConfig);
    if (template.solarConfig) setSolarConfig(template.solarConfig);

    // Restore the SHAPE of the sheet, which is the point of a template.
    setHiddenFields(template.hiddenFields ?? []);
    setCustomParameters(template.customParameters ?? []);
    const savedOverrides = template.overrides ?? {};
    setOverrides(Object.fromEntries(Object.entries(savedOverrides).map(([k, v]) => [k, v.value])));
    setOverrideReasons(Object.fromEntries(Object.entries(savedOverrides).map(([k, v]) => [k, v.reason])));
    // Overrides restored from a template are already justified; unlock them so they are visible
    // as edits rather than appearing to be derived values.
    setUnlockedFields(Object.keys(savedOverrides));
    const savedTolerances = template.toleranceOverrides ?? {};
    setToleranceOverrides(Object.fromEntries(Object.entries(savedTolerances).map(([k, v]) => [k, v.value])));
    setToleranceReasons(Object.fromEntries(Object.entries(savedTolerances).map(([k, v]) => [k, v.reason])));
    setUnlockedTolerances(Object.keys(savedTolerances));
    setChoices(template.choices ?? null);
    setAckWarnings(false);
    recordTemplateUse(template.id);
    setVersion((v) => v + 1);
    setSavedNotice(`Started from "${template.name}". Every value below was re-derived from the current IS tables.`);
  }

  /**
   * Generate: persist the GTP so it appears in Review. Stores the derived fields WITH their
   * provenance snapshot, so this document keeps printing the values it was generated with even
   * after the IS tables are amended.
   */
  async function handleGenerate() {
    if (!profile || !canGenerate || generating) return;
    setGenerating(true);
    try {
      const now = new Date().toISOString();
      // Save the cable HERE rather than trusting the background effect to have finished.
      // Generating straight after the last edit used to win the race against that effect, and
      // the GTP was stamped with an empty specId — the record existed but no quote could ever
      // resolve back to its cable. Awaiting the upsert makes the cable addressable before the
      // document that references it exists.
      let specId = readySpecId ?? "";
      if (!specId && cableCandidate && !("gap" in cableCandidate) && cableSignature) {
        const saved = await specsService.upsert(cableCandidate);
        specId = saved.id;
        setPersistedCable({ signature: cableSignature, id: saved.id });
      }
      const gtp: Gtp = {
        id: `GTP-${Date.now().toString(36).toUpperCase()}`,
        // Linking to the order is what puts this GTP on the order board's card and lets the
        // production gate see it. Without it the GTP exists but no board knows about it.
        orderId: orderId || undefined,
        state: profile.state,
        boardName: profile.name,
        customerId: profile.id,
        specId,
        cableType: cableTypeLabel,
        format: "self-generated",
        designation,
        tenderNo: orderDetails.poReference || undefined,
        standardsPin: profile.standardsPin,
        // `satisfies` anchors the shape at the assignment site. GtpDerivedField is now an alias
        // of ResolvedField rather than a hand-maintained copy, so a new member cannot be dropped
        // in transit — but this keeps the check local and loud if that alias is ever unpicked.
        derivedFields: fields satisfies ResolvedField[],
        orderQuantities: {
          totalLengthM: orderDetails.totalLengthM,
          drumLengthM: orderDetails.drumLengthM,
          drumCount: drumCount(orderDetails),
        },
        // Mirror the fields into sections so the existing detail view can render this record.
        //
        // The mapping used to collapse everything that was not a LOOKUP or CALC into
        // "client-fixed", so a value an operator typed by hand was filed identically to one the
        // board mandated. MANUAL now says so. QUIRK stays client-fixed — that IS a customer
        // requirement — and CHOICE/FIXED are ours to stand behind, so they read as standard.
        //
        // This mirror is the real problem and it survives this task by necessity: the
        // order-driven path in lib/services/index.ts builds `sections` via buildGtpSections and
        // never sets derivedFields, so the mirror cannot be deleted without moving that path
        // too. Tracked as WP-I/T2.5 — one representation, not two.
        sections: printedFields.map((f) => ({
          id: f.key,
          label: f.label,
          value: String(f.value),
          source: sectionSourceFor(f.tag),
        })),
        // What actually printed, so the stored record knows its own shape without recomputing
        // it from a template that may since have changed.
        hiddenFields: [...hiddenFields],
        status: "Draft",
        signOffs: [],
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      await gtpService.save(gtp, actorFromSession());
      // The trail was recorded against the draft id because the GTP did not exist yet. Point it
      // at the real one, or the history detaches from the document it describes.
      reassignAuditEntries(draftId, gtp.id);
      // The document is the deliverable — hand it over as part of generating, not as a
      // separate step the user has to discover.
      downloadPdf(
        `${gtp.id}-${profile.name.replace(/\s+/g, "-")}`,
        buildGtpPdfDocument(printedFields, {
          gtpId: gtp.id,
          version: gtp.version,
          status: gtp.status,
          customerName: profile.name,
          state: profile.state,
          designation,
          standardsPin: profile.standardsPin,
          // A freshly generated GTP has no stamps yet — the block prints blank lines to sign.
          signOffs: gtp.signOffs,
          orderQuantities: gtp.orderQuantities,
          poReference: orderDetails.poReference || undefined,
        }),
      );
      // Land on the record either way — it's where the stamps get recorded, which is the next
      // real step whether or not this GTP came from an order card.
      router.push(`/gtp/review?gtpId=${gtp.id}`);
    } catch (err) {
      setSavedNotice(
        err instanceof Error ? `Could not save the GTP: ${err.message}` : "Could not save the GTP.",
      );
      setGenerating(false);
    }
  }

  /** Save the inputs just used as a reusable named starting point. */
  function handleSaveTemplate() {
    const name = templateName.trim();
    if (!name || !profile || !choices) return;
    // A template is the SHEET, not just the size: which fields print, what was added by hand,
    // and what was overridden and why. Saving only the designation gave you a differently-shaped
    // document when you reloaded it.
    saveTemplate({
      name,
      profileId: profile.id,
      productLine,
      sizeInput: designation,
      ltConfig,
      solarConfig,
      hiddenFields,
      customParameters,
      overrides: Object.fromEntries(
        Object.entries(overrides).map(([k, v]) => [k, { value: v, reason: overrideReasons[k] ?? "" }]),
      ),
      // A tolerance a customer demands is a decision about this buyer, so it belongs in their
      // template exactly as a value override does — otherwise it has to be retyped every order.
      toleranceOverrides: Object.fromEntries(
        Object.entries(toleranceOverrides).map(([k, v]) => [k, { value: v, reason: toleranceReasons[k] ?? "" }]),
      ),
    });
    setVersion((v) => v + 1);
    setTemplateName("");
    setSavedNotice(`Saved "${name}" as a template. It'll appear next time you start a GTP.`);
  }

  /**
   * Jump from a validation issue to the field it's about. The field table is collapsed by
   * default, so expand it first, then scroll/focus once the row has actually rendered —
   * otherwise the click looks like it did nothing.
   */
  function goToField(fieldKey: string) {
    const isDerivedField = fields.some((f) => f.key === fieldKey);
    if (!isDerivedField) return; // e.g. "derating" — no row to jump to (see issue rendering)
    setFieldsOpen(true);
    setHighlightedField(fieldKey);
    requestAnimationFrame(() => {
      const row = document.getElementById(fieldRowId(fieldKey));
      if (!row) return;
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      row.focus({ preventScroll: true });
    });
  }

  // An override on a CHAIN INPUT blocks generation. The override mechanism replaces a printed
  // value without re-running the build-up, so overriding "Nominal conductor area" left every
  // dimension and the mass describing the previous cable on a sheet that named a new one. The
  // chain cannot be re-run from the overridden value either — a size the picker does not offer
  // has no row in IS 10462 Table 1 — so the honest answer is to send the operator to the picker.
  const overriddenInputs = fields.filter(
    (f) => overrides[f.key] !== undefined && CHAIN_INPUT_FIELD_KEYS.includes(f.key),
  );

  // An override of a locked (LOOKUP/CALC) value without a written reason blocks generation —
  // otherwise the "reason required" rule would be decorative.
  const missingReasons = fields.filter(
    (f) =>
      (overrides[f.key] !== undefined && !f.editable && !(overrideReasons[f.key] ?? "").trim()) ||
      // The same rule for the tolerance column, but ONLY where the engine derived a standards
      // floor. Replacing an N/A or a works estimate contradicts nothing published, so demanding
      // a justification there would train people to type "n/a" in the reason box and mean it.
      (toleranceOverrides[f.key] !== undefined &&
        (f.tolerance?.override?.previousOrigin ?? f.tolerance?.origin) === "is-rule" &&
        !(toleranceReasons[f.key] ?? "").trim()),
  );

  // Tolerance is a mandatory input, so an emptied cell is an incomplete GTP — not the same thing
  // as one marked N/A, which is a stated answer.
  const emptyTolerances = fields.filter(
    (f) => toleranceOverrides[f.key] !== undefined && !toleranceOverrides[f.key].trim(),
  );

  const canGenerate =
    (!isLtType || Boolean(readySpecId)) &&
    validation?.passesHardGate &&
    (validation.warningCount === 0 || ackWarnings) &&
    missingReasons.length === 0 &&
    overriddenInputs.length === 0 &&
    emptyTolerances.length === 0;
  const canSaveTemplate = Boolean(profile && choices && templateName.trim());

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <header className="space-y-1">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">New GTP</h1>
          <Link href="/gtp" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
            All GTPs
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">
          Answer a few questions — the rest fills itself in from the IS standards and this
          customer&rsquo;s profile, and shows its working.
        </p>
        {orderId ? (
          <p className="flex items-center gap-1.5 text-sm text-primary">
            <LinkIcon className="h-3.5 w-3.5" aria-hidden="true" />
            For order <span className="font-mono">{orderId}</span> — approving this GTP unblocks its
            production.
          </p>
        ) : null}
        {cableSaveError ? <p role="alert" className="text-sm text-danger">{cableSaveError}</p> : null}
        {cableCandidate && "gap" in cableCandidate ? <p className="text-sm text-muted-foreground">Quote unavailable: {cableCandidate.reason}</p> : null}
      </header>

      {savedNotice ? (
        <div className="flex items-start justify-between gap-3 rounded-md border border-success/30 bg-success/10 p-3 text-sm" role="status">
          <span className="text-foreground">{savedNotice}</span>
          <button type="button" onClick={() => setSavedNotice(null)} aria-label="Dismiss" className="shrink-0 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {/* Start step — templates lead when they exist (playbook rule #3: lead with the shortcut). */}
      {/* Templates, if there are any. Previously a full-screen "How do you want to start?" gate
          that had to be dismissed before the builder appeared, with the template list repeated
          again inside Moment 1. One list, offered as a shortcut rather than a mode choice —
          picking one fills the sheet in; ignoring it costs nothing. */}
      {templates.length > 0 ? (
        <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Start from a saved sheet
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Restores the customer, the cable, which parameters print, and anything added or
            overridden — then re-derives every standards value from the current IS tables.
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {templates.map((t) => {
              const p = findProfile(t.profileId);
              // Hidden and added are shown separately, not summed. They are opposite decisions:
              // one omits a parameter a board may expect, the other supplies one no standard
              // covers. "3 adjustments" told you neither, before loading a sheet that does both.
              const hiddenCount = t.hiddenFields?.length ?? 0;
              const addedCount = t.customParameters?.length ?? 0;
              const shapeNotes = [
                hiddenCount > 0 ? `${hiddenCount} hidden` : null,
                addedCount > 0 ? `${addedCount} added` : null,
              ].filter(Boolean);
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => startFromTemplate(t)}
                    className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-border p-3 text-left hover:bg-muted"
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 font-medium text-foreground">
                        <LayoutTemplate className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        {t.name}
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                        {p?.name ?? t.profileId} · <span className="font-mono">{t.sizeInput}</span>
                        {shapeNotes.length > 0 ? ` · ${shapeNotes.join(", ")}` : ""}
                        {t.useCount > 0 ? ` · used ${t.useCount}×` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-medium text-primary">Use →</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* Cable type — the first real choice, since it decides which standards apply. Planned
          lines are shown rather than hidden so the roadmap is visible and expectations are set. */}
      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">What kind of cable?</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {CABLE_TYPES.map((line) => {
            const isAvailable = line.available;
            const isActive = isAvailable && productLine === line.id;
            return (
              <button
                key={line.id}
                type="button"
                disabled={!isAvailable}
                aria-pressed={isActive}
                onClick={() => isAvailable && setProductLine(line.id)}
                title={line.blockedDetail ?? line.blockedReason}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-md border p-4 text-left transition-colors",
                  isActive && "border-primary bg-primary/5",
                  !isActive && isAvailable && "border-border hover:bg-muted",
                  !isAvailable && "cursor-not-allowed border-dashed border-border opacity-60",
                )}
              >
                <span className="flex w-full items-start justify-between gap-2">
                  <span className="font-medium text-foreground">{line.label}</span>
                  {!isAvailable ? (
                    <span className="shrink-0 rounded-sm border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                      Coming soon
                    </span>
                  ) : null}
                </span>
                <span className="text-sm text-muted-foreground">{line.description}</span>

                {/* Available types show what they derive from — it is the basis of the GTP the
                    operator is about to sign. Blocked types show what is missing instead:
                    a standards list they cannot use yet is noise on a card they cannot pick. */}
                {isAvailable ? (
                  <span className="mt-1 font-mono text-xs text-muted-foreground">
                    {[line.primaryStandard, ...line.supportingStandards]
                      .map((s) => `${s.id}:${s.edition}`)
                      .join(" · ")}
                  </span>
                ) : line.blockedReason ? (
                  <span className="mt-1 flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">{line.blockedReason}</span>
                    {line.remainingWork ? (
                      <span className="text-[11px] text-muted-foreground/80">
                        {line.remainingWork} remaining
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      {/* Moment 1 — Who is this for? */}
      <Moment n={1} title="Which customer?">
        <p className="mb-3 text-sm text-muted-foreground">
          The customer decides more than the name on the document — their profile supplies the
          marking legend, drum length, core identification and tolerance phrasing their engineers
          expect, and pins which edition of each standard is cited.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {CUSTOMER_PROFILES.map((p) => {
            const active = profile?.id === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => pickProfile(p)}
                aria-pressed={active}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-md border p-4 text-left transition-colors",
                  active ? "border-primary bg-primary/5" : "border-border hover:bg-muted",
                )}
              >
                <span className="flex items-center gap-2 font-medium text-foreground">
                  <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  {p.name}
                </span>
                <span className="text-sm text-muted-foreground">{p.state}</span>
                <span className="text-xs text-muted-foreground">
                  {p.approvedGtpCount} approved GTP{p.approvedGtpCount === 1 ? "" : "s"}
                </span>
                {/* What this selection actually changes. Without it the grid reads as navigation
                    chrome rather than the most load-bearing input on the page.

                    Counted by running the real engine rather than by inspecting the quirks
                    object: a hand-maintained list of "which quirks produce a field" drifts the
                    moment a quirk is added, and a card that overstates its effect is worse than
                    one that says nothing. */}
                <span className="mt-1 text-xs text-muted-foreground">
                  {quirkFieldCounts[p.id] > 0
                    ? `${quirkFieldCounts[p.id]} customer-specific field${quirkFieldCounts[p.id] === 1 ? "" : "s"}`
                    : "House defaults — no customer overrides"}
                </span>
              </button>
            );
          })}
        </div>

        {/* This customer's saved templates — the fastest path once one exists. */}
        {profile && templatesForProfile(templates, profile.id).length > 0 ? (
          <div className="mt-4 border-t border-border pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Saved templates for {profile.name}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {templatesForProfile(templates, profile.id).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => startFromTemplate(t)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
                >
                  <LayoutTemplate className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </Moment>

      {/* Moment 2 — What's the cable? */}
      {profile ? (
        <Moment n={2} title="What's the cable?">
          {isSolarType ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Solar cable is single core — thicknesses come straight from IS 17293. The conductor
                class is not chosen: it follows from whether the cable connects to the modules.
              </p>
              <div className="flex flex-wrap items-end gap-x-2 gap-y-3 rounded-md border border-border bg-muted/50 p-4">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="solar-connection" className="text-xs text-muted-foreground">
                    Connection
                  </Label>
                  <select
                    id="solar-connection"
                    value={solarConfig.directlyConnectedToModules ? "modules" : "fixed"}
                    onChange={(e) =>
                      setSolarConfig((c) => {
                        const direct = e.target.value === "modules";
                        const sizes = direct ? IS17293_CLASS5_SIZES : IS17293_CLASS2_SIZES;
                        // Class 2 has no row below 16 sq mm — move the size up rather than
                        // leaving a selection the standard cannot answer.
                        return { ...c, directlyConnectedToModules: direct, csaSqMm: sizes.includes(c.csaSqMm) ? c.csaSqMm : sizes[0] };
                      })
                    }
                    className="h-11 rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="modules">Direct to PV modules</option>
                    <option value="fixed">Fixed installation</option>
                  </select>
                </div>
                <SizePicker
                  id="solar-size"
                  label="Conductor size"
                  value={solarConfig.csaSqMm}
                  options={solarSizeOptions}
                  onChange={(v) => setSolarConfig((c) => ({ ...c, csaSqMm: v }))}
                />
                <span className="pb-2 text-sm text-muted-foreground">sq mm</span>

                <div className="flex flex-col gap-1 pl-2">
                  <Label htmlFor="solar-install" className="text-xs text-muted-foreground">
                    Installation
                  </Label>
                  <select
                    id="solar-install"
                    value={solarConfig.installationMethod}
                    onChange={(e) => setSolarConfig((c) => ({ ...c, installationMethod: e.target.value as typeof c.installationMethod }))}
                    className="h-11 rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="free-in-air">Single, free in air</option>
                    <option value="on-surface">Single, on a surface</option>
                    <option value="two-touching">Two touching, on a surface</option>
                  </select>
                </div>

                <SizePicker
                  id="solar-ambient"
                  label="Ambient"
                  value={solarConfig.ambientC}
                  options={SOLAR_AMBIENT_OPTIONS}
                  format={(v) => `${v} °C`}
                  onChange={(v) => setSolarConfig((c) => ({ ...c, ambientC: v }))}
                />

                <div className="ml-auto border-l border-border pl-4">
                  <MaterialControl
                    value={activeCableType?.fixedConductorMaterial?.material ?? conductorMaterial}
                    fixedBy={activeCableType?.fixedConductorMaterial?.ref}
                    onChange={setConductorMaterial}
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                {solarConfig.directlyConnectedToModules
                  ? "Class 5 flexible conductor (IS 17293 §4.1, Table 1)."
                  : "Class 2 conductor — fixed installation only, no flexing (IS 17293 §4.1, Table 2)."}
                {solarConfig.ambientC !== 40 ? (
                  <span className="text-warning">
                    {" "}Current rating de-rated from the 40 °C table figure.
                  </span>
                ) : null}
              </p>
            </div>
          ) : isLtType ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Pick the conductor and construction. Sheath and armour thicknesses are not chosen —
                they follow from the calculated diameter at each stage of the build-up.
              </p>
              <div className="flex flex-wrap items-end gap-x-2 gap-y-3 rounded-md border border-border bg-muted/50 p-4">
                <SizePicker
                  id="lt-cores"
                  label="Cores"
                  value={ltConfig.coreCount}
                  options={LT_CORE_OPTIONS}
                  format={(v) => (v === 3.5 ? "3½" : String(v))}
                  onChange={(v) => setLtConfig((c) => ({ ...c, coreCount: v }))}
                />
                <Symbol>C &times;</Symbol>
                <SizePicker
                  id="lt-size"
                  label="Conductor size"
                  value={ltConfig.csaSqMm}
                  options={ltSizeOptions}
                  onChange={(v) => setLtConfig((c) => ({ ...c, csaSqMm: v }))}
                />
                <span className="pb-2 text-sm text-muted-foreground">sq mm</span>

                <div className="flex flex-col gap-1 pl-2">
                  <Label htmlFor="lt-armoured" className="text-xs text-muted-foreground">
                    Armour
                  </Label>
                  <select
                    id="lt-armoured"
                    value={ltConfig.armoured ? "yes" : "no"}
                    onChange={(e) => setLtConfig((c) => ({ ...c, armoured: e.target.value === "yes" }))}
                    className="h-11 rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="yes">Armoured</option>
                    <option value="no">Unarmoured</option>
                  </select>
                </div>

                {/* Armour form and practice. Only meaningful on an armoured cable, and the
                    standard overrides the choice below 13 mm calculated diameter — the derived
                    schedule shows which it actually used. */}
                {ltConfig.armoured ? (
                  <>
                    <div className="flex flex-col gap-1 pl-2">
                      <Label htmlFor="lt-armour-form" className="text-xs text-muted-foreground">
                        Armour form
                      </Label>
                      <select
                        id="lt-armour-form"
                        value={effectiveArmourForm}
                        onChange={(e) =>
                          setLtConfig((c) => ({ ...c, armourForm: e.target.value as "round-wire" | "formed-wire" }))
                        }
                        className="h-11 rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="formed-wire">GI strip (formed wire)</option>
                        <option value="round-wire">GI round wire</option>
                      </select>
                    </div>

                    {effectiveArmourForm === "formed-wire" ? (
                      <div className="flex flex-col gap-1 pl-2">
                        <Label htmlFor="lt-armour-method" className="text-xs text-muted-foreground">
                          Strip size
                        </Label>
                        <select
                          id="lt-armour-method"
                          value={effectiveArmourMethod}
                          onChange={(e) => setLtConfig((c) => ({ ...c, armourMethod: e.target.value as "A" | "B" }))}
                          className="h-11 rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <option value="A">4.0 × 0.8 mm (Table 6, method A)</option>
                          <option value="B">Banded (Table 6, method B)</option>
                        </select>
                      </div>
                    ) : null}
                  </>
                ) : null}

                <div className="ml-auto border-l border-border pl-4">
                  <MaterialControl
                    value={activeCableType?.fixedConductorMaterial?.material ?? conductorMaterial}
                    fixedBy={activeCableType?.fixedConductorMaterial?.ref}
                    onChange={setConductorMaterial}
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                {ltConfig.coreCount === 3.5 ? (
                  <>
                    3½ core: three full cores plus a reduced neutral, sized from{" "}
                    {productLine === "XLPE_POWER" ? "IS 7098 (Part 1) Table 2" : "IS 1554 (Part 1) Table 1"}.
                  </>
                ) : (
                  <>Insulation thickness follows the {ltConfig.coreCount === 1 && ltConfig.armoured ? "single-core armoured" : "multi-core"} column.</>
                )}
              </p>
            </div>
          ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Pick each part of the cable. Only sizes we have IS tables for are offered, so the
              cable you build here is always one we can produce a GTP for.
            </p>

            {/* Segmented pickers — the fixed symbols are printed, not typed. */}
            <div className="flex flex-wrap items-end gap-x-2 gap-y-3 rounded-md border border-border bg-muted/50 p-4">
              <SizePicker
                id="core-count"
                label="Cores"
                value={selection.coreCount}
                options={CORE_COUNT_OPTIONS}
                onChange={(v) => updateSelection({ coreCount: v })}
              />
              <Symbol>C &times;</Symbol>
              <SizePicker
                id="phase-size"
                label="Phase size"
                value={selection.phaseSizeSqMm}
                options={PHASE_SIZE_OPTIONS}
                onChange={(v) =>
                  // Re-pair the messenger whenever the phase size changes (IS 14255).
                  updateSelection({
                    phaseSizeSqMm: v,
                    messengerSizeSqMm: pairedMessengerFor(v)?.messengerSqMm ?? selection.messengerSizeSqMm,
                  })
                }
              />
              <Symbol>+</Symbol>
              <SizePicker
                id="street-light"
                label="Street light"
                value={selection.streetLightSizeSqMm ?? 0}
                options={STREET_LIGHT_SIZE_OPTIONS}
                allowNone
                onChange={(v) => updateSelection({ streetLightSizeSqMm: v === 0 ? null : v })}
              />
              <Symbol>+</Symbol>
              <SizePicker
                id="messenger"
                label="Messenger"
                value={selection.messengerSizeSqMm}
                options={MESSENGER_SIZE_OPTIONS}
                onChange={(v) => updateSelection({ messengerSizeSqMm: v })}
              />
              <span className="pb-2 text-sm text-muted-foreground">sq mm</span>

              {/* Bare or covered messenger — IS 14255 covers both, and they weigh differently. */}
              <div className="flex flex-col gap-1 pl-2">
                <Label htmlFor="messenger-construction" className="text-xs text-muted-foreground">
                  Messenger
                </Label>
                <select
                  id="messenger-construction"
                  value={messengerConstruction ?? "profile"}
                  onChange={(e) =>
                    setMessengerConstruction(
                      e.target.value === "profile" ? undefined : (e.target.value as "bare" | "covered"),
                    )
                  }
                  className="h-11 rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="profile">As per customer</option>
                  <option value="covered">Covered / insulated</option>
                  <option value="bare">Bare Al-Mg-Si</option>
                </select>
              </div>

              {/* Conductor material. Driven by the registry, not hardcoded: AB pins aluminium
                  (IS 14255), so this shows as a read-only fact; LT power and control leave it
                  open and this becomes a live picker the moment those types ship. */}
              <div className="ml-auto border-l border-border pl-4">
                <MaterialControl
                  value={activeCableType?.fixedConductorMaterial?.material ?? conductorMaterial}
                  fixedBy={activeCableType?.fixedConductorMaterial?.ref}
                  onChange={setConductorMaterial}
                />
              </div>
            </div>

            {/* Why the messenger is what it is — and a nudge when it's been overridden. */}
            {pairedMessengerFor(selection.phaseSizeSqMm) ? (
              <p className="text-xs text-muted-foreground">
                {pairedMessengerFor(selection.phaseSizeSqMm)!.messengerSqMm === selection.messengerSizeSqMm ? (
                  <>
                    Messenger auto-filled from{" "}
                    {pairedMessengerFor(selection.phaseSizeSqMm)!.ref}. You can change it if the
                    order says otherwise.
                  </>
                ) : (
                  <span className="text-warning">
                    Note: {pairedMessengerFor(selection.phaseSizeSqMm)!.ref} pairs{" "}
                    {selection.phaseSizeSqMm} sq mm with a{" "}
                    {pairedMessengerFor(selection.phaseSizeSqMm)!.messengerSqMm} sq mm messenger —
                    you&rsquo;ve chosen {selection.messengerSizeSqMm}.
                  </span>
                )}
              </p>
            ) : null}

            <p className="font-mono text-xs text-muted-foreground">
              Designation: {designation}
            </p>
          </div>
          )}

          <div className="mt-3 space-y-3">
            {/* Readback of what the pickers built, in plain language. Not a checkpoint — the
                fields below already reflect it and update as the pickers change. */}
            <div className="rounded-md border border-border bg-muted p-3">
              <p className="text-sm text-foreground" dangerouslySetInnerHTML={{ __html: renderPlayback(cableDescription) }} />
            </div>

            {/* Order-specific quantities. Separate from the construction above: the same cable
                can be sold in any quantity, on any drum length, against any PO. */}
            {true ? (
              <div className="mt-4 space-y-3 border-t border-border pt-4">
                <p className="text-sm font-medium text-foreground">How much of it?</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="total-length">Total length</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="total-length"
                        type="number"
                        min={1}
                        value={orderDetails.totalLengthM}
                        onChange={(e) =>
                          setOrderDetails((d) => ({ ...d, totalLengthM: Number(e.target.value) }))
                        }
                        className="h-11 font-mono"
                      />
                      <span className="text-sm text-muted-foreground">m</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="drum-length">Length per drum</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="drum-length"
                        type="number"
                        min={1}
                        value={orderDetails.drumLengthM}
                        onChange={(e) =>
                          setOrderDetails((d) => ({ ...d, drumLengthM: Number(e.target.value) }))
                        }
                        className="h-11 font-mono"
                      />
                      <span className="text-sm text-muted-foreground">m</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="po-ref">Order / PO reference</Label>
                    <Input
                      id="po-ref"
                      value={orderDetails.poReference}
                      placeholder="Optional"
                      onChange={(e) => setOrderDetails((d) => ({ ...d, poReference: e.target.value }))}
                      className="h-11"
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </Moment>
      ) : null}

      {/* Moment 3 — A few questions */}
      {profile && choices ? (
        <Moment n={3} title="Save for next time">
          {/* Two questions were removed here (curing method, drum length). Both fed only
              saveTemplate() — neither reached the derived fields, the stored GTP or the PDF, so
              answering them changed nothing about the document. Drum length was also asked a
              second time in Order details, as a NUMBER that does reach the PDF and overrides the
              customer profile; asking for it twice in two units invited the wrong one being
              trusted. Curing method is a process constant and belongs in profiles.ts if it is
              ever needed on the document.

              Supplier questions were removed earlier (build-plan-v2 D8): suppliers are chosen per
              purchase on price, and disclosing sourcing on a GTP is commercially sensitive. */}

          {/* Save these inputs as a reusable starting point. Secondary to Generate. */}
          <div>
            <Label htmlFor="tpl-name">Save these answers as a template (optional)</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Saves the customer, size and answers above — not the calculated values, so it stays
              correct when standards change.
            </p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <Input
                id="tpl-name"
                value={templateName}
                placeholder={`e.g. ${profile.name} ${sizeInput || "3-core AB"} standard`}
                onChange={(e) => setTemplateName(e.target.value)}
              />
              <Button type="button" variant="secondary" disabled={!canSaveTemplate} onClick={handleSaveTemplate}>
                <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                Save template
              </Button>
            </div>
          </div>
        </Moment>
      ) : null}

      {/* Moment 4 — Filled in for you (collapsed) */}
      {fields.length > 0 ? (
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <button
            type="button"
            onClick={() => setFieldsOpen((v) => !v)}
            aria-expanded={fieldsOpen}
            className="flex w-full items-center justify-between gap-3 p-5 text-left"
          >
            <span className="text-sm font-medium text-foreground">
              {fields.length} fields auto-filled from IS standards and the {profile?.name} profile — review
            </span>
            <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", fieldsOpen && "rotate-180")} aria-hidden="true" />
          </button>
          {fieldsOpen ? (
            <div className="overflow-x-auto border-t border-border">
              <table className="w-full text-left text-sm">
              {hiddenFields.length > 0 ? (
                <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-warning/30 bg-warning/10 px-3 py-2">
                  <span className="text-sm text-foreground">
                    {hiddenFields.length} field{hiddenFields.length === 1 ? "" : "s"} hidden from the printed GTP.
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Still derived and recorded — only left off the document.
                  </span>
                  <button
                    type="button"
                    onClick={() => setHiddenFields([])}
                    className="ml-auto min-h-11 rounded-md px-2 text-xs font-medium text-foreground underline-offset-2 hover:underline"
                  >
                    Show all again
                  </button>
                </div>
              ) : null}
                <thead className="bg-muted text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3 font-medium">Field</th>
                    <th className="p-3 font-medium">Value</th>
                    <th className="p-3 font-medium">
                      <span title="A required entry on every row. Defaulted from the standard where one applies, shown as N/A where none does. Minus-only figures (−16.7%) are one-sided limits: the standard sets a floor, not a band.">
                        Tolerance
                      </span>
                    </th>
                    <th className="p-3 font-medium">Source</th>
                    <th className="p-3 text-right font-medium">
                      <span title="Hidden fields stay derived and audited — they are only left off the printed GTP.">
                        On GTP
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((f) => (
                    <tr
                      key={f.key}
                      id={fieldRowId(f.key)}
                      tabIndex={-1}
                      className={cn(
                        "scroll-mt-24 border-t border-border transition-colors",
                        f.gap && "bg-danger/5",
                        hiddenFields.includes(f.key) && "opacity-55",
                        // Flash the row the user was sent to, so the jump is unmistakable.
                        highlightedField === f.key && "bg-primary/10 ring-2 ring-inset ring-primary",
                      )}
                    >
                      <td className={cn("p-3 text-foreground", hiddenFields.includes(f.key) && "line-through decoration-muted-foreground")}>
                        {f.label}
                      </td>
                      <td className="p-3">
                        <FieldValueCell
                          field={f}
                          override={overrides[f.key]}
                          unlocked={unlockedFields.includes(f.key)}
                          onEdit={(value) => setOverride(f.key, value)}
                          onRequestUnlock={() => setUnlockedFields((keys) => [...keys, f.key])}
                          reason={overrideReasons[f.key] ?? ""}
                          onReasonChange={(reason) => setOverrideReasons((r) => ({ ...r, [f.key]: reason }))}
                          onReasonCommit={() => commitOverride(f, overrides[f.key] ?? "", overrideReasons[f.key] ?? "")}
                          onRevert={() => revertOverride(f.key)}
                        />
                      </td>
                      <td className="p-3 align-top">
                        <FieldToleranceCell
                          field={f}
                          override={toleranceOverrides[f.key]}
                          unlocked={unlockedTolerances.includes(f.key)}
                          onEdit={(value) => setToleranceOverrides((t) => ({ ...t, [f.key]: value }))}
                          onRequestUnlock={() => setUnlockedTolerances((keys) => [...keys, f.key])}
                          reason={toleranceReasons[f.key] ?? ""}
                          onReasonChange={(reason) => setToleranceReasons((r) => ({ ...r, [f.key]: reason }))}
                          onReasonCommit={() =>
                            commitToleranceOverride(f, toleranceOverrides[f.key] ?? "", toleranceReasons[f.key] ?? "")
                          }
                          onRevert={() => revertToleranceOverride(f.key)}
                        />
                      </td>
                      <td className="p-3">
                        <span className={cn("mr-2 inline-block rounded-sm border px-1.5 py-0.5 text-[10px] font-medium", TAG_TONE[f.tag])}>
                          {f.tag}
                        </span>
                        {overrides[f.key] !== undefined ? (
                          <span className="mr-2 inline-block rounded-sm border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                            MANUAL OVERRIDE
                          </span>
                        ) : null}
                        {toleranceOverrides[f.key] !== undefined ? (
                          <span className="mr-2 inline-block rounded-sm border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                            MANUAL TOLERANCE
                          </span>
                        ) : null}
                        <span className="text-xs text-muted-foreground">{f.trace}</span>
                      </td>
                      <td className="p-3 text-right align-top">
                        {f.key.startsWith("custom.") ? (
                          // A hand-added parameter is removed outright rather than hidden —
                          // hiding implies a derived value still exists underneath, and none does.
                          <button
                            type="button"
                            onClick={() => removeCustomParameter(f.key)}
                            className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-danger"
                          >
                            <X className="size-3.5" aria-hidden="true" />
                            Remove
                          </button>
                        ) : canHide(f) ? (
                          <button
                            type="button"
                            onClick={() => toggleFieldHidden(f)}
                            aria-pressed={!hiddenFields.includes(f.key)}
                            className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            {hiddenFields.includes(f.key) ? (
                              <>
                                <EyeOff className="size-3.5" aria-hidden="true" />
                                Hidden
                              </>
                            ) : (
                              <>
                                <Eye className="size-3.5" aria-hidden="true" />
                                Shown
                              </>
                            )}
                          </button>
                        ) : (
                          // A gap can't be hidden — that would conceal a missing value on a
                          // document someone is about to sign.
                          <span
                            className="inline-flex min-h-11 items-center px-2 text-xs text-muted-foreground"
                            title="Fields with a missing value must be filled or overridden, not hidden."
                          >
                            Required
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Add a parameter no standard covers — a tender clause, a project code, a
                  confirmation the buyer asks for. Without this the operator edits the PDF
                  afterwards, which leaves no record at all. */}
              <div className="border-t border-border p-3">
                {addingParameter ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="param-label" className="text-xs text-muted-foreground">
                        Parameter
                      </Label>
                      <Input
                        id="param-label"
                        value={newParamLabel}
                        onChange={(e) => setNewParamLabel(e.target.value)}
                        placeholder="e.g. Tender clause 4.2 compliance"
                        className="h-11 w-56"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="param-value" className="text-xs text-muted-foreground">
                        Value
                      </Label>
                      <Input
                        id="param-value"
                        value={newParamValue}
                        onChange={(e) => setNewParamValue(e.target.value)}
                        placeholder="e.g. Confirmed"
                        className="h-11 w-44"
                      />
                    </div>
                    {/* Optional, unlike the other two — see addCustomParameter. */}
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="param-tolerance" className="text-xs text-muted-foreground">
                        Tolerance
                      </Label>
                      <Input
                        id="param-tolerance"
                        value={newParamTolerance}
                        onChange={(e) => setNewParamTolerance(e.target.value)}
                        placeholder="e.g. ±2% or leave blank"
                        className="h-11 w-40"
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="min-h-11"
                      disabled={!newParamLabel.trim() || !newParamValue.trim()}
                      onClick={() => {
                        addCustomParameter(newParamLabel, newParamValue, newParamTolerance);
                        setNewParamLabel("");
                        setNewParamValue("");
                        setNewParamTolerance("");
                        setAddingParameter(false);
                      }}
                    >
                      Add
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="min-h-11"
                      onClick={() => {
                        setAddingParameter(false);
                        setNewParamLabel("");
                        setNewParamValue("");
                        setNewParamTolerance("");
                      }}
                    >
                      Cancel
                    </Button>
                    <p className="w-full text-xs text-muted-foreground">
                      Added parameters print as written and carry no standards reference — they
                      show as MANUAL so a reviewer can see they came from a person. Leave the
                      tolerance blank if none applies and it prints as N/A.
                    </p>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingParameter(true)}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    Add a parameter
                  </button>
                )}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Moment 5 — Check & generate (pinned strip) */}
      {validation ? (
        <div className="sticky bottom-4 rounded-lg border border-border bg-card p-4 shadow-lg">
          {validation.issues.length > 0 ? (
            <ul className="mb-3 space-y-2">
              {validation.issues.map((issue) => {
                // Only link issues whose field actually has a row to jump to.
                const target = issue.fieldKeys.find((k) => fields.some((f) => f.key === k));
                const icon = (
                  <CircleAlert
                    className={cn("mt-0.5 h-4 w-4 shrink-0", issue.severity === "error" ? "text-danger" : "text-warning")}
                    aria-hidden="true"
                  />
                );
                return (
                  <li key={issue.id} className="text-sm">
                    {target ? (
                      <button
                        type="button"
                        onClick={() => goToField(target)}
                        className="flex w-full items-start gap-2 rounded-sm text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {icon}
                        <span className="text-foreground">
                          {issue.message}{" "}
                          <span className="whitespace-nowrap font-medium text-primary underline underline-offset-2">
                            Show me
                          </span>
                        </span>
                      </button>
                    ) : (
                      <span className="flex items-start gap-2">
                        {icon}
                        <span className="text-foreground">{issue.message}</span>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mb-3 flex items-center gap-1.5 text-sm text-success">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> All checks passed.
            </p>
          )}

          {validation.warningCount > 0 && validation.errorCount === 0 ? (
            <label className="mb-3 flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={ackWarnings} onChange={(e) => setAckWarnings(e.target.checked)} />
              I&rsquo;ve reviewed the {validation.warningCount} warning{validation.warningCount === 1 ? "" : "s"}.
            </label>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {validation.errorCount} error{validation.errorCount === 1 ? "" : "s"} · {validation.warningCount} warning
              {validation.warningCount === 1 ? "" : "s"}
            </span>
            <Button type="button" disabled={!canGenerate || generating} onClick={() => void handleGenerate()}>
              <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
              {generating ? "Saving…" : "Generate GTP"}
            </Button>
          </div>
          {!canGenerate && validation.errorCount > 0 ? (
            <p className="mt-2 text-xs text-danger">
              Fix the errors above before generating — the GTP can&rsquo;t be issued on unverified data.
            </p>
          ) : null}
          {overriddenInputs.length > 0 ? (
            <div className="mt-2 space-y-1">
              {overriddenInputs.map((f) => (
                <p key={f.key} className="text-xs text-danger">
                  {chainInputOverrideMessage(f.label)}
                </p>
              ))}
            </div>
          ) : null}
          {missingReasons.length > 0 ? (
            <p className="mt-2 text-xs text-danger">
              You changed {missingReasons.length === 1 ? "a standards value" : `${missingReasons.length} standards values`} —
              write why below {missingReasons.map((f) => `"${f.label}"`).join(", ")} before generating.
            </p>
          ) : null}
          {emptyTolerances.length > 0 ? (
            <p className="mt-2 text-xs text-danger">
              {emptyTolerances.length === 1 ? "A tolerance was" : `${emptyTolerances.length} tolerances were`} left
              empty — {emptyTolerances.map((f) => `"${f.label}"`).join(", ")}. Enter a value or mark it N/A.
            </p>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}


/** The playback string uses **bold** markers; render them as <strong> safely (no user HTML). */
function renderPlayback(playback: string): string {
  return playback
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

/**
 * useSearchParams needs a Suspense boundary, otherwise the whole route opts out of static
 * rendering (and Next fails the build with a missing-suspense error).
 */
export default function GtpBuilderPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-3xl p-4 sm:p-6 text-sm text-muted-foreground">Loading…</main>}>
      <GtpBuilderInner />
    </Suspense>
  );
}
