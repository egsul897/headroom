/**
 * Phase C Stage 9 - DETERMINISTIC VALIDATION (task §35/§36). Reuses
 * lib/contract-model/validators.ts's validateContractModel(companyId)
 * verbatim - the exact structural validators Phase B already built and
 * tested (rule sources exist, defined-term targets exist, reference targets
 * exist, relationship targets agree on company, effective periods
 * well-formed, stable keys unique, no unbounded cycles) - never a second,
 * parallel validation implementation. Runs AFTER this run's candidates have
 * been mapped into real ContractRule/DefinedTermNode/ContractReferenceEdge/
 * ContractRuleRelationship rows (persistence.ts), since validators.ts
 * operates on persisted state, not raw candidates.
 */
import { validateContractModel } from "../validators";
import type { StageRunResult } from "./types";
import type { ValidationReport } from "../validators";

export async function runValidationStage(companyId: string): Promise<StageRunResult<ValidationReport>> {
  const report = await validateContractModel(companyId);
  return {
    status: report.ok ? "COMPLETED" : "BLOCKED",
    output: report,
    notes: report.ok ? undefined : report.issues.map((i) => `${i.rule}: ${i.message}`),
  };
}
