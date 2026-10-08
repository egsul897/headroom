/**
 * Phase 3 — remediation verification contracts.
 * Independent evaluation owns status. Production agent self-reports do not close tickets.
 */
import type { OwningAgent } from "./phase2-adjudication";

export type RemediationStatus =
  | "OPEN"
  | "FIX_PROPOSED"
  | "REPLAY_FAILED"
  | "REPLAY_PASSED"
  | "INDEPENDENTLY_ADJUDICATED"
  | "CLOSED";

export interface RemediationContract {
  ticketId: string;
  defectId: string;
  title: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM";
  owningProductionBranch: string | null;
  owningAgent: OwningAgent | "Evaluation Harness";
  originalFailingSha: string;
  proposedFixSha: string | null;
  proposedFixBranch: string | null;
  /** Additional SHAs that are complementary, adjacent, or partial — not alone sufficient to CLOSE. */
  relatedShas: string[];
  minimalReproduction: string[];
  frozenExpectedBehavior: string;
  independentTestCommand: string;
  acceptanceCriteria: string[];
  regressionRisks: string[];
  status: RemediationStatus;
  statusRationale: string;
  freezeEpochPreserved: true;
  closedOnlyByIndependentAdjudication: true;
}

/** Original failing epoch: Phase-1 tip that recorded the defects. */
export const ORIGINAL_FAILING_SHA = "084405770a02f5eebe88b0b7ffb192a46fd7960c";

/** Classifier whitespace fix that unblocks SUP RESTATES (ancestor of main). */
export const SUP_RESTATES_FIX_SHA = "e6c85cd8e3d26db6ad867300bccd8f3eefc088af";

/** Relationship surfacing / preamble-boundary work that completes RESTATES candidate emission. */
export const SUP_RESTATES_RELATIONSHIP_SHA = "db7f32a1b737e02a251c23989b750ba2fec602b8";

/** Main tip independently replayed for SUP RESTATES. */
export const MAIN_REPLAY_SHA = "9de4e5737166fcec84a35fdc9a3404870549211f";

/** Architecture remediation tip (checkout point; includes TOC cluster + later figure-role). */
export const ARCH_REMED_SHA = "ec7d5df7f7e7c0a0f32221d682d957f5acd3d8d8";

/** Substantive TOC/contents-listing refusal cluster on architecture-remediation (ancestors of tip). */
export const TOC_CONTENTS_CLUSTER_SHAS = [
  "481b19fe91137f0be6a552d2ec06925a0bcaf27d",
  "f9f402c6e458103352b9fa83805767d997ca6552",
] as const;

/** Partial xref/resolve work on Gibraltar pipeline / arch (unproven resolve-rate lift). */
export const XREF_PARTIAL_SHA = "fc530e18294c90c6a8f2b31acb93f5400e14ff5a";

/** Adjacent semantic-inventory note that ordinary aggregate amount is not SHARED_CAP_MARKER — not a Pass A fix. */
export const SHARED_CAP_ADJACENT_SHA = "34af49b6d7222d7b13db6add3cd1c0d1531715dd";

/** P0 shared-capacity false-permission remediation (PR #136). */
export const SHARED_CAP_P0_FIX_SHA = "83cde5b985b6bb480ac2500cccf894fe6e497f20";

/** Parent of SHARED_CAP_P0_FIX_SHA — independent baseline for ADV-FP-01/02 reproduction. */
export const SHARED_CAP_P0_BASELINE_SHA = "8f87a0633ac31cb7b5f6282cc0787231d365f27c";

/** Pre-whitespace baseline where SUP doc-b misclassifies as CREDIT_AGREEMENT. */
export const PRE_WHITESPACE_SHA = "4331cf8"; // full resolved at replay time

