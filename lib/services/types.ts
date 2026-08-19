/*  Central domain/application type definitions: users, roles, 
    permissions, cable specs, customers, inquiries, quotes,
    orders, dispatch records, invoices, approvals, signals, etc. */

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
  | "IS 1554-1"
  | "IS 694"
  | "IS 8130"
  | "IEC 60502-1"
  | "IEC 60502-2";
export type VoltageGrade =
  | "650/1100 V (1.1 kV)"
  | "1.9/3.3 kV"
  | "3.8/6.6 kV"
  | "6.35/11 kV"
  | "12.7/22 kV"
  | "19/33 kV";
export type ConductorMaterial = "Aluminium" | "Copper";
export type ConductorClass =
  | "Class 1 (solid)"
  | "Class 2 (stranded)"
  | "Class 2 compacted"
  | "Class 5 (flexible)";
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
export type Insulation = "XLPE" | "PVC (Type A)" | "PVC (Type C)" | "EPR" | "XLPO (solar/UV)";
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
  | "HDPE";
export type FlameClass = "FR" | "FRLS" | "LSZH" | "Standard";
export type DrumType = "Wooden" | "Steel" | "Steel-Wood";

export interface CableSpec {
  id: string;
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
  createdAt: string;
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

export interface Dispatch {
  id: string;
  orderId: string;
  transporter: string;
  vehicleNo: string;
  checklist: DispatchChecklistItem[];
  ewayBillNo?: string;
  ewayBillRequired: boolean;
  testCertificateRef?: string;
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
  recordType: "inquiry" | "quote" | "order" | "dispatch" | "invoice" | "compliance" | "jobcard";
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
  | "Repeat-order due"; // a recurring customer is overdue for their next order
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
  | "Dispatch hold";
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
  active?: boolean;
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
  jobCards: JobCard[];
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
