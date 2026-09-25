/**
 * Deterministic qualitative accountability: every materially operative IR claim must point at
 * source-backed inventory lineage and provenance. Numeric grounding (numeric-assertion.ts) already
 * proves amounts against the source; this layer covers the qualitative fields - posture, action,
 * rule type, transaction scope, entity scope, conditions, exceptions, dependencies - which until now
 * could be emitted with no lineage at all and pass verification.
 *
 * The check is structural, not linguistic: a field is GROUNDED when the unit (or the sub-object that
 * carries the field) cites at least one inventoryItemIds entry that exists in the frozen inventory
 * AND the unit carries provenance (a citation or excerpt) into the operative/context source. No
 * prose similarity is consulted. An ungrounded material field yields a MATERIAL finding
 * (QUALITATIVE_ASSERTION_UNGROUNDED); sufficiency is not silently downgraded here - the finding is
 * the record, and the verifier status/gate treat MATERIAL findings as blocking.
 */
import type { IRDefinition, IRRule } from "../../ir/types";
import type { FrozenSemanticInventory } from "../semantic-accountability/types";
import type { SemanticVerificationFinding } from "./types";
import { computeSemanticVerificationFindingId } from "./identity";
import { SEMANTIC_VERIFIER_ALGORITHM_VERSION } from "./types";

export const QUALITATIVE_GROUNDING_VERSION = "qualitative-grounding.v1";

export type QualitativeField = "posture" | "action" | "ruleType" | "transactionScope" | "entityScope" | "conditions" | "exceptions" | "dependsOn" | "covenantFamily" | "calculationExpression";

export interface QualitativeLineageAudit {
  version: typeof QUALITATIVE_GROUNDING_VERSION;
  units: { unitId: string; kind: "RULE" | "DEFINITION"; grounded: QualitativeField[]; ungrounded: { field: string; reason: string }[]; hasProvenance: boolean; inventoryItemIds: string[]; unknownInventoryItemIds: string[] }[];
  materialUngrounded: number;
  inventoryAvailable: boolean;
}

function lineage(obj: { inventoryItemIds?: string[] } | null | undefined): string[] { return obj?.inventoryItemIds ?? []; }

export function auditQualitativeLineage(input: { rules: readonly IRRule[]; definitions: readonly IRDefinition[]; frozenInventory: FrozenSemanticInventory | null | undefined }): QualitativeLineageAudit {
  const known = new Set((input.frozenInventory?.items ?? []).map((i) => i.inventoryItemId));
  const inventoryAvailable = !!input.frozenInventory && input.frozenInventory.items.length > 0;
  const units: QualitativeLineageAudit["units"] = [];
  const unitGrounded = (ids: string[]) => ids.some((id) => known.has(id));
  for (const r of input.rules) {
    const ids = lineage(r); const unknown = ids.filter((id) => !known.has(id));
    const hasProvenance = !!r.provenance && (!!r.provenance.sourceCitation || !!r.provenance.excerpt);
    const ruleOk = hasProvenance && unitGrounded(ids);
    const grounded: QualitativeField[] = []; const ungrounded: { field: string; reason: string }[] = [];
    const material = (field: QualitativeField, present: boolean, ok: boolean) => { if (!present) return; if (ok) grounded.push(field); else ungrounded.push({ field, reason: !hasProvenance ? "no source provenance on the unit" : "no inventory lineage backing this claim" }); };
    material("posture", r.posture !== "N_A", ruleOk);
    material("action", r.action !== null, ruleOk);
    material("ruleType", true, ruleOk);
    material("covenantFamily", true, ruleOk);
    material("transactionScope", (r.transactionScope ?? []).length > 0, ruleOk);
    material("entityScope", r.entityScope.length + r.entityScopeExcluded.length > 0, ruleOk);
    r.conditions.forEach((c, i) => { const ok = unitGrounded(lineage(c)) || (ruleOk && !!c.provenance); if (ok) grounded.push("conditions"); else ungrounded.push({ field: `conditions[${i}]`, reason: "condition carries neither inventory lineage nor provenance" }); });
    r.exceptions.forEach((e, i) => { const ok = unitGrounded(lineage(e)) || (ruleOk && !!e.provenance); if (ok) grounded.push("exceptions"); else ungrounded.push({ field: `exceptions[${i}]`, reason: "exception carries neither inventory lineage nor provenance" }); });
    r.dependsOn.forEach((d, i) => { const ok = unitGrounded(lineage(d)) || ruleOk; if (ok) grounded.push("dependsOn"); else ungrounded.push({ field: `dependsOn[${i}]`, reason: "dependency carries no lineage" }); });
    units.push({ unitId: r.ruleId, kind: "RULE", grounded: [...new Set(grounded)], ungrounded, hasProvenance, inventoryItemIds: ids, unknownInventoryItemIds: unknown });
  }
  for (const d of input.definitions) {
    const ids = lineage(d); const unknown = ids.filter((id) => !known.has(id));
    const hasProvenance = !!d.provenance && (!!d.provenance.sourceCitation || !!d.provenance.excerpt);
    const ok = hasProvenance && unitGrounded(ids);
    const ungrounded: { field: string; reason: string }[] = [];
    if (d.calculationExpression && !ok) ungrounded.push({ field: "calculationExpression", reason: !hasProvenance ? "no source provenance on the definition" : "no inventory lineage backing this calculation" });
    units.push({ unitId: d.definitionId, kind: "DEFINITION", grounded: ok && d.calculationExpression ? ["calculationExpression"] : [], ungrounded, hasProvenance, inventoryItemIds: ids, unknownInventoryItemIds: unknown });
  }
  return { version: QUALITATIVE_GROUNDING_VERSION, units, materialUngrounded: units.reduce((n, u) => n + u.ungrounded.length, 0), inventoryAvailable };
}

