/**
 * Mutation suite (directive queue 7): applies one controlled legal edit to a pinned package IN MEMORY (fixtures on disk
 * are never changed), re-runs the production deterministic stages, and measures three things independently:
 *
 *  1. EXPECTATION DELTA - what the mutation must change and must leave untouched (section text hashes, structural node
 *     identity, operative state at as-of dates, the hybrid closure for a question). Stated before the run.
 *  2. KILL ANALYSIS - does the UNCHANGED expectation manifest, run against the mutated package through the deterministic
 *     audits, fail somewhere new? A mutant that produces no new failure "survived": either the mutation is semantically
 *     neutral (EQUIVALENT) or the acceptance suite has a blind spot at the deterministic layer (GAP). Survival is a
 *     finding about the acceptance harness and the deterministic layer, never evidence that Headroom is correct.
 *  3. IDENTITY STABILITY - which structural node ids survive the edit. Node ids are positional (documentId + nodeType +
 *     charStart, see stage-structure.ts), so an insertion shifts every later node's id even though its text is unchanged.
 */
import { createHash } from "node:crypto";
import type { CorpusPackage, Severity } from "./corpus";
import { runDeterministicStages, type DeterministicStages } from "./stages";
import { auditDeterministic, type Ledger } from "./auditor";
import { hybridScope, type BenchmarkCase } from "./benchmark/strategies";

export type MutationKind = "CHANGED_THRESHOLD" | "ADDED_CONDITION" | "REMOVED_EXCEPTION" | "REVISED_DEFINITION" | "NEW_AMENDMENT" | "MOVED_COVENANT" | "CHANGED_ENTITY_SCOPE" | "CONFLICTING_DOCUMENT" | "REORDERED_HIERARCHY" | "MISSING_REFERENCED_PROVISION";
export type SurvivalExpectation = "KILLED" | "EQUIVALENT" | "GAP";

export interface Mutation {
  id: string; kind: MutationKind; packageId: string; description: string; legalEffect: string;
  edits: Array<{ documentId: string; find: string; replace: string } | { addDocument: { documentId: string; label: string; text: string; role: "AMENDMENT" | "BASE_AGREEMENT" | "INDENTURE" } }>;
  observeDocumentId?: string;
  expect: {
    changedSections: string[]; stableSections: string[]; nodeIdsStableFor: string[]; nodeIdsShiftFor?: string[];
    operativeState?: Array<{ asOfDate: string; sectionRef: string; status: "CURRENT" | "SUPERSEDED" | "DELETED"; sourceDocumentId?: string; instrumentStatusNot?: string }>;
    question?: BenchmarkCase; closureMustContain?: string[]; closureMustFlag?: string[];
    /** Documents that must produce at least one amendment effect (resolved or not) - an override document the pipeline ignores entirely is a dangerous omission. */
    effectsExpectedFrom?: string[];
    /** Independent prediction of what the unchanged manifest does against the mutant at the deterministic layer. */
    survival: SurvivalExpectation; survivalReason: string; killedByStages?: string[];
  };
}

export interface MutationObservation {
  mutationId: string; kind: MutationKind; packageId: string;
  sectionHashes: Record<string, { before: string | null; after: string | null }>;
  nodeIds: Record<string, { before: string | null; after: string | null }>;
  nodeIdSurvival: { total: number; survived: number; shifted: number; textHashSurvived: number };
  operativeState: Record<string, string>;
  closure: { units: string[]; unresolved: string[]; missingDocuments: string[]; flags: string[] } | null;
  kill: { newFailures: Array<{ ref: string; stage: string; severity: string; actual: string }>; vanishedFailures: string[]; verdict: "KILLED" | "SURVIVED"; predicted: SurvivalExpectation; predictionHeld: boolean };
  /** HARNESS verdicts test the suite's own expectation delta (text/identity/closure/kill prediction); PRODUCT verdicts test Headroom's behaviour on the mutant (operative state, effect surfacing) and a failure is a product finding to register, never a reason to weaken the expectation. */
  verdicts: Array<{ check: string; ok: boolean; detail: string; kind: "HARNESS" | "PRODUCT"; ref?: string; severity?: Severity }>;
}

const ws = (s: string) => s.replace(/\s+/g, " ").trim();
const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);
/** Text identity ignores whitespace so that a node moved to the end of a document (losing its trailing blank line) keeps its hash. */
const textId = (s: string) => sha(ws(s));

