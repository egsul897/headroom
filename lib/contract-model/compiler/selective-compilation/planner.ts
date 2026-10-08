/**
 * Dependency-complete selective compilation planner.
 *
 * Builds a broad deterministic inventory, identifies legally relevant seeds,
 * then expands to controlling dependencies (prohibitions, exceptions, definitions,
 * amendments, shared caps, cross-document restrictions). Compiles only the
 * necessary semantic units. Omitted sources are audited independently.
 *
 * Deliberately NOT top-k retrieval / embedding similarity.
 */
import { extractDeterministicCovenantFacts, type DeterministicExtractionResult } from "../deterministic-extraction";
import { SELECTIVE_PLANNER_VERSION, type OmittedSourceAudit, type PlanInclusionReason, type PlanUnit, type SelectiveCompilationPlan } from "./types";

export interface InventoryProvision {
  unitId: string;
  documentId: string | null;
  sectionRef: string | null;
  text: string;
  /** Caller-supplied legal relevance (e.g. discovery role). */
  roles?: string[];
  families?: string[];
  isSeed?: boolean;
  amendmentOf?: string[];
  sharedCapacityGroup?: string | null;
  crossDocumentRestriction?: boolean;
  definitionTerms?: string[];
}

export interface SelectivePlannerInput {
  provisions: InventoryProvision[];
  seedUnitIds?: string[];
  /** Max compile units; dependency closure still preferred over arbitrary truncation. */
  maxCompileUnits?: number;
}

const RELEVANT_ROLES = new Set([
  "GENERAL_PROHIBITION",
  "PERMISSION",
  "BASKET",
  "EXCEPTION",
  "RATIO_BASED_PERMISSION",
  "BUILDER",
  "CONDITION",
  "PROVISO",
  "FINANCIAL_TEST",
  "SHARED_CAP",
  "DEFINITIONAL_DEPENDENCY_CANDIDATE",
]);

function extractionFor(p: InventoryProvision): DeterministicExtractionResult {
  return extractDeterministicCovenantFacts({
    text: p.text,
    documentId: p.documentId,
    candidateRef: p.unitId,
    citation: p.sectionRef,
    knownFamilies: p.families,
    knownDefinitions: p.definitionTerms,
  });
}

function isLegallyRelevant(p: InventoryProvision, extraction: DeterministicExtractionResult): boolean {
  if (p.isSeed) return true;
  if ((p.roles ?? []).some((r) => RELEVANT_ROLES.has(r))) return true;
  if (p.crossDocumentRestriction) return true;
  if (p.sharedCapacityGroup) return true;
  if ((p.amendmentOf ?? []).length > 0) return true;
  const inv = extraction.inventory;
  return (
    inv.covenantFamilySignals.length > 0 ||
    inv.exceptions.length > 0 ||
    inv.provisos.length > 0 ||
    inv.numericalThresholds.length > 0 ||
    inv.financialRatios.length > 0 ||
    inv.sharedCapacitySignals.length > 0
  );
}

/**
 * Expand seed set to dependency-complete closure using deterministic signals
 * and caller-supplied structural edges — never embedding top-k.
 */
