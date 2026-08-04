"use client";

/**
 * GTP output — the one cable-builder document we have a real template for.
 *
 * Laid out to mirror the approved WBSEDCL document's own structure (header block,
 * then Sl. No. 1.0 … 20) so an inspector can read this side-by-side with the paper
 * copy. Printing goes through the browser rather than a PDF library: no new
 * dependency, and the page is the preview.
 *
 * The approval banner and corrections list are not decoration. The source is stamped
 * "PROVISIONALLY APPROVED" and the approver changed values by hand (sag 3% → 1.5%).
 * Showing the submitted-vs-approved delta is the difference between a document you
 * can hand to an inspector and one you merely hope matches.
 */

import { ArrowLeftIcon, PrinterIcon } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Button, Card } from "@/components/ui";
import { buildGtpSections } from "@/lib/domain/gtp-document";
import { abcSampleGtp } from "@/lib/seed/abc-gtp-sample";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<string, string> = {
  "Provisionally approved": "border-warning/40 bg-warning/10 text-warning",
  Approved: "border-success/40 bg-success/10 text-success",
  Submitted: "border-info/40 bg-info/10 text-info",
  Draft: "border-border bg-muted text-muted-foreground",
  Superseded: "border-danger/40 bg-danger/10 text-danger",
};

export default function GtpDocumentPage() {
  const doc = abcSampleGtp;
  const sections = React.useMemo(() => buildGtpSections(doc), [doc]);

  return (
    <div className="space-y-4">
      {/* Screen-only controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Button asChild variant="outline" size="sm">
          <Link href="/cable-builder">
            <ArrowLeftIcon className="mr-2 size-4" />
            Back to builder
          </Link>
        </Button>
        <Button type="button" onClick={() => window.print()}>
          <PrinterIcon className="mr-2 size-4" />
          Print / save as PDF
        </Button>
      </div>

      <Card className="rounded-md p-6 print:border-0 print:p-0 print:shadow-none">
        {/* ── Header block ── */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
          <div>
            <h1 className="text-lg font-semibold">Guaranteed Technical Particulars</h1>
            <p className="mt-1 text-sm text-muted-foreground">{doc.order.itemTitle}</p>
          </div>
          <div className="text-right">
            <span
              className={cn(
                "inline-flex items-center rounded-sm border px-2 py-1 text-xs font-medium",
                STATUS_TONE[doc.status] ?? STATUS_TONE.Draft,
              )}
            >
              {doc.status}
            </span>
            {doc.memoNo ? <p className="mt-1 font-mono text-xs text-muted-foreground">{doc.memoNo}</p> : null}
          </div>
        </div>

        <dl className="grid gap-x-6 gap-y-2 border-b py-4 text-sm sm:grid-cols-2">
          <Field label="Project" value={doc.order.project} />
          <Field label="Owner / Customer" value={doc.order.customer} />
          <Field label="Package No" value={doc.order.packageNos.join(", ")} />
          <Field label="Districts" value={doc.order.districts?.join(", ") ?? "—"} />
          <Field label="Turnkey Agency" value={doc.order.turnkeyAgency} />
          <Field label="Manufacturer" value={doc.order.manufacturerName} />
          <Field label="Material Description" value={doc.order.materialDescription} className="sm:col-span-2" />
          <Field label="NOA No" value={doc.order.noaNumbers.join(" · ")} className="sm:col-span-2" />
          {doc.approvedBy ? (
            <Field label="Approved by" value={`${doc.approvedBy}${doc.approvedOn ? ` — ${doc.approvedOn}` : ""}`} className="sm:col-span-2" />
          ) : null}
        </dl>

        {/* ── Corrections made by the approver ── */}
        {doc.corrections?.length ? (
          <div className="mt-4 rounded-md border border-warning/30 bg-warning/5 p-3">
            <p className="text-xs font-semibold uppercase text-warning">Approver corrections</p>
            <table className="mt-2 w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 font-medium">Field</th>
                  <th className="py-1 font-medium">Submitted</th>
                  <th className="py-1 font-medium">Approved</th>
                </tr>
              </thead>
              <tbody>
                {doc.corrections.map((c) => (
                  <tr key={c.field} className="border-t border-warning/20">
                    <td className="py-1 pr-3">{c.field}</td>
                    <td className="py-1 pr-3 font-mono line-through text-muted-foreground">{c.submitted}</td>
                    <td className="py-1 font-mono font-semibold">{c.approved}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {/* ── Numbered particulars ── */}
        <div className="mt-6 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-y bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <th className="w-16 p-2 font-medium">Sl No</th>
                <th className="w-[38%] p-2 font-medium">Particulars</th>
                <th className="p-2 font-medium">Description</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((section) =>
                section.rows.map((row, i) => (
                  <tr key={`${section.slNo}-${row.marker ?? i}`} className="border-b align-top">
                    <td className="p-2 font-mono text-xs">{i === 0 ? section.slNo : ""}</td>
                    <td className="p-2">
                      {i === 0 ? <span className="font-medium">{section.title}</span> : null}
                      {section.rows.length > 1 || row.marker ? (
                        <span className={cn("block text-muted-foreground", i === 0 && "mt-1")}>
                          {row.marker ? `${row.marker}) ` : ""}
                          {row.label}
                        </span>
                      ) : null}
                    </td>
                    <td className="p-2">{row.value}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>

        {/* ── Footnotes ── */}
        {doc.footnotes?.length ? (
          <div className="mt-4 border-t pt-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Notes</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              {doc.footnotes.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function Field({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs uppercase text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}