export function applyMutation(pkg: CorpusPackage, m: Mutation): CorpusPackage {
  const documents = pkg.documents.map((d) => ({ ...d }));
  const manifest = JSON.parse(JSON.stringify(pkg.manifest)) as CorpusPackage["manifest"];
  for (const e of m.edits) {
    if ("addDocument" in e) {
      const a = e.addDocument;
      const doc = { documentId: a.documentId, label: a.label, file: `documents/${a.documentId}.txt`, role: a.role, operative: true, text: a.text, sha256: sha(a.text) };
      documents.push(doc as CorpusPackage["documents"][number]);
      manifest.documents.push({ documentId: a.documentId, label: a.label, file: doc.file, role: a.role, operative: true, sha256: doc.sha256 } as CorpusPackage["manifest"]["documents"][number]);
      continue;
    }
    const d = documents.find((x) => x.documentId === e.documentId);
    if (!d) throw new Error(`${m.id}: unknown document ${e.documentId}`);
    if (!d.text.includes(e.find)) throw new Error(`${m.id}: "${e.find.slice(0, 60)}" not found in ${e.documentId}`);
    d.text = d.text.replace(e.find, e.replace);
    d.sha256 = sha(d.text);
  }
  return { ...pkg, manifest, documents };
}

function sectionProbe(s: DeterministicStages, documentId: string, ref: string): { hash: string | null; nodeId: string | null } {
  const nodes = s.index.findNodesByRef(documentId, ref);
  if (nodes.length !== 1) return { hash: null, nodeId: null };
  return { hash: textId(s.index.getNodeText(nodes[0]!.nodeId, "DESCENDANTS")), nodeId: nodes[0]!.nodeId };
}

function failures(L: Ledger): Map<string, { stage: string; severity: string; actual: string }> {
  const out = new Map<string, { stage: string; severity: string; actual: string }>();
  for (const c of L.checks) if (c.result === "FAIL") { const f = L.findings.find((x) => x.findingId === c.findingId); out.set(c.expectationRef, { stage: c.stage, severity: f?.severity ?? "?", actual: (f?.actual ?? c.detail).slice(0, 200) }); }
  return out;
}

