/**
 * Quality metrics for one (case, strategy) pair, judged against the case's independently authored legal universe.
 * Everything here is deterministic over the scope; nothing is a model judgement.
 */
import type { StructuralIndex } from "../../../lib/contract-model/compiler/structural-index";
import type { BenchmarkCase, Scope } from "./strategies";

const ws = (s: string) => s.replace(/\s+/g, " ").trim();
const sectionOf = (ref: string) => ref.replace(/\(.*$/, "");

export interface QualityMetrics {
  requiredUnits: number; unitsInScope: number; materialRestrictionRecall: { hit: number; of: number };
  materialConditionRecall: { hit: number; of: number };
  dependencyClosure: { definitionsHit: number; definitionsOf: number; documentsHit: number; documentsOf: number };
  operativeSourceAccurate: boolean | null;
  dangerousOmissions: string[];
  falsePermission: boolean;
  forbiddenUnitsInScope: string[];
  /** For fail-closed cases: did the strategy surface the missing document / undefined term / unresolved reference? */
  failClosedCorrect: boolean | null;
  outcome: "COMPLETE" | "PLAUSIBLE_BUT_INCOMPLETE" | "FAIL_CLOSED" | "NO_ANSWER";
  notes: string[];
}

function inScope(scope: Scope, index: StructuralIndex, documentId: string, sectionRef: string, occurrence?: number): boolean {
  // a unit is in scope if the node itself, or an ancestor SECTION containing it, is in the scope
  const nodes = index.findNodesByRef(documentId, sectionRef);
  const targets = occurrence ? [nodes[occurrence - 1]].filter(Boolean) : nodes;
  for (const t of targets) {
    if (!t) continue;
    for (const u of scope.units) {
      if (u.documentId !== documentId) continue;
      if (u.nodeId === t.nodeId) return true;
      if (u.nodeType === "SECTION" && u.sectionRef === sectionOf(t.sectionRef) && index.getDescendants(u.nodeId).some((d) => d.nodeId === t.nodeId)) return true;
    }
  }
  return false;
}

export function scoreScope(c: BenchmarkCase, scope: Scope, index: StructuralIndex, texts: Map<string, string>): QualityMetrics {
  const notes: string[] = [];
  const restrictions = c.requiredUnits.filter((u) => u.restriction);
  const unitHits = c.requiredUnits.filter((u) => inScope(scope, index, u.documentId, u.sectionRef, u.occurrence));
  const restrictionHits = restrictions.filter((u) => inScope(scope, index, u.documentId, u.sectionRef, u.occurrence));
  const dangerous = c.requiredUnits.filter((u) => u.dangerousIfOmitted && !inScope(scope, index, u.documentId, u.sectionRef, u.occurrence)).map((u) => `${u.documentId}#${u.sectionRef}: ${u.why}`);
  // a condition is covered when its locating unit/definition is in scope AND the scope's text for that unit contains the condition text
  const defsInScope = new Set(scope.definitions.map((d) => `${d.documentId}|${d.term.toLowerCase()}`));
  const conditionHits = c.requiredConditions.filter((k) => {
    if (k.locatedIn.definition) return defsInScope.has(`${k.locatedIn.documentId}|${k.locatedIn.definition.toLowerCase()}`);
    const ref = k.locatedIn.sectionRef!;
    if (!inScope(scope, index, k.locatedIn.documentId, ref)) return false;
    // the in-scope unit that physically contains the located node (never a same-label contents line)
    const located = index.findNodesByRef(k.locatedIn.documentId, ref);
    const unit = scope.units.find((u) => u.documentId === k.locatedIn.documentId && located.some((n) => n.nodeId === u.nodeId || index.getDescendants(u.nodeId).some((d) => d.nodeId === n.nodeId)));
    const text = unit ? ws(index.getNodeText(unit.nodeId, "DESCENDANTS")) : "";
    const amendedText = c.asOfDate && scope.usesOperativeState ? ws(texts.get(k.locatedIn.documentId) ?? "") : "";
    return text.includes(ws(k.text)) || amendedText.includes(ws(k.text));
  });
  for (const k of c.requiredConditions) if (k.dangerousIfOmitted && !conditionHits.includes(k)) dangerous.push(`condition ${k.kind} in ${k.locatedIn.documentId}#${k.locatedIn.sectionRef ?? k.locatedIn.definition}`);
  const defHits = c.requiredDefinitions.filter((t) => [...defsInScope].some((k) => k.endsWith(`|${t.toLowerCase()}`)));
  const docHits = c.requiredDocuments.filter((d) => scope.documents.includes(d));
  const forbidden = (c.forbiddenUnits ?? []).filter((f) => { const nodes = index.findNodesByRef(f.documentId, f.sectionRef); const t = f.occurrence ? nodes[f.occurrence - 1] : undefined; return t ? scope.units.some((u) => u.nodeId === t.nodeId) : false; }).map((f) => `${f.documentId}#${f.sectionRef}#${f.occurrence}`);
  // operative-source accuracy: only meaningful when the case has an amendment-dependent unit
  const amended = c.requiredUnits.filter((u) => u.operativeTextDocumentId);
  const operativeSourceAccurate = amended.length === 0 ? null : scope.usesOperativeState && amended.every((u) => scope.documents.includes(u.operativeTextDocumentId!));
  // fail-closed correctness
  let failClosedCorrect: boolean | null = null;
  if (c.expectedOutcome === "FAIL_CLOSED_MISSING_DOCUMENT") failClosedCorrect = (c.missingDocuments ?? []).every((m) => scope.missingDocuments.some((x) => x.toLowerCase() === m.toLowerCase()) || scope.unresolvedReferences.some((x) => x.toLowerCase().includes(m.toLowerCase())));
  else if (c.expectedOutcome === "FAIL_CLOSED_UNRESOLVED") failClosedCorrect = (c.undefinedTerms ?? []).every((t) => scope.unresolvedReferences.some((x) => x.toLowerCase().includes(t.toLowerCase()))) && ((c.conflictingUnits ?? []).length === 0 || scope.unresolvedReferences.some((x) => /AMBIGUOUS|conflict/i.test(x)));
  else if (c.expectedOutcome === "NEEDS_INPUT_FAIL_CLOSED") failClosedCorrect = defHits.length === c.requiredDefinitions.length && (c.undefinedTerms ?? []).every((t) => scope.unresolvedReferences.some((x) => x.toLowerCase().includes(t.toLowerCase())) || !scope.definitions.some((d) => d.term.toLowerCase() === t.toLowerCase()));
  const complete = unitHits.length === c.requiredUnits.length && conditionHits.length === c.requiredConditions.length && docHits.length === c.requiredDocuments.length;
  let outcome: QualityMetrics["outcome"];
  if (scope.units.length === 0) outcome = "NO_ANSWER";
  else if (c.expectedOutcome !== "ANSWER_WITH_RESTRICTIONS" && failClosedCorrect) outcome = "FAIL_CLOSED";
  else if (complete) outcome = "COMPLETE";
  else outcome = "PLAUSIBLE_BUT_INCOMPLETE";
  const falsePermission = dangerous.length > 0 && /PERMITTED/.test(c.answerIfRestrictionsOmitted) && outcome !== "FAIL_CLOSED";
  if (forbidden.length) notes.push(`forbidden unit(s) in scope: ${forbidden.join(", ")}`);
  if (scope.notExamined.length) notes.push(`${scope.notExamined.length} signalled unit(s) not examined (disclosed)`);
  return { requiredUnits: c.requiredUnits.length, unitsInScope: scope.units.length, materialRestrictionRecall: { hit: restrictionHits.length, of: restrictions.length }, materialConditionRecall: { hit: conditionHits.length, of: c.requiredConditions.length }, dependencyClosure: { definitionsHit: defHits.length, definitionsOf: c.requiredDefinitions.length, documentsHit: docHits.length, documentsOf: c.requiredDocuments.length }, operativeSourceAccurate, dangerousOmissions: dangerous, falsePermission, forbiddenUnitsInScope: forbidden, failClosedCorrect, outcome, notes };
}
