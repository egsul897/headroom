/**
 * Workstream 8 — Integrate verified contractual interpretations with Phase 3
 * certification and expose them to Ask / Phase 4 consumers without inventing
 * permissions.
 */

import type { AskRetrieveAnswer } from "./ask-retrieve";
import type { AdversarialLegalVerification } from "./adversarial-legal-verify";
import type { ContractualProvisionRepresentation } from "./contractual-representation";
import type { CrossCovenantAnalysis } from "./cross-covenant";
import type { CompleteRetrievalResult } from "./complete-retrieval";

export const CERTIFICATION_BRIDGE_VERSION = "product.certification-bridge.v1";

export type CertifiedRuleRef = {
  ruleId: string;
  sectionRef: string;
  instrumentKey: string;
  sourceCitation: string;
  epistemicStatus: "PHASE3_CERTIFIED";
};

export interface BridgedLegalAnswer {
  version: typeof CERTIFICATION_BRIDGE_VERSION;
  ask: AskRetrieveAnswer;
  retrieval: CompleteRetrievalResult;
  representations: ContractualProvisionRepresentation[];
  crossCovenant: CrossCovenantAnalysis | null;
  verification: AdversarialLegalVerification;
  certifiedRuleRefs: CertifiedRuleRef[];
  /** Ask must not invent permissions beyond these certified refs + disclosed discovery. */
  permissionAuthority: "CERTIFIED_RULES_ONLY" | "DISCOVERY_NON_AUTHORITATIVE";
  provenancePreserved: true;
  usableByPhase4A: boolean;
  usableByPhase4E: boolean;
  usableByPhase4D: boolean;
  blockReasons: string[];
}

/**
 * Bind Ask output to Phase 3 certified rules when available.
 * Certified rules may feed Phase 4A evaluation, 4E enumeration, and 4D simulation.
 * Discovery-only analyses remain non-authoritative.
 */
export function bridgeToCertificationPipeline(params: {
  ask: AskRetrieveAnswer;
  retrieval: CompleteRetrievalResult;
  representations: ContractualProvisionRepresentation[];
  crossCovenant: CrossCovenantAnalysis | null;
  verification: AdversarialLegalVerification;
  certifiedRules?: CertifiedRuleRef[];
}): BridgedLegalAnswer {
  const certified = params.certifiedRules ?? [];
  const blockReasons: string[] = [];

  if (params.verification.firstAnalysisRejected) {
    blockReasons.push("Independent adversarial verifier rejected the first analysis");
  }
  if (params.retrieval.retrievalIncomplete) {
    blockReasons.push("Complete-retrieval omission pass reported HIGH gaps");
  }
  if (params.ask.promotedToLegalTruth !== 0) {
    blockReasons.push("Ask illegally promoted discovery to legal truth");
  }

  const permissionAuthority =
    certified.length > 0 && !params.verification.firstAnalysisRejected
      ? "CERTIFIED_RULES_ONLY"
      : "DISCOVERY_NON_AUTHORITATIVE";

  // Phase 4 consumers require certified + verified path
  const phase4Ok =
    permissionAuthority === "CERTIFIED_RULES_ONLY" &&
    params.verification.verdict === "CONFIRMED" &&
    blockReasons.length === 0;

  let ask = params.ask;
  if (certified.length > 0) {
    const certBlock = [
      "",
      "Phase 3 certified rules bound to this answer (executable authority only for these refs):",
      ...certified.map((c) => `• ${c.sectionRef} [${c.ruleId}] — ${c.sourceCitation}`),
      "Ask Headroom will not invent additional legal permissions beyond certified rules and disclosed discovery gaps.",
    ].join("\n");
    ask = {
      ...ask,
      detail: `${ask.detail}${certBlock}`,
      limitations: [
        ...ask.limitations,
        "Certified-rule bridge active — discovery text is explanatory only",
      ],
    };
  } else {
    ask = {
      ...ask,
      limitations: [
        ...ask.limitations,
        "No Phase 3 certified rules bound — explanatory discovery only; not Phase 4 executable",
      ],
    };
  }

  return {
    version: CERTIFICATION_BRIDGE_VERSION,
    ask,
    retrieval: params.retrieval,
    representations: params.representations,
    crossCovenant: params.crossCovenant,
    verification: params.verification,
    certifiedRuleRefs: certified,
    permissionAuthority,
    provenancePreserved: true,
    usableByPhase4A: phase4Ok,
    usableByPhase4E: phase4Ok,
    usableByPhase4D: phase4Ok,
    blockReasons,
  };
}
