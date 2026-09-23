import type { ResolvedField } from "@/lib/domain/gtp/types";

export type Role = "Owner" | "Sales" | "Operations" | "Accounts";

export type Action =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "transition"
  | "approve"
  | "sync"
  | "export";

export type Resource =
  | "dashboard"
  | "inquiry"
  | "quote"
  | "order"
  | "gtp"
  | "jobcard"
  | "dispatch"
  | "invoice"
  | "contact"
  | "compliance"
  | "approvals"
  | "integrations"
  | "users"
  | "settings"
  | "activity";

export type PermissionKey = `${Action}:${Resource}`;

export interface PermissionContext {
  record?: {
    ownerRole?: Role;
    stage?: string;
    marginReviewRequired?: boolean;
    amountInr?: number;
  };
}

export type CableStandard =
  | "IS 7098-1"
  | "IS 7098-2"
  | "IS 9968-1"
  | "IS 1554-1"
  | "IS 694"
  | "IS 8130"
  | "IS 14255"
  // The Indian solar cable standard, and the right citation for a GTP produced here — the
  // cable-type registry already pins IS 17293 as SOLAR_DC's primary standard.
  | "IS 17293"
  | "IS 398-4"
  | "EN 50618"
  | "BS EN 60228"
  | "IEC 60584"
  | "SS EN 50397-1"
  | "IEC 60502-1"
  | "IEC 60502-2";
export type VoltageGrade =
  | "650/1100 V (1.1 kV)"
  | "600/1000 V DC"
  | "1.9/3.3 kV"
  | "3.8/6.6 kV"
  | "6.35/11 kV"
  | "12.7/22 kV"
  | "19/33 kV"
  | "13.8 kV"
  | "22 kV"
  | "33 kV";
export type CableFamily =
  | "LT PVC Power"
  | "LT XLPE Power"
  | "Control Cable"
  | "FR/FRLS/ZHFR Cable"
  | "House Wiring"
  | "Weatherproof Cable"
  | "Screened Instrumentation"
  | "Thermocouple Cable"
  | "Aerial Bunched Cable"
  | "Submersible Cable"
  | "Solar DC Cable"
  | "Covered Conductor";
export type ConductorMaterial =
  | "Aluminium"
  | "Copper"
  | "Tinned Copper"
  | "Aluminium Alloy"
  | "AAAC"
  | "ACSR"
  | "Thermocouple Alloy";
export type ConductorClass =
  | "Class 1 (solid)"
  | "Class 2 (stranded)"
  | "Class 2 compacted"
  | "Class 5 (flexible)"
  | "Messenger conductor"
  | "Thermocouple extension";
/**
 * Core counts across the range.
 *
 * The steps above 5 are the control-cable ladder. Niraj (13 Sept 2026): control cables "go up to
 * 61" cores and are a separate category from power. The gaps in this list were not cosmetic —
 * `specFromFields` rejects any config it cannot represent, so a 16-core control GTP derived
 * perfectly well and then could not be quoted at all.
 */
export type CoreConfig =
  | "1C"
  | "2C"
  | "3C"
  | "3.5C"
  | "4C"
  | "5C"
  | "6C"
  | "7C"
  | "8C"
  | "10C"
  | "12C"
  | "14C"
  | "16C"
  | "19C"
  | "21C"
  | "24C"
  | "27C"
  | "30C"
  | "37C"
  | "44C"
  | "52C"
  | "61C";

/** Every CoreConfig, for callers that need to test representability rather than hardcode a list. */
export const CORE_CONFIGS: readonly CoreConfig[] = [
  "1C", "2C", "3C", "3.5C", "4C", "5C", "6C", "7C", "8C", "10C", "12C",
  "14C", "16C", "19C", "21C", "24C", "27C", "30C", "37C", "44C", "52C", "61C",
];
export type Insulation =
  | "XLPE"
  | "PVC (Type A)"
  | "PVC (Type C)"
  | "EPR"
  | "XLPO (solar/UV)"
  | "Polyethylene"
  | "XLPE anti-tracking"
  | "HDPE anti-tracking";
