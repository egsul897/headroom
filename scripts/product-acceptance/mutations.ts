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

export type MutationKind = "CHANGED_THRESHOLD" | "ADDED_CONDITION" | "REMOVED_EXCEPTION" | "REVISED_DEFINITION" | "NEW_AMENDMENT" | "MOVED_COVENANT" | "CHANGED_ENTITY_SCOPE" | "CONFLICTING_DOCUMENT" | "REORDERED_HIERARCHY" | "MISSING_REFERENCED_PROVISION" | "OCR_NOISE";
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
    /** OCR-noise contract: the named node is either intact (unique, same text) or absent with the parser failing closed; it must never be silently absorbed into another node (the IPV-07 class). The distinctive phrase is the mutated clause's own wording. */
    ocr?: { ref: string; distinctivePhrase: string };
    /** Independent prediction of what the unchanged manifest does against the mutant at the deterministic layer. */
    survival: SurvivalExpectation; survivalReason: string; killedByStages?: string[];
    /** Documentation only (not asserted; the suite runs against main): what the mutant does on a tree where the registered defect is fixed, and why. */
    afterFix?: { observedOn: string; survival: SurvivalExpectation; killedByStages?: string[]; note: string };
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
  verdicts: Array<{ check: string; ok: boolean; detail: string; kind: "HARNESS" | "PRODUCT" | "OBSERVATION"; ref?: string; severity?: Severity }>;
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
  const v = (check: string, ok: boolean, detail: string, kind: "HARNESS" | "PRODUCT" | "OBSERVATION" = "HARNESS", ref?: string, severity?: Severity) => verdicts.push({ check, ok, detail, kind, ...(ref ? { ref } : {}), ...(severity ? { severity } : {}) });
  for (const r of m.expect.changedSections) v(`text changes: ${r}`, sectionHashes[r]!.before !== sectionHashes[r]!.after, `${sectionHashes[r]!.before} → ${sectionHashes[r]!.after}`);
  for (const r of m.expect.stableSections) v(`text stable: ${r}`, sectionHashes[r]!.before === sectionHashes[r]!.after && sectionHashes[r]!.before !== null, `${sectionHashes[r]!.before} → ${sectionHashes[r]!.after}`);
  for (const r of m.expect.nodeIdsStableFor) v(`node id survives: ${r}`, nodeIds[r]!.before === nodeIds[r]!.after && nodeIds[r]!.before !== null, `${nodeIds[r]!.before} → ${nodeIds[r]!.after}`);
  for (const r of m.expect.nodeIdsShiftFor ?? []) v(`node id shifts (positional identity): ${r}`, nodeIds[r]!.before !== nodeIds[r]!.after && nodeIds[r]!.after !== null, `${nodeIds[r]!.before} → ${nodeIds[r]!.after}`);
  const operativeState: Record<string, string> = {};
  for (const o of m.expect.operativeState ?? []) {
    const st = after.operativeStates.get(`${o.asOfDate}::${doc}`) ?? after.operativeStates.get(o.asOfDate);
    const p = st?.provisions.find((x) => x.kind === "SECTION" && x.sectionRef === o.sectionRef);
    const applied = p?.appliedChain.length ?? 0;
    const got = !p || applied === 0 ? "CURRENT" : p.currentText === null ? "DELETED" : "SUPERSEDED";
    const detail = `${got}${p ? ` (${p.status}, applied ${applied}, source ${p.currentSourceDocumentId})` : " (no provision view)"}; instrument ${st?.status ?? "none"}, unattached ${st?.unattachedEffects.length ?? "?"}`;
    operativeState[`${o.asOfDate}:${o.sectionRef}`] = detail;
    // IPV-16: attached UNKNOWN_CHANGE/REVIEW_REQUIRED preserves last authoritative
    // text and leaves the instrument non-RESOLVED. That fail-closed outcome
    // satisfies both "CURRENT" (base/prior text retained, not replaced with
    // invented override dollars) and "SUPERSEDED" (amendment activity applied)
    // expectations when the override document is what last touched the chain.
    const attachedReview =
      !!p &&
      p.status === "OPERATIVE_STATE_REVIEW_REQUIRED" &&
      applied > 0 &&
      st?.status !== "OPERATIVE_STATE_RESOLVED";
    const statusOk = got === o.status || (attachedReview && (o.status === "CURRENT" || o.status === "SUPERSEDED"));
    const sourceOk =
      !o.sourceDocumentId ||
      p?.currentSourceDocumentId === o.sourceDocumentId ||
      (attachedReview && p.appliedChain.some((a) => a.amendmentDocumentId === o.sourceDocumentId));
    v(`operative ${o.sectionRef}@${o.asOfDate} = ${o.status}${o.sourceDocumentId ? ` from ${o.sourceDocumentId}` : ""}`, statusOk && sourceOk, detail, "PRODUCT", `mutation:${m.id}:operative:${o.asOfDate}:${o.sectionRef}`, o.status === "CURRENT" ? "WRONG_OPERATIVE_SOURCE" : "INCORRECT_AMENDMENT_PRECEDENCE");
    if (o.instrumentStatusNot) v(`instrument status @${o.asOfDate} is not ${o.instrumentStatusNot}`, st?.status !== o.instrumentStatusNot, detail, "PRODUCT", `mutation:${m.id}:instrument-status:${o.asOfDate}`, m.kind === "CONFLICTING_DOCUMENT" && /tighten/i.test(m.description) ? "CRITICAL_FALSE_PERMISSION" : "UNSUPPORTED_AS_COMPLETE");
  }
  for (const d of m.expect.effectsExpectedFrom ?? []) {
    const eff = (after.amendment?.effects ?? []).filter((e) => e.amendmentDocumentId === d);
    const unattached = (after.amendment?.unattachedEffects ?? []).filter((e) => e.amendmentDocumentId === d);
    v(`amendment pipeline surfaces ${d} as an effect (resolved or unresolved)`, eff.length + unattached.length > 0, /* detail */ `${eff.length} effect(s)${eff.length ? ` [${eff.map((e) => `${e.operation}/${e.status}→${e.target.targetDocumentId ?? "?"}#${e.target.targetSectionRef ?? e.target.targetDefinedTermRef ?? "?"}`).join(", ")}]` : ""}, ${unattached.length} unattached, interpreter calls ${after.interpreterCalls}; cross-document leads from ${d}: ${(after.packageGraph.crossDocumentReferenceLeads ?? []).filter((l) => l.sourceDocumentId === d).map((l) => `${l.referenceText}→${l.targetDocumentId ?? "?"} ${l.status}`).join(", ") || "none"}`, "PRODUCT", `mutation:${m.id}:effects:${d}`, "MISSING_DEPENDENCY");
  }
  let closure: MutationObservation["closure"] = null;
  if (m.expect.question) {
    const scope = hybridScope(mutated, after, m.expect.question);
    closure = { units: scope.units.map((u) => `${u.documentId}#${u.sectionRef}`), unresolved: scope.unresolvedReferences, missingDocuments: scope.missingDocuments, flags: scope.flags };
    for (const u of m.expect.closureMustContain ?? []) v(`closure contains ${u}`, closure.units.includes(u), closure.units.join(", "));
    for (const f of m.expect.closureMustFlag ?? []) { const hay = [...closure.unresolved, ...closure.missingDocuments, ...closure.flags]; v(`closure flags "${f}"`, hay.some((x) => x.toLowerCase().includes(f.toLowerCase())), hay.join(" | ").slice(0, 300), "PRODUCT", `mutation:${m.id}:closure-flag:${f}`, "MISSING_DEPENDENCY"); }
  }
  if (m.expect.ocr) {
    const o = m.expect.ocr; const nodes = after.index.findNodesByRef(doc, o.ref);
    // "intact" = the node is still uniquely resolvable (its text may legitimately carry the scan artefact itself)
    const intact = nodes.length === 1;
    const absorbedBy = after.index.allNodes().filter((n) => n.documentId === doc && n.sectionRef !== o.ref && !nodes.some((x) => x.nodeId === n.nodeId) && ws(after.index.getNodeText(n.nodeId, "OWN")).includes(ws(o.distinctivePhrase))).map((n) => `${n.nodeType} ${n.sectionRef}`);
    const health = after.index.healthDiagnostics().length;
    v(`OCR: ${o.ref} is intact or absent-with-diagnostics, never silently absorbed`, intact || (nodes.length === 0 && absorbedBy.length === 0) || (nodes.length === 0 && health > 0), `${nodes.length} node(s) for ${o.ref}; intact ${intact}; absorbed by ${absorbedBy.join(", ") || "nobody"}; health diagnostics ${health}`, "PRODUCT", `mutation:${m.id}:ocr:${o.ref}`, "SOURCE_PROVENANCE_FAILURE");
    if (absorbedBy.length > 0) v(`OCR: the distinctive phrase of ${o.ref} now lives inside another node (silent merge)`, false, absorbedBy.join(", "), "OBSERVATION" as never);
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
      survival: "KILLED", survivalReason: "run 83e6bf1: SURVIVED (GAP) - conditions were only checked at the mocked semantic stage. Harness fix: every manifest covenant now pins textSha256 (whitespace-normalised node text, pin-corpus.ts) and auditStructure checks it, so any textual change to an operative clause is a deterministic kill", killedByStages: ["STRUCTURE"] } },
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
      survival: "KILLED", survivalReason: "side letter attaches UNKNOWN_CHANGE/REVIEW_REQUIRED to 7.01(b); manifest CURRENT expectation fails at OPERATIVE_STATE", killedByStages: ["OPERATIVE_STATE"],
      afterFix: { observedOn: "cursor/database-legal-intelligence-0e3f @ d74a3ac7", survival: "KILLED", killedByStages: ["OPERATIVE_STATE"], note: "Side letter -> UNKNOWN_CHANGE/REVIEW_REQUIRED on 7.01(b); instrument REVIEW_REQUIRED; PRODUCT verdicts OK (fail-closed attached override)." } } },
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
      survival: "KILLED", survivalReason: "tightening side letter attaches REVIEW_REQUIRED; manifest CURRENT expectation fails at OPERATIVE_STATE (dangerous false-permission direction now detected)", killedByStages: ["OPERATIVE_STATE"],
      afterFix: { observedOn: "cursor/database-legal-intelligence-0e3f @ d74a3ac7", survival: "KILLED", killedByStages: ["OPERATIVE_STATE"], note: "Tightening override attached; PRODUCT verdicts OK; INV-16b section withhold remains." } } },
  // ---- side-letter / waiver / consent family (IPV-16 breadth): one per package family, all in memory ----
  { id: "MUT-13", kind: "CONFLICTING_DOCUMENT", packageId: "pkg-a-basic-credit-agreement", description: "A side letter TIGHTENS 7.01(b) to $10,000,000 'notwithstanding' the credit agreement (basic single-agreement package).", legalEffect: "Operative cap $10m, not $30m.",
    edits: [{ addDocument: { documentId: "side-letter", label: "Side Letter", role: "AMENDMENT", text: "SIDE LETTER dated as of April 1, 2026 to the Credit Agreement dated as of March 3, 2026, among Harbor Lane Industries, Inc., as Borrower, the Lenders party hereto and Meridian Trust Bank, as Administrative Agent.\n\nSECTION 1. Agreement . Notwithstanding Section 7.01(b) of the Credit Agreement, the Borrower agrees that it shall not incur other Indebtedness under Section 7.01(b) of the Credit Agreement in an aggregate principal amount exceeding $10,000,000 at any time outstanding.\n\nSECTION 2. Effectiveness . This letter shall become effective on April 1, 2026.\n" } }],
    expect: { changedSections: [], stableSections: ["7.01", "7.01(b)"], nodeIdsStableFor: ["7.01", "7.01(b)"],
      operativeState: [{ asOfDate: "2026-06-30", sectionRef: "7.01(b)", status: "CURRENT", instrumentStatusNot: "OPERATIVE_STATE_RESOLVED" }], effectsExpectedFrom: ["side-letter"],
      survival: "KILLED", survivalReason: "same IPV-16 kill as MUT-12 on a single-agreement package", killedByStages: ["OPERATIVE_STATE"],
      afterFix: { observedOn: "cursor/database-legal-intelligence-0e3f @ d74a3ac7", survival: "KILLED", killedByStages: ["OPERATIVE_STATE"], note: "Single-agreement package; PRODUCT verdicts OK." } } },
  { id: "MUT-14", kind: "CONFLICTING_DOCUMENT", packageId: "pkg-c-amendment-supersession", description: "After two amendments, a side letter TIGHTENS 7.01(b) (as restated by Amendment No. 1) to $30,000,000.", legalEffect: "Operative cap $30m from 2026-03-15, not the $40m Amendment No. 1 set; the amendment chain must carry the override or flag it.",
    edits: [{ addDocument: { documentId: "side-letter", label: "Side Letter", role: "AMENDMENT", text: "SIDE LETTER dated as of March 15, 2026 to the Credit Agreement dated as of January 20, 2025 (as amended by Amendment No. 1 dated as of August 15, 2025 and Amendment No. 2 dated as of February 2, 2026), among Westmark Logistics Holdings LLC, as Borrower, the Lenders party hereto and Pinnacle Commercial Bank, as Administrative Agent.\n\nSECTION 1. Agreement . Notwithstanding Section 7.01(b) of the Credit Agreement as amended by Amendment No. 1, the Borrower agrees that it shall not incur other Indebtedness under Section 7.01(b) in an aggregate principal amount exceeding $30,000,000 at any time outstanding.\n\nSECTION 2. Effectiveness . This letter shall become effective on March 15, 2026.\n" } }],
    expect: { changedSections: [], stableSections: ["7.01", "7.01(b)"], nodeIdsStableFor: ["7.01", "7.01(b)"],
      operativeState: [{ asOfDate: "2026-06-30", sectionRef: "7.01(b)", status: "SUPERSEDED", sourceDocumentId: "amendment-1", instrumentStatusNot: "OPERATIVE_STATE_RESOLVED" }], effectsExpectedFrom: ["side-letter"],
      survival: "KILLED", survivalReason: "override attaches after Amendment No. 1; OPERATIVE_STATE and CONTEXT_RETRIEVAL detect the REVIEW_REQUIRED clause (instrument not RESOLVED; $40m preserved, override dollars not invented)",
      killedByStages: ["OPERATIVE_STATE", "CONTEXT_RETRIEVAL"],
      afterFix: { observedOn: "cursor/database-legal-intelligence-0e3f @ d74a3ac7", survival: "KILLED", killedByStages: ["OPERATIVE_STATE", "CONTEXT_RETRIEVAL"], note: "Override attaches to 7.01(b) after Amendment No. 1 (SUPERSEDED, source amendment-1 preserved); instrument REVIEW_REQUIRED; PRODUCT verdicts OK. Incidental CONTEXT kill: Default not retrievable from the withheld clause." } } },
  { id: "MUT-15", kind: "CONFLICTING_DOCUMENT", packageId: "pkg-h-unseen-composition", description: "ABL package: a side letter TIGHTENS the 7.02(d) general lien basket to $2,500,000.", legalEffect: "Operative lien basket $2.5m, not $7.5m.",
    edits: [{ addDocument: { documentId: "side-letter", label: "Side Letter", role: "AMENDMENT", text: "SIDE LETTER dated as of October 15, 2026 to the ABL Credit Agreement dated as of September 9, 2026, among Copperline Energy Services, Inc., as Borrower, the Lenders party hereto and Red Mesa Capital Bank, as Administrative Agent and Collateral Agent.\n\nSECTION 1. Agreement . Notwithstanding Section 7.02(d) of the ABL Credit Agreement, the Borrower agrees that it shall not create Liens under Section 7.02(d) securing obligations in an aggregate amount exceeding $2,500,000 at any time outstanding.\n\nSECTION 2. Effectiveness . This letter shall become effective on October 15, 2026.\n" } }],
    expect: { changedSections: [], stableSections: ["7.02", "7.02(d)"], nodeIdsStableFor: ["7.02", "7.02(d)"],
      operativeState: [{ asOfDate: "2027-03-31", sectionRef: "7.02(d)", status: "CURRENT", instrumentStatusNot: "OPERATIVE_STATE_RESOLVED" }], effectsExpectedFrom: ["side-letter"],
      survival: "GAP", survivalReason: "IPV-16 on a multi-instrument package whose first amendment is already unresolved (IPV-05)",
      afterFix: { observedOn: "PR #136 @ 8f87a0633ac3", survival: "KILLED", killedByStages: ["CONTEXT_RETRIEVAL"], note: "PR #136 @8f87a06: override attached to abl-credit-agreement#7.02(d); 7.02(d) REVIEW_REQUIRED with the $7,500,000 text preserved. Incidental kill: the withheld clause yields 0 definition items, so the manifest's undefined-term check (Eligible Receivables / Eligible Inventory) cannot see the unresolved dependencies. PRODUCT verdicts OK." } } },
  { id: "MUT-16", kind: "CONFLICTING_DOCUMENT", packageId: "pkg-i-secured-debt-lien", description: "A lender CONSENT raises the 7.02(b) lien cap to $30,000,000 'notwithstanding the limitation in Section 7.02(b)' (loosening; consent form, not an amendment form).", legalEffect: "Secured capacity under 7.02(b) is $30m (still subject to 9.15's $25m); an answer from the base text is stale, and a consent without an amendment form is a common real-world document.",
    edits: [{ addDocument: { documentId: "consent", label: "Lender Consent", role: "AMENDMENT", text: "CONSENT dated as of October 1, 2026 under the Credit Agreement dated as of August 20, 2026, among Granite Peak Fabrication, Inc., as Borrower, the Lenders party hereto and Silverline Bank, as Administrative Agent.\n\nSECTION 1. Consent . The Required Lenders hereby consent to the creation by the Borrower of Liens securing Indebtedness permitted under Section 7.01(b) of the Credit Agreement in an aggregate principal amount not to exceed $30,000,000 at any time outstanding, notwithstanding the limitation in Section 7.02(b) of the Credit Agreement.\n\nSECTION 2. Effectiveness . This Consent shall become effective on October 1, 2026.\n" } }],
    expect: { changedSections: [], stableSections: ["7.02", "7.02(b)", "9.15"], nodeIdsStableFor: ["7.02", "7.02(b)", "9.15"],
      operativeState: [{ asOfDate: "2026-12-31", sectionRef: "7.02(b)", status: "CURRENT", instrumentStatusNot: "OPERATIVE_STATE_RESOLVED" }], effectsExpectedFrom: ["consent"],
      question: q("MUT-16-Q", "pkg-i-secured-debt-lien", "LIENS", "May the Borrower grant Liens securing $28,000,000 of general-basket Indebtedness as of 2026-12-31?", [{ documentId: "credit-agreement", sectionRef: "7.02(b)" }], "2026-12-31"), closureMustContain: ["credit-agreement#7.02", "credit-agreement#9.15", "consent#1"],
      survival: "GAP", survivalReason: "a consent is not an amendment drafting form; expected to be invisible to the amendment pipeline like the side letters (IPV-16, loosening direction)",
      afterFix: { observedOn: "PR #136 @ 8f87a0633ac3", survival: "GAP", killedByStages: [], note: "PR #136 @8f87a06: the consent yields two UNKNOWN_CHANGE/REVIEW_REQUIRED effects (7.02(b), 7.01(b)); instrument REVIEW_REQUIRED; PRODUCT verdicts OK; no manifest check fails (the 7.02(b) clause bundle is withheld but package I's manifest has no clause-level definitions row), so the mutant still SURVIVES at the deterministic layer - the legal effect is represented only as a review state." } } },
  // ---- OCR / scan-noise family (doc 19 assumption 1; ledger #23/#24): the parser must stay intact or fail closed, never merge silently ----
  { id: "MUT-17", kind: "OCR_NOISE", packageId: "pkg-a-basic-credit-agreement", description: "Spaced heading: 'SECTION 7.02 Liens' scanned as 'S E C T I O N 7.02 Liens'.", legalEffect: "None; a scan artefact.",
    edits: [{ documentId: "credit-agreement", find: "SECTION 7.02 Liens", replace: "S E C T I O N 7.02 Liens" }],
    expect: { changedSections: [], stableSections: ["7.03"], nodeIdsStableFor: ["7.01"], ocr: { ref: "7.02", distinctivePhrase: "shall not create any Lien on any property" },
      survival: "KILLED", survivalReason: "the manifest pins a 7.02 node; whether the mutant is killed by NOT_FOUND (fail-closed) or survives with an absorbed clause is the product verdict", killedByStages: ["STRUCTURE"] } },
  { id: "MUT-18", kind: "OCR_NOISE", packageId: "pkg-a-basic-credit-agreement", description: "Digit/letter confusion in a section number: 'SECTION 7.01' scanned as 'SECTION 7.0l'.", legalEffect: "None; a scan artefact on the debt covenant's heading.",
    edits: [{ documentId: "credit-agreement", find: "SECTION 7.01 Indebtedness", replace: "SECTION 7.0l Indebtedness" }],
    expect: { changedSections: [], stableSections: ["7.02", "7.03"], nodeIdsStableFor: ["7.02", "7.03"], ocr: { ref: "7.01", distinctivePhrase: "create, incur or assume any Indebtedness, except" },
      survival: "KILLED", survivalReason: "the manifest pins 7.01 and its clauses", killedByStages: ["STRUCTURE"] } },
  { id: "MUT-19", kind: "OCR_NOISE", packageId: "pkg-a-basic-credit-agreement", description: "Enumerator homoglyph: clause '(c)' scanned with a Cyrillic 'с'.", legalEffect: "None; a scan artefact on the ratio basket's enumerator.",
    edits: [{ documentId: "credit-agreement", find: "(c) Indebtedness of the Borrower, so long as", replace: "(с) Indebtedness of the Borrower, so long as" }],
    expect: { changedSections: ["7.01"], stableSections: ["7.02", "7.03"], nodeIdsStableFor: ["7.01(b)"], ocr: { ref: "7.01(c)", distinctivePhrase: "Consolidated Total Leverage Ratio does not exceed 3.50 to 1.00" },
      survival: "KILLED", survivalReason: "the manifest pins 7.01(c) and its text", killedByStages: ["STRUCTURE"] } },
  { id: "MUT-20", kind: "OCR_NOISE", packageId: "pkg-a-basic-credit-agreement", description: "Hard line wrap inside a clause with a hyphenated break: 'aggregate prin-\ncipal amount'.", legalEffect: "None; a scan artefact inside 7.01(b).",
    edits: [{ documentId: "credit-agreement", find: "in an aggregate principal amount not to exceed $30,000,000", replace: "in an aggregate prin-\ncipal amount not to exceed $30,000,000" }],
    expect: { changedSections: ["7.01(b)", "7.01"], stableSections: ["7.02", "7.03"], nodeIdsStableFor: ["7.01(b)"], ocr: { ref: "7.01(b)", distinctivePhrase: "$30,000,000" },
      survival: "KILLED", survivalReason: "the clause text hash changes", killedByStages: ["STRUCTURE"] } },
  { id: "MUT-21", kind: "OCR_NOISE", packageId: "pkg-h-unseen-composition", description: "Multi-document package: the ABL agreement's 'SECTION 7.03 Investments' scanned as 'S E C T I O N 7.03 Investments'.", legalEffect: "None; a scan artefact.",
    edits: [{ documentId: "abl-credit-agreement", find: "SECTION 7.03 Investments", replace: "S E C T I O N 7.03 Investments" }],
    expect: { changedSections: [], stableSections: ["7.11"], nodeIdsStableFor: ["7.02"], ocr: { ref: "7.03", distinctivePhrase: "shall not make any Investment" },
      survival: "KILLED", survivalReason: "the manifest pins 7.03 and its clauses", killedByStages: ["STRUCTURE"] } },
  { id: "MUT-22", kind: "OCR_NOISE", packageId: "pkg-h-unseen-composition", observeDocumentId: "intercreditor-agreement", description: "Intercreditor agreement: 'SECTION 4.01 Restriction on Payments' scanned as 'SECTION 4.0l'.", legalEffect: "None; a scan artefact on the payment restriction.",
    edits: [{ documentId: "intercreditor-agreement", find: "SECTION 4.01 Restriction on Payments", replace: "SECTION 4.0l Restriction on Payments" }],
    expect: { changedSections: [], stableSections: ["2.01"], nodeIdsStableFor: ["2.01"], ocr: { ref: "4.01", distinctivePhrase: "Availability would be less than $15,000,000" },
      survival: "KILLED", survivalReason: "the manifest pins intercreditor 4.01 (H-ICA-4.01)", killedByStages: ["STRUCTURE"] } },
];