/** One MATERIAL finding per ungrounded unit (listing its fields), only when an inventory exists to ground against. */
export function qualitativeGroundingFindings(audit: QualitativeLineageAudit, ctx: { companyId: string; instrumentKey: string; sourceDocumentId: string; candidateRef: string; sourceSectionRef: string | null }): SemanticVerificationFinding[] {
  if (!audit.inventoryAvailable) return [];
  const out: SemanticVerificationFinding[] = [];
  for (const u of audit.units) {
    if (u.ungrounded.length === 0) continue;
    const citation = ctx.sourceSectionRef ?? "(unknown)";
    const detail = u.ungrounded.map((g) => `${g.field}: ${g.reason}`).join("; ");
    out.push({
      findingId: computeSemanticVerificationFindingId(ctx.companyId, ctx.instrumentKey, ctx.candidateRef, "QUALITATIVE_ASSERTION_UNGROUNDED", u.unitId, null, citation, SEMANTIC_VERIFIER_ALGORITHM_VERSION),
      companyId: ctx.companyId, instrumentKey: ctx.instrumentKey, sourceDocumentId: ctx.sourceDocumentId, candidateRef: ctx.candidateRef,
      ruleOrDefinitionId: u.unitId, irPath: null,
      findingType: "QUALITATIVE_ASSERTION_UNGROUNDED", severity: "MATERIAL",
      sourceEvidence: "(structural: no inventory item / provenance backs the claim)", sourceCitation: citation,
      proposedIrEvidence: `${u.kind} ${u.unitId}: ${detail}`,
      verifierReasoning: `qualitative accountability (${audit.version}): a materially operative claim must cite source-backed inventory lineage and carry provenance; ${u.inventoryItemIds.length === 0 ? "the unit cites no inventory item" : `the unit cites ${u.inventoryItemIds.length} item(s) of which ${u.unknownInventoryItemIds.length} are unknown to the frozen inventory`}${u.hasProvenance ? "" : "; the unit carries no provenance"}`,
      deterministicSignals: u.ungrounded.map((g) => `UNGROUNDED:${g.field}`),
      verificationMethod: "DETERMINISTIC_ONLY", provider: null, model: null,
      verifierAlgorithmVersion: SEMANTIC_VERIFIER_ALGORITHM_VERSION, verifierPromptVersion: null,
      resolutionStatus: "OPEN", createdAt: new Date().toISOString(),
    });
  }
  return out;
}
