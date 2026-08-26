/**
 * Phase C Stage 8 - MANDATORY ADVERSARIAL VERIFICATION (task §30-34). Two
 * independent layers, both real, neither optional:
 *
 * 1. Deterministic structural check (lib/contract-model/analyzer/verify.ts's
 *    existing verifyAllRulesAgainstSource, reused verbatim - free, and
 *    already measured in C0 to matter: dangerous-unflagged 33.3% -> 11.1%).
 * 2. A bounded LLM adversarial pass (task §32/§34): given the rule, its
 *    source context, and its resolved dependencies (NOT the human ground
 *    truth - task §31's own explicit prohibition), actively tries to
 *    disprove the extraction. At most ONE correction attempt: EXTRACTION ->
 *    VERIFICATION -> (if CORRECTION_PROPOSED) apply the correction -> ONE
 *    final VERIFICATION -> CONFIRMED or REVIEW_REQUIRED, never an unbounded
 *    loop (task §34). The verifier's own verdict is never silently applied
 *    without this second, final check.
 */
import type { StageCaller } from "./llm-caller";
import { BatchVerificationStageSchema, type BatchVerificationStageOutput } from "./schemas";
import { verifyRuleAgainstSource } from "../analyzer/verify";
import type { CandidateContractRule } from "../types";
import type { StageRunResult } from "./types";

const SYSTEM_PROMPT = [
  "You are an adversarial verifier for a set of ALREADY-EXTRACTED contract rule candidates. Your job is to actively try to DISPROVE each one, not confirm it by default.",
  "For each rule, re-read its own cited source section in the provided document text and check specifically for: wrong threshold, wrong unit, wrong formula, wrong covenant family, wrong action, wrong entity scope, wrong security scope, wrong AND/OR logic, a missed exception, a missed proviso, a missed required-definition dependency, a missed cross-reference, a conflicting rule, or an unsupported semantic primitive being silently flattened into free text.",
  "You are NOT given any answer key. Judge only from the source text itself.",
  "Return exactly one of CONFIRMED (the rule is correct as extracted), CORRECTION_PROPOSED (you found a specific, correctable error - provide the corrected rule), or REVIEW_REQUIRED (something is wrong or uncertain but you cannot confidently propose a specific fix). Never return CONFIRMED merely because the JSON is well-formed.",
].join(" ");

export interface VerificationBatch {
  documentId: string;
  sourceText: string;
  rules: CandidateContractRule[];
}

function summarizeRuleForVerification(rule: CandidateContractRule): string {
  return JSON.stringify(rule);
}

async function runOneAdversarialPass(caller: StageCaller, batch: VerificationBatch): Promise<BatchVerificationStageOutput> {
  const content = `Source document text (this batch's rules were extracted from this text):\n${batch.sourceText}\n\nExtracted rule candidates to verify:\n${batch.rules.map(summarizeRuleForVerification).join("\n")}`;
  return caller.call(BatchVerificationStageSchema, "adversarial_verification", SYSTEM_PROMPT, content);
}

export interface VerificationResult {
  finalRules: CandidateContractRule[];
  /** Per-rule final disposition, keyed by sourceSectionRef, for reporting (task §33/§51). */
  dispositions: { sourceSectionRef: string; deterministicFlag: boolean; llmVerdict: "CONFIRMED" | "CORRECTION_PROPOSED" | "REVIEW_REQUIRED" | "NOT_RUN"; correctionApplied: boolean }[];
}

