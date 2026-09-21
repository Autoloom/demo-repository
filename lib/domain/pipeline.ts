/**
 * Job relationships and stage gates. Pure rules shared by service enforcement and
 * tracking surfaces; never infer inspection clearance from a checklist tick.
 */
import { gtpForOrder } from "./gtp";
import type { CableStore, Inquiry, InspectionReport, Order } from "../services/types";

/** Plural wins, including an explicit empty array. Legacy IDs remain readable. */
export function inquirySpecIds(inquiry: { specIds?: string[]; specId?: string }): string[] {
  return [...new Set(inquiry.specIds ?? (inquiry.specId ? [inquiry.specId] : []))];
}

export function normalizeInquiry(inquiry: Inquiry): Inquiry {
  const normalized = { ...inquiry, specIds: inquirySpecIds(inquiry) };
  delete normalized.specId;
  return normalized;
}

export function productionGateBlockers(store: CableStore, order: Order): string[] {
  const blockers: string[] = [];
  const gtp = gtpForOrder(store.gtps, order);
  if (!gtp || gtp.status !== "Approved") {
    blockers.push(gtp
      ? `GTP ${gtp.id} is ${gtp.status} — divisional engineer sign-off required.`
      : "No GTP on file — create and approve one in the GTP Generator.");
  }
  const qc = store.rawMaterialChecks.find((entry) => entry.orderId === order.id);
  if (!qc || qc.checks.length === 0 || !qc.checks.every((check) => check.result === "Pass")) {
    blockers.push(!qc ? "Incoming raw material QC has not been recorded."
      : qc.checks.length === 0 ? "Incoming raw material QC has no checks recorded."
      : "Incoming raw material QC has pending or failed checks.");
  }
  return blockers;
}

/** Latest inspection time wins; equal timestamps use newest recorded first (unshift). */
export function latestInspection(reports: InspectionReport[], orderId: string): InspectionReport | undefined {
  return reports.filter((report) => report.orderId === orderId).reduce<InspectionReport | undefined>(
    (latest, report) => !latest || Date.parse(report.inspectedAt) > Date.parse(latest.inspectedAt) ? report : latest,
    undefined,
  );
}

export function dispatchGateBlockers(store: CableStore, order: Order): string[] {
  const reports = store.inspectionReports.filter((report) => report.orderId === order.id);
  if (reports.some((report) => !Number.isFinite(Date.parse(report.inspectedAt)))) {
    return ["Inspection date is invalid — correct the inspection record before dispatch."];
  }
  const report = latestInspection(reports, order.id);
  if (!report) return ["No inspection report on file — inspection clearance is required before dispatch."];
  const blockers: string[] = [];
  if (report.result !== "Passed") blockers.push(`Inspection ${report.id} failed — re-inspection required.`);
  if (!report.clearanceIssued) blockers.push(`Inspection ${report.id} has no dispatch clearance (DI).`);
  return blockers;
}

export type DocumentState = { label: string; records: { id: string; status: string; href: string }[] };
export type InquiryBoardItem = Inquiry & { documents: DocumentState[] };

/** Include every linked document, rather than silently choosing the first cable/quote. */
export function documentTray(store: CableStore, inquiryId?: string, orderId?: string): DocumentState[] {
  const inquiry = store.inquiries.find((item) => item.id === inquiryId);
  const orders = store.orders.filter((item) => orderId ? item.id === orderId
    : Boolean(inquiryId) && (item.inquiryId === inquiryId || item.id === inquiry?.convertedOrderId
      || store.quotes.some((quote) => quote.inquiryId === inquiryId && quote.id === item.quoteId)));
  const orderIds = new Set(orders.map((order) => order.id));
  const quotes = store.quotes.filter((quote) => (inquiryId && quote.inquiryId === inquiryId)
    || orders.some((order) => order.quoteId === quote.id));
  const gtps = store.gtps.filter((gtp) => !gtp.isTemplate &&
    (Boolean(gtp.orderId && orderIds.has(gtp.orderId)) || orders.some((order) => order.gtpId === gtp.id)));
  return [
    { label: "Quote", records: quotes.map((quote) => ({ id: quote.id, status: quote.status, href: `/quote/${quote.id}` })) },
    { label: "GTP", records: gtps.map((gtp) => ({ id: gtp.id, status: gtp.status, href: `/gtp/review?orderId=${gtp.orderId ?? orders.find((order) => order.gtpId === gtp.id)?.id ?? ""}` })) },
    { label: "Job card", records: store.jobCards.filter((job) => orderIds.has(job.orderId)).map((job) => ({ id: job.id, status: "Created", href: `/job-card?orderId=${job.orderId}` })) },
    { label: "Inspection", records: orders.flatMap((order) => {
      const report = latestInspection(store.inspectionReports, order.id);
      return report ? [{ id: report.id, status: `${report.result} · ${report.clearanceIssued ? `DI issued${report.diRef ? ` (${report.diRef})` : ""}` : "No clearance"}`, href: `/dispatch?orderId=${order.id}` }] : [];
    }) },
    { label: "Dispatch", records: store.dispatches.filter((dispatch) => orderIds.has(dispatch.orderId)).map((dispatch) => ({
      id: dispatch.id, status: dispatch.dispatchedAt ? "Dispatched"
        : dispatchGateBlockers(store, orders.find((order) => order.id === dispatch.orderId)!).length ? "Awaiting clearance"
        : dispatch.checklist.filter((item) => item.required).every((item) => item.done) ? "Checklist complete" : "Checklist open",
      href: `/dispatch?orderId=${dispatch.orderId}`,
    })) },
  ];
}
