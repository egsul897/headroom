/**
 * Presentation-only status language for CFO-facing badges.
 *
 * This module does not compute, remap, or upgrade a status. It looks up the
 * exact code the screen already has and chooses a tone, a plain-language
 * label, and a one-line hint. Unmapped codes stay on the unknown tone and
 * keep their original token in `code` — a label is only the code made readable.
 *
 * Customer-workflow codes reuse `presentCustomerStatus` so badge copy cannot
 * drift from the existing contract.
 */
import {
  allCustomerStatusCodes,
  presentCustomerStatus,
  type CustomerStatusCode,
  type CustomerStatusTone,
} from "@/lib/customer-workflow/status-contract";

export type StatusBadgeTone = "clear" | "attention" | "stop" | "info" | "unknown";

export interface StatusPresentation {
  /** Exact input, trimmed. Never a substituted code. */
  code: string;
  label: string;
  tone: StatusBadgeTone;
  hint: string;
}

const TONE_FROM_CUSTOMER: Record<CustomerStatusTone, StatusBadgeTone> = {
  pass: "clear",
  trip: "stop",
  tight: "attention",
  idle: "unknown",
  navy: "info",
};

type Row = [code: string, tone: StatusBadgeTone, label: string, hint: string];

/**
 * Codes confirmed in product types and UI. Not a second status model —
 * labels describe the code the screen already shows.
 */
