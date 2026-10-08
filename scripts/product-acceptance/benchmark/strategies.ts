/**
 * Extraction-architecture benchmark — three scope strategies over the production deterministic interfaces.
 *
 * None of these calls a model. Each strategy answers one question: WHICH units (structural nodes), definitions and
 * documents would be sent to interpretation. Quality is then judged against the independently authored legal
 * universe for each case (tests/fixtures/product-acceptance/benchmark/cases.json). Cost is estimated from the text
 * that would be dispatched (see cost.ts) and is labelled ESTIMATED, never measured spend.
 *
 *   A  BROAD            every structural SECTION in every package document (what "compile the package" means)
 *   B  NAIVE_SELECTIVE  top-k keyword/family retrieval over nodes, base text, no closure  — an EVALUATION MODEL of a
 *                        retrieval-first architecture; no such production path exists
 *   C  HYBRID           Pass A over every document + dependency closure (structural references, definitions, amendment
 *                        effects, cross-document leads, shared-cap phrases, sibling-family prohibitions, hanging
 *                        provisos) + an omission audit listing signalled units NOT examined and documents referenced
 *                        but absent — an EVALUATION MODEL built from production deterministic outputs
 */
import type { StructuralIndex } from "../../../lib/contract-model/compiler/structural-index";
import type { StructuralNode } from "../../../lib/contract-model/compiler/types";
import { buildCandidateCompilerInput } from "../../../lib/contract-model/covenant-map/candidate-input";
import type { CorpusPackage } from "../corpus";
import type { DeterministicStages } from "../stages";
import { candidateFor } from "../auditor";

export type StrategyId = "A_BROAD" | "B_NAIVE_SELECTIVE" | "C_HYBRID";

export interface ScopeUnit { documentId: string; sectionRef: string; nodeId: string; nodeType: StructuralNode["nodeType"]; chars: number; reason: string; operativeTextDocumentId?: string }
export interface Scope {
  strategy: StrategyId;
  mode: "EVALUATION_MODEL" | "PRODUCTION_POPULATION";
  units: ScopeUnit[];
  definitions: Array<{ documentId: string; term: string; chars: number }>;
  documents: string[];
  flags: string[];
  /** Units that carried a discovery signal but were not examined (C only; A has none by construction; B does not know). */
  notExamined: Array<{ documentId: string; sectionRef: string; signals: string[] }>;
  /** Documents the package text names but that are absent (C only). */
  missingDocuments: string[];
  unresolvedReferences: string[];
  usesOperativeState: boolean;
}

export interface BenchmarkCase {
  id: string; adversarialClass: string; packageId: string; question: string; family: string; asOfDate?: string; entity?: string;
  seedRefs: Array<{ documentId: string; sectionRef: string }>;
  requiredUnits: Array<{ documentId: string; sectionRef: string; occurrence?: number; why: string; restriction?: boolean; dangerousIfOmitted?: boolean; operativeTextDocumentId?: string }>;
  forbiddenUnits?: Array<{ documentId: string; sectionRef: string; occurrence?: number; why: string }>;
  requiredConditions: Array<{ kind: string; locatedIn: { documentId: string; sectionRef?: string; definition?: string }; text: string; dangerousIfOmitted?: boolean }>;
  requiredDefinitions: string[]; requiredDocuments: string[]; undefinedTerms?: string[]; missingDocuments?: string[]; requiresLedger?: string[]; conflictingUnits?: unknown[];
  correctAnswer: string; answerIfRestrictionsOmitted: string; expectedOutcome: "ANSWER_WITH_RESTRICTIONS" | "NEEDS_INPUT_FAIL_CLOSED" | "FAIL_CLOSED_UNRESOLVED" | "FAIL_CLOSED_MISSING_DOCUMENT";
}