export async function runVerificationStage(caller: StageCaller, batches: VerificationBatch[], useLlmAdversarialPass: boolean): Promise<StageRunResult<VerificationResult>> {
  const dispositions: VerificationResult["dispositions"] = [];
  let finalRules: CandidateContractRule[] = [];
  let anyFailed = false;
  const errors: string[] = [];
  let lastTelemetry = null as StageRunResult<VerificationResult>["telemetry"];

  for (const batch of batches) {
    // Layer 1: deterministic (always runs, free).
    const deterministicChecked = batch.rules.map((r) => {
      const checked = verifyRuleAgainstSource(r, batch.sourceText);
      return { original: r, checked, flagged: checked.notes !== r.notes };
    });

    if (!useLlmAdversarialPass) {
      finalRules.push(...deterministicChecked.map((d) => d.checked));
      for (const d of deterministicChecked) dispositions.push({ sourceSectionRef: d.original.sourceSectionRef, deterministicFlag: d.flagged, llmVerdict: "NOT_RUN", correctionApplied: false });
      continue;
    }

    // Layer 2: one bounded LLM adversarial pass, then at most one re-check of any proposed correction.
    try {
      const firstPass = await runOneAdversarialPass(caller, { ...batch, rules: deterministicChecked.map((d) => d.checked) });
      lastTelemetry = caller.lastTelemetry();
      const byRef = new Map(firstPass.results.map((r) => [r.ruleSourceSectionRef, r]));

      const toRecheck: { rule: CandidateContractRule; original: CandidateContractRule }[] = [];
      for (const d of deterministicChecked) {
        const verdict = byRef.get(d.checked.sourceSectionRef);
        if (!verdict) {
          dispositions.push({ sourceSectionRef: d.original.sourceSectionRef, deterministicFlag: d.flagged, llmVerdict: "REVIEW_REQUIRED", correctionApplied: false });
          finalRules.push({ ...d.checked, evaluationClass: d.checked.evaluationClass === "EXECUTABLE" ? "JUDGMENT_REQUIRED" : d.checked.evaluationClass, notes: `${d.checked.notes ?? ""} VERIFICATION_INCOMPLETE: adversarial verifier returned no verdict for this rule.`.trim() });
          continue;
        }
        if (verdict.verdict === "CORRECTION_PROPOSED" && verdict.correctedRule) {
          toRecheck.push({ rule: verdict.correctedRule, original: d.checked });
        } else if (verdict.verdict === "CONFIRMED") {
          dispositions.push({ sourceSectionRef: d.original.sourceSectionRef, deterministicFlag: d.flagged, llmVerdict: "CONFIRMED", correctionApplied: false });
          finalRules.push(d.checked);
        } else {
          dispositions.push({ sourceSectionRef: d.original.sourceSectionRef, deterministicFlag: d.flagged, llmVerdict: "REVIEW_REQUIRED", correctionApplied: false });
          finalRules.push({ ...d.checked, evaluationClass: "JUDGMENT_REQUIRED", notes: `${d.checked.notes ?? ""} ADVERSARIAL_REVIEW_REQUIRED: ${verdict.reasons.join("; ")}`.trim() });
        }
      }

      if (toRecheck.length > 0) {
        const secondPass = await runOneAdversarialPass(caller, { ...batch, rules: toRecheck.map((r) => r.rule) });
        lastTelemetry = caller.lastTelemetry();
        const byRef2 = new Map(secondPass.results.map((r) => [r.ruleSourceSectionRef, r]));
        for (const { rule, original } of toRecheck) {
          const verdict2 = byRef2.get(rule.sourceSectionRef);
          if (verdict2?.verdict === "CONFIRMED") {
            dispositions.push({ sourceSectionRef: original.sourceSectionRef, deterministicFlag: false, llmVerdict: "CORRECTION_PROPOSED", correctionApplied: true });
            finalRules.push(rule);
          } else {
            // Bounded: no further correction attempts (task §34) - a
            // correction that doesn't re-confirm becomes REVIEW_REQUIRED,
            // never re-looped. Real evidence this matters (LSB run,
            // docs/phase-c-contract-compiler-v1.md): a proposed correction
            // can itself DROP real, correct fields the original extraction
            // had (observed: a correction that "fixed" formulaRef also
            // silently dropped a real, correct thresholdValue/thresholdUnit
            // the pre-correction rule carried). Falling back to the
            // ORIGINAL (pre-correction) rule here - not the unconfirmed
            // corrected one - preserves whatever real information the first
            // extraction pass had, rather than keeping a strictly worse,
            // unconfirmed rewrite merely because it was the most recent one.
            dispositions.push({ sourceSectionRef: original.sourceSectionRef, deterministicFlag: false, llmVerdict: "REVIEW_REQUIRED", correctionApplied: false });
            finalRules.push({ ...original, evaluationClass: "JUDGMENT_REQUIRED", notes: `${original.notes ?? ""} CORRECTION_NOT_RECONFIRMED: bounded verification (1 correction attempt, proposed correction not reconfirmed) - falling back to original extraction, downgraded.`.trim() });
          }
        }
      }
    } catch (err) {
      anyFailed = true;
      errors.push(err instanceof Error ? err.message : String(err));
      finalRules.push(...deterministicChecked.map((d) => d.checked));
      for (const d of deterministicChecked) dispositions.push({ sourceSectionRef: d.original.sourceSectionRef, deterministicFlag: d.flagged, llmVerdict: "NOT_RUN", correctionApplied: false });
    }
  }

  return {
    status: anyFailed ? "REVIEW_REQUIRED" : "COMPLETED",
    output: { finalRules, dispositions },
    provider: caller.providerName,
    model: caller.model,
    telemetry: lastTelemetry,
    error: errors.length > 0 ? errors.join("; ") : undefined,
    notes: !useLlmAdversarialPass ? ["LLM adversarial pass not run for this call (deterministic-only mode) - see caller."] : undefined,
  };
}
