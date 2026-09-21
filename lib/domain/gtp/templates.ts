/**
 * GTP Templates — named, saved starting points.
 *
 * ── WHAT A TEMPLATE IS (and deliberately is not) ──────────────────────────────
 * A template stores the *inputs* a person chose, never the *derived* values:
 *
 *     customer profile  +  size string  +  the CHOICE answers  (+ a name)
 *
 * It does NOT store strand counts, diameters, resistances or any LOOKUP/CALC field.
 * Those are always re-derived from the IS tables at use time. This is the whole point:
 *   • a template can never go stale against a standards update,
 *   • provenance/traces stay live rather than frozen into a copy,
 *   • and a template stays tiny and human-readable.
 *
 * This is distinct from the two other things the word "template" gets used for:
 *   1. a REUSED past GTP (an approved GTP for the same customer+size) — system-suggested,
 *      nothing for the user to author; see the reuse path in the builder.
 *   2. a document LAYOUT/format (WBSEDCL sectioned-tabular vs DHBVN multi-size columns) —
 *      dev-authored JSON, owned by the renderer, not by users. See PRD §3 non-goals.
 *
 * Persistence: localStorage for now (same posture as the mock adapter). The shape is the
 * contract; swapping to the service layer later touches only load/save here.
 */
import type { CustomerProfile } from "./profiles";
import type { ProductLine } from "./types";

/**
 * @deprecated Retained so templates saved before the sheet model still parse. The two questions
 * these answered (curing method, drum length) fed nothing on the document and were removed.
 */
export interface TemplateChoices {
  curing: string;
  drumLength: string;
}

/**
 * A parameter an operator added by hand.
 *
 * Not from any standard. It renders tagged MANUAL with no IS citation, so a reviewer can see at
 * a glance that a person put it there — the same posture as an override. Buyers ask for tender
 * clauses, project codes and confirmations that no cable standard has an opinion about, and the
 * alternative to supporting them is an operator editing the PDF afterwards, unlogged.
 */
export interface CustomParameter {
  /** Stable across reloads so hide/show and edits can address it. */
  key: string;
  label: string;
  value: string;
  /**
   * Tolerance as the operator typed it, e.g. "±2%".
   *
   * Free text on purpose: a buyer's clause may state a band, a class or a plain limit, and this
   * row has no standard behind it to normalise against. Absent means no tolerance was stated —
   * rendered as N/A with a reason, never as a blank cell.
   *
   * Optional so templates saved before the field existed still load.
   */
  tolerance?: string;
}

/**
 * A saved sheet: the arrangement of a GTP for one customer and cable type.
 *
 * This IS the template. There is no separate "customer template" concept — picking a customer
 * seeds the sheet from their profile, and saving the arrangement is what makes it reusable.
 * A template therefore has to carry everything that shapes the document, not just its size:
 *
 *   • which cable type and construction it is for
 *   • which fields are HIDDEN from the printed document
 *   • which parameters were ADDED by hand
 *   • which derived values were manually overridden, and why
 *
 * Storing only the size — which is what it used to do — meant reloading a template gave you a
 * differently-shaped document from the one you saved.
 */
export interface GtpTemplate {
  id: string;
  /** User-given name, e.g. "WBSEDCL 3-core AB standard". */
  name: string;
  profileId: CustomerProfile["id"];
  /**
   * Which cable type this template is for.
   *
   * Optional for backward compatibility: templates saved before cable types existed have no
   * value and are treated as AB, which is what they were. Without this, loading an AB template
   * while LT power is selected restored AB sizes into the LT engine.
   */
  productLine?: ProductLine;
  /** The designation for the type above. Only AB round-trips through the parser. */
  sizeInput: string;
  /** Construction for LT power / control, where a designation string cannot express it. */
  ltConfig?: { csaSqMm: number; coreCount: number; armoured: boolean };
  /** Construction for solar DC. */
  solarConfig?: {
    csaSqMm: number;
    directlyConnectedToModules: boolean;
    installationMethod: "free-in-air" | "on-surface" | "two-touching";
    ambientC: number;
  };
  /** Field keys left OFF the printed document. The shape of the sheet. */
  hiddenFields?: string[];
  /** Parameters the operator added by hand. */
  customParameters?: CustomParameter[];
  /** Manual edits to derived values, with the reason each was changed. */
  overrides?: Record<string, { value: string; reason: string }>;
  /**
   * Manual edits to the tolerance column, keyed the same way.
   *
   * Separate from `overrides` because a row's value and its tolerance are independently
   * editable — a buyer may accept the standard thickness but demand a tighter acceptance band.
   * Optional so templates saved before the column existed still load.
   */
  toleranceOverrides?: Record<string, { value: string; reason: string }>;
  /** @deprecated see TemplateChoices. Kept optional so old records still load. */
  choices?: TemplateChoices;
  createdAt: string;
  /** Bumped each time a GTP is started from this template — powers "most used" ordering. */
  useCount: number;
}

/** Stable key for a custom parameter. Prefixed so it can never collide with a derived field. */
export function customParameterKey(): string {
  return `custom.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const STORAGE_KEY = "cableos2:v1:gtp-templates";

/** Read all saved templates. Never throws — a corrupt/absent store yields an empty list. */
export function loadTemplates(): GtpTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as GtpTemplate[]) : [];
  } catch {
    return [];
  }
}

function persist(templates: GtpTemplate[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch {
    // Storage full or blocked — the caller's in-memory list stays correct for this session.
  }
}

/** Save a new template. Returns the full list so callers can update state in one step. */
export function saveTemplate(input: Omit<GtpTemplate, "id" | "createdAt" | "useCount">): GtpTemplate[] {
  const template: GtpTemplate = {
    ...input,
    id: `TPL-${Date.now().toString(36).toUpperCase()}`,
    createdAt: new Date().toISOString(),
    useCount: 0,
  };
  const next = [template, ...loadTemplates()];
  persist(next);
  return next;
}

export function deleteTemplate(id: string): GtpTemplate[] {
  const next = loadTemplates().filter((t) => t.id !== id);
  persist(next);
  return next;
}

/** Record that a template was used, so the list can surface the most-used first. */
export function recordTemplateUse(id: string): GtpTemplate[] {
  const next = loadTemplates().map((t) => (t.id === id ? { ...t, useCount: t.useCount + 1 } : t));
  persist(next);
  return next;
}

/** Templates for a customer, most-used first — what the builder offers on Moment 1. */
export function templatesForProfile(templates: GtpTemplate[], profileId: string): GtpTemplate[] {
  return templates.filter((t) => t.profileId === profileId).sort((a, b) => b.useCount - a.useCount);
}
