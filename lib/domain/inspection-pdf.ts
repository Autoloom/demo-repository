/**
 * The inspection checklist as a document — what goes to the inspector.
 *
 * It is the stamped GTP read back as a form: every parameter the customer approved, the value and
 * tolerance the GTP states, and empty boxes for what the inspector measures and whether it passes.
 * The inspector tests against THIS, not against the IS value where the two differ, and the sheet
 * says so at the top, because that is the sentence that settles an argument on the shop floor.
 *
 * Blank by design. The digital record on the order board is where a result is kept; this is the
 * paper the inspector carries and signs.
 */
import { formatDate } from "./format";
import type { ChecklistItem } from "./inspection-checklist";
import type { PdfDocument } from "./pdf";
import type { Gtp } from "../services/types";

export function inspectionChecklistDocument({
  gtp,
  orderId,
  customerName,
  cables,
  items,
  companyName,
}: {
  gtp: Gtp;
  orderId: string;
  customerName: string;
  cables: string[];
  items: ChecklistItem[];
  companyName: string;
}): PdfDocument {
  const stamps = gtp.signOffs.length
    ? gtp.signOffs.map((stamp) => `${stamp.role}: ${stamp.name} (${formatDate(stamp.stampedAt)})`).join("   |   ")
    : "Not yet stamped";

  return {
    title: "Inspection checklist",
    subtitle: `Against the customer-stamped GTP ${gtp.id}, version ${gtp.version}`,
    meta: [
      `Order: ${orderId}   |   Customer: ${customerName}`,
      `Cable: ${cables.join("; ") || gtp.cableType}`,
      `GTP stamped by - ${stamps}`,
      "Test against this GTP, not against the IS value where the two differ: the stamped GTP is the requirement.",
    ],
    sections: [
      {
        title: "Parameters",
        table: {
          headers: ["No.", "Parameter", "GTP value", "Tolerance", "Measured", "Pass / Fail / N/A"],
          widths: [26, 170, 118, 58, 82, 57],
          grid: true,
          minRowHeight: 26,
          headerAlign: "center",
          align: ["center", "left", "left", "left", "left", "center"],
          rows: items.map((item, index) => [String(index + 1), item.label, item.gtpValue, item.tolerance, "", ""]),
        },
      },
      {
        title: "Result",
        lines: [
          "",
          "Overall result:      [   ] Passed        [   ] Failed - re-inspection required",
          "",
          "Dispatch clearance issued:      [   ] Yes        [   ] No           DI reference: ______________________",
          "",
          "Drums checked: ______________________________________________________________",
          "",
          "Non-conformances: ___________________________________________________________",
          "",
          "____________________________________________________________________________",
          "",
          "",
          "Inspector: __________________________   Organisation: __________________________",
          "",
          "Signature: __________________________   Date: ______________",
          "",
          "",
          `For ${companyName}: __________________________   Date: ______________`,
        ],
      },
    ],
  };
}
