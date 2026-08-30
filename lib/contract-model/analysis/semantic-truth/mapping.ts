/**
 * Phase 3F.1.6.RX Workstream H (AUDIT-F1) - the trust-gating mapping: given
 * one IRRule/IRDefinition's own RepresentationSufficiency plus (when it
 * exists) the SemanticVerificationResult for the candidate it was compiled
 * from, decide the ONE SemanticTruthTrustStatus this phase's own charter
 * Section 19 requires. See prisma/schema.prisma's own
 * SemanticTruthTrustStatus doc comment for the full taxonomy rationale -
 * this module is deliberately just the pure decision function, never a
 * second copy of semantic-verification's own status taxonomy.
 *
 * SCOPE NOTE (disclosed, not silently assumed): verification in this
 * codebase runs PER COMPILED CANDIDATE (one SemanticVerificationResult per
 * candidateRef - semantic-verification/types.ts's own VerificationInput),
 * not per individual IRRule/IRDefinition a multi-rule candidate (a builder
 * basket) might produce. This mapping therefore assigns the SAME trust
 * status to every rule/definition compiled from the same candidate, UNLESS
 * that specific object's own `sufficiency` is UNSUPPORTED - an unsupported
 * representation can never be trusted regardless of what verification
 * found for its sibling rules under the same candidate, since there is no
 * faithful structured meaning in it to have verified in the first place.
 * A finer-grained per-rule trust status (keying off
 * SemanticVerificationFinding.ruleOrDefinitionId individually) is a
 * legitimate future refinement, not required to close this audit finding -
 * see 09-semantic-truth-persistence-design.json's own disclosed scope note.
 */
import type { RepresentationSufficiency } from "../../ir/types";
import type { SemanticVerificationResult } from "../../compiler/semantic-verification/types";
import type { SemanticTruthFindingSummary } from "./types";
import type { SemanticTruthTrustStatus } from "@prisma/client";

const MAX_FINDINGS_IN_SUMMARY = 20;
const MAX_REASONING_LENGTH = 500;

export function computeTrustStatus(sufficiency: RepresentationSufficiency, verification: SemanticVerificationResult | null): SemanticTruthTrustStatus {
  if (sufficiency === "UNSUPPORTED") return "UNSUPPORTED";
  if (!verification) return "COMPILED";
  switch (verification.status) {
    case "VERIFIED_NO_MATERIAL_GAP_FOUND":
    case "VERIFIED_WITH_NON_MATERIAL_FINDINGS":
      return "VERIFIED";
    case "MATERIAL_DISCREPANCY":
      return "CONTRADICTED";
    case "REVIEW_REQUIRED":
    case "VERIFICATION_INCOMPLETE":
    case "VERIFICATION_FAILED":
    case "NOT_VERIFIED":
      return "REVIEW_REQUIRED";
    default: {
      const _exhaustive: never = verification.status;
      return _exhaustive;
    }
  }
}

/** Bounded, sanitization-free (verifierReasoning is the verifier's own structured written explanation, not free-text user/model narrative prone to embedding secrets the way a thrown exception message can - matches SemanticVerificationFinding's own "never fabricated post-hoc" discipline) summary - never the full finding list, never raw proposedIrEvidence/deterministicSignals. */
export function summarizeFindings(verification: SemanticVerificationResult | null): SemanticTruthFindingSummary[] | null {
  if (!verification || verification.findings.length === 0) return null;
  return verification.findings.slice(0, MAX_FINDINGS_IN_SUMMARY).map((f) => ({
    findingId: f.findingId,
    findingType: f.findingType,
    severity: f.severity,
    sourceCitation: f.sourceCitation,
    verifierReasoning: f.verifierReasoning.length > MAX_REASONING_LENGTH ? `${f.verifierReasoning.slice(0, MAX_REASONING_LENGTH)}... [truncated]` : f.verifierReasoning,
  }));
}
