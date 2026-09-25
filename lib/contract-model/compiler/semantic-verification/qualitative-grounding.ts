/**
 * QUALITATIVE GROUNDING (Layer 1, deterministic). Numeric assertions are already reconciled value-by-value
 * (numeric-grounding). This audit covers the QUALITATIVE claims a compiled unit makes - posture, action, rule type,
 * family, entity/transaction scope, each condition, each exception, each dependency, a definition's calculation
 * shape - and demands that every one of them be traceable to source:
 *
 *   GROUNDED     the unit (or the object itself) carries provenance whose excerpt is a real, locatable substring of
 *                the admissible source text (operative text, source-context regions, context-bundle excerpts), OR it
 *                cites a known frozen-inventory item.
 *   FABRICATED   the provenance excerpt cannot be located anywhere in the admissible source -> MATERIAL finding.
 *   UNCITED      no provenance at all and no inventory lineage -> MATERIAL when the compilation ran under the
 *                accountability layer (a frozen inventory exists: every certified unit must cite), NON_MATERIAL
 *                otherwise (a provenance-less legacy/fixture compilation is disclosed, not condemned).
 *   LINEAGE_GAP  grounded by a verifiable excerpt but without inventory lineage -> NON_MATERIAL (accountability's
 *                Pass C already judges inventory consumption; this is not a second material verdict on it).
 *
 * No prose similarity is consulted; the check is substring location after whitespace normalization.
 */
import type { IRDefinition, IRRule, SourceProvenance } from "../../ir/types";
import type { SemanticVerificationFinding } from "./types";
import { computeSemanticVerificationFindingId } from "./identity";
import { SEMANTIC_VERIFIER_ALGORITHM_VERSION } from "./types";

export const QUALITATIVE_GROUNDING_VERSION = "qualitative-grounding.v2";

export type QualitativeField = "posture" | "action" | "ruleType" | "transactionScope" | "entityScope" | "conditions" | "exceptions" | "dependsOn" | "covenantFamily" | "calculationExpression";
export type GroundingVerdict = "GROUNDED" | "FABRICATED" | "UNCITED" | "LINEAGE_GAP";

export interface QualitativeUnitAudit {
  unitId: string;
  kind: "RULE" | "DEFINITION";
  verdict: GroundingVerdict;
  grounded: string[];
  ungrounded: { field: string; verdict: GroundingVerdict; reason: string }[];
  hasProvenance: boolean;
  excerptLocated: boolean | null;
  inventoryItemIds: string[];
  unknownInventoryItemIds: string[];
}

