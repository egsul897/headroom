/**
 * Phase 3B.1 (task §2/§3) - the machine-readable baseline classifying every
 * one of Phase 3B's 12 real-regression cases by root failure class, BEFORE
 * any 3B.1 remediation code was written. This file is derived entirely from
 * direct inspection of the preserved evidence
 * (tests/fixtures/unseen-packages/phase-3b-real-regression-run/run-1787866714176.json)
 * and is itself part of the preserved baseline - it must never be edited to
 * match whatever 3B.1 produces; 3B.1's own revalidation step compares NEW
 * output against this frozen classification, not the other way around.
 *
 * Failure classes (task §3):
 *  - TRANSPORT: the response was cut off at the provider's output-token
 *    ceiling before submit_compilation's input could be fully emitted -
 *    a transport/capacity fact, not a reasoning defect.
 *  - TOOL_DISCIPLINE: the model treated genuinely-resolvable source
 *    evidence as unavailable (MISSING_CONTEXT/UNSUPPORTED) without first
 *    attempting a bounded tool call that was available to it and plausibly
 *    would have resolved the gap.
 *  - GRADING: the COMPILER's output was correct (or at least not proven
 *    wrong), but Phase 3B's own positional-order grading script compared
 *    the wrong pair of (expected, actual) rules and produced a false
 *    finding.
 *  - GENUINE_SEMANTIC: the compiler itself produced an incorrect or
 *    incomplete IR node despite adequate evidence and adequate tool use -
 *    a real interpretation defect, out of this subphase's scope to fix
 *    (task §4 - no IR/taxonomy/prompt-to-known-answer changes).
 *  - GENUINE_SEMANTIC_DANGEROUS_PRESERVE: a GENUINE_SEMANTIC case the task
 *    explicitly forbids fixing (task §0/§40) - lsb-6.13's incomplete
 *    multi-basket enumeration - because it is deliberately reserved as
 *    adversarial evidence for Phase 3C's independent verifier.
 *  - NONE: no defect found in this case at the time of the Phase 3B run;
 *    included for completeness of the 12-case baseline.
 */

export type Phase3BFailureClass = "TRANSPORT" | "TOOL_DISCIPLINE" | "GRADING" | "GENUINE_SEMANTIC" | "GENUINE_SEMANTIC_DANGEROUS_PRESERVE" | "NONE";

export interface Phase3BBaselineCase {
  caseId: string;
  package: "FWRG" | "LSB";
  originalStatus: "COMPLETED" | "PARTIAL" | "REVIEW_REQUIRED" | "FAILED";
  failureClasses: Phase3BFailureClass[];
  /** Which of Phase 3B.1's three remediation classes (A transport, B tool discipline, C grading) this case is evidence for, if any. */
  remediationTarget: ("A_TRANSPORT" | "B_TOOL_DISCIPLINE" | "C_GRADING")[];
  notes: string;
}

