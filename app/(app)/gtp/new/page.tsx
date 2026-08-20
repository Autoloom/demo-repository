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
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  FileText,
  LayoutTemplate,
  Lock,
  Save,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";

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
import { CUSTOMER_PROFILES, findProfile, type CustomerProfile } from "@/lib/domain/gtp/profiles";
import {
  loadTemplates,
  recordTemplateUse,
  saveTemplate,
  templatesForProfile,
  type GtpTemplate,
} from "@/lib/domain/gtp/templates";
import type { ResolvedField } from "@/lib/domain/gtp/types";
import { validateGtp } from "@/lib/domain/gtp/validate";
import { cn } from "@/lib/utils";

const TAG_TONE: Record<ResolvedField["tag"], string> = {
  LOOKUP: "bg-info/10 text-info border-info/30",
  CALC: "bg-highlight/10 text-highlight border-highlight/30",
  CHOICE: "bg-primary/10 text-primary border-primary/30",
  QUIRK: "bg-warning/10 text-warning border-warning/30",
  FIXED: "bg-muted text-muted-foreground border-border",
};

interface Choices {
  aluminiumVendor: string;
  xlpeVendor: string;
  curing: string;
  drumLength: string;
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
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  options: readonly number[];
  /** Adds a "None" option (value 0) — used by the optional street-light core. */
  allowNone?: boolean;
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
            {o}
          </option>
        ))}
      </select>
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

