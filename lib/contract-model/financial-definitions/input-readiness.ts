/**
 * UCD-4 — derive required financial inputs for a contractual definition.
 * Never invents values; classifies readiness only from supplied evidence status.
 */

import { catalogEntry } from "./catalog";
import type {
  ContractualFinancialDefinition,
  DefinitionDependencyClosure,
  DefinitionInputManifest,
  FinancialInputReadiness,
  FinancialInputRequirement,
} from "./types";

export interface KnownInputStatus {
  key: string;
  readiness: FinancialInputReadiness;
  /** Optional override for evidence text. */
  requiredEvidence?: string;
  publicFilingCandidate?: boolean;
  companyOrReviewerRequired?: boolean;
  notes?: string;
}

const BLOCKING: ReadonlySet<FinancialInputReadiness> = new Set([
  "MISSING",
  "AMBIGUOUS",
  "STALE",
  "UNSUPPORTED",
  "AVAILABLE_UNVERIFIED",
]);

function defaultEvidenceForTerm(termName: string): {
  requiredEvidence: string;
  publicFilingCandidate: boolean;
  companyOrReviewerRequired: boolean;
} {
  return {
    requiredEvidence: `Instrument-scoped definition and verified numeric binding for "${termName}" (compliance certificate / delivered reporting / debt schedule / reviewer approval as applicable)`,
    publicFilingCandidate: true,
    companyOrReviewerRequired: true,
  };
}

/**
 * Build a missing-information style manifest for one definition using its dependency closure.
 * `known` supplies readiness for leaf facts already in hand; absent keys default to MISSING.
 */
export function buildDefinitionInputManifest(params: {
  definition: ContractualFinancialDefinition;
  closure: DefinitionDependencyClosure;
  known?: readonly KnownInputStatus[];
}): DefinitionInputManifest {
  const knownMap = new Map((params.known ?? []).map((k) => [k.key, k]));
  const requirements: FinancialInputRequirement[] = [];

  const pushReq = (key: string, metricKind: FinancialInputRequirement["metricKind"], fallbackNotes?: string) => {
    const known = knownMap.get(key);
    const defaults = defaultEvidenceForTerm(key);
    const readiness = known?.readiness ?? "MISSING";
    requirements.push({
      key,
      metricKind,
      readiness,
      requiredEvidence: known?.requiredEvidence ?? defaults.requiredEvidence,
      publicFilingCandidate: known?.publicFilingCandidate ?? defaults.publicFilingCandidate,
      companyOrReviewerRequired: known?.companyOrReviewerRequired ?? defaults.companyOrReviewerRequired,
      notes: known?.notes ?? fallbackNotes,
    });
  };

  // Root definition itself
  if (params.definition.calculationExpression === null || params.definition.sufficiency === "UNSUPPORTED") {
    pushReq(params.definition.termName, params.definition.metricKind, "Root definition is not compositionally executable");
  } else {
    const catalog = catalogEntry(params.definition.metricKind);
    // Even with an expression, leaf metrics still need binding
    for (const dep of params.closure.nodes) {
      if (dep.depth === 0) continue;
      if (dep.status === "RESOLVED" && dep.metricKind) {
        // Resolved term still needs a numeric leaf or further expansion — require input unless known
        pushReq(dep.termName, dep.metricKind);
      } else if (dep.status === "UNRESOLVED") {
        pushReq(dep.termName, "RAW_FINANCIAL_FACT", "Unresolved defined-term dependency");
      } else if (dep.status === "UNSUPPORTED") {
        pushReq(dep.termName, dep.metricKind ?? "RAW_FINANCIAL_FACT", dep.reason);
        // Force UNSUPPORTED readiness when structural support is absent
        const last = requirements[requirements.length - 1]!;
        if (last.readiness !== "UNSUPPORTED") {
          last.readiness = "UNSUPPORTED";
          last.notes = dep.reason;
        }
      } else if (dep.status === "CYCLE") {
        pushReq(dep.termName, dep.metricKind ?? "REVIEWER_DECISION", dep.reason);
        const last = requirements[requirements.length - 1]!;
        last.readiness = "AMBIGUOUS";
      }
    }
    // If closure is empty of deps, still require the root metric binding
    if (params.definition.dependsOnTerms.length === 0) {
      pushReq(params.definition.termName, params.definition.metricKind, `Legacy flat proxy candidate: ${catalog.legacyFlatProxy ?? "none"}`);
    }
  }

  // Explicit unsupported adjustments always surface
  for (const adj of params.definition.adjustments) {
    if (adj.kind === "UNSUPPORTED") {
      requirements.push({
        key: `adjustment:${adj.semanticDescription.slice(0, 80)}`,
        metricKind: "REVIEWER_DECISION",
        readiness: "UNSUPPORTED",
        requiredEvidence: `Reviewer disposition or IR extension for: ${adj.reason}`,
        publicFilingCandidate: false,
        companyOrReviewerRequired: true,
        notes: adj.sourceEvidence.slice(0, 200),
      });
    }
  }

  // Dedupe by key (keep worst readiness)
  const precedence: Record<FinancialInputReadiness, number> = {
    AVAILABLE_VERIFIED: 0,
    AVAILABLE_UNVERIFIED: 1,
    STALE: 2,
    AMBIGUOUS: 3,
    MISSING: 4,
    UNSUPPORTED: 5,
  };
  const byKey = new Map<string, FinancialInputRequirement>();
  for (const r of requirements) {
    const prev = byKey.get(r.key);
    if (!prev || precedence[r.readiness] > precedence[prev.readiness]) byKey.set(r.key, r);
  }
  const deduped = [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));

  const blockingReadiness = [
    ...new Set(deduped.map((r) => r.readiness).filter((r) => BLOCKING.has(r))),
  ].sort() as FinancialInputReadiness[];

  const mayEvaluateAuthoritatively =
    params.closure.executable &&
    blockingReadiness.length === 0 &&
    deduped.every((r) => r.readiness === "AVAILABLE_VERIFIED");

  return {
    definitionId: params.definition.definitionId,
    termName: params.definition.termName,
    companyId: params.definition.companyId,
    instrumentKey: params.definition.instrumentKey,
    requirements: deduped,
    blockingReadiness,
    mayEvaluateAuthoritatively,
  };
}