export async function observeMutation(base: CorpusPackage, m: Mutation): Promise<MutationObservation> {
  const mutated = applyMutation(base, m);
  const before = await runDeterministicStages(base);
  const after = await runDeterministicStages(mutated);
  const doc = m.observeDocumentId ?? before.baseDocumentId;
  const refs = [...new Set([...m.expect.changedSections, ...m.expect.stableSections, ...m.expect.nodeIdsStableFor, ...(m.expect.nodeIdsShiftFor ?? [])])];
  const sectionHashes: MutationObservation["sectionHashes"] = {}, nodeIds: MutationObservation["nodeIds"] = {};
  for (const r of refs) { const b = sectionProbe(before, doc, r), a = sectionProbe(after, doc, r); sectionHashes[r] = { before: b.hash, after: a.hash }; nodeIds[r] = { before: b.nodeId, after: a.nodeId }; }
  const beforeIds = new Set(before.index.allNodes().filter((n) => n.documentId === doc).map((n) => n.nodeId));
  const beforeTextHashes = new Set(before.index.allNodes().filter((n) => n.documentId === doc).map((n) => textId(`${n.nodeType}|${n.sectionRef}|${before.index.getNodeText(n.nodeId, "OWN")}`)));
  const afterNodes = after.index.allNodes().filter((n) => n.documentId === doc);
  const survived = afterNodes.filter((n) => beforeIds.has(n.nodeId)).length;
  const textHashSurvived = afterNodes.filter((n) => beforeTextHashes.has(textId(`${n.nodeType}|${n.sectionRef}|${after.index.getNodeText(n.nodeId, "OWN")}`))).length;
  const verdicts: MutationObservation["verdicts"] = [];
  const v = (check: string, ok: boolean, detail: string, kind: "HARNESS" | "PRODUCT" = "HARNESS", ref?: string, severity?: Severity) => verdicts.push({ check, ok, detail, kind, ...(ref ? { ref } : {}), ...(severity ? { severity } : {}) });
  for (const r of m.expect.changedSections) v(`text changes: ${r}`, sectionHashes[r]!.before !== sectionHashes[r]!.after, `${sectionHashes[r]!.before} → ${sectionHashes[r]!.after}`);
  for (const r of m.expect.stableSections) v(`text stable: ${r}`, sectionHashes[r]!.before === sectionHashes[r]!.after && sectionHashes[r]!.before !== null, `${sectionHashes[r]!.before} → ${sectionHashes[r]!.after}`);
  for (const r of m.expect.nodeIdsStableFor) v(`node id survives: ${r}`, nodeIds[r]!.before === nodeIds[r]!.after && nodeIds[r]!.before !== null, `${nodeIds[r]!.before} → ${nodeIds[r]!.after}`);
  for (const r of m.expect.nodeIdsShiftFor ?? []) v(`node id shifts (positional identity): ${r}`, nodeIds[r]!.before !== nodeIds[r]!.after && nodeIds[r]!.after !== null, `${nodeIds[r]!.before} → ${nodeIds[r]!.after}`);
  const operativeState: Record<string, string> = {};
  for (const o of m.expect.operativeState ?? []) {
    const st = after.operativeStates.get(o.asOfDate);
    const p = st?.provisions.find((x) => x.kind === "SECTION" && x.sectionRef === o.sectionRef);
    const applied = p?.appliedChain.length ?? 0;
    const got = !p || applied === 0 ? "CURRENT" : p.currentText === null ? "DELETED" : "SUPERSEDED";
    const detail = `${got}${p ? ` (${p.status}, applied ${applied}, source ${p.currentSourceDocumentId})` : " (no provision view)"}; instrument ${st?.status ?? "none"}, unattached ${st?.unattachedEffects.length ?? "?"}`;
    operativeState[`${o.asOfDate}:${o.sectionRef}`] = detail;
    v(`operative ${o.sectionRef}@${o.asOfDate} = ${o.status}${o.sourceDocumentId ? ` from ${o.sourceDocumentId}` : ""}`, got === o.status && (!o.sourceDocumentId || p?.currentSourceDocumentId === o.sourceDocumentId), detail, "PRODUCT", `mutation:${m.id}:operative:${o.asOfDate}:${o.sectionRef}`, o.status === "CURRENT" ? "WRONG_OPERATIVE_SOURCE" : "INCORRECT_AMENDMENT_PRECEDENCE");
    if (o.instrumentStatusNot) v(`instrument status @${o.asOfDate} is not ${o.instrumentStatusNot}`, st?.status !== o.instrumentStatusNot, detail, "PRODUCT", `mutation:${m.id}:instrument-status:${o.asOfDate}`, m.kind === "CONFLICTING_DOCUMENT" && /tighten/i.test(m.description) ? "CRITICAL_FALSE_PERMISSION" : "UNSUPPORTED_AS_COMPLETE");
  }
  for (const d of m.expect.effectsExpectedFrom ?? []) {
    const eff = (after.amendment?.effects ?? []).filter((e) => e.amendmentDocumentId === d);
    const unattached = (after.amendment?.unattachedEffects ?? []).filter((e) => e.amendmentDocumentId === d);
    v(`amendment pipeline surfaces ${d} as an effect (resolved or unresolved)`, eff.length + unattached.length > 0, /* detail */ `${eff.length} effect(s), ${unattached.length} unattached, interpreter calls ${after.interpreterCalls}; cross-document leads from ${d}: ${(after.packageGraph.crossDocumentReferenceLeads ?? []).filter((l) => l.sourceDocumentId === d).map((l) => `${l.referenceText}→${l.targetDocumentId ?? "?"} ${l.status}`).join(", ") || "none"}`, "PRODUCT", `mutation:${m.id}:effects:${d}`, "MISSING_DEPENDENCY");
  }
  let closure: MutationObservation["closure"] = null;
  if (m.expect.question) {
    const scope = hybridScope(mutated, after, m.expect.question);
    closure = { units: scope.units.map((u) => `${u.documentId}#${u.sectionRef}`), unresolved: scope.unresolvedReferences, missingDocuments: scope.missingDocuments, flags: scope.flags };
    for (const u of m.expect.closureMustContain ?? []) v(`closure contains ${u}`, closure.units.includes(u), closure.units.join(", "));
    for (const f of m.expect.closureMustFlag ?? []) { const hay = [...closure.unresolved, ...closure.missingDocuments, ...closure.flags]; v(`closure flags "${f}"`, hay.some((x) => x.toLowerCase().includes(f.toLowerCase())), hay.join(" | ").slice(0, 300), "PRODUCT", `mutation:${m.id}:closure-flag:${f}`, "MISSING_DEPENDENCY"); }
  }
  // kill analysis: the ORIGINAL manifest against the mutant through the production deterministic audits
  const baseFails = failures(auditDeterministic(base, before));
  const mutFails = failures(auditDeterministic(mutated, after));
  const newFailures = [...mutFails].filter(([ref]) => !baseFails.has(ref)).map(([ref, f]) => ({ ref, ...f }));
  const vanishedFailures = [...baseFails.keys()].filter((ref) => !mutFails.has(ref));
  const verdict = newFailures.length > 0 ? "KILLED" : "SURVIVED";
  const predictionHeld = m.expect.survival === "KILLED" ? verdict === "KILLED" && (m.expect.killedByStages ?? []).every((st) => newFailures.some((f) => f.stage === st)) : verdict === "SURVIVED";
  v(`kill prediction (${m.expect.survival}) holds`, predictionHeld, `${verdict}: ${newFailures.map((f) => `${f.stage}:${f.ref}`).join(", ") || "no new deterministic failure"}`);
  return { mutationId: m.id, kind: m.kind, packageId: m.packageId, sectionHashes, nodeIds, nodeIdSurvival: { total: afterNodes.length, survived, shifted: afterNodes.length - survived, textHashSurvived }, operativeState, closure, kill: { newFailures, vanishedFailures, verdict, predicted: m.expect.survival, predictionHeld }, verdicts };
}

