/**
 * Workstream 4 — Independent adversarial verification pass.
 *
 * Reconstructs the applicable restriction set and challenges a first-pass
 * analysis with deterministic checks. Must be able to REJECT the first
 * analysis. Does not ask the same generative model whether its answer
 * "looks correct."
 */

import type { CompleteRetrievalResult } from "./complete-retrieval";
import type { CrossCovenantAnalysis } from "./cross-covenant";
import type { ContractualProvisionRepresentation } from "./contractual-representation";
import type { AskRetrieveAnswer } from "./ask-retrieve";

export const ADVERSARIAL_LEGAL_VERIFY_VERSION = "product.adversarial-legal-verify.v1";

export type VerifierVerdict = "CONFIRMED" | "REJECTED" | "INCOMPLETE";

export interface VerifierFinding {
  code:
    | "MISSING_PERMISSION_OR_EXCEPTION"
    | "DEFINED_TERM_CHALLENGE"
    | "AMENDMENT_PRECEDENCE"
    | "FORMULA_UNVERIFIED"
    | "CROSS_COVENANT_INCONSISTENCY"
    | "UNSUPPORTED_ASSUMPTION"
    | "CITATION_MISMATCH"
    | "OMISSION_FROM_RETRIEVAL"
    | "FALSE_PERMISSION_LANGUAGE";
  severity: "BLOCKER" | "MATERIAL" | "INFO";
  detail: string;
  rejectsFirstAnalysis: boolean;
}

export interface AdversarialLegalVerification {
  version: typeof ADVERSARIAL_LEGAL_VERIFY_VERSION;
  verdict: VerifierVerdict;
  findings: VerifierFinding[];
  reconstructedRestrictionCount: number;
  firstAnalysisRejected: boolean;
}

function citationExact(answer: AskRetrieveAnswer, representations: ContractualProvisionRepresentation[]): VerifierFinding[] {
  const out: VerifierFinding[] = [];
  for (const c of answer.citations) {
    if (!c.sectionRef || !c.excerpt || c.excerpt.length < 20) {
      out.push({
        code: "CITATION_MISMATCH",
        severity: "MATERIAL",
        detail: `Citation for ${c.governingAgreement} lacks a usable section/excerpt.`,
        rejectsFirstAnalysis: true,
      });
    }
  }
  for (const r of representations) {
    if (r.sourceCitations.length === 0) {
      out.push({
        code: "CITATION_MISMATCH",
        severity: "BLOCKER",
        detail: `§${r.sectionRef} representation has no source citation.`,
        rejectsFirstAnalysis: true,
      });
    }
  }
  return out;
}

/**
 * Independent verification of a first-pass Ask / cross-covenant analysis.
 * Uses only deterministic reconstruction + omission signals — never the
 * same model's self-grade.
 */