export function renderMutationReport(obs: MutationObservation[], sha: string): string {
  const rows = obs.map((o) => `| ${o.mutationId} | ${o.kind} | ${o.packageId.replace(/^pkg-([a-z])-.*$/, "$1").toUpperCase()} | ${o.kill.verdict} | ${o.kill.predicted} | ${o.kill.predictionHeld ? "yes" : "NO"} | ${o.nodeIdSurvival.survived}/${o.nodeIdSurvival.total} | ${o.nodeIdSurvival.textHashSurvived}/${o.nodeIdSurvival.total} | ${o.verdicts.filter((v) => v.kind === "HARNESS" && v.ok).length}/${o.verdicts.filter((v) => v.kind === "HARNESS").length} | ${o.verdicts.filter((v) => v.kind === "PRODUCT" && v.ok).length}/${o.verdicts.filter((v) => v.kind === "PRODUCT").length} |`);
  const details = obs.map((o) => [`### ${o.mutationId} (${o.kind}, ${o.packageId})`, "", ...o.verdicts.map((v) => `- ${v.ok ? "✅" : "❌"} [${v.kind}] ${v.check} — ${v.detail}`), ...(o.kill.newFailures.length ? ["", "New deterministic failures (the unchanged manifest against the mutant):", ...o.kill.newFailures.map((f) => `- ${f.stage} ${f.ref} [${f.severity}]: ${f.actual}`)] : []), ...(o.kill.vanishedFailures.length ? ["", `Baseline failures that disappeared: ${o.kill.vanishedFailures.join(", ")}`] : []), ...(o.closure ? ["", `Hybrid closure: ${o.closure.units.join(", ")}${o.closure.unresolved.length ? ` | unresolved: ${o.closure.unresolved.join("; ")}` : ""}${o.closure.missingDocuments.length ? ` | missing: ${o.closure.missingDocuments.join("; ")}` : ""}`] : []), ""].join("\n"));
  return [`# Mutation suite run @ ${sha}`, "", "| Mutation | Operator | Pkg | Mutant | Predicted | Held | Node ids kept | Text hashes kept | Harness checks | Product checks |", "|---|---|---|---|---|---|---|---|---|---|", ...rows, "", ...details].join("\n");
}