const q = (id: string, packageId: string, family: string, question: string, seedRefs: BenchmarkCase["seedRefs"], asOfDate?: string): BenchmarkCase => ({ id, adversarialClass: "MUTATION", packageId, question, family, asOfDate, seedRefs, requiredUnits: [], requiredConditions: [], requiredDefinitions: [], requiredDocuments: [], correctAnswer: "(mutation probe)", answerIfRestrictionsOmitted: "(mutation probe)", expectedOutcome: "ANSWER_WITH_RESTRICTIONS" });

/** The catalogue: one operator per directive line, each with an independently stated expectation delta and kill prediction. */
export const MUTATIONS: Mutation[] = [
  { id: "MUT-01", kind: "CHANGED_THRESHOLD", packageId: "pkg-a-basic-credit-agreement", description: "7.01(b) general basket $30,000,000 → $45,000,000 (same length).", legalEffect: "Capacity under the general debt basket rises by $15m; every dependent answer changes.",
    edits: [{ documentId: "credit-agreement", find: "$30,000,000", replace: "$45,000,000" }],
    expect: { changedSections: ["7.01(b)", "7.01"], stableSections: ["7.01(c)", "7.02", "7.03", "1.01"], nodeIdsStableFor: ["7.01(b)", "7.01(c)", "7.02", "7.03"],
      question: q("MUT-01-Q", "pkg-a-basic-credit-agreement", "INDEBTEDNESS", "How much other Indebtedness may the Borrower incur under Section 7.01(b)?", [{ documentId: "credit-agreement", sectionRef: "7.01(b)" }]), closureMustContain: ["credit-agreement#7.01", "credit-agreement#7.02"],
      survival: "KILLED", survivalReason: "the manifest pins $30,000,000 in the structure own-text and operative-state expectations", killedByStages: ["STRUCTURE"] } },
  { id: "MUT-02", kind: "ADDED_CONDITION", packageId: "pkg-a-basic-credit-agreement", description: "7.01(c) ratio basket gains a 'no Default' proviso (length-changing insertion).", legalEffect: "A new material condition: the ratio basket is unavailable while a Default continues.",
    edits: [{ documentId: "credit-agreement", find: "does not exceed 3.50 to 1.00.", replace: "does not exceed 3.50 to 1.00; provided that no Default has occurred and is continuing at the time of incurrence." }],
    expect: { changedSections: ["7.01(c)", "7.01"], stableSections: ["7.01(b)", "7.02", "7.03", "1.01"], nodeIdsStableFor: ["7.01(b)", "7.01(c)"], nodeIdsShiftFor: ["7.02", "7.03"],
      survival: "GAP", survivalReason: "conditions are only checked at the (mocked) semantic stage; no deterministic expectation pins the clause text, so the deterministic layer cannot see a new proviso" } },
  { id: "MUT-03", kind: "REMOVED_EXCEPTION", packageId: "pkg-d-qualitative-restrictions", description: "7.05(l) (Specified Strategic Transaction basket) deleted; the hanging proviso now follows (k).", legalEffect: "One permission disappears; the undefined-term dependency on 'Specified Strategic Transaction' disappears with it.",
    edits: [{ documentId: "credit-agreement", find: "Section 2.05(b); and\n\n(l) Dispositions constituting a Specified Strategic Transaction;\n\nprovided further", replace: "Section 2.05(b);\n\nprovided further" }],
    expect: { changedSections: ["7.05", "7.05(k)"], stableSections: ["7.05(j)", "2.05", "1.01"], nodeIdsStableFor: ["7.05(j)", "7.05(k)", "2.05"],
      question: q("MUT-03-Q", "pkg-d-qualitative-restrictions", "DISPOSITIONS", "Can the Borrower sell a warehouse for $8,000,000 cash under Section 7.05?", [{ documentId: "credit-agreement", sectionRef: "7.05" }]), closureMustContain: ["credit-agreement#7.05", "credit-agreement#2.05"],
      survival: "KILLED", survivalReason: "the manifest pins 7.05(l) as a structural node and 'Specified Strategic Transaction' as an undefined term that must be surfaced", killedByStages: ["STRUCTURE"] } },
  { id: "MUT-04", kind: "REVISED_DEFINITION", packageId: "pkg-b-multi-document", description: "Credit-agreement 'Consolidated EBITDA' loses the stock-compensation add-back.", legalEffect: "EBITDA falls; any ratio-based capacity computed from the credit agreement definition changes while the indenture definition is untouched.",
    edits: [{ documentId: "credit-agreement", find: "depreciation and amortization expense and non-cash stock compensation expense for such period.", replace: "depreciation and amortization expense for such period." }],
    expect: { changedSections: ["1.01"], stableSections: ["7.01", "7.02"], nodeIdsStableFor: ["1.01"], nodeIdsShiftFor: ["7.01", "7.02"],
      survival: "KILLED", survivalReason: "the manifest pins 'non-cash stock compensation expense' in the credit-agreement definition's mustContain (first-run prediction was GAP: I had assumed definition bodies were unpinned; the suite corrected my model of the harness)", killedByStages: ["STRUCTURE"] } },
  { id: "MUT-05", kind: "NEW_AMENDMENT", packageId: "pkg-c-amendment-supersession", description: "Amendment No. 3 (effective 2026-05-01) restates 7.01(d) capital-lease basket from $5,000,000 to $8,000,000.", legalEffect: "7.01(d) is superseded as of 2026-05-01; earlier as-of dates are unaffected.",
    edits: [{ addDocument: { documentId: "amendment-3", label: "Amendment No. 3", role: "AMENDMENT", text: "AMENDMENT NO. 3 dated as of May 1, 2026 to the Credit Agreement dated as of January 20, 2025 (as amended by Amendment No. 1 dated as of August 15, 2025 and Amendment No. 2 dated as of February 2, 2026), among Westmark Logistics Holdings LLC, as Borrower, the Lenders party hereto and Pinnacle Commercial Bank, as Administrative Agent.\n\nSECTION 1. Amendments . Section 7.01(d) of the Credit Agreement is hereby amended and restated in its entirety to read as follows: (d) Indebtedness in respect of capital leases in an aggregate principal amount not to exceed $8,000,000 at any time outstanding; and\n\nSECTION 2. Effectiveness . This Amendment shall become effective on May 1, 2026.\n" } }],
    expect: { changedSections: [], stableSections: ["7.01", "7.01(d)", "7.02"], nodeIdsStableFor: ["7.01", "7.01(d)", "7.02"],
      operativeState: [{ asOfDate: "2026-06-30", sectionRef: "7.01(d)", status: "SUPERSEDED", sourceDocumentId: "amendment-3" }, { asOfDate: "2025-12-31", sectionRef: "7.01(d)", status: "CURRENT" }, { asOfDate: "2026-06-30", sectionRef: "7.01(b)", status: "SUPERSEDED", sourceDocumentId: "amendment-1" }, { asOfDate: "2026-06-30", sectionRef: "7.01(e)", status: "DELETED", sourceDocumentId: "amendment-2" }],
      question: q("MUT-05-Q", "pkg-c-amendment-supersession", "INDEBTEDNESS", "As of 2026-06-30, how much capital lease Indebtedness may the Borrower incur under Section 7.01(d)?", [{ documentId: "credit-agreement", sectionRef: "7.01(d)" }], "2026-06-30"), closureMustContain: ["credit-agreement#7.01", "amendment-3#1"],
      survival: "KILLED", survivalReason: "the manifest expects 7.01(d) CURRENT with $5,000,000 at 2026-06-30", killedByStages: ["OPERATIVE_STATE"] } },
  { id: "MUT-06", kind: "MOVED_COVENANT", packageId: "pkg-a-basic-credit-agreement", description: "The Liens covenant is renumbered from Section 7.02 to Section 7.04 (same length); its cross-reference to 7.01(b) is unchanged.", legalEffect: "No legal change; every pointer to '7.02' is now stale.",
    edits: [{ documentId: "credit-agreement", find: "SECTION 7.02 Liens", replace: "SECTION 7.04 Liens" }],
    expect: { changedSections: [], stableSections: ["7.01", "7.03"], nodeIdsStableFor: ["7.01", "7.03"],
      question: q("MUT-06-Q", "pkg-a-basic-credit-agreement", "LIENS", "May the Borrower grant a Lien securing $10,000,000 of general-basket Indebtedness?", [{ documentId: "credit-agreement", sectionRef: "7.02" }]), closureMustContain: ["credit-agreement#7.04", "credit-agreement#7.01"],
      survival: "KILLED", survivalReason: "the manifest pins a 7.02 node and a 7.02 covenant candidate", killedByStages: ["STRUCTURE"] } },
  { id: "MUT-07", kind: "CHANGED_ENTITY_SCOPE", packageId: "pkg-i-secured-debt-lien", description: "7.01(b) general basket widened from 'the Borrower and the Guarantors' to include Foreign Subsidiaries.", legalEffect: "A Foreign Subsidiary gains access to the $50m basket in addition to the $15m basket in 7.01(c); the entity-limited answer changes.",
    edits: [{ documentId: "credit-agreement", find: "other Indebtedness of the Borrower and the Guarantors in an aggregate principal amount not to exceed $50,000,000", replace: "other Indebtedness of the Borrower, the Guarantors and the Foreign Subsidiaries in an aggregate principal amount not to exceed $50,000,000" }],
    expect: { changedSections: ["7.01(b)", "7.01"], stableSections: ["7.01(c)", "7.02", "9.15", "1.01"], nodeIdsStableFor: ["7.01(b)"], nodeIdsShiftFor: ["7.01(c)", "7.02", "9.15"],
      survival: "KILLED", survivalReason: "the manifest pins 'Borrower and the Guarantors' in 7.01(b)'s own text (first-run prediction was GAP; corrected after the run - the entity scope itself is still only checked at the mocked semantic stage)", killedByStages: ["STRUCTURE"] } },
  { id: "MUT-08", kind: "CONFLICTING_DOCUMENT", packageId: "pkg-b-multi-document", description: "A side letter (dated 2026-03-01) purports to lift the 7.01(b) general basket to $60,000,000 'notwithstanding' the credit agreement.", legalEffect: "Two operative documents now state different caps for the same basket; the correct outcome is a flagged conflict, never a silent CURRENT $30,000,000 or a silent $60,000,000.",
    edits: [{ addDocument: { documentId: "side-letter", label: "Side Letter", role: "AMENDMENT", text: "SIDE LETTER dated as of March 1, 2026 to the Credit Agreement dated as of February 10, 2026, among Northfield Components Corp., as Borrower, the Lenders party hereto and Lakeside National Bank, as Administrative Agent.\n\nSECTION 1. Agreement . Notwithstanding Section 7.01(b) of the Credit Agreement, the Lenders party hereto agree that the Borrower may incur other Indebtedness in an aggregate principal amount not to exceed $60,000,000 at any time outstanding.\n\nSECTION 2. Effectiveness . This letter shall become effective on March 1, 2026.\n" } }],
    expect: { changedSections: [], stableSections: ["7.01", "7.01(b)", "7.02"], nodeIdsStableFor: ["7.01", "7.01(b)"],
      operativeState: [{ asOfDate: "2026-06-30", sectionRef: "7.01(b)", status: "CURRENT", instrumentStatusNot: "OPERATIVE_STATE_RESOLVED" }], effectsExpectedFrom: ["side-letter"],
      question: q("MUT-08-Q", "pkg-b-multi-document", "INDEBTEDNESS", "How much other Indebtedness may the Borrower incur under Section 7.01(b) of the Credit Agreement as of 2026-06-30?", [{ documentId: "credit-agreement", sectionRef: "7.01(b)" }], "2026-06-30"), closureMustContain: ["credit-agreement#7.01", "side-letter#1"],
      survival: "GAP", survivalReason: "if the amendment parser cannot classify 'notwithstanding … may incur' it yields a REVIEW_REQUIRED or unattached effect; the manifest's CURRENT expectation for 7.01(b) only fails on an APPLIED effect, so the conflict is invisible to the deterministic manifest layer unless the instrument status changes" } },
  { id: "MUT-09", kind: "REORDERED_HIERARCHY", packageId: "pkg-a-basic-credit-agreement", description: "Sections 7.02 and 7.03 swap places in the document; text of both is unchanged.", legalEffect: "None; a semantically neutral edit.",
    edits: [{ documentId: "credit-agreement", find: "SECTION 7.02 Liens . The Borrower shall not create any Lien on any property, except Liens securing Indebtedness permitted under Section 7.01(b).\n\nSECTION 7.03 Fundamental Changes . The Borrower shall not merge or consolidate with any other Person.", replace: "SECTION 7.03 Fundamental Changes . The Borrower shall not merge or consolidate with any other Person.\n\nSECTION 7.02 Liens . The Borrower shall not create any Lien on any property, except Liens securing Indebtedness permitted under Section 7.01(b)." }],
    expect: { changedSections: [], stableSections: ["7.01", "7.02", "7.03", "1.01"], nodeIdsStableFor: ["7.01", "1.01"], nodeIdsShiftFor: ["7.02", "7.03"],
      survival: "EQUIVALENT", survivalReason: "no legal content changes; the manifest must keep passing (a failure here would be over-fitting to document order)" } },
  { id: "MUT-10", kind: "MISSING_REFERENCED_PROVISION", packageId: "pkg-c-amendment-supersession", description: "7.02 Liens now points to Section 7.01(f), which does not exist.", legalEffect: "The Liens exception depends on a provision that cannot be located; any answer about permitted Liens must fail closed.",
    edits: [{ documentId: "credit-agreement", find: "permitted under Section 7.01(d).", replace: "permitted under Section 7.01(f)." }],
    expect: { changedSections: ["7.02"], stableSections: ["7.01", "7.01(d)", "1.01"], nodeIdsStableFor: ["7.01", "7.01(d)", "7.02"],
      question: q("MUT-10-Q", "pkg-c-amendment-supersession", "LIENS", "May the Borrower grant a Lien securing capital lease Indebtedness?", [{ documentId: "credit-agreement", sectionRef: "7.02" }]), closureMustContain: ["credit-agreement#7.02", "credit-agreement#7.01"], closureMustFlag: ["7.01(f)"],
      survival: "KILLED", survivalReason: "the manifest's 7.02 covenant declares a cross-reference to 7.01(d) with mustResolve (first run: SURVIVED - the auditor never checked crossReferences; the cross-reference audit was added to auditContextRetrieval because of this mutant)", killedByStages: ["CONTEXT_RETRIEVAL"] } },
  { id: "MUT-11", kind: "CHANGED_THRESHOLD", packageId: "pkg-c-amendment-supersession", description: "Amendment No. 1 restates 7.01(b) at $45,000,000 instead of $40,000,000 (edit in the amendment, not the base agreement).", legalEffect: "The operative cap from 2025-08-15 onward is $45m; the base agreement text is untouched.",
    edits: [{ documentId: "amendment-1", find: "$40,000,000", replace: "$45,000,000" }],
    expect: { changedSections: [], stableSections: ["7.01", "7.01(b)", "7.02"], nodeIdsStableFor: ["7.01", "7.01(b)", "7.02"],
      operativeState: [{ asOfDate: "2025-12-31", sectionRef: "7.01(b)", status: "SUPERSEDED", sourceDocumentId: "amendment-1" }, { asOfDate: "2025-06-30", sectionRef: "7.01(b)", status: "CURRENT" }],
      survival: "KILLED", survivalReason: "the manifest expects the 2025-12-31 operative text of 7.01(b) to contain $40,000,000", killedByStages: ["OPERATIVE_STATE"] } },
  { id: "MUT-12", kind: "CONFLICTING_DOCUMENT", packageId: "pkg-b-multi-document", description: "A side letter (dated 2026-03-01) TIGHTENS the 7.01(b) general basket to $10,000,000 'notwithstanding' the credit agreement (the dangerous direction of MUT-08).", legalEffect: "The operative cap is $10m, not $30m; an answer that still reads $30m from the base agreement is a false permission.",
    edits: [{ addDocument: { documentId: "side-letter", label: "Side Letter", role: "AMENDMENT", text: "SIDE LETTER dated as of March 1, 2026 to the Credit Agreement dated as of February 10, 2026, among Northfield Components Corp., as Borrower, the Lenders party hereto and Lakeside National Bank, as Administrative Agent.\n\nSECTION 1. Agreement . Notwithstanding Section 7.01(b) of the Credit Agreement, the Borrower agrees that it shall not incur other Indebtedness under Section 7.01(b) of the Credit Agreement in an aggregate principal amount exceeding $10,000,000 at any time outstanding.\n\nSECTION 2. Effectiveness . This letter shall become effective on March 1, 2026.\n" } }],
    expect: { changedSections: [], stableSections: ["7.01", "7.01(b)"], nodeIdsStableFor: ["7.01", "7.01(b)"],
      operativeState: [{ asOfDate: "2026-06-30", sectionRef: "7.01(b)", status: "CURRENT", instrumentStatusNot: "OPERATIVE_STATE_RESOLVED" }], effectsExpectedFrom: ["side-letter"],
      question: q("MUT-12-Q", "pkg-b-multi-document", "INDEBTEDNESS", "How much other Indebtedness may the Borrower incur under Section 7.01(b) of the Credit Agreement as of 2026-06-30?", [{ documentId: "credit-agreement", sectionRef: "7.01(b)" }], "2026-06-30"), closureMustContain: ["credit-agreement#7.01", "side-letter#1"],
      survival: "GAP", survivalReason: "same mechanism as MUT-08: a 'notwithstanding' side letter is not an amendment pattern the deterministic parser recognises, so no effect reaches the operative state and the manifest's CURRENT $30,000,000 expectation keeps passing - which here is exactly the false permission" } },
];