export type ArmourType =
  | "Unarmoured"
  | "GI round wire (GSW)"
  | "GI strip (GSS)"
  | "Aluminium wire (AWA)"
  | "Aluminium strip";
export type SheathType =
  | "PVC (ST1)"
  | "PVC (ST2)"
  | "FR PVC"
  | "FRLS PVC"
  | "Zero-halogen (ZHFR/LSZH)"
  | "HDPE"
  | "Weatherproof PVC"
  | "XLPO (solar/UV)";
export type FlameClass = "FR" | "FRLS" | "LSZH" | "Standard";
export type DrumType = "Wooden" | "Steel" | "Steel-Wood";

export interface CableTechnicalData {
  approxCurrentRatingA?: number;
  approxCurrentRatingInAirA?: number;
  approxCurrentRatingInGroundA?: number;
  approxCurrentRatingInDuctA?: number;
  conductorResistanceOhmPerKm?: number;
  acResistanceOhmPerKm?: number;
  coreIdentification?: string;
  colour?: string;
}

export interface AerialBunchedDetails {
  phaseCount: 1 | 3;
  phaseSizeSqMm: number;
  messengerSizeSqMm: number;
  messengerInsulated?: boolean;
  streetLightSizeSqMm?: number;
}

export interface CoveredConductorDetails {
  networkVoltageKv: "13.8" | "22" | "33";
  conductorConstruction: "AAAC" | "ACSR";
  waterTight?: boolean;
  antiTrackingOuter?: boolean;
}

export interface InstrumentationDetails {
  grouping: "Pair" | "Triad";
  groupCount: number;
  individualScreen?: boolean;
  overallScreen?: boolean;
  drainWire?: boolean;
}

export interface ThermocoupleDetails {
  thermocoupleType: "J" | "K" | "T" | "R" | "S";
  pairCount: number;
  extensionGrade?: boolean;
}

export interface SolarDetails {
  dcPolarityColour: "Red" | "Black" | "Natural" | "Black with red stripe";
  halogenFree: boolean;
  uvResistant: boolean;
}

export interface SubmersibleDetails {
  shape: "Flat" | "Round";
  waterResistant: boolean;
}

export interface CableSpec {
  /** Declared GTP snapshot. Only the GTP builder writes the shared cable. */
  gtpSource?: import("@/lib/domain/gtp/spec-from-fields").GtpSpecSource;
  id: string;
  family?: CableFamily;
  standard: CableStandard;
  voltageGrade: VoltageGrade;
  cores: CoreConfig;
  conductorMaterial: ConductorMaterial;
  conductorClass: ConductorClass;
  conductorSizeSqMm: number;
  neutralSizeSqMm?: number;
  insulation: Insulation;
  armour: ArmourType;
  sheath: SheathType;
  flameClass: FlameClass;
  screened?: boolean;
  designation: string;
  cableCode?: string;
  approxOuterDiaMm?: number;
  approxWeightKgPerKm?: number;
  technical?: CableTechnicalData;
  aerialBunched?: AerialBunchedDetails;
  coveredConductor?: CoveredConductorDetails;
  instrumentation?: InstrumentationDetails;
  thermocouple?: ThermocoupleDetails;
  solar?: SolarDetails;
  submersible?: SubmersibleDetails;
  bisLicenceNo?: string;
  rohsCompliant?: boolean;
  notes?: string;
}

export interface Customer {
  id: string;
  name: string;
  segment:
    | "EPC contractor"
    | "Civil contractor"
    | "Solar installer"
    | "Utility distributor"
    | "OEM"
    | "Government/PSU"
    | "Trader/Dealer";
  contactName: string;
  phone: string;
  email: string;
  billingAddress: string;
  shippingAddress?: string;
  city: string;
  state: string;
  pincode: string;
  gstin: string;
  stateCode: string;
  paymentTerms: string;
  creditLimitInr: number;
  creditUsedInr?: number;
  msmeRegistered?: boolean;
  crmId?: string;
  createdAt: string;
}

