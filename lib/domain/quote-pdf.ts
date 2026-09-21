import type { computeGst, CostingResult } from "./costing";
import { formatDate, formatINR } from "./format";
import type { PdfDocument, PdfSection } from "./pdf";
import type { CableSpec, QuoteLine, Customer } from "@/lib/services/types";

/**
 * This document goes to the buyer. Never print margin, build target, or any other internal
 * commercial decision — the same D10 boundary `pdf-document.ts` enforces for the GTP applies
 * here (see `field-visibility.test.ts`). What prints is what the buyer is being asked to pay:
 * a per-material breakdown and a total, priced per metre and scaled to length — not how that
 * total was arrived at internally.
 */
export function quotePdfDocument({
  quoteId,
  customerName,
  selectedCustomer,
  lines,
  subtotalInr,
  gstSplit,
  totalInr,
  validUntil,
}: {
  validUntil?: string;
  quoteId?: string;
  customerName: string;
  selectedCustomer?: Customer;
  lines: { line: QuoteLine; spec: CableSpec; costing: CostingResult }[];
  subtotalInr: number;
  gstSplit: ReturnType<typeof computeGst>;
  totalInr: number;
}): PdfDocument {
  const customer = selectedCustomer?.name ?? (customerName.trim() || "Customer pending");

  const lineSections: PdfSection[] = lines.map(({ line, spec, costing }) => ({
    title: `${line.id} — ${spec.designation}`,
    table: {
      headers: ["Component", "₹ / kg", "₹ / m"],
      widths: [280, 100, 134],
      rows: [
        ...costing.components.map((component) => [
          component.label,
          component.ratePerKg > 0 ? formatINR(component.ratePerKg) : "-",
          formatINR(Math.round(component.costPerM)),
        ]),
        ["Cost per metre", "", formatINR(Math.round(costing.baseCostPerM))],
        [`x ${line.lengthM} m`, "", ""],
        ["Line total", "", formatINR(line.lineTotalInr)],
      ],
    },
  }));

  return {
    title: `Quotation ${quoteId ?? "Draft"}`,
    subtitle: "Daksha Cables - commercial quotation",
    meta: [
      `Customer: ${customer}`,
      selectedCustomer?.gstin ? `GSTIN: ${selectedCustomer.gstin}` : undefined,
      selectedCustomer ? `Location: ${[selectedCustomer.city, selectedCustomer.state].filter(Boolean).join(", ")}` : undefined,
      `Valid until: ${formatDate(validUntil ?? "")}`,
      `Tax: ${gstSplit.interstate ? "IGST 18%" : "CGST 9% + SGST 9%"}`,
    ],
    sections: [
      ...lineSections,
      {
        title: "Totals",
        table: {
          headers: ["Item", "Amount"],
          widths: [360, 154],
          rows: [
            ["Subtotal", formatINR(subtotalInr)],
            [gstSplit.interstate ? "IGST 18%" : "GST 18%", formatINR(gstSplit.gstInr)],
            ["Grand total", formatINR(totalInr)],
          ],
        },
      },
    ],
  };
}