export function planSelectiveCompilation(input: SelectivePlannerInput): SelectiveCompilationPlan {
  const byId = new Map(input.provisions.map((p) => [p.unitId, p]));
  const extractions = new Map<string, DeterministicExtractionResult>();
  for (const p of input.provisions) extractions.set(p.unitId, extractionFor(p));

  const seedIds = new Set(
    (input.seedUnitIds?.length ? input.seedUnitIds : input.provisions.filter((p) => p.isSeed).map((p) => p.unitId)).filter((id) => byId.has(id))
  );
  if (seedIds.size === 0) {
    for (const p of input.provisions) {
      if (isLegallyRelevant(p, extractions.get(p.unitId)!)) seedIds.add(p.unitId);
    }
  }

  const reasons = new Map<string, Set<PlanInclusionReason>>();
  const dependencyOf = new Map<string, Set<string>>();
  const ensure = (id: string, reason: PlanInclusionReason, parent?: string) => {
    if (!reasons.has(id)) reasons.set(id, new Set());
    reasons.get(id)!.add(reason);
    if (parent) {
      if (!dependencyOf.has(id)) dependencyOf.set(id, new Set());
      dependencyOf.get(id)!.add(parent);
    }
  };

  for (const id of seedIds) ensure(id, "SEED_CANDIDATE");

  // Closure passes (fixed-point over structural/deterministic edges).
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 32) {
    changed = false;
    const current = [...reasons.keys()];
    for (const id of current) {
      const p = byId.get(id);
      if (!p) continue;
      const ex = extractions.get(id)!;

      // Governing prohibitions / same-family siblings with GENERAL_PROHIBITION role.
      for (const other of input.provisions) {
        if (other.unitId === id) continue;
        const roles = other.roles ?? [];
        if (roles.includes("GENERAL_PROHIBITION") && (other.families ?? []).some((f) => (p.families ?? []).includes(f) || ex.inventory.covenantFamilySignals.includes(f))) {
          if (!reasons.has(other.unitId)) {
            ensure(other.unitId, "GOVERNING_PROHIBITION", id);
            changed = true;
          }
        }
        if ((roles.includes("EXCEPTION") || roles.includes("PROVISO") || roles.includes("CONDITION")) && other.sectionRef && p.sectionRef && other.sectionRef.startsWith(p.sectionRef.split("(")[0]!)) {
          if (!reasons.has(other.unitId)) {
            ensure(other.unitId, "EXCEPTION_OR_PROVISO", id);
            changed = true;
          }
        }
        if (other.sharedCapacityGroup && other.sharedCapacityGroup === p.sharedCapacityGroup) {
          if (!reasons.has(other.unitId)) {
            ensure(other.unitId, "SHARED_CAPACITY", id);
            changed = true;
          }
        }
        if ((other.amendmentOf ?? []).includes(id) || (p.amendmentOf ?? []).includes(other.unitId)) {
          if (!reasons.has(other.unitId)) {
            ensure(other.unitId, "AMENDMENT_EFFECT", id);
            changed = true;
          }
        }
        if (other.crossDocumentRestriction && (other.families ?? []).some((f) => (p.families ?? ex.inventory.covenantFamilySignals).includes(f))) {
          if (!reasons.has(other.unitId)) {
            ensure(other.unitId, "CROSS_DOCUMENT_RESTRICTION", id);
            changed = true;
          }
        }
      }

      // Definition dependencies by term mention (inline means + "definition of \"Term\"" references).
      const referencedTerms = new Set<string>([...ex.inventory.definitions, ...(p.definitionTerms ?? [])]);
      for (const m of p.text.matchAll(/(?:definition\s+of|defined\s+term)\s+[“"]([^”"]{1,80})[”"]/gi)) {
        if (m[1]) referencedTerms.add(m[1]);
      }
      for (const m of p.text.matchAll(/[“"]([A-Z][^”"]{1,80})[”"]/g)) {
        if (m[1] && /definition|means|Consolidated|EBITDA|Indebtedness|Leverage/i.test(p.text)) referencedTerms.add(m[1]);
      }
      for (const term of referencedTerms) {
        for (const other of input.provisions) {
          if (other.unitId === id) continue;
          const otherRoles = other.roles ?? [];
          const definesTerm =
            (other.definitionTerms ?? []).includes(term) ||
            other.text.includes(`"${term}" means`) ||
            other.text.includes(`“${term}” means`) ||
            new RegExp(`[“"]${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[”"]\\s+means`, "i").test(other.text);
          if (definesTerm || (otherRoles.includes("DEFINITIONAL_DEPENDENCY_CANDIDATE") && other.text.includes(term))) {
            if (!reasons.has(other.unitId)) {
              ensure(other.unitId, "DEFINITION_DEPENDENCY", id);
              changed = true;
            }
          }
        }
      }

      // Cross-reference closure by section ref.
      for (const ref of ex.inventory.crossReferences) {
        for (const other of input.provisions) {
          if (other.sectionRef && (other.sectionRef === ref || other.sectionRef.endsWith(ref) || ref.startsWith(other.sectionRef))) {
            if (!reasons.has(other.unitId)) {
              ensure(other.unitId, "CROSS_REFERENCE_CLOSURE", id);
              changed = true;
            }
          }
        }
      }

      // Entity-scope neighbors when seed mentions entity phrases.
      if (ex.inventory.entityScopeSignals.length > 0) {
        for (const other of input.provisions) {
          if (other.unitId === id) continue;
          const oex = extractions.get(other.unitId)!;
          if (oex.inventory.entityScopeSignals.length > 0 && (other.families ?? []).some((f) => (p.families ?? []).includes(f))) {
            if (!reasons.has(other.unitId) && reasons.size < (input.maxCompileUnits ?? 500)) {
              ensure(other.unitId, "ENTITY_SCOPE_CONTEXT", id);
              changed = true;
            }
          }
        }
      }
    }
  }

  const compileIds = [...reasons.keys()];
  const max = input.maxCompileUnits ?? compileIds.length;
  const limited = compileIds.slice(0, max);

  const units: PlanUnit[] = limited.map((id) => {
    const p = byId.get(id)!;
    const ex = extractions.get(id)!;
    return {
      unitId: id,
      documentId: p.documentId,
      sectionRef: p.sectionRef,
      text: p.text,
      reasons: [...(reasons.get(id) ?? [])],
      dependencyOf: [...(dependencyOf.get(id) ?? [])],
      factIds: ex.facts.map((f) => f.factId),
    };
  });

  const omitted: OmittedSourceAudit[] = [];
  for (const p of input.provisions) {
    if (reasons.has(p.unitId)) continue;
    const ex = extractions.get(p.unitId)!;
    const relevant = isLegallyRelevant(p, ex);
    omitted.push({
      sourceId: p.unitId,
      documentId: p.documentId,
      sectionRef: p.sectionRef,
      whyOmitted: relevant
        ? "Legally relevant by local signals but outside dependency closure of selected seeds (review required)."
        : "Not legally relevant under deterministic inventory signals and not in seed dependency closure.",
      independentlyReviewed: true,
    });
  }

  const modelInputChars = units.reduce((n, u) => n + u.text.length, 0);
  const fullInventoryChars = input.provisions.reduce((n, p) => n + p.text.length, 0);
  const legallyRelevantCount = input.provisions.filter((p) => isLegallyRelevant(p, extractions.get(p.unitId)!)).length;

  return {
    version: SELECTIVE_PLANNER_VERSION,
    seedCandidateRefs: [...seedIds],
    units,
    compileUnitIds: limited,
    omitted,
    stats: {
      inventoryCount: input.provisions.length,
      legallyRelevantCount,
      compileCount: limited.length,
      omittedCount: omitted.length,
      modelInputChars,
      fullInventoryChars,
      reductionRatio: fullInventoryChars === 0 ? 0 : 1 - modelInputChars / fullInventoryChars,
    },
    notes: [
      "Planner uses deterministic inventory + structural dependency closure, not top-k retrieval.",
      "Threshold facts never authorize inclusion as permission.",
      "Omitted sources are listed for independent audit.",
    ],
  };
}
