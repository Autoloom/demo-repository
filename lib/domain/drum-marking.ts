/**
 * Drum marking builder (kamble-meeting-improvements.md §6).
 *
 * The client confirmed a full printed marking per drum — drum number, cable size,
 * length, consignee address, BIS/ISI licence — not just a markings string. This
 * module derives the marking fields from records that already exist so the label
 * always matches the GTP/spec, and renders a printable HTML label. Pure string
 * building only; the page opens a print window with the result.
 */
import type { CableSpec, Customer, DrumPlanItem, Order, OrgSettings } from "@/lib/services/types";

export interface DrumMarking {
  drumNo: string;
  manufacturer: string;
  designation: string;
  cableCode?: string;
  isStandard: string;
  voltageGrade: string;
  lengthM: number;
  grossWeightKg?: number;
  consigneeName: string;
  consigneeAddress: string;
  bisLicenceNo?: string;
  orderId: string;
}

export function buildDrumMarking(
  drum: DrumPlanItem,
  spec: CableSpec | undefined,
  order: Order,
  customer: Customer | undefined,
  org?: OrgSettings,
): DrumMarking {
  return {
    drumNo: drum.drumNo,
    manufacturer: org?.companyName ?? "Autoloom Cables Pvt. Ltd.",
    designation: spec?.designation ?? order.specSummary,
    cableCode: spec?.cableCode,
    isStandard: spec?.standard ?? "IS standard pending",
    voltageGrade: spec?.voltageGrade ?? "—",
    lengthM: drum.lengthM,
    grossWeightKg: drum.grossWeightKg,
    consigneeName: customer?.name ?? order.customerId,
    consigneeAddress: customer
      ? (customer.shippingAddress ?? customer.billingAddress) +
        `, ${customer.city}, ${customer.state} ${customer.pincode}`
      : "Consignee address pending",
    bisLicenceNo: spec?.bisLicenceNo,
    orderId: order.id,
  };
}

function esc(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Printable 2-column label. The dispatch checklist's "marking matches GTP" item
 * assumes markings come from here, so the layout must only read marking fields.
 */
export function drumMarkingHtml(marking: DrumMarking): string {
  const rows: Array<[string, string]> = [
    ["Cable", marking.designation],
    ["Standard", `${marking.isStandard} · ${marking.voltageGrade}`],
    ["Length", `${marking.lengthM} m`],
    ["Gross weight", marking.grossWeightKg ? `${marking.grossWeightKg} kg` : "—"],
    ["Consignee", `${marking.consigneeName}, ${marking.consigneeAddress}`],
    ["Order", marking.orderId],
  ];
  return `<!doctype html><html><head><title>Drum marking ${esc(marking.drumNo)}</title>
<style>
  body { font-family: -apple-system, "Segoe UI", sans-serif; margin: 24px; color: #111; }
  .marking { border: 2px solid #111; max-width: 560px; }
  .head { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #111; padding: 12px 16px; }
  .drum { font-family: ui-monospace, monospace; font-size: 34px; font-weight: 700; }
  .brand { text-align: right; font-size: 13px; font-weight: 600; }
  .bis { border: 1.5px solid #111; border-radius: 50%; width: 46px; height: 46px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; margin-left: auto; margin-top: 4px; }
  table { border-collapse: collapse; width: 100%; }
  td { border-bottom: 1px solid #999; padding: 8px 16px; font-size: 13px; vertical-align: top; }
  td.label { width: 130px; font-weight: 600; text-transform: uppercase; font-size: 11px; color: #333; }
  .lic { padding: 10px 16px; font-family: ui-monospace, monospace; font-size: 12px; }
  @media print { body { margin: 0; } }
</style></head><body>
<div class="marking">
  <div class="head">
    <div class="drum">${esc(marking.drumNo)}</div>
    <div class="brand">${esc(marking.manufacturer)}${marking.cableCode ? `<br/><span style="font-family:ui-monospace,monospace">${esc(marking.cableCode)}</span>` : ""}<div class="bis">BIS<br/>ISI</div></div>
  </div>
  <table>${rows
    .map(([label, value]) => `<tr><td class="label">${esc(label)}</td><td>${esc(value)}</td></tr>`)
    .join("")}</table>
  <div class="lic">${marking.bisLicenceNo ? `BIS licence ${esc(marking.bisLicenceNo)} · ` : ""}${esc(marking.isStandard)}</div>
</div>
<script>window.print();</script>
</body></html>`;
}