export type InquiryStage = "New" | "Quoting" | "Quote sent" | "Won" | "Lost";
export interface Inquiry {
  id: string;
  customerId: string;
  requirement: string;
  specId?: string;
  source: "Repeat order" | "Tender portal" | "Website" | "Distributor call" | "Referral";
  tenderRef?: string;
  estimatedValueInr: number;
  stage: InquiryStage;
  ownerRole: Role;
  nextAction: string;
  followUpDate: string;
  convertedOrderId?: string;
  createdAt: string;
  /** Canonical cable IDs; legacy specId is accepted on reads only. */
  specIds: string[];
  commercialTerms?: string;
}

export type QuoteStatus = "Draft" | "Sent" | "Review" | "Approved" | "On board" | "Rejected";
export interface QuoteLine {
  /** Internal manufacturing decision; never rendered on buyer documents. */
  buildSpec?: import("@/lib/domain/gtp/build-spec").BuildSpec;
  /** Quote-local edits leave the shared GTP cable intact. */
  specSnapshot?: CableSpec;
  id: string;
  specId: string;
  lengthM: number;
  metalRatePerKg: number;
  overheadPerM: number;
  /**
   * The cost build-up this line was priced with: conversion, wastage, finance, drum, freight and
   * the margin over the total.
   *
   * Optional so lines saved before it still load. Per-material margins were removed on Niraj's
   * instruction (13 Sept) — "a single blended margin, not per-component" — and a line saved under
   * the old model falls back to its flat `marginPct` with zero uplifts, which reproduces exactly
   * what that line was quoted at rather than silently re-pricing history.
   */
  buildUp?: import("@/lib/domain/costing").CostBuildUp;
  /** Margin % over total cost. The 12% owner-review gate checks this. */
  marginPct: number;
  metalCostPerM: number;
  baseCostPerM: number;
  lineSubtotalInr: number;
  lineMarginInr: number;
  lineTotalInr: number;
  hsnCode: "8544";
  gstRatePct: 18;
}

export interface Quote {
  id: string;
  inquiryId?: string;
  /** The GTP this quote was started from. Cable OS 3 requires every quote to begin from one. */
  gtpId?: string;
  /**
   * `gtpId`'s `version` as it stood when this quote was priced. A quote may start from an
   * unstamped GTP — sign-off gates production, not pricing — but if the GTP is later corrected
   * or reopened, its version moves and this quote's price no longer reflects it. Compared against
   * the live GTP on load so the builder can warn rather than silently price stale values.
   */
  gtpVersionAtQuote?: number;
  customerId: string;
  lines: QuoteLine[];
  subtotalInr: number;
  gstInr: number;
  totalInr: number;
  status: QuoteStatus;
  validUntil: string;
  marginReviewRequired: boolean;
  convertedOrderId?: string;
  notes?: string;
  createdAt: string;
}

export type OrderStage = "Quoted" | "Won" | "In Production" | "Ready for Dispatch" | "Invoiced";
export type Priority = "Low" | "Medium" | "High";
export type InspectionStatus =
  | "Not called"
  | "Called"
  | "Inspector arrived"
  | "Passed"
  | "Failed";
export interface Order {
  id: string;
  quoteId: string;
  inquiryId?: string;
  customerId: string;
  title: string;
  specSummary: string;
  stage: OrderStage;
  priority: Priority;
  amountInr: number;
  promisedDate: string;
  completionPct: number;
  ownerRole: Role;
  dispatchId?: string;
  invoiceId?: string;
  jobCardId?: string;
  gtpId?: string;
  /** Set when the job card is issued — drives the "call inspection by" countdown. */
  estimatedCompletionDate?: string;
  inspectionStatus?: InspectionStatus;
  /** Date the inspection call was actually placed with the board/agency. */
  inspectionCallDate?: string;
  /** Expected inspector arrival (call date + ~11 days). */
  inspectorEtaDate?: string;
  createdAt: string;
}

