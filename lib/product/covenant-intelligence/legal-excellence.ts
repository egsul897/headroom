/**
 * Headroom legal-excellence orchestration — wires complete retrieval,
 * contractual representation, cross-covenant analysis, independent
 * verification, and Phase 3 certification bridging for Ask.
 */

import type { CovenantSummaryItem } from "./summarize";
import { completeRetrieveAndAnswer, type CompleteRetrievalResult } from "./complete-retrieval";
import { representProvision, type ContractualProvisionRepresentation } from "./contractual-representation";
import { analyzeCrossCovenant, type CrossCovenantAnalysis } from "./cross-covenant";
import { verifyLegalAnalysisIndependently, type AdversarialLegalVerification } from "./adversarial-legal-verify";
import { bridgeToCertificationPipeline, type BridgedLegalAnswer, type CertifiedRuleRef } from "./certification-bridge";

export interface LegalExcellenceInput {
  question: string;
  items: Array<CovenantSummaryItem & { sourceId: string }>;
  researchOnly?: boolean;
  amendmentNote?: string;
  /** Optional transaction description for cross-covenant coordination. */
  transactionDescription?: string;
  certifiedRules?: CertifiedRuleRef[];
  limit?: number;
}

export interface LegalExcellenceResult {
  retrieval: CompleteRetrievalResult;
  representations: ContractualProvisionRepresentation[];
  crossCovenant: CrossCovenantAnalysis | null;
  verification: AdversarialLegalVerification;
  bridged: BridgedLegalAnswer;
}

/** End-to-end lawyer-grade Ask path over persisted provision analyses. */
export function runLegalExcellence(input: LegalExcellenceInput): LegalExcellenceResult {
  const retrieval = completeRetrieveAndAnswer({
    question: input.question,
    items: input.items,
    researchOnly: input.researchOnly,
    amendmentNote: input.amendmentNote,
    limit: input.limit,
  });

  const cited = new Set(retrieval.answer.citations.map((c) => `${c.sourceId}::${c.sectionRef}`));
  const hitItems = input.items.filter((i) => cited.has(`${i.sourceId}::${i.sectionRef}`));
  const forRep = hitItems.length > 0 ? hitItems : input.items.slice(0, input.limit ?? 6);

  const representations = forRep.map((item) =>
    representProvision({ item, amendmentProvenance: input.amendmentNote, certifiedUpstream: (input.certifiedRules ?? []).some((c) => c.sectionRef === item.sectionRef) }),
  );

  const crossCovenant = input.transactionDescription
    ? analyzeCrossCovenant({
        transactionDescription: input.transactionDescription,
        items: input.items,
        amendmentProvenance: input.amendmentNote,
      })
    : analyzeCrossCovenant({
        transactionDescription: input.question,
        items: input.items,
        amendmentProvenance: input.amendmentNote,
      });

  const verification = verifyLegalAnalysisIndependently({
    firstAnswer: retrieval.answer,
    retrieval,
    crossCovenant,
    representations,
  });

  const bridged = bridgeToCertificationPipeline({
    ask: retrieval.answer,
    retrieval,
    representations,
    crossCovenant,
    verification,
    certifiedRules: input.certifiedRules,
  });

  return { retrieval, representations, crossCovenant, verification, bridged };
}

export {
  completeRetrieveAndAnswer,
  representProvision,
  analyzeCrossCovenant,
  verifyLegalAnalysisIndependently,
  bridgeToCertificationPipeline,
};