export function renderMutationReport(obs: MutationObservation[], sha: string): string {
  const rows = obs.map((o) => `| ${o.mutationId} | ${o.kind} | ${o.packageId.replace(/^pkg-([a-z])-.*$/, "$1").toUpperCase()} | ${o.kill.verdict} | ${o.kill.predicted} | ${o.kill.predictionHeld ? "yes" : "NO"} | ${o.nodeIdSurvival.survived}/${o.nodeIdSurvival.total} | ${o.nodeIdSurvival.textHashSurvived}/${o.nodeIdSurvival.total} | ${o.verdicts.filter((v) => v.kind === "HARNESS" && v.ok).length}/${o.verdicts.filter((v) => v.kind === "HARNESS").length} | ${o.verdicts.filter((v) => v.kind === "PRODUCT" && v.ok).length}/${o.verdicts.filter((v) => v.kind === "PRODUCT").length} |`);
  const details = obs.map((o) => [`### ${o.mutationId} (${o.kind}, ${o.packageId})`, "", ...o.verdicts.map((v) => `- ${v.ok ? "✅" : "❌"} [${v.kind}] ${v.check} — ${v.detail}`), ...(o.kill.newFailures.length ? ["", "New deterministic failures (the unchanged manifest against the mutant):", ...o.kill.newFailures.map((f) => `- ${f.stage} ${f.ref} [${f.severity}]: ${f.actual}`)] : []), ...(o.kill.vanishedFailures.length ? ["", `Baseline failures that disappeared: ${o.kill.vanishedFailures.join(", ")}`] : []), ...(o.closure ? ["", `Hybrid closure: ${o.closure.units.join(", ")}${o.closure.unresolved.length ? ` | unresolved: ${o.closure.unresolved.join("; ")}` : ""}${o.closure.missingDocuments.length ? ` | missing: ${o.closure.missingDocuments.join("; ")}` : ""}`] : []), ""].join("\n"));
  return [`# Mutation suite run @ ${sha}`, "", "| Mutation | Operator | Pkg | Mutant | Predicted | Held | Node ids kept | Text hashes kept | Harness checks | Product checks |", "|---|---|---|---|---|---|---|---|---|---|", ...rows, "", ...details].join("\n");
}