const ROWS: Row[] = [
  // Legal review (lib/legal-review.ts, components/ui.tsx)
  ["VERIFIED", "clear", "Verified", "Legal review recorded as verified. This is not an engineering or capacity result."],
  ["UNVERIFIED", "unknown", "Unverified", "No legal review is recorded for this conclusion."],
  ["DISPUTED", "stop", "Disputed", "Legal review is disputed. Do not treat it as settled."],

  // Onboarding (lib/status-labels.ts)
  ["ONBOARDING", "attention", "Onboarding", "Workspace setup is still in progress."],
  ["ACTIVE", "clear", "Active", "Workspace is active."],
  ["ACTIVE_WITH_LIMITATIONS", "attention", "Active — limited coverage", "Workspace is active with limited coverage."],

  // Rulebook stage (lib/product/customer-intelligence/rulebook-readiness.ts)
  ["DISCOVERED", "attention", "Discovered", "Found in the documents. Not counsel-approved and not a capacity figure."],
  ["INTERPRETED", "info", "Interpreted", "Read into a structured interpretation. Not a production capacity claim."],
  ["REVIEWED", "info", "Reviewed", "Reviewed. Not the same as production-authoritative available capacity."],
  ["EXECUTABLE", "info", "Executable", "Rulebook stage is executable. Not a production-authoritative available figure."],

  // Operative amendment resolution
  ["RESOLVED", "clear", "Resolved", "Operative amendment precedence is resolved."],
  ["RESOLVED_PARTIAL", "attention", "Resolved in part", "Some operative bindings are resolved. The rest are not."],
  ["UNRESOLVED_PRECEDENCE", "attention", "Precedence unresolved", "Which document controls is not settled. Do not assume a single operative text."],
  ["SINGLE_DOCUMENT", "info", "Single document", "One document is in the package. No amendment conflict to resolve."],
  ["NO_DOCUMENTS", "unknown", "No documents", "No documents are loaded for this question."],

  // Capacity determination (lib/product/conmed-demo/covenant-catalog.ts)
  ["STRUCTURE_ONLY", "attention", "Structure only", "The clause is mapped. Capacity is not calculated."],
  ["NEEDS_FINANCIAL_INPUTS", "attention", "Needs financial inputs", "A figure needs approved financial inputs. Blank is not zero."],
  ["RATIO_GATED_UNRESOLVED", "attention", "Ratio gate unresolved", "A ratio gate is not resolved, so capacity stays withheld."],
  ["SCHEDULE_DEPENDENT_UNRESOLVED", "attention", "Schedule unresolved", "The result depends on a schedule that is not resolved."],
  ["OUT_OF_PACKAGE_UNRESOLVED", "attention", "Outside the package", "The clause points outside this package. It is not resolved here."],
  ["PROHIBITION_STRUCTURE", "info", "Prohibition", "The clause is a prohibition. That is structure, not a measured breach."],

  // Capacity readiness + authority
  ["EXECUTABLE_PATH_AVAILABLE", "info", "Executable path available", "The legacy engine can evaluate. Read the authority label before relying on a number."],
  ["DISCOVERY_ONLY", "attention", "Discovery only", "Analysis only. No executable capacity figure."],
  ["NO_FINANCIAL_SNAPSHOT", "attention", "No financial snapshot", "Capacity cannot be evaluated without a financial snapshot."],
  ["LEGACY_ENGINE", "info", "Legacy engine", "Figure comes from the legacy engine, not a certified 4E path."],
  ["NOT_CERTIFIED_4E", "attention", "Not certified", "Not a Phase 4E certified result."],
  ["NONE", "unknown", "None", "No capacity authority is recorded."],
  ["CERTIFIED_EXECUTED", "clear", "Certified executed", "Verified-execution path reported certified executed. Read the authority line with the number."],
  ["CERTIFIED_4A_4D", "info", "Certified 4A–4D", "Authority label for the certified path. Read it with the status beside it."],

  // Snapshot / approval (lib/financial-certificate-engine/approval-bridge.ts)
  ["DRAFT", "unknown", "Draft", "Draft only. Not approved."],
  ["APPROVED", "clear", "Approved", "Approved snapshot or record."],
  ["SUPERSEDED", "unknown", "Superseded", "Replaced by a later record. Do not use it as current."],
  ["ABSENT", "unknown", "Absent", "No record is present."],

  // Workflow steps (lib/product/north-star-workflow/transaction-readiness.ts)
  ["READY", "clear", "Ready", "This step has what it needs."],
  ["MISSING", "attention", "Missing", "Required input is missing."],
  ["LEGACY_ONLY", "info", "Legacy only", "Only a legacy source is available."],

  // Solver / execution words that appear as displayed statuses
  ["CLEAR", "clear", "Clear", "Path status clear. A legacy clear result may still be hypothetical."],
  ["BLOCKED", "stop", "Blocked", "The path is blocked."],
  ["NOT_TESTED", "unknown", "Not tested", "Not tested. Absence of a test is not a pass."],
  ["ASSUMPTION_REQUIRED", "attention", "Assumption required", "An assumption is required before this can be settled."],
  ["SATISFIED", "clear", "Satisfied", "This requirement is satisfied."],
  ["FAILED", "stop", "Failed", "This requirement or step failed."],
  ["OK", "clear", "Ok", "This step completed."],
  ["PASS", "clear", "Pass", "Recorded pass for this check. It is not a capacity figure by itself."],
  ["PENDING", "attention", "Pending", "Needs a person or has not started. Not a pass."],
  ["CONFIRMED", "clear", "Confirmed", "A person confirmed this sourced figure."],
  ["EVIDENCED", "info", "Evidenced", "A filing supports this figure. It is not a confirmation."],
  ["DETECTED", "unknown", "Detected", "Found in the documents. Not confirmed."],
  ["CAPPED", "info", "Capped", "A cap applies to this amount."],
  ["NOT_IDENTIFIED", "unknown", "Not identified", "This agreement has no such basket."],
  ["NEEDS_INPUT", "attention", "Needs input", "Required input is missing. The figure stays closed."],
  ["RUNNING", "info", "Running", "In progress."],
  ["SKIPPED", "unknown", "Skipped", "Skipped."],
  ["CONDITIONAL", "attention", "Conditional", "Conditional. Read the condition before relying on it."],
  ["PERMITTED", "info", "Permitted", "Shown as permitted only with the qualifier printed beside it."],
  ["NOT_PERMITTED", "stop", "Not permitted", "Not permitted on this path."],

  // Provision posture (lib/product/covenant-intelligence/analyze-provision.ts) — clause type, not a test result
  ["GENERAL_PROHIBITION", "info", "General prohibition", "Clause type: a general prohibition."],
  ["ENUMERATED_PERMISSION", "info", "Enumerated permission", "Clause type: an enumerated permission."],
  ["MAINTENANCE_TEST", "info", "Maintenance test", "Clause type: a maintenance test."],
  ["CONDITIONAL_PERMISSION", "info", "Conditional permission", "Clause type: a permission with conditions."],
  ["OBLIGATION", "info", "Obligation", "Clause type: an obligation."],
  ["UNRESOLVED", "attention", "Unresolved", "The reading is unresolved."],
  ["PROHIBITION", "info", "Prohibition", "Clause type: a prohibition."],
  ["PERMISSION", "info", "Permission", "Clause type: a permission."],
  ["CONDITION", "info", "Condition", "Clause type: a condition."],
  ["DEFINITION", "info", "Definition", "Clause type: a definition."],
  ["PRIORITY", "info", "Priority", "Clause type: priority."],

  // Epistemic labels seen on covenant review rows
  ["DISCOVERED_CANDIDATE", "attention", "Discovered candidate", "A candidate reading. Not counsel-approved."],
  ["PHASE3_CERTIFIED", "info", "Phase 3 certified", "Epistemic certification label. Not a remaining-capacity number."],

  // Overview table phrases (already plain language; tone only)
  ["healthy", "clear", "healthy", "Within the loaded status."],
  ["within capacity", "clear", "within capacity", "Within the loaded capacity status."],
  ["moderate", "attention", "moderate", "Needs a closer look."],
  ["needs review", "attention", "needs review", "Needs review before it is relied on."],
  ["at risk", "stop", "at risk", "At risk on the loaded status."],
  ["at capacity", "stop", "at capacity", "At capacity on the loaded status."],

  // Phrase used on the capacity empty state (not an enum member)
  ["NOT DETERMINABLE", "attention", "Not determinable", "No executable capacity evaluation. Not zero and not unlimited."],
  ["NOT_DETERMINABLE", "attention", "Not determinable", "No executable capacity evaluation. Not zero and not unlimited."],
];

