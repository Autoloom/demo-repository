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

/** The CHOICE answers a template carries. Mirrors the builder's Moment-3 questions. */
export interface TemplateChoices {
  curing: string;
  drumLength: string;
}

export interface GtpTemplate {
  id: string;
  /** User-given name, e.g. "WBSEDCL 3-core AB standard". */
  name: string;
  profileId: CustomerProfile["id"];
  /** The size string exactly as typed, re-parsed on use. */
  sizeInput: string;
  choices: TemplateChoices;
  createdAt: string;
  /** Bumped each time a GTP is started from this template — powers "most used" ordering. */
  useCount: number;
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
