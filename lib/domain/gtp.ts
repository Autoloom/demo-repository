/**
 * GTP (Guaranteed Technical Particulars) helpers — pure functions only.
 *
 * The GTP is a hard production gate: the divisional engineer + AE must stamp it
 * before production begins. Sections are auto-filled from the contracted
 * CableSpec so a self-generated GTP needs zero re-typing, and client-fixed
 * formats (WBCL, MSEDCL templates in seed) override with the board's own text.
 */
import { suggestStandard } from "@/lib/domain/cable";
import type { CableSpec, Gtp, GtpSection, Order } from "@/lib/services/types";

/** Default GTP sections derived from a CableSpec (self-generated format). */
export function buildGtpSections(spec: CableSpec): GtpSection[] {
  const standard = spec.standard ?? suggestStandard(spec);
  const neutral = spec.neutralSizeSqMm ? ` + ${spec.neutralSizeSqMm} sq mm neutral` : "";
  return [
    {
      id: "gs-standard",
      label: "Applicable standard",
      value: `${standard} · ${spec.voltageGrade}`,
      source: "is-standard",
    },
    {
      id: "gs-conductor",
      label: "Conductor",
      value: `${spec.conductorMaterial}, ${spec.conductorClass}, ${spec.conductorSizeSqMm} sq mm${neutral}`,
      source: "is-standard",
    },
    {
      id: "gs-insulation",
      label: "Insulation",
      value: `${spec.insulation}${spec.screened ? ", screened" : ""}`,
      source: "is-standard",
    },
    { id: "gs-armour", label: "Armour", value: spec.armour, source: "is-standard" },
    {
      id: "gs-sheath",
      label: "Outer sheath",
      value: `${spec.sheath} (${spec.flameClass})`,
      source: "is-standard",
    },
    {
      id: "gs-tests",
      label: "Routine tests",
      value: "Conductor resistance, HVT, insulation resistance — per governing IS clause",
      source: "is-standard",
    },
    {
      id: "gs-marking",
      label: "Drum marking",
      value: "Consignee, drum no., designation, length, BIS/ISI mark",
      source: "client-fixed",
    },
    {
      id: "gs-delivery",
      label: "Delivery drums",
      value: "Steel-wood drums, standard lengths per drum plan",
      source: "client-fixed",
    },
  ];
}

/** The GTP linked to an order (by order.gtpId, falling back to gtp.orderId). */
export function gtpForOrder(gtps: Gtp[], order: Pick<Order, "id" | "gtpId">): Gtp | undefined {
  return gtps.find((gtp) => gtp.id === order.gtpId) ?? gtps.find((gtp) => gtp.orderId === order.id);
}

/**
 * Reuse quick-path: same client + same cable type (spec) ⇒ same GTP across
 * repeat orders. Falls back to a public-format template for the state.
 */
export function findReusableGtp(
  gtps: Gtp[],
  match: { customerId?: string; specId: string; state?: string },
): Gtp | undefined {
  const approvedForClient = gtps.find(
    (gtp) =>
      !gtp.isTemplate &&
      gtp.status === "Approved" &&
      gtp.customerId === match.customerId &&
      gtp.specId === match.specId,
  );
  if (approvedForClient) return approvedForClient;
  return gtps.find(
    (gtp) => gtp.isTemplate && (gtp.specId === match.specId || gtp.state === match.state),
  );
}
