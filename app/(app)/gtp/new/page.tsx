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
  Lock,
  Search,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deriveFields } from "@/lib/domain/gtp/derive";
import { parseSizeString } from "@/lib/domain/gtp/parse-size";
import { CUSTOMER_PROFILES, type CustomerProfile } from "@/lib/domain/gtp/profiles";
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
  const [sizeInput, setSizeInput] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [choices, setChoices] = useState<Choices | null>(null);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [ackWarnings, setAckWarnings] = useState(false);

  // Moment 2 — parse live as they type; confirm gates the rest.
  const parsed = useMemo(() => (sizeInput.trim() ? parseSizeString(sizeInput) : null), [sizeInput]);

  // Moment 4 — derive the full field map once a profile + confirmed construction exist.
  const fields = useMemo<ResolvedField[]>(() => {
    if (!profile || !parsed?.ok || !confirmed) return [];
    return deriveFields(parsed.construction, profile.quirks);
  }, [profile, parsed, confirmed]);

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
    setSizeInput("");
    setAckWarnings(false);
  }

  function confirmSize() {
    if (!profile || !parsed?.ok) return;
    setConfirmed(true);
    setChoices({
      aluminiumVendor: profile.choices.aluminiumVendors[0],
      xlpeVendor: profile.choices.xlpeVendors[0],
      curing: profile.choices.curingMethods[0],
      drumLength: profile.choices.drumLengthOptions[0],
    });
  }

  const canGenerate =
    validation?.passesHardGate && (validation.warningCount === 0 || ackWarnings);

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

      {/* Moment 1 — Who is this for? */}
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
      </Moment>

      {/* Moment 2 — What's the cable? */}
      {profile ? (
        <Moment n={2} title="What's the cable?">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="size">Cable size (type it the way it&rsquo;s on the order)</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="size"
                  value={sizeInput}
                  placeholder="3Cx70 + 1Cx50 + 1Cx16"
                  className="pl-9"
                  onChange={(e) => {
                    setSizeInput(e.target.value);
                    setConfirmed(false);
                  }}
                />
              </div>
            </div>

            {parsed && !parsed.ok ? (
              <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
                <p className="text-foreground">{parsed.reason}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {parsed.suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSizeInput(s)}
                      className="rounded-sm border border-border bg-card px-2 py-1 font-mono text-xs hover:bg-muted"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {parsed?.ok ? (
              <div className="rounded-md border border-border bg-muted p-3">
                <p className="text-sm text-foreground" dangerouslySetInnerHTML={{ __html: renderPlayback(parsed.playback) }} />
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
                    <tr key={f.key} className={cn("border-t border-border", f.gap && "bg-danger/5")}>
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
              {validation.issues.map((issue) => (
                <li key={issue.id} className="flex items-start gap-2 text-sm">
                  <CircleAlert
                    className={cn("mt-0.5 h-4 w-4 shrink-0", issue.severity === "error" ? "text-danger" : "text-warning")}
                    aria-hidden="true"
                  />
                  <span className="text-foreground">{issue.message}</span>
                </li>
              ))}
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