export default function GtpBuilderPage() {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  // The size is chosen via pickers; `sizeInput` is the composed designation the parser reads.
  const [selection, setSelection] = useState<SizeSelection>(defaultSelection);
  const sizeInput = buildSizeString(selection);
  const [confirmed, setConfirmed] = useState(false);
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
  const [startMode, setStartMode] = useState<"choose" | "scratch">("choose");
  const [templateName, setTemplateName] = useState("");
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  /** Field key the user was last sent to from a validation issue — briefly highlighted. */
  const [highlightedField, setHighlightedField] = useState<string | null>(null);

  // Moment 2 — built directly from the pickers — no string parsing, so no role guessing (see compose-size).
  const construction = useMemo(() => constructionFromSelection(selection), [selection]);

  // Moment 4 — derive the full field map once a profile + confirmed construction exist.
  const fields = useMemo<ResolvedField[]>(() => {
    if (!profile || !confirmed) return [];
    return deriveFields(construction, profile.quirks);
  }, [profile, construction, confirmed]);

  // Moment 5 — validation gate. Clean de-rating ladder assumed for the demo; drum matches order.
  const validation = useMemo(() => {
    if (fields.length === 0) return null;
    return validateGtp(fields, {
      deratingFactors: [1.22, 1.16, 1.09, 1.0, 0.9],
      drumLengthM: 1000,
      orderedLengthM: 1000,
    });
  }, [fields]);

  function pickProfile(p: CustomerProfile) {
    setProfile(p);
    setConfirmed(false);
    setChoices(null);
    setSelection(defaultSelection());
    setAckWarnings(false);
    setHighlightedField(null);
  }

  /** Change one part of the size; any edit invalidates the earlier confirmation. */
  function updateSelection(patch: Partial<SizeSelection>) {
    setSelection((current) => ({ ...current, ...patch }));
    setConfirmed(false);
  }

  function confirmSize() {
    if (!profile) return;
    setConfirmed(true);
    setChoices({
      aluminiumVendor: profile.choices.aluminiumVendors[0],
      xlpeVendor: profile.choices.xlpeVendors[0],
      curing: profile.choices.curingMethods[0],
      drumLength: profile.choices.drumLengthOptions[0],
    });
  }

  /** Start from a saved template: restore its inputs, then re-derive from live IS tables. */
  function startFromTemplate(template: GtpTemplate) {
    const p = findProfile(template.profileId);
    if (!p) return;
    setProfile(p);
    // Templates store the designation string; recover the picker state from it.
    setSelection(selectionFromSizeString(template.sizeInput) ?? defaultSelection());
    setChoices(template.choices);
    setConfirmed(true);
    setAckWarnings(false);
    setStartMode("scratch");
    recordTemplateUse(template.id);
    setVersion((v) => v + 1);
    setSavedNotice(`Started from "${template.name}". Every value below was re-derived from the current IS tables.`);
  }

  /** Save the inputs just used as a reusable named starting point. */
  function handleSaveTemplate() {
    const name = templateName.trim();
    if (!name || !profile || !choices) return;
    saveTemplate({ name, profileId: profile.id, sizeInput, choices });
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

  const canGenerate =
    validation?.passesHardGate && (validation.warningCount === 0 || ackWarnings);
  const canSaveTemplate = Boolean(profile && choices && confirmed && templateName.trim());

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
      {startMode === "choose" ? (
        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <h2 className="text-base font-semibold text-foreground">How do you want to start?</h2>
          {templates.length > 0 ? (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                Start from one of your saved templates — it fills in the customer, size and answers.
              </p>
              <ul className="mt-4 space-y-2">
                {templates.map((t) => {
                  const p = findProfile(t.profileId);
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => startFromTemplate(t)}
                        className="flex w-full items-center justify-between gap-3 rounded-md border border-border p-4 text-left hover:bg-muted"
                      >
                        <span className="min-w-0">
                          <span className="flex items-center gap-2 font-medium text-foreground">
                            <LayoutTemplate className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                            {t.name}
                          </span>
                          <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                            {p?.name ?? t.profileId} · <span className="font-mono">{t.sizeInput}</span>
                            {t.useCount > 0 ? ` · used ${t.useCount}×` : ""}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-medium text-primary">Use →</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                onClick={() => setStartMode("scratch")}
                className="mt-4 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                Or start from scratch
              </button>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                You haven&rsquo;t saved any templates yet. Build a GTP below, then save its answers as a
                template so the next one takes a few taps.
              </p>
              <Button type="button" className="mt-4" onClick={() => setStartMode("scratch")}>
                Start a new GTP
              </Button>
            </>
          )}
        </section>
      ) : null}

      {/* Moment 1 — Who is this for? */}
      {startMode === "scratch" ? (
      <Moment n={1} title="Who is this GTP for?">
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
      ) : null}

      {/* Moment 2 — What's the cable? */}
      {profile ? (
        <Moment n={2} title="What's the cable?">
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
              Designation: {sizeInput}
            </p>

            {true ? (
              <div className="rounded-md border border-border bg-muted p-3">
                <p className="text-sm text-foreground" dangerouslySetInnerHTML={{ __html: renderPlayback(`${describeSelection(selection)} Correct?`) }} />
                {!confirmed ? (
                  <Button type="button" size="sm" className="mt-3" onClick={confirmSize}>
                    Yes, continue
                  </Button>
                ) : (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Confirmed
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </Moment>
      ) : null}

      {/* Moment 3 — A few questions */}
      {confirmed && profile && choices ? (
        <Moment n={3} title="A few questions">
          <div className="grid gap-4 sm:grid-cols-2">
            <ChoiceField
              label="Aluminium supplier (this batch)"
              value={choices.aluminiumVendor}
              options={profile.choices.aluminiumVendors}
              onChange={(v) => setChoices({ ...choices, aluminiumVendor: v })}
            />
            <ChoiceField
              label="XLPE compound supplier"
              value={choices.xlpeVendor}
              options={profile.choices.xlpeVendors}
              onChange={(v) => setChoices({ ...choices, xlpeVendor: v })}
            />
            <ChoiceField
              label="Curing method"
              value={choices.curing}
              options={profile.choices.curingMethods}
              onChange={(v) => setChoices({ ...choices, curing: v })}
            />
            <ChoiceField
              label="Drum length"
              value={choices.drumLength}
              options={profile.choices.drumLengthOptions}
              onChange={(v) => setChoices({ ...choices, drumLength: v })}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Pre-filled from {profile.name}&rsquo;s last approved GTPs. Change only what&rsquo;s different.
          </p>

          {/* Save these inputs as a reusable starting point. Secondary to Generate. */}
          <div className="mt-4 border-t border-border pt-4">
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
                <thead className="bg-muted text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3 font-medium">Field</th>
                    <th className="p-3 font-medium">Value</th>
                    <th className="p-3 font-medium">Source</th>
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
                        // Flash the row the user was sent to, so the jump is unmistakable.
                        highlightedField === f.key && "bg-primary/10 ring-2 ring-inset ring-primary",
                      )}
                    >
                      <td className="p-3 text-foreground">{f.label}</td>
                      <td className="p-3">
                        <span className="flex items-center gap-1.5">
                          {!f.editable ? <Lock className="h-3 w-3 text-muted-foreground" aria-hidden="true" /> : null}
                          <span className="font-mono">{String(f.value)}</span>
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={cn("mr-2 inline-block rounded-sm border px-1.5 py-0.5 text-[10px] font-medium", TAG_TONE[f.tag])}>
                          {f.tag}
                        </span>
                        <span className="text-xs text-muted-foreground">{f.trace}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
            <Button type="button" disabled={!canGenerate}>
              <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
              Generate GTP
            </Button>
          </div>
          {!canGenerate && validation.errorCount > 0 ? (
            <p className="mt-2 text-xs text-danger">
              Fix the errors above before generating — the GTP can&rsquo;t be issued on unverified data.
            </p>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}

function ChoiceField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

/** The playback string uses **bold** markers; render them as <strong> safely (no user HTML). */
function renderPlayback(playback: string): string {
  return playback
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}