export interface QualitativeLineageAudit {
  version: typeof QUALITATIVE_GROUNDING_VERSION;
  units: QualitativeUnitAudit[];
  materialUngrounded: number;
  nonMaterialLineageGaps: number;
  inventoryAvailable: boolean;
  sourceTextsConsulted: number;
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

function lineage(obj: { inventoryItemIds?: string[] } | null | undefined): string[] { return obj?.inventoryItemIds ?? []; }

/** Substring location after whitespace normalization; a short excerpt (< 12 chars) is not considered locating evidence. */
export function excerptLocatedIn(excerpt: string | null | undefined, sources: readonly string[]): boolean | null {
  if (!excerpt) return null;
  const e = norm(excerpt);
  if (e.length < 12) return null;
  return sources.some((s) => s.includes(e));
}

export function auditQualitativeLineage(input: { rules: readonly IRRule[]; definitions: readonly IRDefinition[]; frozenInventory: { items: readonly { inventoryItemId: string }[] } | null | undefined; sourceTexts?: readonly string[] }): QualitativeLineageAudit {
  const known = new Set((input.frozenInventory?.items ?? []).map((i) => i.inventoryItemId));
  const inventoryAvailable = !!input.frozenInventory && input.frozenInventory.items.length > 0;
  const sources = (input.sourceTexts ?? []).map(norm).filter((s) => s.length > 0);
  const units: QualitativeUnitAudit[] = [];
  const cited = (ids: string[]) => ids.some((id) => known.has(id));
  const provenanceOf = (p: SourceProvenance | null | undefined) => ({ has: !!p && (!!p.sourceCitation || !!p.excerpt), located: sources.length > 0 ? excerptLocatedIn(p?.excerpt, sources) : null });
  const verdictFor = (p: SourceProvenance | null | undefined, ids: string[]): GroundingVerdict => {
    const pv = provenanceOf(p);
    if (pv.located === true) return "GROUNDED";
    if (pv.located === false) return cited(ids) ? "GROUNDED" : "FABRICATED";
    // no locatable excerpt (none supplied, too short, or no source texts to check against)
    if (cited(ids)) return "GROUNDED";
    if (pv.has) return "LINEAGE_GAP";
    return "UNCITED";
  };
  const reasonFor = (v: GroundingVerdict, what: string): string =>
    v === "FABRICATED" ? `${what}: the provenance excerpt is not a substring of any admissible source text and no inventory lineage backs it` :
    v === "UNCITED" ? `${what}: no source provenance (citation/excerpt) and no inventory lineage` :
    v === "LINEAGE_GAP" ? `${what}: cited to source but not tied to a frozen inventory item` : "";

  for (const r of input.rules) {
    const ids = lineage(r); const unknown = ids.filter((id) => !known.has(id));
    const pv = provenanceOf(r.provenance);
    const unitVerdict = verdictFor(r.provenance, ids);
    const grounded: string[] = []; const ungrounded: QualitativeUnitAudit["ungrounded"] = [];
    const field = (name: string, present: boolean, v: GroundingVerdict) => { if (!present) return; if (v === "GROUNDED") grounded.push(name); else ungrounded.push({ field: name, verdict: v, reason: reasonFor(v, name) }); };
    field("posture", r.posture !== "N_A", unitVerdict);
    field("action", r.action !== null, unitVerdict);
    field("ruleType", true, unitVerdict);
    field("covenantFamily", true, unitVerdict);
    field("transactionScope", (r.transactionScope ?? []).length > 0, unitVerdict);
    field("entityScope", r.entityScope.length + r.entityScopeExcluded.length > 0, unitVerdict);
    r.conditions.forEach((c, i) => { const own = verdictFor(c.provenance, lineage(c)); const v = own === "GROUNDED" ? own : c.provenance ? own : unitVerdict; field(`conditions[${i}]`, true, v); });
    r.exceptions.forEach((e, i) => { const own = verdictFor(e.provenance, lineage(e)); const v = own === "GROUNDED" ? own : e.provenance ? own : unitVerdict; field(`exceptions[${i}]`, true, v); });
    r.dependsOn.forEach((d, i) => { const v = cited(lineage(d)) ? "GROUNDED" : unitVerdict; field(`dependsOn[${i}]`, true, v === "GROUNDED" || v === "LINEAGE_GAP" ? "GROUNDED" : v); });
    const worst: GroundingVerdict = ungrounded.some((u) => u.verdict === "FABRICATED") ? "FABRICATED" : ungrounded.some((u) => u.verdict === "UNCITED") ? "UNCITED" : ungrounded.length > 0 ? "LINEAGE_GAP" : "GROUNDED";
    units.push({ unitId: r.ruleId, kind: "RULE", verdict: worst, grounded: [...new Set(grounded)], ungrounded, hasProvenance: pv.has, excerptLocated: pv.located, inventoryItemIds: ids, unknownInventoryItemIds: unknown });
  }
  for (const d of input.definitions) {
    const ids = lineage(d); const unknown = ids.filter((id) => !known.has(id));
    const pv = provenanceOf(d.provenance);
    const v = verdictFor(d.provenance, ids);
    const ungrounded: QualitativeUnitAudit["ungrounded"] = [];
    if (v !== "GROUNDED") ungrounded.push({ field: d.calculationExpression ? "calculationExpression" : "definition", verdict: v, reason: reasonFor(v, `definition "${d.termName}"`) });
    units.push({ unitId: d.definitionId, kind: "DEFINITION", verdict: v, grounded: v === "GROUNDED" ? [d.calculationExpression ? "calculationExpression" : "definition"] : [], ungrounded, hasProvenance: pv.has, excerptLocated: pv.located, inventoryItemIds: ids, unknownInventoryItemIds: unknown });
  }
  return { version: QUALITATIVE_GROUNDING_VERSION, units, materialUngrounded: units.filter((u) => u.verdict === "FABRICATED" || (u.verdict === "UNCITED" && inventoryAvailable)).length, nonMaterialLineageGaps: units.filter((u) => u.verdict === "LINEAGE_GAP").length, inventoryAvailable, sourceTextsConsulted: sources.length };
}

/** One finding per unit that is not GROUNDED: MATERIAL for FABRICATED / UNCITED, NON_MATERIAL for a lineage gap. */
export function qualitativeGroundingFindings(audit: QualitativeLineageAudit, ctx: { companyId: string; instrumentKey: string; sourceDocumentId: string; candidateRef: string; sourceCitation?: string; sourceSectionRef?: string | null }): SemanticVerificationFinding[] {
  const out: SemanticVerificationFinding[] = [];
  for (const u of audit.units) {
    if (u.verdict === "GROUNDED") continue;
    // Without a frozen inventory (a legacy or fixture compilation) only a FABRICATED excerpt is a finding; the
    // UNCITED / LINEAGE_GAP verdicts are still recorded on the audit (result.qualitativeLineage) for disclosure.
    if (!audit.inventoryAvailable && u.verdict !== "FABRICATED") continue;
    const severity = u.verdict === "FABRICATED" ? "MATERIAL" : u.verdict === "UNCITED" ? "MATERIAL" : "NON_MATERIAL";
    const detail = u.ungrounded.map((g) => `${g.field} [${g.verdict}]: ${g.reason}`).join("; ");
    const citation = ctx.sourceCitation ?? ctx.sourceSectionRef ?? "(unknown)";
    const irPath = u.kind === "RULE" ? `rules[?${u.unitId}]` : `definitions[?${u.unitId}]`;
    out.push({
      findingId: computeSemanticVerificationFindingId(ctx.companyId, ctx.instrumentKey, ctx.candidateRef, "QUALITATIVE_ASSERTION_UNGROUNDED", u.unitId, irPath, citation, SEMANTIC_VERIFIER_ALGORITHM_VERSION),
      companyId: ctx.companyId, instrumentKey: ctx.instrumentKey, sourceDocumentId: ctx.sourceDocumentId, candidateRef: ctx.candidateRef,
      ruleOrDefinitionId: u.unitId, irPath, findingType: "QUALITATIVE_ASSERTION_UNGROUNDED", severity,
      sourceEvidence: u.verdict === "FABRICATED" ? "(the cited excerpt does not occur in the admissible source)" : "(no admissible source citation for this qualitative claim)",
      sourceCitation: citation,
      proposedIrEvidence: `${u.kind} ${u.unitId}: ${u.ungrounded.map((g) => g.field).join(", ")}`,
      verifierReasoning: `qualitative grounding (${QUALITATIVE_GROUNDING_VERSION}): ${u.verdict} - ${detail}`,
      deterministicSignals: ["QUALITATIVE_GROUNDING"], verificationMethod: "DETERMINISTIC_ONLY", provider: "deterministic", model: "qualitative-grounding",
      verifierAlgorithmVersion: SEMANTIC_VERIFIER_ALGORITHM_VERSION, verifierPromptVersion: QUALITATIVE_GROUNDING_VERSION, resolutionStatus: "OPEN", createdAt: new Date().toISOString(),
    });
  }
  return out;
}