export const PHASE_3B_BASELINE: Phase3BBaselineCase[] = [
  {
    caseId: "fwrg-6.01-g-i",
    package: "FWRG",
    originalStatus: "REVIEW_REQUIRED",
    failureClasses: ["GENUINE_SEMANTIC"],
    remediationTarget: [],
    notes:
      "Economics 100% correct (MAX($2.5M, 5%xEBITDA)). action=OTHER instead of GUARANTEE_DEBT - a real action-taxonomy mapping gap in the compiler's own interpretation, not a transport/tool/grading defect. Two extra sibling-clause rules for 6.01(g)(ii)/(iii) beyond the assigned scope were both correctly UNLIMITED_CAPACITY/OTHER_RULE_SATISFIED/INCUR_DEBT - not a defect, a scope-expansion side effect of the test's own getNodeText(..., DESCENDANTS) call. Out of 3B.1 scope: fixing WRONG_ACTION would mean prompt-tuning to a known expected answer (forbidden by task §4).",
  },
  {
    caseId: "fwrg-6.04-a-x",
    package: "FWRG",
    originalStatus: "REVIEW_REQUIRED",
    failureClasses: ["GENUINE_SEMANTIC"],
    remediationTarget: [],
    notes:
      "Economics 100% correct (MAX($21M, 35%xEBITDA)), NO_DEFAULT condition correct. action=OTHER instead of PAY_DIVIDEND - same action-taxonomy gap as fwrg-6.01-g-i. Out of 3B.1 scope for the same reason.",
  },
  {
    caseId: "fwrg-6.04-a-xi",
    package: "FWRG",
    originalStatus: "REVIEW_REQUIRED",
    failureClasses: ["GENUINE_SEMANTIC"],
    remediationTarget: [],
    notes:
      "The single most dangerous real ground-truth adversarial probe - and it SUCCEEDED: correctly UnlimitedCapacity gated by COMPARE(ratio, LTE, 3.5), never a fabricated dollar cap, sufficiency correctly PARTIAL. action=OTHER instead of PAY_DIVIDEND is the same taxonomy gap noted above; not a reliability defect. Out of 3B.1 scope.",
  },
  {
    caseId: "fwrg-6.04-b",
    package: "FWRG",
    originalStatus: "REVIEW_REQUIRED",
    failureClasses: ["NONE"],
    remediationTarget: [],
    notes:
      "The type-check safety net (enforceSufficiencyConsistency/inferType) caught a malformed ADD ('ADD operands do not type-check together') and correctly degraded sufficiency to PARTIAL/UNSUPPORTED live - this is the compiler correctly self-flagging its own uncertainty, exactly as designed, not a defect. The original grader's WRONG_THRESHOLD/WRONG_PERCENT/WRONG_METRIC/WRONG_CONDITION findings against this already-non-COMPLETE rule are non-dangerous by isDangerous()'s own definition (dangerous requires sufficiency===COMPLETE) and reflect real absent detail in an honestly-flagged partial rule, not a grading bug.",
  },
  {
    caseId: "fwrg-6.10-a",
    package: "FWRG",
    originalStatus: "FAILED",
    failureClasses: ["TRANSPORT"],
    remediationTarget: ["A_TRANSPORT"],
    notes:
      "MODEL_SCHEMA_FAILURE. outputTokens=8192 exactly (= old hardcoded MAX_TOKENS ceiling) on the failing turn - definitive proof of hard provider-side truncation, not a reasoning mistake. Raw model output showed a fully-correct architecture (EVENT_ACTIVE for Material Acquisition step-up, nested IF/ADD/SCHEDULE) with the deepest nested SCHEDULE.cases[0].value truncated to an empty object mid-emission. Exact Zod failure paths: rules[0].capacityExpression.gatedBy.right.then.operands[0].cases[0].value.kind and ...cases[0].description, both 'expected string, received undefined'. Target case for 3B.1's raised MAX_TOKENS + partial-output-recovery fix.",
  },
  {
    caseId: "fwrg-6.10-b",
    package: "FWRG",
    originalStatus: "REVIEW_REQUIRED",
    failureClasses: ["NONE"],
    remediationTarget: [],
    notes: "100% correct end-to-end (action=SATISFY_RATIO, UnlimitedCapacity gated by COMPARE(DURING_PERIOD(METRIC),GTE,RATIO(1.25))), sufficiency=COMPLETE. No defect.",
  },
  {
    caseId: "fwrg-def-available-amount",
    package: "FWRG",
    originalStatus: "REVIEW_REQUIRED",
    failureClasses: ["NONE"],
    remediationTarget: [],
    notes: "Honest MISSING_CONTEXT - matches ground truth's own designation of this as the hardest provision in the FWRG package. Correct behavior, not a defect.",
  },
  {
    caseId: "lsb-6.01-general-ratio-gated",
    package: "LSB",
    originalStatus: "FAILED",
    failureClasses: ["TRANSPORT"],
    remediationTarget: ["A_TRANSPORT"],
    notes:
      "MODEL_SCHEMA_FAILURE. The model attempted a comprehensive 18-rule emission (1 prohibition + 17 exceptions, one per lettered sub-clause 6.01(a)-(t)) for the whole Section 6.01 - an ambitious but reasonable scope given the test's own getNodeText(..., DESCENDANTS) inclusion of all sub-clauses - and was cut off exactly at rules[17] (localRef/sourceSectionRef both undefined). outputTokens=23251 aggregate across 2 turns (1 tool-call turn + 1 truncated final turn). Target case for 3B.1's raised MAX_TOKENS + partial-output-recovery fix; a good test of whether raising the ceiling alone suffices given this case needed more headroom than fwrg-6.10-a.",
  },
  {
    caseId: "lsb-6.01-i-flat-or-pct-assets",
    package: "LSB",
    originalStatus: "REVIEW_REQUIRED",
    failureClasses: ["NONE"],
    remediationTarget: [],
    notes:
      "100% correct (action=INCUR_DEBT, MAX($70M, 5.5%x'total consolidated assets')), sufficiency=COMPLETE. The anti-enumeration proof: same MAX(flat, pct) shape as fwrg-6.01-g-i but against a different, non-EBITDA metric, with zero new code required. No defect.",
  },
  {
    caseId: "lsb-6.11-restricted-payments",
    package: "LSB",
    originalStatus: "PARTIAL",
    failureClasses: ["GRADING", "TOOL_DISCIPLINE"],
    remediationTarget: ["C_GRADING", "B_TOOL_DISCIPLINE"],
    notes:
      "GRADING: the original grader's positional matching compared expected[0] (the $500,000 fixed-basket expectation) against result.rules[0] (the prohibition rule, capacityExpression:null) instead of the actual match at result.rules[4] (correctly DURING_PERIOD(MONEY(500000))) - producing a FALSE 'WRONG_THRESHOLD: expected $500,000, none found' finding. Confirmed by direct inspection of the raw JSON: rules[4] is the correct match. This is the canonical case task §17-28's bipartite/content-matching grader must fix. TOOL_DISCIPLINE: rule (b) was marked UNSUPPORTED for a bare Section 6.03 cross-reference and rule (c) was marked MISSING_CONTEXT for the compound defined term 'Payment Conditions', in both cases WITHOUT the tool call log showing a getReferencedProvision('6.03') or getDefinition('Payment Conditions') attempt, even though both tools were available under budget (6 of 8 tool calls used). Candidate case for 3B.1's retrieval-before-give-up policy - real-run confirmation deferred to the minimal revalidation rerun (task §32-33).",
  },
  {
    caseId: "lsb-6.13-investments",
    package: "LSB",
    originalStatus: "REVIEW_REQUIRED",
    failureClasses: ["GENUINE_SEMANTIC_DANGEROUS_PRESERVE"],
    remediationTarget: [],
    notes:
      "PRESERVE, DO NOT FIX (task §0, repeated verbatim, and task §40). The model produced fully correct rules for sub-clauses (a)-(d) (Schedule 6.13 ref correctly UNSUPPORTED/MISSING_CONTEXT; Cash Equivalents/negotiable instruments/ordinary-course purchases correctly UNLIMITED_CAPACITY, sufficiency=COMPLETE where uncapped) but SILENTLY OMITTED clauses (e) through (l) - confirmed via direct read of the raw LSB source text that the full section through clause (l), including the $35,000,000 joint-venture cap (h), the Payment-Conditions-gated Investments (k), and the $5,000,000 general basket (l), was present in the operativeSourceText given to the model (1468 chars, verified length matches the full section). Nothing in sufficiency/status/unresolvedIssues signals the omission - a genuine DANGEROUS_UNFLAGGED_SEMANTIC_ERROR. This case must remain reproducible with the SAME behavior after all 3B.1 changes; task §40 requires the NEW IR-aware grader to correctly identify this as MISSED_RULE/omission from the PRESERVED Phase 3B output without any lsb-6.13-specific production logic. Do not add this section number, its missing baskets, its rule count, or its threshold values to any prompt or production code.",
  },
  {
    caseId: "lsb-def-abl-notes-priority-collateral",
    package: "LSB",
    originalStatus: "REVIEW_REQUIRED",
    failureClasses: ["NONE"],
    remediationTarget: [],
    notes: "Honest MISSING_CONTEXT for both 'ABL Priority Collateral' and 'Notes Priority Collateral' - matches ground truth's own designed adversarial probe. No defect.",
  },
];

export function getBaselineCase(caseId: string): Phase3BBaselineCase {
  const found = PHASE_3B_BASELINE.find((c) => c.caseId === caseId);
  if (!found) throw new Error(`no Phase 3B baseline entry for case "${caseId}"`);
  return found;
}
