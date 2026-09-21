/**
 * Override audit trail.
 *
 * ─── Why this exists ──────────────────────────────────────────────────────────────────────────
 *
 * A GTP is a legally-binding document. When someone overrides a standards-derived value, the
 * builder already demands a written reason before accepting the edit — but until now that reason
 * lived only in React state. It reached the stored GTP's `override` block for values still
 * overridden at save time, and was lost entirely for anything reverted, re-edited, or abandoned
 * before generating.
 *
 * That is the wrong shape for an audit trail. The question a reviewer asks months later is not
 * "what does this field say" — the document answers that — but "was this value ever changed, by
 * whom, and why". A trail that only records the final state cannot answer it.
 *
 * So every override, revert and re-edit appends an immutable entry here. Entries are never
 * modified and never deleted: correcting a mistake means appending the correction, exactly as a
 * ledger works.
 *
 * ─── What this is NOT ─────────────────────────────────────────────────────────────────────────
 *
 * Not customer-facing. Build-plan-v2 D10 is explicit that internal override reasons must never
 * be printed on the GTP — they are operational context ("customer asked verbally", "matching
 * their last order") and disclosing them to a buyer exposes our reasoning. This log is the
 * internal record; the PDF stays clean. A test in pdf-document guards that boundary.
 */

/** One recorded change. Append-only — never edited in place. */
export interface AuditEntry {
  id: string;
  /** GTP this belongs to. Draft edits use a session id until the GTP is generated. */
  gtpId: string;
  /** Field the change was made to. */
  fieldKey: string;
  fieldLabel: string;
  /**
   * `hide`/`unhide` record a field being dropped from or restored to the printed document.
   * They carry no reason by design — most hides are format trimming for a particular buyer,
   * and demanding a justification for each would train people to type "n/a". The DECISION is
   * still recorded, because omitting a parameter from a document a board stamps and an
   * inspector measures against is consequential, and `saveTemplate` propagates the omission
   * into every future document built from that sheet.
   */
  action: "override" | "revert" | "amend" | "hide" | "unhide";
  /** Value before the change. For an override, the standards-derived value. */
  previousValue: string;
  /** Value after. Empty on a revert — the field returns to its derived value. */
  newValue: string;
  /** The written justification. Required for an override; absent on a revert, hide or unhide. */
  reason: string;
  /** Who made it. */
  actor: string;
  /** ISO timestamp. */
  at: string;
  /** Customer and cable this GTP was for, so the trail is readable without joining. */
  context?: { customerName?: string; designation?: string };
}

const STORAGE_KEY = "cableos2:v1:gtp-audit-log";

/** Read the whole trail. Never throws — a corrupt or absent store yields an empty list. */
export function loadAuditLog(): AuditEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AuditEntry[]) : [];
  } catch {
    return [];
  }
}

function persist(entries: AuditEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // A full quota must not break the builder. The in-memory trail still reached the GTP.
  }
}

/**
 * Append one entry. Returns the full trail.
 *
 * Deliberately has no update or delete counterpart: an audit log that can be rewritten is not an
 * audit log. A wrong entry is corrected by appending an `amend`, which leaves both visible.
 */
export function appendAuditEntry(entry: Omit<AuditEntry, "id" | "at">): AuditEntry[] {
  const full: AuditEntry = {
    ...entry,
    id: `AUD-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
    at: new Date().toISOString(),
  };
  const next = [...loadAuditLog(), full];
  persist(next);
  return next;
}

/** Everything recorded against one GTP, oldest first — the order a reviewer reads it in. */
export function auditEntriesFor(entries: AuditEntry[], gtpId: string): AuditEntry[] {
  return entries.filter((e) => e.gtpId === gtpId);
}

/**
 * Re-key a draft's entries once the GTP has a real id.
 *
 * Edits happen before the GTP exists, so they are recorded against a session id. Generating
 * assigns the real id, and the trail has to follow or the history detaches from the document.
 * This rewrites the pointer only — no reason, value or timestamp is touched.
 */
export function reassignAuditEntries(fromGtpId: string, toGtpId: string): AuditEntry[] {
  const next = loadAuditLog().map((e) => (e.gtpId === fromGtpId ? { ...e, gtpId: toGtpId } : e));
  persist(next);
  return next;
}

/** Fields changed at least once on this GTP — the "what was touched" summary. */
export function changedFieldKeys(entries: AuditEntry[], gtpId: string): string[] {
  return [...new Set(auditEntriesFor(entries, gtpId).map((e) => e.fieldKey))];
}

/**
 * The trail as readable lines, for an internal review screen or an export.
 *
 * Never call this when building the customer-facing PDF — see the header note on D10.
 */
export function formatAuditTrail(entries: AuditEntry[], gtpId: string): string[] {
  return auditEntriesFor(entries, gtpId).map((e) => {
    const when = e.at.slice(0, 16).replace("T", " ");
    if (e.action === "revert") {
      return `${when} · ${e.actor} reverted "${e.fieldLabel}" to the derived value (was "${e.previousValue}")`;
    }
    if (e.action === "hide" || e.action === "unhide") {
      const verb = e.action === "hide" ? "hid" : "restored";
      const tail = e.action === "hide" ? "from the printed document" : "to the printed document";
      return `${when} · ${e.actor} ${verb} "${e.fieldLabel}" ${tail}`;
    }
    const verb = e.action === "amend" ? "amended" : "overrode";
    return `${when} · ${e.actor} ${verb} "${e.fieldLabel}": "${e.previousValue}" → "${e.newValue}" — ${e.reason}`;
  });
}