// ── GTP (Guaranteed Technical Particulars) ────────────────────────────────────
// Hard production gate: an order cannot move to "In Production" until its GTP is
// Approved (divisional engineer + AE stamped). See kamble-meeting-improvements.md §1.
/**
 * The GTP lifecycle (PRD §5.2). Four statuses, deliberately no more — the tracker is meant to be
 * dumb enough that a documentation person updates it without training.
 *
 *   Draft → Submitted → Corrections received → Approved
 *                   ↖________________________↙
 *
 * "Corrections received" is the one that earns its place: it's where a returned mark-up is
 * captured, and each captured diff is what teaches the customer profile for the next GTP.
 * Only "Approved" opens the production gate.
 */
export type GtpStatus = "Draft" | "Submitted" | "Corrections received" | "Approved";
export type GtpFormat = "client-fixed" | "self-generated";
/**
 * Where a stored GTP row's value came from.
 *
 * Mirrors `FieldSource` on the live `ResolvedField`, but deliberately coarser: this is what a
 * reviewer sees on a saved document, not the full cascade. The distinction that matters here is
 * who is answerable for the value.
 *
 * `client-fixed` and `manual` were previously collapsed into one, so a value an operator typed
 * by hand was filed identically to one a board mandated. That is the same provenance claim this
 * codebase refuses to make elsewhere — works data is not an IS table — made silently, in the one
 * place a reviewer actually reads.
 *
 * NOTE: two creation paths populate this. The builder maps from `ResolvedField.tag`; the
 * order-driven path in `lib/services/index.ts` uses `buildGtpSections`, which knows only
 * `is-standard`. See the follow-up in build-plan-v3 — the real fix is one representation, and
 * that is WP-I/T2.5 work, not this task's.
 */
export type GtpSectionSource =
  /** Read from an encoded IS/IEC table, or calculated from one. */
  | "is-standard"
  /** Required by the buyer's own document format, not by any standard. */
  | "client-fixed"
  /** Typed by an operator. Nothing verifies it — the loosest provenance a printed row can have. */
  | "manual";

export interface GtpSection {
  id: string;
  label: string;
  value: string;
  /** Client-mandated sections have different edit rules than IS-standard ones. */
  source: GtpSectionSource;
}

export interface GtpSignOff {
  role: "Divisional Engineer" | "Assistant Engineer";
  name: string;
  stampedAt: string;
}

export interface Gtp {
  id: string;
  /** Absent on reusable templates (public formats pre-seeded per state/board). */
  orderId?: string;
  customerId?: string;
  /** Destination state — same client, different state = different GTP. */
  state: string;
  /** Board/client format name, e.g. "WBCL", "MSEDCL". */
  boardName?: string;
  specId: string;
  cableType: string;
  format: GtpFormat;
  /** Header of the formatted GTP sheet, e.g. "Daksha Cables Pvt. Ltd." (blank = fill by hand). */
  manufacturerName?: string;
  /** Board tender/PO reference printed on the formatted GTP sheet. */
  tenderNo?: string;
  sections: GtpSection[];
  status: GtpStatus;
  signOffs: GtpSignOff[];
  version: number;
  reusedFromGtpId?: string;
  isTemplate?: boolean;
  createdAt: string;
  updatedAt: string;
  /**
   * Engine-derived fields, snapshotted at generation time with their provenance
   * (tag/source/trace) — present on GTPs built by the derivation engine, absent on the older
   * section-based records. Stored rather than re-derived so an approved GTP keeps printing the
   * values it was approved with, even after the IS tables are amended.
   */
  derivedFields?: GtpDerivedField[];
  /**
   * Field keys omitted from the printed document, as at generation time.
   *
   * Stored so the record knows its own shape. Recomputing it from the template it came from
   * would be wrong: the template is mutable and may have been reshaped since.
   */
  hiddenFields?: string[];
  /** The cable designation the engine parsed, e.g. "3Cx70 + 1Cx50 + 1Cx16". */
  designation?: string;
  /** Which standard editions produced `derivedFields`. */
  standardsPin?: { standardId: string; edition: string }[];
  /**
   * Mark-ups received from the buyer, newest last. Each captured diff is a candidate quirk for
   * the customer profile — the mechanism by which the next GTP absorbs this correction.
   */
  corrections?: GtpCorrection[];
  /**
   * Order-specific quantities. Not part of the cable's construction — the same cable can be sold
   * in any quantity — but printed on the GTP and checked against the drum plan.
   */
  orderQuantities?: { totalLengthM: number; drumLengthM: number; drumCount: number };
}