const EXTRA: Record<string, Omit<StatusPresentation, "code">> = {};
for (const [code, tone, label, hint] of ROWS) {
  EXTRA[code] = { tone, label, hint };
}

function humanize(code: string): string {
  if (!/^[A-Z0-9_]+$/.test(code)) return code;
  const lower = code.replace(/_/g, " ").toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Present the exact status string a screen already renders. */
export function presentUiStatus(raw: string | null | undefined): StatusPresentation {
  const code = (raw ?? "").trim();
  if (!code) {
    return {
      code: "",
      label: "Unknown",
      tone: "unknown",
      hint: "No status was provided. Nothing was invented in its place.",
    };
  }

  const presentationFirst = EXTRA[code];
  if (
    presentationFirst &&
    (code === "CONFIRMED" ||
      code === "EVIDENCED" ||
      code === "PENDING" ||
      code === "CONDITIONAL" ||
      code === "NOT_IDENTIFIED" ||
      code === "DETECTED" ||
      code === "CAPPED")
  ) {
    return { code, ...presentationFirst };
  }

  if ((allCustomerStatusCodes() as string[]).includes(code)) {
    const presented = presentCustomerStatus(code as CustomerStatusCode);
    return {
      code,
      label: presented.label,
      tone: TONE_FROM_CUSTOMER[presented.tone],
      hint: presented.customerGuidance,
    };
  }

  const extra = EXTRA[code];
  if (extra) return { code, ...extra };

  return {
    code,
    label: humanize(code),
    tone: "unknown",
    hint: "Unmapped status. Shown as written, with no success or failure implied.",
  };
}