const ws = (s: string) => s.replace(/\s+/g, " ").trim();
const FAMILY_CUES: Record<string, RegExp> = {
  INDEBTEDNESS: /\b(?:indebtedness|debt|incur|borrow)/i, LIENS: /\b(?:lien|secured|security interest|pledge|mortgage)/i, RESTRICTED_PAYMENTS: /\b(?:restricted payment|dividend|distribution)/i,
  INVESTMENTS: /\b(?:investment|acqui)/i, ASSET_SALES: /\b(?:disposition|dispose|asset sale|sell)/i, DISPOSITIONS: /\b(?:disposition|dispose)/i, GUARANTEES: /\b(?:guarant)/i, FINANCIAL_COVENANTS: /\b(?:ratio|leverage|coverage)/i, SPRINGING_COVENANTS: /\b(?:availability|coverage ratio)/i,
};
const NORMATIVE = /\b(?:shall|must|may|will)\b/i;
const sectionOf = (ref: string) => ref.replace(/\(.*$/, "");

function unit(index: StructuralIndex, n: StructuralNode, reason: string): ScopeUnit {
  return { documentId: n.documentId, sectionRef: n.sectionRef, nodeId: n.nodeId, nodeType: n.nodeType, chars: index.getNodeText(n.nodeId, "DESCENDANTS").length, reason };
}
function sectionNodes(index: StructuralIndex, documentId?: string): StructuralNode[] {
  return index.allNodes().filter((n) => n.nodeType === "SECTION" && (!documentId || n.documentId === documentId));
}
function definitionsIn(index: StructuralIndex, documentId: string, terms?: Set<string>) {
  return index.allDefinitions().filter((d) => d.documentId === documentId && (!terms || terms.has(d.normalizedTerm))).map((d) => ({ documentId, term: d.exactTerm, chars: (index.getDefinitionFullText(d.exactTerm, documentId) ?? d.definitionExcerpt).length }));
}

/** Named external agreements a document defines by reference ("X Agreement" means the … dated as of …) that are not package documents. */
export function referencedExternalAgreements(pkg: CorpusPackage, index: StructuralIndex): string[] {
  const out = new Set<string>();
  for (const d of index.allDefinitions()) {
    const text = index.getDefinitionFullText(d.exactTerm, d.documentId) ?? d.definitionExcerpt;
    if (/\b(?:Agreement|Indenture)\b/.test(d.exactTerm) && /\bdated as of\b/.test(text)) {
      const present = pkg.documents.some((doc) => doc.text.toUpperCase().startsWith(d.exactTerm.toUpperCase().replace(/ AGREEMENT$/, "")) || new RegExp(`^${d.exactTerm.replace(/\s+/g, "\\s+")}`, "i").test(doc.text) || doc.label.toLowerCase().includes(d.exactTerm.toLowerCase().replace(/ agreement$/, "")));
      if (!present) out.add(d.exactTerm);
    }
  }
  return [...out];
}

/** Production context retrieval over a set of units: the definitions the compiler would be handed and every unresolved dependency it reports (any severity - an undefined defined term is LOW in production and still a hard fact). */
function retrievalFor(pkg: CorpusPackage, s: DeterministicStages, units: ScopeUnit[], family: string, asOfDate?: string): { defs: Map<string, { documentId: string; term: string; chars: number }>; unresolved: Set<string>; flags: string[] } {
  const { index } = s;
  const asOf = asOfDate ?? pkg.manifest.operativeState.asOfDates[pkg.manifest.operativeState.asOfDates.length - 1]!;
  const cp = { companyId: pkg.manifest.companyId, instrumentKey: s.instrumentKeys.get(s.baseDocumentId) ?? pkg.manifest.instrumentKey, packageKey: `${pkg.packageId}-package`, index, packageGraph: s.packageGraph, exactTermsByDocument: s.exactTermsByDocument, operativeState: s.operativeStates.get(asOf) ?? null, amendmentEffects: s.amendment?.effects ?? null, supersessionIndex: s.supersessionIndexes.get(asOf) };
  const defs = new Map<string, { documentId: string; term: string; chars: number }>();
  const unresolved = new Set<string>();
  const flags: string[] = [];
  for (const u of units) {
    const occurrence = index.findNodesByRef(u.documentId, u.sectionRef).findIndex((n) => n.nodeId === u.nodeId) + 1;
    const cand = candidateFor(index, u.documentId, u.sectionRef, [family as never], "GENERAL_PROHIBITION" as never, u.nodeId, occurrence || undefined);
    if (!cand) continue;
    try {
      const b = buildCandidateCompilerInput({ ...cand, structuralNodeIds: [u.nodeId], structuralNodeKeys: [index.getNodeById(u.nodeId)!.nodeKey] }, cp);
      for (const item of b.bundle.items) if (item.type === "DEFINITION" || item.type === "DEFINITION_DEPENDENCY") { const term = item.excerptText.match(/^"([^"]+)"/)?.[1] ?? item.normalizedRef; defs.set(`${item.documentId}|${term.toLowerCase()}`, { documentId: item.documentId, term, chars: item.excerptText.length }); }
      for (const x of b.bundle.unresolvedDependencies) unresolved.add(`${x.dependencyType}: ${x.sourceText.slice(0, 40)}`);
    } catch (e) { flags.push(`context retrieval threw for ${u.sectionRef}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  for (const h of index.healthDiagnostics()) { const code = (h as { code?: string }).code ?? ""; if (/AMBIGUOUS|DUPLICATE/.test(code)) unresolved.add(`structure: ${code}`); }
  return { defs, unresolved, flags };
}

// ---------------------------------------------------------------------------------------------- A: broad
export function broadScope(pkg: CorpusPackage, s: DeterministicStages, family = "INDEBTEDNESS", asOfDate?: string): Scope {
  const { index } = s;
  const units = sectionNodes(index).map((n) => unit(index, n, "package-wide compilation"));
  const documents = [...new Set(units.map((u) => u.documentId))];
  const definitions = documents.flatMap((d) => definitionsIn(index, d));
  const r = retrievalFor(pkg, s, units, family, asOfDate);
  return { strategy: "A_BROAD", mode: "PRODUCTION_POPULATION", units, definitions, documents, flags: ["every SECTION in every document, including non-operative documents unless a document-role gate excludes them", ...r.flags], notExamined: [], missingDocuments: referencedExternalAgreements(pkg, index), unresolvedReferences: [...r.unresolved], usesOperativeState: true };
}

// ---------------------------------------------------------------------------------------------- B: naive selective
export function naiveSelectiveScope(pkg: CorpusPackage, s: DeterministicStages, c: BenchmarkCase, k = 3): Scope {
  const { index } = s;
  const terms = ws(c.question.toLowerCase()).replace(/[^a-z0-9$,.() ]/g, " ").split(/\s+/).filter((t) => t.length > 3 && !["under", "section", "borrower", "subsidiary", "indebtedness"].includes(t));
  const cue = FAMILY_CUES[c.family];
  const scored = index.allNodes().filter((n) => n.nodeType === "SECTION" || n.nodeType === "SUBSECTION").map((n) => {
    const text = index.getNodeText(n.nodeId, "OWN").toLowerCase();
    let score = 0;
    for (const t of terms) if (text.includes(t)) score += 1;
    if (cue && cue.test(text)) score += 2;
    for (const seed of c.seedRefs) if (n.documentId === seed.documentId && n.sectionRef === seed.sectionRef) score += 5;
    // short dense nodes (a contents line!) rank well under keyword overlap per character — the retrieval-first failure mode
    return { n, score: score + Math.min(2, 200 / Math.max(40, text.length)) };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
  const units = scored.map((x) => unit(index, x.n, `top-${k} retrieval score ${x.score.toFixed(2)}`));
  const documents = [...new Set(units.map((u) => u.documentId))];
  // definitions only when a retrieved node is itself a definitions section
  const definitions = units.filter((u) => /^1\.\d+$/.test(u.sectionRef)).flatMap((u) => definitionsIn(index, u.documentId));
  return { strategy: "B_NAIVE_SELECTIVE", mode: "EVALUATION_MODEL", units, definitions, documents, flags: ["base text only (no operative state)", "no dependency closure", `k=${k}`], notExamined: [], missingDocuments: [], unresolvedReferences: [], usesOperativeState: false };
}

// ---------------------------------------------------------------------------------------------- C: hybrid
export function hybridScope(pkg: CorpusPackage, s: DeterministicStages, c: BenchmarkCase): Scope {
  const { index } = s;
  const flags: string[] = [];
  const operativeDocs = new Set(pkg.manifest.documents.filter((d) => d.operative).map((d) => d.documentId));
  const chosen = new Map<string, ScopeUnit>();
  const add = (n: StructuralNode, reason: string) => { if (!chosen.has(n.nodeId)) chosen.set(n.nodeId, unit(index, n, reason)); };
  const sectionNode = (documentId: string, ref: string): StructuralNode[] => index.findNodesByRef(documentId, ref);
  // 1. seeds: the question's refs (whole section, so hanging provisos travel with the clause) + every operative SECTION in
  //    any operative document whose text carries the family cue AND a normative verb (Pass A-style signal, document-wide)
  const families = new Set<string>([c.family]);
  if (/\bsecured\b|\blien\b/i.test(c.question)) families.add("LIENS");
  if (/\bguarant/i.test(c.question)) families.add("GUARANTEES");
  for (const seed of c.seedRefs) for (const n of sectionNode(seed.documentId, sectionOf(seed.sectionRef))) add(n, "question seed (whole section)");
  for (const doc of operativeDocs) for (const n of sectionNodes(index, doc)) {
    const text = index.getNodeText(n.nodeId, "DESCENDANTS");
    for (const f of families) if (FAMILY_CUES[f]?.test(text) && NORMATIVE.test(text) && !/^1\.\d+$/.test(n.sectionRef)) add(n, `family cue ${f} + normative verb (document-wide scan, ${doc})`);
  }
  // 2. closure: structural references out of chosen units (resolved → add; unresolved → flag), to a fixed depth
  const unresolved = new Set<string>();
  for (let hop = 0; hop < 3; hop++) {
    for (const u of [...chosen.values()]) {
      for (const r of index.findReferencesFrom(u.nodeId, true)) {
        const targetRef = r.normalizedTarget;
        if (!targetRef || (r.targetKind !== "SECTION" && r.targetKind !== "CLAUSE")) { if (r.targetKind === "SCHEDULE" || r.targetKind === "EXHIBIT") unresolved.add(`${r.referenceText} (${r.targetKind})`); continue; }
        const targets = sectionNode(u.documentId, sectionOf(targetRef));
        if (targets.length === 1) add(targets[0]!, `cross-reference from ${u.sectionRef}: "${r.referenceText}"`);
        else unresolved.add(`${r.referenceText} from ${u.sectionRef} → ${targets.length === 0 ? "NOT_FOUND" : "AMBIGUOUS"}`);
      }
    }
  }
  // 3. shared-cap phrases ("together with … Section X") and "notwithstanding … Article" overrides anywhere in operative docs
  for (const doc of operativeDocs) for (const n of sectionNodes(index, doc)) {
    const text = index.getNodeText(n.nodeId, "DESCENDANTS");
    if (/notwithstanding anything to the contrary in article/i.test(text)) add(n, "override clause (\"notwithstanding … Article\") anywhere in the document");
    if ([...chosen.values()].some((u) => u.documentId === doc && new RegExp(`Section ${u.sectionRef.replace(/[().]/g, "\\$&")}`).test(text))) add(n, "names an in-scope section (shared cap / back-reference)");
  }
  // 4. definitions: production context retrieval for each chosen unit (what the compiler would be handed) + definition→definition chains; undefined terms flagged
  const r = retrievalFor(pkg, s, [...chosen.values()], c.family, c.asOfDate);
  const defs = r.defs; for (const x of r.unresolved) unresolved.add(x); flags.push(...r.flags);
  // definitions that name in-scope sections are themselves restrictions (Available Amount netting / kill-switch) …
  for (const d of index.allDefinitions()) if (operativeDocs.has(d.documentId)) {
    const text = index.getDefinitionFullText(d.exactTerm, d.documentId) ?? d.definitionExcerpt;
    if ([...chosen.values()].some((u) => u.documentId === d.documentId && new RegExp(`Section ${u.sectionRef.replace(/[().]/g, "\\$&")}`).test(text))) defs.set(`${d.documentId}|${d.exactTerm.toLowerCase()}`, { documentId: d.documentId, term: d.exactTerm, chars: text.length });
  }
  // … and every section an in-scope definition names shares that definition's constraint (definition→section closure)
  for (const d of [...defs.values()]) {
    const text = index.getDefinitionFullText(d.term, d.documentId) ?? "";
    for (const m of text.matchAll(/Section (\d+\.\d+(?:\([a-z0-9]+\))*)/g)) for (const n of sectionNode(d.documentId, sectionOf(m[1]!))) add(n, `named by in-scope definition "${d.term}"`);
  }
  // 5. amendments: any effect whose target is an in-scope node brings the amendment document in; unresolved effects are flagged
  const docs = new Set([...chosen.values()].map((u) => u.documentId));
  for (const e of s.amendment?.effects ?? []) {
    if (e.status !== "RESOLVED") { unresolved.add(`amendment ${e.amendmentDocumentId}: ${e.status} (${e.unresolvedReason ?? e.target.targetSectionRef ?? e.target.targetDefinedTermRef})`); continue; }
    if ([...chosen.values()].some((u) => u.documentId === e.target.targetDocumentId && (u.sectionRef === e.target.targetSectionRef || (e.target.targetSectionRef ?? "").startsWith(u.sectionRef + "(")))) { docs.add(e.amendmentDocumentId); for (const n of sectionNodes(index, e.amendmentDocumentId)) add(n, `amendment effect on in-scope ${e.target.targetSectionRef}`); }
    if (e.target.targetDefinedTermRef && [...defs.values()].some((d) => d.term.toLowerCase() === e.target.targetDefinedTermRef!.toLowerCase())) { docs.add(e.amendmentDocumentId); for (const n of sectionNodes(index, e.amendmentDocumentId)) add(n, `amendment effect on in-scope definition ${e.target.targetDefinedTermRef}`); }
  }
  // 6. cross-document leads from the package graph: an in-scope unit that names another package document pulls that document's family units in
  for (const lead of s.packageGraph.crossDocumentReferenceLeads) {
    if (!docs.has(lead.sourceDocumentId)) continue;
    if (lead.targetDocumentId && operativeDocs.has(lead.targetDocumentId)) { for (const n of sectionNodes(index, lead.targetDocumentId)) { const text = index.getNodeText(n.nodeId, "DESCENDANTS"); for (const f of families) if (FAMILY_CUES[f]?.test(text) && NORMATIVE.test(text)) add(n, `cross-document lead "${lead.namedAgreementHint}" → ${lead.targetDocumentId}`); } }
    else unresolved.add(`cross-document lead "${lead.namedAgreementHint}" ${lead.status}: ${lead.unresolvedReason ?? "target not in package"}`);
  }
  // multi-instrument packages: another operative instrument restricting the same family is in the universe even without a lead
  for (const doc of operativeDocs) if (!docs.has(doc)) for (const n of sectionNodes(index, doc)) { const text = index.getNodeText(n.nodeId, "DESCENDANTS"); if (FAMILY_CUES[c.family]?.test(text) && NORMATIVE.test(text) && !/^1\.\d+$/.test(n.sectionRef)) add(n, `other operative instrument ${doc} restricts the same family`); }
  // 7. omission audit: Pass A-signalled units not examined, and externally referenced agreements absent from the package
  const chosenIds = new Set(chosen.keys());
  const notExamined = [...s.passA.values()].flat().filter((p) => !chosenIds.has(p.nodeId) && operativeDocs.has(p.documentId)).map((p) => ({ documentId: p.documentId, sectionRef: p.sectionRef, signals: p.signals }));
  const missingDocuments = referencedExternalAgreements(pkg, index);
  const units = [...chosen.values()];
  return { strategy: "C_HYBRID", mode: "EVALUATION_MODEL", units, definitions: [...defs.values()], documents: [...new Set(units.map((u) => u.documentId))], flags, notExamined, missingDocuments, unresolvedReferences: [...unresolved], usesOperativeState: true };
}