export interface GtpCorrection {
  receivedAt: string;
  /** What the engineer said, in the operator's words. */
  note: string;
  diffs: { fieldKey: string; from: string; to: string }[];
}

/**
 * A `ResolvedField` as persisted on a GTP record.
 *
 * This is an ALIAS, not a copy. It used to be a hand-maintained duplicate of `ResolvedField`,
 * which failed in the worst available way: `derivedFields` is assigned from a variable rather
 * than an object literal, so TypeScript's excess-property check never fires. A member added to
 * `ResolvedField` and not mirrored here compiled clean and was silently dropped from every
 * saved record — no error, no warning, just missing data in a legally-binding document.
 *
 * The import direction is worth noting: `lib/domain/gtp/types.ts` already imports
 * `ConductorMaterial` from this file, so this creates a cycle. It is `import type` in both
 * directions, so it is erased at compile time and no cycle exists at runtime.
 */
export type GtpDerivedField = ResolvedField;

// ── Raw material incoming QC ──────────────────────────────────────────────────
// Pre-production gate: material must pass incoming checks before the job card can
// drive production. A Fail escalates to the Owner via the activity trail.
export interface RawMaterialCheckItem {
  id: string;
  label: string;
  result: "Pass" | "Fail" | "Pending";
}

export interface RawMaterialCheck {
  id: string;
  orderId: string;
  materialType: string;
  checks: RawMaterialCheckItem[];
  passedAt?: string;
  approvedBy?: string;
}

// ── Finished cable QC (per drum) ─────────────────────────────────────────────
// HVT / conductor resistance / IR per drum. These results ARE the test
// certificates — "Generate cert" stamps a certRef that flows to the dispatch
// checklist's per-drum certs.
export interface FinishedCableQc {
  id: string;
  orderId: string;
  drumNo: string;
  hvtResult: "Pass" | "Fail" | "Pending";
  resistanceMeasuredOhmPerKm?: number;
  resistanceSpecMaxOhmPerKm?: number;
  irValueMohmKm?: number;
  result: "Pass" | "Fail" | "Pending";
  certRef?: string;
  testedAt?: string;
}

// ── Machine incident log ─────────────────────────────────────────────────────
// Replaces the verbal operator → owner flow. Tagged by machineType + failureMode
// from day one so pattern detection can ship later without a data migration.
export type MachineType =
  | "Extruder"
  | "Stranding"
  | "Armouring"
  | "RBD (wire drawing)"
  | "Laying-up"
  | "Rewinding/Drum";

export type MachineIncidentStatus = "Open" | "Awaiting approval" | "Approved" | "Resolved";

export interface MachineIncident {
  id: string;
  orderId: string;
  jobCardId: string;
  machineType: MachineType;
  failureMode: string;
  description: string;
  proposedFix: string;
  status: MachineIncidentStatus;
  reportedAt: string;
  resolvedAt?: string;
}

// ── Inspection report digital log ────────────────────────────────────────────
// Replaces the QC manager's physical diary. clearanceIssued auto-ticks the
// dispatch checklist's "Inspection clearance" item.
export interface InspectionReport {
  id: string;
  orderId: string;
  inspectorName: string;
  inspectorOrg: string;
  inspectedAt: string;
  drumsChecked: string[];
  result: "Passed" | "Failed";
  nonConformances?: string[];
  clearanceIssued: boolean;
  diRef?: string;
}

