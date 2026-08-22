"use client";

/**
 * IS standards viewer.
 *
 * Shows every table the derivation engine reads, with its edition and per-row clause refs, so an
 * engineer can see exactly what the GTP is built from.
 *
 * ⚠️ WHY THE TABLES ARE READ-ONLY: the standards layer is versioned and immutable by design
 * (design-doc §0.3). Editing IS 8130:2013 in place would silently change every past GTP derived
 * from it — and a discom can reject a delivered lot that doesn't match its approved GTP. So when a
 * standard is amended, the correct action is to record a NEW edition, not to overwrite this one.
 * That keeps old GTPs re-rendering identically forever, which is the whole point of pinning.
 */
import { BookOpen, CircleAlert, Info } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { IS14255_1995_EDITION, IS14255_1995_MESSENGER_PAIRING, IS14255_1995_PHASE } from "@/lib/domain/standards/is14255-1995";
import { IS398_4_EDITION, IS398_4_MESSENGER } from "@/lib/domain/standards/is398-4";
import { CABLE_TYPES } from "@/lib/domain/gtp/cable-types";
import { IS8130_2013_EDITION, IS8130_2013_TABLE2_STRANDED } from "@/lib/domain/standards/is8130-2013";
import { findWorksConductor } from "@/lib/domain/standards/works-conductor-data";
import { cn } from "@/lib/utils";

/** A row whose value came from a real document vs. one still awaiting the licensed PDF. */
function SourceCell({ refText }: { refText: string }) {
  const isGap = /GAP/i.test(refText);
  return (
    <span className={cn("text-xs", isGap ? "text-warning" : "text-muted-foreground")}>{refText}</span>
  );
}