export function verifyLegalAnalysisIndependently(params: {
  firstAnswer: AskRetrieveAnswer;
  retrieval: CompleteRetrievalResult;
  crossCovenant?: CrossCovenantAnalysis | null;
  representations?: ContractualProvisionRepresentation[];
}): AdversarialLegalVerification {
  const findings: VerifierFinding[] = [];
  const representations = params.representations ?? [];

  // 1. Reconstruct applicable restriction set from retrieval expansion
  const restrictions = params.retrieval.expanded.filter((e) => e.role === "GOVERNING_RESTRICTION");
  const permissions = params.retrieval.expanded.filter(
    (e) => e.role === "PERMISSION" || e.role === "EXCEPTION_PROVISO",
  );

  // 2. Missing permissions / exceptions
  for (const o of params.retrieval.omissions) {
    if (o.kind === "MISSING_PERMISSION_UNDER_PROHIBITION" || o.kind === "MISSING_SHARED_CAP_PEER") {
      findings.push({
        code: "MISSING_PERMISSION_OR_EXCEPTION",
        severity: o.severity === "HIGH" ? "BLOCKER" : "MATERIAL",
        detail: o.detail,
        rejectsFirstAnalysis: o.severity === "HIGH",
      });
    }
    if (o.kind === "MISSING_DEFINITION") {
      findings.push({
        code: "DEFINED_TERM_CHALLENGE",
        severity: "BLOCKER",
        detail: o.detail,
        rejectsFirstAnalysis: true,
      });
    }
    if (o.kind === "AMENDMENT_PRECEDENCE_UNRESOLVED") {
      findings.push({
        code: "AMENDMENT_PRECEDENCE",
        severity: "BLOCKER",
        detail: o.detail,
        rejectsFirstAnalysis: true,
      });
    }
    if (o.kind === "MISSING_RELATED_FAMILY" || o.kind === "MISSING_CROSS_REF_TARGET") {
      findings.push({
        code: "OMISSION_FROM_RETRIEVAL",
        severity: "MATERIAL",
        detail: o.detail,
        rejectsFirstAnalysis: false,
      });
    }
  }

  // 3. Challenge defined-term interpretation in representations
  for (const r of representations) {
    for (const d of r.definedTermDependencies.filter((x) => !x.resolved)) {
      findings.push({
        code: "DEFINED_TERM_CHALLENGE",
        severity: "MATERIAL",
        detail: `§${r.sectionRef} depends on unresolved defined term “${d.term}”.`,
        rejectsFirstAnalysis: true,
      });
    }
    // 5. Quantitative formulas
    if (r.calculationFormula) {
      findings.push({
        code: "FORMULA_UNVERIFIED",
        severity: "INFO",
        detail: `§${r.sectionRef} formula “${r.calculationFormula}” is surface-extracted only — not Phase-3 verified.`,
        rejectsFirstAnalysis: false,
      });
    }
    // 7. Unsupported assumptions
    for (const a of r.ambiguityAndUnsupportedMechanics) {
      findings.push({
        code: "UNSUPPORTED_ASSUMPTION",
        severity: /capacity|permitted|operative/i.test(a) ? "MATERIAL" : "INFO",
        detail: `§${r.sectionRef}: ${a}`,
        rejectsFirstAnalysis: /capacity|permitted|invent/i.test(a),
      });
    }
    if (r.executabilityStance !== "CERTIFIED_UPSTREAM" && r.executabilityStance !== "NOT_EXECUTABLE") {
      findings.push({
        code: "UNSUPPORTED_ASSUMPTION",
        severity: "BLOCKER",
        detail: `§${r.sectionRef} stance ${r.executabilityStance} is not certified executable authority.`,
        rejectsFirstAnalysis: true,
      });
    }
  }

  // 4. Amendment precedence already covered via omissions; also scan answer text
  if (/UNRESOLVED.*amendment|amendment.*UNRESOLVED/i.test(params.firstAnswer.detail + (params.firstAnswer.amendmentNote ?? ""))) {
    findings.push({
      code: "AMENDMENT_PRECEDENCE",
      severity: "BLOCKER",
      detail: "First analysis acknowledges unresolved amendment precedence — operative answer rejected.",
      rejectsFirstAnalysis: true,
    });
  }

  // 6. Cross-covenant consistency
  if (params.crossCovenant) {
    if (params.crossCovenant.applicableRestrictions.length === 0) {
      findings.push({
        code: "CROSS_COVENANT_INCONSISTENCY",
        severity: "MATERIAL",
        detail: "Cross-covenant pass found zero independently applicable restrictions for the transaction.",
        rejectsFirstAnalysis: true,
      });
    }
    for (const note of params.crossCovenant.antiStackingNotes) {
      const mentionsStack =
        /stack|independent basket|separately/i.test(params.firstAnswer.detail) &&
        !/must not be stacked|shared/i.test(params.firstAnswer.detail);
      if (mentionsStack) {
        findings.push({
          code: "CROSS_COVENANT_INCONSISTENCY",
          severity: "BLOCKER",
          detail: `First analysis appears to treat shared capacity as independent: ${note}`,
          rejectsFirstAnalysis: true,
        });
      }
    }
    for (const u of params.crossCovenant.unsupportedAssumptions.slice(0, 6)) {
      findings.push({
        code: "UNSUPPORTED_ASSUMPTION",
        severity: "MATERIAL",
        detail: u,
        rejectsFirstAnalysis: false,
      });
    }
  }

  // False permission language in the first answer
  if (
    /\b(?:is permitted|may freely|transaction is allowed|capacity of \$)\b/i.test(params.firstAnswer.detail) &&
    !/not a determination|not.*permitted|will not invent/i.test(params.firstAnswer.detail)
  ) {
    findings.push({
      code: "FALSE_PERMISSION_LANGUAGE",
      severity: "BLOCKER",
      detail: "First analysis uses permission/capacity language without certification guardrails.",
      rejectsFirstAnalysis: true,
    });
  }

  // 8. Citations
  findings.push(...citationExact(params.firstAnswer, representations));

  // If a prohibition was retrieved but zero permissions and answer lists permissions as available — reject
  if (
    restrictions.length > 0 &&
    permissions.length === 0 &&
    (params.firstAnswer.permissions?.length ?? 0) > 0 &&
    !/None clearly segmented/i.test(params.firstAnswer.detail)
  ) {
    findings.push({
      code: "MISSING_PERMISSION_OR_EXCEPTION",
      severity: "BLOCKER",
      detail: "Answer lists permissions but independent reconstruction found none under the governing restriction.",
      rejectsFirstAnalysis: true,
    });
  }

  const rejects = findings.some((f) => f.rejectsFirstAnalysis && (f.severity === "BLOCKER" || f.severity === "MATERIAL"));
  const blockers = findings.some((f) => f.severity === "BLOCKER");
  let verdict: VerifierVerdict;
  if (blockers || rejects) verdict = "REJECTED";
  else if (findings.some((f) => f.severity === "MATERIAL") || params.retrieval.retrievalIncomplete) verdict = "INCOMPLETE";
  else verdict = "CONFIRMED";

  return {
    version: ADVERSARIAL_LEGAL_VERIFY_VERSION,
    verdict,
    findings,
    reconstructedRestrictionCount: restrictions.length,
    firstAnalysisRejected: verdict === "REJECTED",
  };
}
