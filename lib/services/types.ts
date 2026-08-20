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
export type CoreConfig =
  | "1C"
  | "2C"
  | "3C"
  | "3.5C"
  | "4C"
  | "5C"
  | "7C"
  | "12C"
  | "19C"
  | "27C"
  | "37C";
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
}

export type QuoteStatus = "Draft" | "Sent" | "Review" | "Approved" | "On board" | "Rejected";
export interface QuoteLine {
  id: string;
  specId: string;
  lengthM: number;
  metalRatePerKg: number;
  overheadPerM: number;
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
export type GtpStatus = "Draft" | "Pending sign-off" | "Approved";
export type GtpFormat = "client-fixed" | "self-generated";
export type GtpSectionSource = "client-fixed" | "is-standard";

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
  /** The cable designation the engine parsed, e.g. "3Cx70 + 1Cx50 + 1Cx16". */
  designation?: string;
  /** Which standard editions produced `derivedFields`. */
  standardsPin?: { standardId: string; edition: string }[];
}

/** A `ResolvedField` as persisted on a GTP record (structurally identical, kept independent). */
export interface GtpDerivedField {
  key: string;
  label: string;
  value: string | number;
  tag: "LOOKUP" | "CALC" | "CHOICE" | "QUIRK" | "FIXED";
  source: "is-table" | "profile" | "order" | "override" | "calc";
  trace: string;
  editable: boolean;
  gap?: boolean;
  override?: { previous: string | number; reason: string; by: string; at: string };
}

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