export interface QualityCheck {
  id: string;
  label: string;
  result?: "Pass" | "Fail" | "Pending";
}

export interface DrumPlanItem {
  drumNo: string;
  drumType: DrumType;
  lengthM: number;
  grossWeightKg?: number;
  markings: string;
}

export interface JobCard {
  id: string;
  orderId: string;
  specId: string;
  conductorDetail: string;
  insulationDetail: string;
  armourDetail: string;
  sheathDetail: string;
  drumPlan: DrumPlanItem[];
  operatorNotes: string;
  qualityChecks: QualityCheck[];
  updatedAt: string;
}

export interface DispatchChecklistItem {
  id: string;
  label: string;
  done: boolean;
  required: boolean;
}

/** Test certificates are per drum (client-confirmed), not per order. */
export interface DrumTestCert {
  drumNo: string;
  certRef: string;
  verified: boolean;
}

export interface Dispatch {
  id: string;
  orderId: string;
  transporter: string;
  vehicleNo: string;
  checklist: DispatchChecklistItem[];
  ewayBillNo?: string;
  ewayBillRequired: boolean;
  drumTestCerts: DrumTestCert[];
  packingListRef?: string;
  dispatchedAt?: string;
  createdAt: string;
}

export type InvoiceKind = "Proforma" | "Tax invoice" | "Draft";
export type InvoiceStatus =
  | "Draft"
  | "Ready to sync"
  | "Payment pending"
  | "Paid"
  | "Overdue"
  | "Blocked";
export type SyncStatus =
  | "Not synced"
  | "Ready to sync"
  | "Synced to Zoho Books"
  | "Sync failed"
  | "Missing dispatch data";
export type RiskLevel = "Low" | "Medium" | "High";

export interface Invoice {
  id: string;
  kind: InvoiceKind;
  orderId: string;
  customerId: string;
  taxableInr: number;
  igstInr?: number;
  cgstInr?: number;
  sgstInr?: number;
  totalInr: number;
  hsnCode: "8544";
  status: InvoiceStatus;
  syncStatus: SyncStatus;
  risk: RiskLevel;
  dueDate: string;
  zohoBooksId?: string;
  syncedAt?: string;
  createdAt: string;
}

export type ComplianceType = "EMD" | "Bank guarantee" | "Tender document" | "Security deposit";
export type ComplianceStatus =
  | "Needs approval"
  | "Draft requested"
  | "Submitted"
  | "Complete"
  | "Expired";

export interface ComplianceItem {
  id: string;
  type: ComplianceType;
  customerId: string;
  inquiryId?: string;
  amountInr: number;
  dueDate: string;
  status: ComplianceStatus;
  risk: RiskLevel;
  instrumentRef?: string;
  createdAt: string;
}

export interface ActivityEvent {
  id: string;
  at: string;
  actorRole: Role;
  actorName?: string;
  type: string;
  recordType:
    | "inquiry"
    | "quote"
    | "order"
    | "dispatch"
    | "invoice"
    | "compliance"
    | "jobcard"
    | "gtp"
    | "incident"
    | "inspection";
  recordId: string;
  text: string;
}

export type SignalType =
  | "Margin anomaly"
  | "Delay risk"
  | "Missing document"
  | "Cash control"
  | "Credit risk"
  // ── Sales-acceleration signals (computed by lib/domain/signals.ts) ──
  | "Hot lead" // high win-probability inquiry worth prioritising
  | "Follow-up due" // an inquiry's followUpDate has arrived or passed
  | "Repeat-order due" // a recurring customer is overdue for their next order
  // ── Compliance/production-gate signals (also computed) ──
  | "GTP missing" // Won/In-Production order without an approved GTP
  | "Inspection call due"; // inspection call must be placed ~10 days before completion