function StandardSection({
  id,
  title,
  edition,
  note,
  children,
}: {
  id: string;
  title: string;
  edition: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="rounded-lg border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
        <div>
          <h2 className="font-semibold text-foreground">{title}</h2>
          {note ? <p className="mt-0.5 text-sm text-muted-foreground">{note}</p> : null}
        </div>
        <span className="rounded-sm border border-border bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
          Edition {edition}
        </span>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

export default function StandardsPage() {
  const [showAmendHelp, setShowAmendHelp] = useState(false);

  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <header className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
            <BookOpen className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            IS standards
          </h1>
          <Link href="/gtp" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
            Back to GTP
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">
          The IS tables GTPs are derived from, grouped by cable type. Each row shows the clause it
          came from.
        </p>
      </header>

      {/* The immutability rule, stated plainly rather than hidden in code comments. */}
      <div className="rounded-lg border border-info/30 bg-info/10 p-4">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
          <div className="space-y-2 text-sm">
            <p className="text-foreground">
              <strong>These tables can&rsquo;t be edited in place — on purpose.</strong> A GTP that was
              approved last year must still print exactly the same values today. If we overwrote a
              number here, every past GTP would silently change, and a buyer could reject a delivery
              for not matching its approved GTP.
            </p>
            <p className="text-muted-foreground">
              When a standard is amended, we add it as a <em>new edition</em> and point customers at
              it — old GTPs keep using the edition they were approved under.
            </p>
            <Button type="button" variant="secondary" size="sm" onClick={() => setShowAmendHelp((v) => !v)}>
              {showAmendHelp ? "Hide" : "A standard has changed — what do I do?"}
            </Button>
            {showAmendHelp ? (
              <div className="rounded-md border border-border bg-card p-3 text-sm">
                <p className="font-medium text-foreground">Recording an amendment</p>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
                  <li>Get the amended standard from the BIS portal (the licensed PDF, not a scrape).</li>
                  <li>
                    Send it to the Cable OS team — we add it as a new edition module (e.g.
                    <span className="font-mono"> IS 8130:2013+A1</span>) alongside the existing one.
                  </li>
                  <li>
                    Each customer profile is then re-pinned to the new edition. GTPs already approved
                    stay on their old pin and keep printing identically.
                  </li>
                </ol>
                <p className="mt-2 text-xs text-muted-foreground">
                  In-app editing of standards data is intentionally not offered — a typo here would
                  propagate to every future GTP with no audit trail.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Rows the engine can't yet source are flagged, since they block GTP generation. */}
      <div className="rounded-lg border border-warning/30 bg-warning/10 p-4">
        <div className="flex items-start gap-3">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <p className="text-sm text-foreground">
            Values marked <span className="font-medium text-warning">GAP</span> below are estimates
            awaiting the licensed IS PDF. A GTP using one is blocked from generating until the real
            value is encoded — the engine will not issue a document on unverified data.
          </p>
        </div>
      </div>

      {/* Standards are grouped by the product line they serve. Every table below is AB-specific,
          which wasn't obvious when they were a flat list. */}
      <div className="flex items-center gap-3 pt-2">
        <h2 className="text-lg font-semibold text-foreground">Aerial Bunched (AB) cable</h2>
        <span className="rounded-sm border border-success/30 bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
          In use
        </span>
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
      </div>
      <p className="-mt-2 text-sm text-muted-foreground">
        The four tables every AB-cable GTP is derived from.
      </p>

      <StandardSection
        id="is8130"
        title="IS 8130 — Conductors (Class 2 aluminium)"
        edition={IS8130_2013_EDITION}
        note="Strand counts, diameters and resistances for the phase and street-light cores."
      >
        <table className="w-full text-left text-sm">
          <thead className="bg-muted text-xs text-muted-foreground">
            <tr>
              <th className="p-3 font-medium">Size (sq mm)</th>
              <th className="p-3 font-medium">Min wires (circular)</th>
              <th className="p-3 font-medium">Min wires (compacted)</th>
              <th className="p-3 font-medium">Max DC resistance (Ω/km)</th>
              <th className="p-3 font-medium">Conductor dia (mm)</th>
              <th className="p-3 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {IS8130_2013_TABLE2_STRANDED.filter((row) => row.alOhmPerKm !== null && row.csaSqMm <= 120).map((row) => {
              // Dimensions are NOT in IS 8130 (§3.2) — they come from works data and are marked
              // as such, so the table never implies the standard specifies a diameter.
              const works = findWorksConductor(row.csaSqMm);
              return (
                <tr key={row.csaSqMm} className="border-t border-border">
                  <td className="p-3 font-mono font-medium">{row.csaSqMm}</td>
                  <td className="p-3 font-mono">{row.minWiresCircularAl ?? "—"}</td>
                  <td className="p-3 font-mono">{row.minWiresCompactedAl ?? "—"}</td>
                  <td className="p-3 font-mono">{row.alOhmPerKm}</td>
                  <td className="p-3 font-mono">
                    {works ? (
                      <span className={cn(!works.verified && "text-amber-600 dark:text-amber-500")}>
                        {works.conductorDiaMm.toFixed(2)}
                        <span className="ml-1 text-[10px] uppercase tracking-wide">
                          {works.verified ? "works" : "est."}
                        </span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-3">
                    <SourceCell refText={`IS 8130 : 2013, Table 2 (${row.csaSqMm} sq mm, Al)`} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </StandardSection>

      <StandardSection
        id="is14255-insulation"
        title="IS 14255 — Insulation thickness & current rating"
        edition={IS14255_1995_EDITION}
        note="XLPE wall thickness and ampacity per conductor size."
      >
        <table className="w-full text-left text-sm">
          <thead className="bg-muted text-xs text-muted-foreground">
            <tr>
              <th className="p-3 font-medium">Size (sq mm)</th>
              <th className="p-3 font-medium">Insulation (mm)</th>
              <th className="p-3 font-medium">Current rating (A)</th>
              <th className="p-3 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {IS14255_1995_PHASE.slice()
              .sort((a, b) => a.csaSqMm - b.csaSqMm)
              .map((row) => (
                <tr key={row.csaSqMm} className="border-t border-border">
                  <td className="p-3 font-mono font-medium">{row.csaSqMm}</td>
                  <td className="p-3 font-mono">{row.insulationThicknessMinMm.toFixed(2)}</td>
                  <td className="p-3 font-mono">
                    {row.currentRatingA} @ {row.currentRatingRefTempC}°C
                  </td>
                  <td className="p-3">
                    <SourceCell refText={row.ref} />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </StandardSection>

      <StandardSection
        id="is14255-pairing"
        title="IS 14255 — Phase → messenger pairing"
        edition={IS14255_1995_EDITION}
        note="Which messenger size goes with each phase size, and the breaking load it must meet."
      >
        <table className="w-full text-left text-sm">
          <thead className="bg-muted text-xs text-muted-foreground">
            <tr>
              <th className="p-3 font-medium">Phase (sq mm)</th>
              <th className="p-3 font-medium">Messenger (sq mm)</th>
              <th className="p-3 font-medium">Min breaking load (kN)</th>
              <th className="p-3 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {IS14255_1995_MESSENGER_PAIRING.map((row) => (
              <tr key={row.phaseSqMm} className="border-t border-border">
                <td className="p-3 font-mono font-medium">{row.phaseSqMm}</td>
                <td className="p-3 font-mono">{row.messengerSqMm}</td>
                <td className="p-3 font-mono">{row.minBreakingLoadKN}</td>
                <td className="p-3">
                  <SourceCell refText={row.ref} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </StandardSection>

      <StandardSection
        id="is398-4"
        title="IS 398 Pt-4 — Messenger (Al-Mg-Si alloy)"
        edition={IS398_4_EDITION}
        note="Alloy properties for the neutral-cum-messenger wire that carries the mechanical load."
      >
        <table className="w-full text-left text-sm">
          <thead className="bg-muted text-xs text-muted-foreground">
            <tr>
              <th className="p-3 font-medium">Size (sq mm)</th>
              <th className="p-3 font-medium">Strands</th>
              <th className="p-3 font-medium">Compacted dia (mm)</th>
              <th className="p-3 font-medium">Breaking load (kN)</th>
              <th className="p-3 font-medium">Resistance (Ω/km)</th>
              <th className="p-3 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {IS398_4_MESSENGER.map((row) => (
              <tr key={row.csaSqMm} className="border-t border-border">
                <td className="p-3 font-mono font-medium">{row.csaSqMm}</td>
                <td className="p-3 font-mono">{row.strands}</td>
                <td className="p-3 font-mono">{row.compactedDiaMm.toFixed(2)}</td>
                <td className="p-3 font-mono">{row.breakingLoadKN}</td>
                <td className="p-3 font-mono">{row.maxDcResistanceOhmPerKm}</td>
                <td className="p-3">
                  <SourceCell refText={row.ref} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </StandardSection>

      {/* Other product lines, from the same registry the builder uses — so this page can't claim
          a line is coming that the builder doesn't offer, or vice versa. */}
      {CABLE_TYPES.filter((line) => !line.available).map((line) => (
        <section key={line.id} className="space-y-2">
          <div className="flex items-center gap-3 pt-2">
            <h2 className="text-lg font-semibold text-muted-foreground">{line.label}</h2>
            <span className="rounded-sm border border-border bg-muted px-2 py-0.5 text-xs font-medium uppercase text-muted-foreground">
              Not encoded yet
            </span>
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
          </div>
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
            <p className="text-sm text-muted-foreground">{line.description}</p>
            <p className="mt-2 text-sm text-foreground">
              Would be derived from:{" "}
              <span className="font-mono text-xs">
                {[line.primaryStandard, ...line.supportingStandards].map((s) => `${s.id}:${s.edition}`).join(" · ")}
              </span>
            </p>
            {line.blockedReason ? (
              <p className="mt-2 text-xs text-warning">{line.blockedReason}</p>
            ) : null}
          </div>
        </section>
      ))}
    </main>
  );
}