export function buildRemediationContracts(overrides?: Partial<Record<string, RemediationStatus>>): RemediationContract[] {
  const contracts: RemediationContract[] = [
    {
      ticketId: "TICKET-LCQG-GIB-FALSE-AFFIRM-SHARED-CAP",
      defectId: "LCQG-GIB-FALSE-AFFIRM-SHARED-CAP",
      title: "Pass A shared_cap over-fires on aggregate-amount nodes",
      priority: "CRITICAL",
      owningProductionBranch: "cursor/architecture-remediation-7cc2",
      owningAgent: "Covenant Knowledge Factory",
      originalFailingSha: ORIGINAL_FAILING_SHA,
      proposedFixSha: SHARED_CAP_P0_FIX_SHA,
      proposedFixBranch: "cursor/architecture-remediation-7cc2",
      relatedShas: [SHARED_CAP_ADJACENT_SHA, SHARED_CAP_P0_BASELINE_SHA, ARCH_REMED_SHA],
      minimalReproduction: [
        "Baseline worktree at 8f87a06 (parent of fix): ADV-FP-01/02 emit shared_cap + SHARED_CAP_CANDIDATE.",
        "Fix worktree at 83cde5b: ordinary aggregate → aggregate_amount only; no shared_cap / SHARED_CAP_CANDIDATE / SHARED_CAP_MARKER.",
        "Genuine multi-permission language still shared_cap on fix.",
        "Do not mutate phase1-freeze oracle (historical pass-a-shared-cap.json length=51 remains frozen evidence).",
      ],
      frozenExpectedBehavior:
        "Do not emit affirmative shared-capacity / combined-headroom conclusions from aggregate-amount pattern matches alone. Require explicit shared-pool / combined-cap / reallocation semantics.",
      independentTestCommand:
        "docs/live-corpus-quality-gate/phase3/29-p0-shared-cap-e2e-closure.json  # + 28 labeling replay; prod tests shared-capacity-aggregate-alone-e2e",
      acceptanceCriteria: [
        "shared_cap signal no longer fires on ordinary aggregate-amount nodes lacking shared-pool semantics.",
        "Explicit shared capacity / combined basket / reallocation language still detectable.",
        "No package-specific hardcoding (Invariant #29).",
        "Independent evaluator REPLAY_PASSED before any CLOSED status.",
        "Scripted compile→certify→REQUIRE→capacity: ordinary aggregate alone yields zero executable IRSharedCapacity / sharedConstraints.",
      ],
      regressionRisks: [
        "Over-narrowing may miss real shared baskets that use atypical phrasing (Gibraltar shared_cap ~18 live; 9 frozen-fixture excerpts still helper-shared_cap but Pass A nodeId-dropped).",
        "Downstream Pass B/C consumers that treated shared_cap as soft recall signal may need recalibration.",
        "Unpaid scripted E2E ≠ live LLM WireSharedCapacity emit — keep ticket out of CLOSED until paid/live compile boundary is separately adjudicated or accepted.",
      ],
      status: overrides?.["LCQG-GIB-FALSE-AFFIRM-SHARED-CAP"] ?? "INDEPENDENTLY_ADJUDICATED",
      statusRationale:
        "Labeling independently verified (baseline 8f87a06 → fix 83cde5b). E2E scripted golden path at PR #136 head 0e31c36 proves ADV-FP aggregate-alone cannot CERTIFY/EXECUTE a shared pool; genuine shared positives and unquantified-share fail-closed hold; Gibraltar drop stratified (42 ordinary / 9 helper-shared but Pass-A-dropped). Not CLOSED — live unpaid LLM discovery/compile of ADV-FP text not run; preserve INDEPENDENTLY_ADJUDICATED.",
      freezeEpochPreserved: true,
      closedOnlyByIndependentAdjudication: true,
    },
    {
      ticketId: "TICKET-LCQG-SUP-AMEND-RESTATES-MISSING",
      defectId: "LCQG-SUP-AMEND-RESTATES-MISSING",
      title: "SUP doc-b RESTATES doc-a never surfaced (classifier whitespace)",
      priority: "CRITICAL",
      owningProductionBranch: "main",
      owningAgent: "Amendment Intelligence",
      originalFailingSha: ORIGINAL_FAILING_SHA,
      proposedFixSha: SUP_RESTATES_FIX_SHA,
      proposedFixBranch: "main",
      relatedShas: [SUP_RESTATES_RELATIONSHIP_SHA, MAIN_REPLAY_SHA],
      minimalReproduction: [
        "Baseline worktree at pre-fix SHA (parent of e6c85cd): classifyDocument(sup-doc-b) → CREDIT_AGREEMENT; buildPackageGraph RESTATES count=0.",
        "Candidate worktree at e6c85cd or main tip: classifyDocument → AMENDED_AND_RESTATED_AGREEMENT; RESTATES candidate sup-doc-b→sup-doc-a surfaced (REVIEW_REQUIRED acceptable).",
        "Complementary relationship/preamble work: db7f32a (Unit A+B structural relationship retrieval).",
        "Do not mutate phase1-freeze oracle.",
      ],
      frozenExpectedBehavior:
        "Classify as AMENDED_AND_RESTATED_AGREEMENT; surface RESTATES→doc-a or honest REVIEW_REQUIRED — never silent omission.",
      independentTestCommand:
        "npx tsx scripts/live-corpus-quality-gate/phase3-run.ts  # + isolated worktree replay for SUP graph",
      acceptanceCriteria: [
        "Line-wrapped 'AMENDED AND RESTATED\\nCREDIT AGREEMENT' classifies as AMENDED_AND_RESTATED_AGREEMENT.",
        "RESTATES relationship candidate exists for doc-b→doc-a (RESOLVED or REVIEW_REQUIRED).",
        "Pre-fix baseline still fails (proves the fix is causal).",
        "Independent evaluator adjudication recorded; freeze epoch unchanged.",
      ],
      regressionRisks: [
        "Whitespace-tolerant matching could over-match referential A&R mentions inside amendments (mitigated by self-reference / position logic).",
        "REVIEW_REQUIRED vs RESOLVED confidence may still require human confirmation for operative supersession.",
      ],
      status: overrides?.["LCQG-SUP-AMEND-RESTATES-MISSING"] ?? "INDEPENDENTLY_ADJUDICATED",
      statusRationale:
        "Independent worktree replay: pre-fix CREDIT_AGREEMENT + 0 RESTATES; post-fix (classifier e6c85cd + relationship db7f32a on main 9de4e57 / eval tip) AMENDED_AND_RESTATED_AGREEMENT + RESTATES REVIEW_REQUIRED. Acceptance criteria met. Not CLOSED — freeze epoch not advanced; certification unchanged.",
      freezeEpochPreserved: true,
      closedOnlyByIndependentAdjudication: true,
    },
    {
      ticketId: "TICKET-LCQG-GIB-XREF-BUILDER-MARKER-CONFLICT",
      defectId: "LCQG-GIB-XREF-BUILDER-MARKER-CONFLICT",
      title: "Builder Basket citation marker conflict (7.05(a)(y) vs printed (vi))",
      priority: "CRITICAL",
      owningProductionBranch: "cursor/covenant-dependency-atlas-5021",
      owningAgent: "Dependency Atlas",
      originalFailingSha: ORIGINAL_FAILING_SHA,
      proposedFixSha: null,
      proposedFixBranch: null,
      relatedShas: [],
      minimalReproduction: [
        "Locate definition cite Section 7.05(a)(y) and operative printed marker (vi) / parenthetical clause (y) in Gibraltar source.",
        "Confirm dual-cite disagreement is in the filed HTML itself.",
        "Expected: UNRESOLVED / dual-cite REVIEW_REQUIRED — never unique forced bind.",
      ],
      frozenExpectedBehavior:
        "Treat as UNRESOLVED / dual-cite REVIEW_REQUIRED. Never force a unique resolved target that prefers compiler path over source disagreement.",
      independentTestCommand:
        "npx tsx scripts/live-corpus-quality-gate/phase3-run.ts  # builder dual-cite probe",
      acceptanceCriteria: [
        "Compiler exposes dual-cite / source inconsistency explicitly.",
        "No unique resolved target invented when definition cite and printed marker disagree.",
        "Generalized handling — not Gibraltar-hardcoded.",
      ],
      regressionRisks: [
        "Over-refusing unique cites that are merely layout-odd but consistent.",
        "Consumers must handle dual-cite REVIEW_REQUIRED without inventing capacity.",
        "Letter/roman clause-hierarchy work may make resolveUniqueNodeByRef('7.05(a)(y)') UNIQUE — that is the opposite of dual-cite UNRESOLVED and must not be treated as this defect's fix.",
      ],
      status: overrides?.["LCQG-GIB-XREF-BUILDER-MARKER-CONFLICT"] ?? "OPEN",
      statusRationale:
        "SOURCE_INCONSISTENCY primary. No production SHA implements dual-cite UNRESOLVED for definition cite vs printed marker. Related clause-hierarchy SHAs are not acceptance. Left OPEN.",
      freezeEpochPreserved: true,
      closedOnlyByIndependentAdjudication: true,
    },
    {
      ticketId: "TICKET-LCQG-GIB-STRUCT-AMBIGUOUS-TOC",
      defectId: "LCQG-GIB-STRUCT-AMBIGUOUS-TOC",
      title: "Gibraltar TOC duplication yields AMBIGUOUS bare section refs",
      priority: "HIGH",
      owningProductionBranch: "cursor/architecture-remediation-7cc2",
      owningAgent: "Structural Compiler",
      originalFailingSha: ORIGINAL_FAILING_SHA,
      proposedFixSha: ARCH_REMED_SHA,
      proposedFixBranch: "cursor/architecture-remediation-7cc2",
      relatedShas: [...TOC_CONTENTS_CLUSTER_SHAS],
      minimalReproduction: [
        "Frozen structure health: AMBIGUOUS_LEGAL_REFERENCE=306 / DUPLICATE_LABEL_EXPECTED=306.",
        "Substantive TOC/contents cluster on architecture-remediation: 481b19f … f9f402c (ancestors of tip ec7d5df).",
        "Tip ec7d5df is the branch checkout point (also adds figure-role); TOC commits are earlier on the same branch.",
        "Independent test: contents listing must refuseModelDispatch; never silently bind TOC stub as operative body.",
      ],
      frozenExpectedBehavior:
        "Prefer long-span operative body nodes; never silently bind TOC stubs; expose AMBIGUOUS explicitly to consumers.",
      independentTestCommand:
        "cd <arch-remed-worktree> && npx vitest run tests/contract-model/compiler/operative-authority.test.ts tests/contract-model/context-retrieval-definition-contents.test.ts",
      acceptanceCriteria: [
        "TOC/contents occurrence classified CONTENTS_LISTING and refused for model dispatch.",
        "When TOC + body share a label, operative body preferred or ambiguity explicit — never silent TOC bind.",
        "Gibraltar structural AMBIGUOUS exposure remains honest (not force-resolved).",
      ],
      regressionRisks: [
        "False CONTENTS_LISTING on short operative stubs.",
        "Structural index still reports AMBIGUOUS at scale — resolve-rate metrics may not improve until index-side dedup.",
      ],
      status: overrides?.["LCQG-GIB-STRUCT-AMBIGUOUS-TOC"] ?? "INDEPENDENTLY_ADJUDICATED",
      statusRationale:
        "Checkout tip ec7d5df includes TOC/contents cluster (481b19f→f9f402c). Independent worktree vitest: operative-authority + contents-listing refusal 25/25 PASSED. Consumer fail-closed meets frozen expected behavior; structural AMBIGUOUS counts unchanged (honest). Not CLOSED — Gibraltar index regeneration not re-run; freeze epoch not advanced.",
      freezeEpochPreserved: true,
      closedOnlyByIndependentAdjudication: true,
    },
    {
      ticketId: "TICKET-LCQG-GIB-XREF-LOW-RESOLVE",
      defectId: "LCQG-GIB-XREF-LOW-RESOLVE",
      title: "Gibraltar cross-reference resolve rate ~33.7%",
      priority: "HIGH",
      owningProductionBranch: "cursor/covenant-dependency-atlas-5021",
      owningAgent: "Dependency Atlas",
      originalFailingSha: ORIGINAL_FAILING_SHA,
      proposedFixSha: null,
      proposedFixBranch: null,
      relatedShas: [XREF_PARTIAL_SHA, ARCH_REMED_SHA],
      minimalReproduction: [
        "structure-summary.json: detected=1459 resolved=491 unresolved=968 resolveRate≈0.337.",
        "Confirm unresolved remain explicit; no force-bind to TOC stubs.",
        "Partial unproven candidate: fc530e1 on architecture-remediation / Gibraltar Track D (degenerate TOC exclusion); atlas tip is diagnostic-only.",
      ],
      frozenExpectedBehavior:
        "Keep material unresolved refs explicit (UNRESOLVED/REVIEW_REQUIRED). Do not force-bind to ambiguous TOC targets. Improve resolution where unique operative targets exist.",
      independentTestCommand:
        "npx tsx scripts/live-corpus-quality-gate/phase3-run.ts  # xref resolve probe",
      acceptanceCriteria: [
        "Material unresolved refs stay explicit.",
        "No silent TOC force-bind.",
        "Measurable resolve-rate improvement on unique operative targets without inventing certainty.",
      ],
      regressionRisks: [
        "Aggressive resolution against AMBIGUOUS labels would be a legal-safety regression.",
        "Contents-listing refusal alone does not raise the frozen 33.7% rate without re-index.",
        "Treating atlas diagnostics or unmeasured arch resolve changes as CLOSED would contaminate adjudication.",
      ],
      status: overrides?.["LCQG-GIB-XREF-LOW-RESOLVE"] ?? "OPEN",
      statusRationale:
        "fc530e1 / TOC exclusion may help unique operative resolution but no measured Gibraltar resolve-rate lift was independently verified. Dependency-atlas tip has no production resolver edits. Left OPEN (not FIX_PROPOSED — no proven candidate).",
      freezeEpochPreserved: true,
      closedOnlyByIndependentAdjudication: true,
    },
    {
      ticketId: "TICKET-LCQG-HARNESS-FINDING-ID-COLLISION",
      defectId: "LCQG-HARNESS-FINDING-ID-COLLISION",
      title: "Phase-1 findingId collision (46 listed / 45 unique)",
      priority: "MEDIUM",
      owningProductionBranch: "cursor/live-corpus-quality-gate-7f51",
      owningAgent: "Evaluation Harness",
      originalFailingSha: ORIGINAL_FAILING_SHA,
      proposedFixSha: null, // filled at run tip
      proposedFixBranch: "cursor/live-corpus-quality-gate-7f51",
      relatedShas: [],
      minimalReproduction: [
        "Load phase1-freeze/01-findings.json — 46 findings, 45 unique findingIds.",
        "Collision: gib-doc-a:exception_and_condition_recall:legally_verified:pass (§7.02 vs §7.08).",
        "Phase-3 harness assigns LCQG-F-NNN stable IDs without mutating freeze.",
      ],
      frozenExpectedBehavior:
        "All 46 findings individually addressable via stable IDs; freeze oracle bytes unchanged; mapping to original findingIds preserved.",
      independentTestCommand: "npx vitest run tests/live-corpus-quality-gate/phase3.test.ts",
      acceptanceCriteria: [
        "46 distinct stableFindingIds.",
        "Collision group maps to 2 distinct stable IDs.",
        "Freeze artifact SHA256 matches FREEZE-MANIFEST.",
      ],
      regressionRisks: [
        "Downstream tools that keyed only on original findingId must migrate to stable IDs for collision members.",
      ],
      status: overrides?.["LCQG-HARNESS-FINDING-ID-COLLISION"] ?? "INDEPENDENTLY_ADJUDICATED",
      statusRationale:
        "Harness-only fix in Phase-3 versioned artifacts. Freeze untouched. Stable IDs prove individual addressability.",
      freezeEpochPreserved: true,
      closedOnlyByIndependentAdjudication: true,
    },
  ];
  return contracts;
}

export function contractStatusRollup(contracts: RemediationContract[]): Record<RemediationStatus, number> {
  const rollup: Record<RemediationStatus, number> = {
    OPEN: 0,
    FIX_PROPOSED: 0,
    REPLAY_FAILED: 0,
    REPLAY_PASSED: 0,
    INDEPENDENTLY_ADJUDICATED: 0,
    CLOSED: 0,
  };
  for (const c of contracts) rollup[c.status] += 1;
  return rollup;
}