export interface Signal {
  id: string;
  type: SignalType;
  severity: RiskLevel;
  route: string;
  recordId?: string;
  text: string;
  /** 0–100 win-probability / priority score (set by the lead-scoring engine). */
  score?: number;
  /** Plain-language reasons behind the score, for explainability in the UI. */
  reasons?: string[];
}

export type ApprovalKind =
  | "Margin approval"
  | "BG/EMD approval"
  | "Credit override"
  | "Dispatch hold"
  | "Machine incident";
export interface ApprovalRequest {
  id: string;
  kind: ApprovalKind;
  recordType: ActivityEvent["recordType"];
  recordId: string;
  requestedByRole: Role;
  status: "Pending" | "Approved" | "Rejected";
  reason: string;
  createdAt: string;
  resolvedByRole?: Role;
  resolvedAt?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  extraPermissions?: PermissionKey[];
  deniedPermissions?: PermissionKey[];
}
export type Actor = Pick<User, "id" | "name" | "role">;

export type ConnectorId = "zoho-books" | "crm" | "eway-bill" | "mcx-index";
export type ConnectionStatus = "Connected" | "Disconnected" | "Error" | "Syncing";
export interface ConnectorMeta {
  id: ConnectorId;
  name: string;
  category: "Accounting" | "CRM" | "Compliance" | "Pricing";
  direction: "in" | "out" | "bidirectional";
  status: ConnectionStatus;
  lastSyncAt?: string;
  config: Record<string, string>;
  health?: { ok: boolean; message?: string };
}

export interface SyncLog {
  id: string;
  connectorId: ConnectorId;
  at: string;
  action: "push" | "pull" | "test";
  recordType?: string;
  recordId?: string;
  status: "success" | "error";
  message: string;
}

export interface OrgSettings {
  companyName: string;
  gstin: string;
  homeStateCode: string;
  address: string;
  timezone: string;
}

export interface Policies {
  /**
   * Off by default for the PoC: flagging owner review on every sub-threshold line
   * creates friction in a small team. Turn on once the client validates the rule.
   */
  marginGateEnabled: boolean;
  marginThresholdPct: number;
  ewayThresholdInr: number;
  gstRatePct: number;
  creditLimitEnforced: boolean;
  dispatchHoldMode: "soft" | "hard";
}

/**
 * A raw material with a price. Quote costing reads ₹/kg from here (the bill of materials),
 * so adding/editing a material here changes every future quote. Conductor metals (Aluminium,
 * Copper) are auto-updated from the MCX feed; the rest are edited manually.
 */
export type MaterialCategory = "Conductor" | "Insulation" | "Armour" | "Sheath";
export type RateSource = "MCX" | "Manual";

export interface Material {
  id: string;
  name: string; // e.g. "Aluminium (EC grade)", "XLPE compound", "GI strip"
  category: MaterialCategory;
  ratePerKg: number; // ₹ per kg
  source: RateSource; // MCX = auto-refreshed; Manual = user-entered
  /** Which spec value(s) this material is the price for, so costing can look it up. */
  matchMaterial?: ConductorMaterial; // for Conductor rows
  note?: string;
  updatedAt: string;
}

export interface CableStore {
  specs: CableSpec[];
  materials: Material[];
  customers: Customer[];
  inquiries: Inquiry[];
  quotes: Quote[];
  orders: Order[];
  gtps: Gtp[];
  jobCards: JobCard[];
  rawMaterialChecks: RawMaterialCheck[];
  finishedCableQc: FinishedCableQc[];
  machineIncidents: MachineIncident[];
  inspectionReports: InspectionReport[];
  dispatches: Dispatch[];
  invoices: Invoice[];
  compliance: ComplianceItem[];
  activity: ActivityEvent[];
  signals: Signal[];
  approvals: ApprovalRequest[];
  users: User[];
  integrations: ConnectorMeta[];
  syncLogs: SyncLog[];
  org: OrgSettings;
  policies: Policies;
}

export type Collection = Exclude<keyof CableStore, "org" | "policies">;
