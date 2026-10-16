/**
 * Deterministic (no-LLM) workspace activation.
 *
 * The LLM promotion path is the only path that ever set
 * Company.onboardingStatus to ACTIVE — and its Promote button is
 * gated on contract-model analysis readiness, which never becomes
 * ready without an LLM credential. A company that reviewed its
 * Rulebook, entered financials, and has executable Permissions
 * would stay ONBOARDING forever (home nav keeps routing it to the
 * wizard, the home page keeps showing a setup CTA).
 *
 * This gate is the deterministic equivalent: counsel review is
 * complete (every discovered summary item has a reviewer decision,
 * or the rulebook ladder already reports EXECUTABLE) and financials
 * exist. The onboarding status mirrors the LLM path's
 * evaluatePostPromotionCoverage verdict: ACTIVE only when every
 * solver-coverage declaration is complete (Rule 171 maintains those
 * declarations from counsel decisions); otherwise
 * ACTIVE_WITH_LIMITATIONS. No new declaration logic — this reads
 * the declarations the review flow already maintains.
 */
import type { RulebookStage } from "@/lib/product/customer-intelligence/rulebook-readiness";

export interface DeterministicActivationInput {
  rulebookStage: RulebookStage;
  /** Discovered summary items (loadRulebookReadiness.discoveredSummaries). */
  discoveredSummaries: number;
  /** Reviewer decisions recorded via the Rulebook. */
  decisions: number;
  /** Manual financial snapshots on file. */
  financialSnapshots: number;
  /** True when at least one coverage declaration exists and every one is complete. */
  declarationsComplete: boolean;
}

export interface DeterministicActivationGate {
  ready: boolean;
  blockers: string[];
  /** The onboarding status activation would set. */
  status: "ACTIVE" | "ACTIVE_WITH_LIMITATIONS";
}

export function deterministicActivationGate(input: DeterministicActivationInput): DeterministicActivationGate {
  const blockers: string[] = [];
  if (input.discoveredSummaries === 0) {
    blockers.push("No deterministic covenant summaries yet — upload and analyze financing documents first.");
  } else if (input.rulebookStage !== "EXECUTABLE" && input.decisions < input.discoveredSummaries) {
    blockers.push(
      `Review all ${input.discoveredSummaries} AI interpretations in the Rulebook (${input.decisions} reviewed) — counsel decisions compile the executable rulebook.`,
    );
  }
  if (input.financialSnapshots === 0) {
    blockers.push("Enter financials first — capacity and simulation need a financial snapshot.");
  }
  return {
    ready: blockers.length === 0,
    blockers,
    status: input.declarationsComplete ? "ACTIVE" : "ACTIVE_WITH_LIMITATIONS",
  };
}
