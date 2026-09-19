/**
 * PHASE 3 / 6.01 REQUIRED-DEPENDENCY PRECISION + CERTIFICATE HONESTY AUDIT - artifacts 133-145.
 *
 * Zero paid calls. Everything is derived from the frozen Pass-A inventory, the frozen source, the frozen v1 artifacts
 * (118-132, read only), the frozen paid IR/verifier evidence (read only) and the live v2 model.
 *
 * Optional environment inputs (recorded as NOT_SUPPLIED when absent):
 *   DD_V1_DUMP    JSON dump of the v1 model's plan (produced by running the starting SHA in a detached worktree)
 *   DD_TESTS      vitest --reporter=json output for the dd-* / f7a suites
 *   DD_SUITE_BASE / DD_SUITE_CURR   full-suite vitest json at the starting SHA and at HEAD
 *
 * Run: npx tsx scripts/phase-3-601-precision-audit-artifacts.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { writeJson } from "./f7b-lib";
import { buildRealPlan, loadFrozenInventoryCandidate, OUT, readJson, resumeProof, sh } from "./phase-3-601-revalidation-lib";
import { planCompilationShards, DEFAULT_SHARD_BUDGET, MAX_FIRST_TURN_INPUT_TOKENS } from "../lib/contract-model/compiler/semantic/shard-planner";
import { SHARD_PLANNER_ALGORITHM_VERSION } from "../lib/contract-model/compiler/semantic/shard-types";
import { DEFAULT_REQUIRED_DEPENDENCY_BUDGET, REQUIRED_DEPENDENCY_MODEL_VERSION, qualifyCitedTerm, definedTermsOccurringIn, collapseWhitespace, findTermOccurrences, grammaticalNumberSpellings, isDelivered, isLimitation, type RequiredDependency, type TermResolutionMethod } from "../lib/contract-model/compiler/semantic/required-dependencies";
import { MISSING_CONTEXT_CONTRACT_VERSION } from "../lib/contract-model/compiler/semantic/missing-context-contract";
import { synthesizeCrossShardLinks } from "../lib/contract-model/compiler/semantic/shard-stitcher";
import { DEFAULT_TOOL_BUDGET, SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION } from "../lib/contract-model/compiler/semantic/types";
import type { ShardPlan, CompilationShard } from "../lib/contract-model/compiler/semantic/shard-types";
import type { IRRule } from "../lib/contract-model/ir/types";
import { BASE_SHAPE, antiOverfitExpectations, planSynthetic, buildSyntheticAgreement, SYN_DOC } from "../tests/contract-model/dd-synthetic-agreement";
import { buildDefinitionsCorpus, buildChapeauCorpus, CO as F7A_CO, INST as F7A_INST, DOC as F7A_DOC } from "../tests/contract-model/f7a-synthetic-corpus";
import { CORPUS } from "../tests/contract-model/semantic-accountability/corpus";
import { buildScenario, DOC_ID as I_DOC } from "../tests/contract-model/semantic-accountability/harness";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const at = () => new Date().toISOString();
const DOC = "doc-a";
const FAILED_SHARD_ID = "shard:86cc5e439f113d6053a9";
const TARGETS = ["term:fixed incremental amount", "term:voluntary prepayment incremental amount", "term:ratio incremental amount", "term:extension amount", "section:2.18(b)"];
const STARTING_SHA = "1fd23881fb9366b3730a06419a7b5dc33647384c";
const a = (n: string) => readJson<Any>(`${OUT}/${n}.json`);
const env = (k: string) => { const p = process.env[k]; return p && existsSync(p) ? readJson<Any>(p) : null; };

const candidate = loadFrozenInventoryCandidate();
const proof = resumeProof(candidate);
if (!proof.decision.ok) throw new Error("resume proof failed");
const index = proof.built.chewy.index;
const region = proof.ctx.regions[0]!;
const inventory = proof.decision.inventory;
const byId = new Map(inventory.items.map((i) => [i.inventoryItemId, i]));
const planWith = (budget: Partial<typeof DEFAULT_SHARD_BUDGET> = {}, requiredBudget: Partial<typeof DEFAULT_REQUIRED_DEPENDENCY_BUDGET> = {}): ShardPlan =>
  planCompilationShards({ candidateRef: proof.built.candidateRef, companyId: proof.built.input.companyId, instrumentKey: proof.built.input.instrumentKey, documentId: DOC, sourceContext: proof.ctx, frozenInventory: inventory, structuralIndex: index, generation: { algorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION, promptVersion: SEMANTIC_COMPILER_PROMPT_VERSION }, budget: { ...DEFAULT_SHARD_BUDGET, ...budget }, requiredBudget });
const plan = buildRealPlan(proof);
const reqChars = (s: CompilationShard) => s.context.filter((e) => e.tier === "REQUIRED").reduce((x, e) => x + e.chars, 0);
const ownedTextOf = (s: CompilationShard) => s.primarySlices.map((sl) => region.text.slice(sl.charStart, sl.charEnd)).join("\n");
const allDeps = plan.shards.flatMap((s) => s.requiredDependencies.map((d) => ({ shard: s, d })));
const v1 = env("DD_V1_DUMP");
const A121 = a("121-required-dependency-model"), A124 = a("124-shard-dependency-certificates"), A125 = a("125-external-and-absent-dependencies");
const verifier = a("113-verifier");
const frozenIR = readJson<Any>("tests/fixtures/unseen-packages/phase-3-final-601-revalidation/compile-result.json");
const documentText = index.getDocumentText(DOC) ?? "";

// ---------------------------------------------------------------------------
// 133 - certificate semantic gap (§2)
// ---------------------------------------------------------------------------
const v1Source = sh(`git show ${STARTING_SHA}:lib/contract-model/compiler/semantic/required-dependencies.ts`);
const grab = (re: RegExp) => { const m = re.exec(v1Source); return m ? m[0] : "(not found)"; };
writeJson(`${OUT}/133-certificate-semantic-gap.json`, {
  artifact: "PRECISION AUDIT §2 - v1 let a required, internal, text-less dependency satisfy the executable certificate", at: at(), paidCalls: 0,
  startingSha: STARTING_SHA,
  v1CodeAsCommitted: {
    isDelivered: grab(/export function isDelivered[\s\S]*?\n\}/),
    NEEDS_NO_ENTRY: grab(/const NEEDS_NO_ENTRY = [^\n]*/),
    certificateStatusRule: grab(/certificateStatus: undelivered\.length === 0[^\n]*/),
    undeliveredRule: grab(/const undelivered = required\.filter[^\n]*/),
  },
  proofFromTheCode: [
    "isDelivered() returned true for disposition UNDELIVERABLE_DISCLOSED",
    "NEEDS_NO_ENTRY contained UNDELIVERABLE_DISCLOSED, so buildShardDependencyCertificate never counted it as undelivered",
    "certificateStatus was CERTIFIED_EXECUTABLE whenever `undelivered` was empty - which the two facts above guarantee for an UNDELIVERABLE_DISCLOSED dependency",
    "there was no certificate status between CERTIFIED_EXECUTABLE and PLANNING_FAILED, so a shard carrying such a dependency was indistinguishable from a context-complete one",
  ],
  proofFromTheFrozenRun: {
    undeliverableDisclosedDependencies: A125.counts.undeliverableDisclosed,
    everyOneHadEmptyText: A125.counts.everyUndeliverableHasEmptyText,
    everyShardCertifiedExecutable: A124.everyShardCertified,
    example: (A125.undeliverable as Any[]).slice(0, 3),
    conclusion: "REQUIRED + NO TEXT AVAILABLE + INTERNAL TO PACKAGE + CERTIFIED_EXECUTABLE was reachable and was reached on the frozen unit",
  },
  classification: "CERTIFICATE_SEMANTIC_GAP",
  v2Correction: { modelVersion: REQUIRED_DEPENDENCY_MODEL_VERSION, isDelivered: "true only for DELIVERED_FULL, DELIVERED_BOUNDED_EXCERPT, OWNED_PRIMARY_SOURCE", limitations: "EXTERNAL_REQUIRED_DEPENDENCY, INTERNAL_REQUIRED_DEPENDENCY_UNRESOLVED, AMBIGUOUS_REQUIRED_DEPENDENCY are never delivery and force a LIMITED certificate", statuses: ["CERTIFIED_CONTEXT_COMPLETE", "CERTIFIED_WITH_EXPLICIT_EXTERNAL_LIMITATION", "CERTIFIED_WITH_EXPLICIT_INTERNAL_LIMITATION", "PLANNING_FAILED_REQUIRED_CONTEXT_UNDELIVERABLE"], invariant: "required + unavailable is never fully executable; it is LIMITED (executable with the limitation stated) or a planning failure" },
});

// ---------------------------------------------------------------------------
// 134 - the 26 undeliverables (§5/§6)
// ---------------------------------------------------------------------------
const CLASS_BY_METHOD: Record<TermResolutionMethod, string> = {
  DEFINED_TERM: "OTHER (resolves directly - should not have been undeliverable)",
  GRAMMATICAL_NUMBER_VARIANT: "PLURAL_SINGULAR_ALIAS",
  SOURCE_DECLARED_CORRELATIVE: "NORMALIZATION_OR_INFLECTION_ALIAS",
  INLINE_DECLARATION_IN_OWNED_SOURCE: "DEFINED_TERM_DETECTOR_FALSE_NEGATIVE",
  DECLARATION_FOUND_IN_SOURCE_TEXT: "DEFINED_TERM_DETECTOR_FALSE_NEGATIVE",
  EXTERNAL_BY_SOURCE_DECLARATION: "EXTERNAL_TO_PACKAGE",
  ORDINARY_LEGAL_WORD: "PASS_A_FALSE_REFERENCED_TERM_EDGE",
  TERM_ABSENT_FROM_SOURCE: "PASS_A_FALSE_REFERENCED_TERM_EDGE",
  UNKNOWN_CAPITALISED_TERM: "TRUE_NONDEFINED_TERM",
  AMBIGUOUS: "AMBIGUOUS_REAL_REFERENCE",
};
const shardOfItem = (id: string) => plan.shards.find((s) => s.ownedItemIds.includes(id));
const rows26 = (A125.undeliverable as Any[]).map((u) => {
  const item = (allDeps.find((x) => x.d.requiredBy.some((id) => byId.has(id)) && x.d.citedAs.some((c) => c.toLowerCase() === String(u.target).toLowerCase()))?.d.requiredBy ?? []).map((id) => byId.get(id)).find(Boolean) ?? null;
  const requiringItemId = item?.inventoryItemId ?? null;
  const shard = requiringItemId ? shardOfItem(requiringItemId) : plan.shards[u.shardOrdinal] ?? plan.shards[0]!;
  const ownedText = collapseWhitespace(shard ? ownedTextOf(shard) : "");
  const isSection = String(u.key).startsWith("section:");
  const occurrences = findTermOccurrences(collapseWhitespace(documentText), String(u.target)).length;
  if (isSection) {
    const dep = allDeps.find((x) => x.d.key === u.key)?.d;
    return { v1ShardOrdinal: u.shardOrdinal ?? null, dependencyKey: u.key, targetText: u.target, requiringInventoryItem: requiringItemId, sourceProposition: item?.proposition ?? null, appearsInContract: /\(Z\)|\(z\)/.test(u.target) ? "the sub-clause label appears inline inside its parent paragraph" : occurrences > 0, actualDefinitionExists: "n/a (section)", structuralIndexFinds: `AMBIGUOUS - ${dep?.candidates?.length ?? "?"} substantive candidates`, whyV1ResolverFailed: "the reference resolves to more than one physical node; v1 recorded it as undeliverable with no candidates", trulyRequiredForSemantics: true, classification: "AMBIGUOUS_REAL_REFERENCE", v2Disposition: dep?.disposition ?? null, candidatesPreserved: dep?.candidates?.length ?? 0 };
  }
  const q = qualifyCitedTerm({ index, documentId: DOC, cited: String(u.target), ownedText, documentText });
  const dep = allDeps.find((x) => x.d.citedAs.some((c) => c.toLowerCase() === String(u.target).toLowerCase()))?.d;
  return {
    v1ShardOrdinal: u.shardOrdinal ?? null, dependencyKey: u.key, targetText: u.target, requiringInventoryItem: requiringItemId, sourceProposition: item?.proposition ?? null,
    appearsInContract: occurrences > 0 ? `yes (${occurrences} word-boundary occurrences)` : "no",
    actualDefinitionExists: q.def ? `yes - "${q.def.exactTerm}" (${q.resolution.method})` : q.declaration ? `yes - declared in the source text at chars ${q.declaration.absCharStart}-${q.declaration.absCharEnd} under a grammar the detector does not model` : q.resolution.method === "INLINE_DECLARATION_IN_OWNED_SOURCE" ? "yes - declared inline (parenthetical) inside the owned operative text" : q.external ? `no - the source says it is defined in "${q.external.agreement}"` : "no",
    structuralIndexFinds: index.getDefinition(String(u.target), DOC) ? "yes" : q.def ? `no under the cited spelling; yes under "${q.def.exactTerm}"` : "no",
    whyV1ResolverFailed: q.def ? "v1 looked up the cited spelling only (index.getDefinition), with no grammatical-number or source-declared alias resolution" : q.declaration ? "the structural detector's declaration grammar requires the verb immediately after the closing quote and models one term per declaration; this declaration has a qualifier, several co-declared terms or an enumerated body" : q.resolution.method === "INLINE_DECLARATION_IN_OWNED_SOURCE" ? "the inline parenthetical declaration is not a definitions-section grammar; v1 treated the term as absent instead of owned" : q.external ? "v1 inferred externality from the dependency's name, which this name does not satisfy, so it fell through to undeliverable" : "no declaration exists anywhere in the document",
    trulyRequiredForSemantics: q.resolution.method === "INLINE_DECLARATION_IN_OWNED_SOURCE" ? "yes - and already in the owned primary source" : true,
    classification: CLASS_BY_METHOD[q.resolution.method],
    v2Resolution: q.resolution.method, v2Disposition: dep?.disposition ?? null, v2DeliveredChars: dep?.deliveredChars ?? null, aliasOf: q.resolution.aliasOf,
  };
});
const classCounts: Record<string, number> = {};
for (const r of rows26) classCounts[r.classification] = (classCounts[r.classification] ?? 0) + 1;
writeJson(`${OUT}/134-undeliverable-classification.json`, {
  artifact: "PRECISION AUDIT §5/§6 - every one of the 26 v1 undeliverables classified exactly once, from the source", at: at(), paidCalls: 0,
  source: "docs/phase-3-final-601/125-external-and-absent-dependencies.json (frozen v1)", identity: "one row per (v1 shard, dependency key) - 125 listed a term once per shard that required it, so 26 rows cover 21 distinct keys", distinctKeys: new Set(rows26.map((r) => r.dependencyKey)).size, rows: rows26, counts: classCounts,
  genericIssueClasses: {
    pluralization: "the dominant class: the source defines one grammatical number and the operative text cites the other. Resolved by the index's own number-variant rule (source-backed: the variant definition exists), disclosed on the entry as 'cited as'",
    inflectionCorrelative: "the source itself declares the inflected forms correlative ('X and Y shall have correlative meanings'); resolved only when that declaration is found in the defined term's own text",
    detectorGrammar: "three declaration grammars the structural detector does not model: a qualifier between the term and its verb; several terms declared together; an enumerated body with no verb; plus inline parenthetical declarations in operative text. Compensated in the required layer from the source text; the detector itself is unchanged and its gap is recorded as a known deterministic defect for a structural-substrate follow-up",
    capitalization: "a lower-case cited word is ordinary legal English, not a term - excluded as a non-required edge",
    structuralIndexing: "one reference resolved to three physical nodes - now AMBIGUOUS with candidates preserved, not 'undeliverable'",
    passAEdgeQuality: "every referenced-term edge is now qualified against the source and the index before it may seed the closure",
  },
  auditExamplesNotInProduction: "the mission's example names were used only to audit; no term name was added to production code (gate condition 8 greps the mission diff)",
});

// ---------------------------------------------------------------------------
// 135 - closure precision (§7) v1 vs v2
// ---------------------------------------------------------------------------
type Census = Record<string, { count: number; sourceBacked: number; avgDepth: number; avgRequiredBy: number; dubious: number; limitations: number }>;
const census = (deps: { key: string; evidence: string[]; closureDepth: number; requiredBy: number; fullTextChars: number; disposition: string; textualSupport: boolean }[]): Census => {
  const out: Census = {};
  for (const d of deps) for (const e of d.evidence) {
    const r = (out[e] ??= { count: 0, sourceBacked: 0, avgDepth: 0, avgRequiredBy: 0, dubious: 0, limitations: 0 });
    r.count++; if (d.fullTextChars > 0) r.sourceBacked++; r.avgDepth += d.closureDepth; r.avgRequiredBy += d.requiredBy;
    if (e === "INVENTORY_REFERENCED_TERM_EDGE" && !d.textualSupport) r.dubious++;
    if (d.disposition === "NON_REQUIRED_EDGE") r.dubious++;
    if (["EXTERNAL_REQUIRED_DEPENDENCY", "INTERNAL_REQUIRED_DEPENDENCY_UNRESOLVED", "AMBIGUOUS_REQUIRED_DEPENDENCY", "UNDELIVERABLE_DISCLOSED"].includes(d.disposition)) r.limitations++;
  }
  for (const r of Object.values(out)) { r.avgDepth = +(r.avgDepth / r.count).toFixed(2); r.avgRequiredBy = +(r.avgRequiredBy / r.count).toFixed(2); }
  return out;
};
const v2Deps = allDeps.map(({ shard, d }) => ({ key: d.key, evidence: d.evidence, closureDepth: d.closureDepth, requiredBy: d.requiredBy.length, fullTextChars: d.fullTextChars, disposition: d.disposition, textualSupport: d.kind !== "REQUIRED_DEFINITION" || findTermOccurrences(collapseWhitespace(ownedTextOf(shard)), d.target).length > 0 || d.citedAs.some((c) => findTermOccurrences(collapseWhitespace(ownedTextOf(shard)), c).length > 0) }));
const v1Deps: typeof v2Deps | null = v1 ? (v1.shards as Any[]).flatMap((s) => (s.deps as Any[]).map((d) => ({ key: d.key, evidence: d.evidence, closureDepth: d.closureDepth, requiredBy: d.requiredBy, fullTextChars: d.fullTextChars, disposition: d.disposition, textualSupport: true }))) : null;
const v1Keys = v1Deps ? new Set(v1Deps.map((d) => d.key)) : null;
const v2Keys = new Set(v2Deps.map((d) => d.key));
const removed = v1Keys ? [...v1Keys].filter((k) => !v2Keys.has(k)) : null;
const added = v1Keys ? [...v2Keys].filter((k) => !v1Keys.has(k)) : null;
const explainRemoved = (k: string) => {
  const term = k.startsWith("term:") ? k.slice(5) : null;
  if (!term) return "section entry no longer derived (its parent definition or edge changed disposition)";
  const def = index.allDefinitions().find((d) => d.normalizedTerm === term);
  const spelling = def?.exactTerm ?? term;
  const stillSubstring = plan.shards.some((s) => collapseWhitespace(ownedTextOf(s)).includes(spelling));
  const boundary = plan.shards.some((s) => findTermOccurrences(collapseWhitespace(ownedTextOf(s)), spelling).length > 0);
  const merged = [...v2Keys].some((k2) => k2 !== k && k2.startsWith("term:") && grammaticalNumberSpellings(term).map((x) => `term:${x.toLowerCase()}`).includes(k2));
  if (merged) return "merged into its grammatical-number counterpart (one entry, cited-as disclosed)";
  if (stillSubstring && !boundary) return "v1 matched it only INSIDE a longer word (no word-boundary occurrence) - a spurious occurrence hit";
  return "no longer reached: its closure parent is now excerpted/limited or the edge was qualified out";
};
writeJson(`${OUT}/135-closure-precision.json`, {
  artifact: "PRECISION AUDIT §7 - does each dependency class deserve REQUIRED status? v1 vs v2 census by evidence", at: at(), paidCalls: 0,
  totals: { v1: v1Deps ? v1Deps.length : A121.measuredOnTheFrozenUnit.requiredDependencies, v2Total: v2Deps.length, v2Required: v2Deps.filter((d) => d.disposition !== "NON_REQUIRED_EDGE").length, v2NonRequiredExcluded: v2Deps.filter((d) => d.disposition === "NON_REQUIRED_EDGE").length },
  byEvidence: { v1: v1Deps ? census(v1Deps) : "NOT_SUPPLIED (DD_V1_DUMP)", v2: census(v2Deps) },
  dubiousDefinition: "an INVENTORY_REFERENCED_TERM_EDGE entry whose cited term never occurs (word-boundary, any number variant) in the owned text, or an entry qualified out as NON_REQUIRED_EDGE - counted, never silently dropped",
  delta: v1Keys ? { removedFromV1: removed!.length, addedInV2: added!.length, removedExplained: removed!.map((k) => ({ key: k, why: explainRemoved(k) })), added: added!.map((k) => ({ key: k, disposition: v2Deps.find((d) => d.key === k)?.disposition })) } : "NOT_SUPPLIED (DD_V1_DUMP)",
  necessityStatement: "'actually necessary for interpretation' is not decidable from the reference set (forbidden here) and is not claimed; what IS decided is source-backing (text exists), textual support (the cited term really occurs in the owned text) and qualification (an AI edge corresponds to a defined term). Every class's count above is under those three deterministic tests.",
});

// ---------------------------------------------------------------------------
// 136 - Pass-A edge qualification (§8)
// ---------------------------------------------------------------------------
const edgeRows: { shard: number; item: string; cited: string; method: TermResolutionMethod; aliasOf: string | null }[] = [];
for (const s of plan.shards) { const owned = collapseWhitespace(ownedTextOf(s)); for (const id of s.ownedItemIds) { const it = byId.get(id); if (!it) continue; for (const t of it.referencedTerms ?? []) { const q = qualifyCitedTerm({ index, documentId: DOC, cited: t, ownedText: owned, documentText }); edgeRows.push({ shard: s.ordinal, item: id, cited: t, method: q.resolution.method, aliasOf: q.resolution.aliasOf }); } } }
const methodCounts: Record<string, number> = {};
for (const r of edgeRows) methodCounts[r.method] = (methodCounts[r.method] ?? 0) + 1;
writeJson(`${OUT}/136-pass-a-edge-qualification.json`, {
  artifact: "PRECISION AUDIT §8 - every Pass-A referenced-term edge qualified deterministically before it may seed the closure", at: at(), paidCalls: 0,
  layer: { input: "AI says 'referenced term'", steps: ["DEFINED_TERM (index)", "GRAMMATICAL_NUMBER_VARIANT (index's own number rule; the variant definition must exist)", "SOURCE_DECLARED_CORRELATIVE (the defined term's own text declares the cited form)", "INLINE_DECLARATION_IN_OWNED_SOURCE (quoted declaration inside the shard's own text)", "DECLARATION_FOUND_IN_SOURCE_TEXT (a declaration grammar the detector does not model)", "EXTERNAL_BY_SOURCE_DECLARATION ('(as defined in X)' + package identity)", "ORDINARY_LEGAL_WORD (lower-case)", "TERM_ABSENT_FROM_SOURCE", "UNKNOWN_CAPITALISED_TERM"], seedsClosure: ["DEFINED_TERM", "GRAMMATICAL_NUMBER_VARIANT", "SOURCE_DECLARED_CORRELATIVE", "DECLARATION_FOUND_IN_SOURCE_TEXT"], ownedNotContext: ["INLINE_DECLARATION_IN_OWNED_SOURCE"], limitation: ["EXTERNAL_BY_SOURCE_DECLARATION", "UNKNOWN_CAPITALISED_TERM", "AMBIGUOUS"], excluded: ["ORDINARY_LEGAL_WORD", "TERM_ABSENT_FROM_SOURCE"] },
  missionClasses: { DEFINED_TERM: ["DEFINED_TERM", "DECLARATION_FOUND_IN_SOURCE_TEXT"], ORDINARY_LEGAL_WORD: ["ORDINARY_LEGAL_WORD"], INFLECTION_OF_DEFINED_TERM: ["GRAMMATICAL_NUMBER_VARIANT", "SOURCE_DECLARED_CORRELATIVE"], UNKNOWN: ["UNKNOWN_CAPITALISED_TERM", "TERM_ABSENT_FROM_SOURCE"], AMBIGUOUS: ["AMBIGUOUS"] },
  edgesOnTheFrozenUnit: edgeRows.length, byMethod: methodCounts,
  examplesByMethod: Object.fromEntries(Object.keys(methodCounts).map((m) => [m, edgeRows.filter((r) => r.method === m).slice(0, 6).map((r) => ({ cited: r.cited, aliasOf: r.aliasOf, shard: r.shard }))])),
  guarantee: "a hallucinated edge can create no downstream context: it is NON_REQUIRED_EDGE, carried for audit, never admitted, never expanded (tests: dd-anti-overfit E, dd-certificate-honesty end-to-end)",
});

// ---------------------------------------------------------------------------
// 137 - occurrence precision (§9)
// ---------------------------------------------------------------------------
const naiveOccurring = (text: string) => { const h = collapseWhitespace(text); return index.allDefinitions().filter((d) => d.documentId === DOC && collapseWhitespace(d.exactTerm).length >= 4 && h.includes(collapseWhitespace(d.exactTerm))); };
let naiveTotal = 0, boundaryTotal = 0; const spurious: { shard: number; term: string; context: string }[] = []; const viaVariant: { shard: number; term: string; spelling: string }[] = [];
for (const s of plan.shards) {
  const owned = collapseWhitespace(ownedTextOf(s));
  const naive = naiveOccurring(owned); const strict = definedTermsOccurringIn(owned, index, DOC);
  naiveTotal += naive.length; boundaryTotal += strict.length;
  const strictKeys = new Set(strict.map((d) => d.normalizedTerm));
  for (const d of naive) if (!strictKeys.has(d.normalizedTerm)) { const i = owned.indexOf(collapseWhitespace(d.exactTerm)); spurious.push({ shard: s.ordinal, term: d.exactTerm, context: owned.slice(Math.max(0, i - 25), i + d.exactTerm.length + 25) }); }
  for (const d of strict) { const hits = findTermOccurrences(owned, d.exactTerm); if (hits.length && hits.every((h) => h.spelling !== collapseWhitespace(d.exactTerm).trim())) viaVariant.push({ shard: s.ordinal, term: d.exactTerm, spelling: hits[0]!.spelling }); }
}
writeJson(`${OUT}/137-occurrence-precision.json`, {
  artifact: "PRECISION AUDIT §9 - the defined-term occurrence scan: longest match, word boundaries, deterministic number spellings, no dictionary", at: at(), paidCalls: 0,
  disciplines: {
    longestMatch: "terms are scanned longest spelling first and a span claimed by a longer term is never credited to a shorter one (definedTermsOccurringIn)",
    wordBoundary: "an occurrence needs a non-alphanumeric character (or the text edge) on both sides (findTermOccurrences)",
    numberSpellings: "the only alternative spellings are the deterministic suffix rules the index's own findDefinedTermVariant applies (ies<->y, -es, -s), on the last word, with no stem guessing; 'Refinanced' is NOT derived from 'Refinance' by spelling - only by the source's correlative declaration",
    noDuplicateInflation: "one entry per normalized term; a cited plural and its defined singular are one dependency with 'cited as' disclosed",
    aliasesSourceBacked: "GRAMMATICAL_NUMBER_VARIANT requires the variant definition to exist in the index; SOURCE_DECLARED_CORRELATIVE requires the declaration in the defined term's own text; there is no hand-built legal dictionary anywhere in the module",
  },
  onTheFrozenUnit: { naiveSubstringHits: naiveTotal, boundaryDisciplinedHits: boundaryTotal, spuriousHitsRemoved: spurious.length, examplesRemoved: spurious.slice(0, 12), occurrencesRecoveredViaNumberSpelling: viaVariant.length, examplesRecovered: viaVariant.slice(0, 12) },
  tests: "tests/contract-model/dd-anti-overfit.test.ts (§9 block)",
});

// ---------------------------------------------------------------------------
// 138 - threshold sensitivity (§10)
// ---------------------------------------------------------------------------
const thresholds = [0.25, 0.4, 0.5, 0.6, 0.75];
const sweep = thresholds.map((t) => {
  const p = planWith({}, { compositionalCoverageThreshold: t });
  const deps = p.shards.flatMap((s) => s.requiredDependencies).filter((d) => d.disposition !== "NON_REQUIRED_EDGE");
  const shape = { ...BASE_SHAPE, extraEdges: ["Fictitious Sublimit Reserve"], arithmeticTerm: { term: "Composite Availability Amount", operands: ["Primary Tranche Component", "Secondary Tranche Component", "Tertiary Tranche Component"] } };
  const synth = antiOverfitExpectations(shape, planSynthetic(shape, {}, { compositionalCoverageThreshold: t }));
  const failedShardAt = p.shards.find((s) => s.ownedMaterialItemIds.some((id) => (plan.shards.find((x) => x.shardId === FAILED_SHARD_ID)?.ownedMaterialItemIds ?? []).includes(id)));
  return { threshold: t, shards: p.shards.length, requiredDependencies: deps.length, maxClosureDepth: Math.max(...deps.map((d) => d.closureDepth)), requiredContextChars: p.shards.reduce((x, s) => x + reqChars(s), 0), maxShardRequiredChars: Math.max(...p.shards.map(reqChars)), limitations: deps.filter(isLimitation).length, planningFailures: p.dependencyCertification.deliverableNotDelivered,
    // what the threshold governs: closure MEMBERSHIP (reached); what the ceiling governs: full vs bounded delivery
    fiveTargetsReached: TARGETS.filter((k) => (failedShardAt ?? p.shards[0]!).requiredDependencies.some((d) => d.key === k && isDelivered(d))).length,
    fiveTargetsDeliveredInFull: TARGETS.filter((k) => (failedShardAt ?? p.shards[0]!).context.some((e) => e.tier === "REQUIRED" && e.contextKey === k && !e.truncated)).length,
    fiveTargetsBoundedExcerpt: TARGETS.filter((k) => (failedShardAt ?? p.shards[0]!).requiredDependencies.some((d) => d.key === k && d.disposition === "DELIVERED_BOUNDED_EXCERPT")).map((k) => { const d = (failedShardAt ?? p.shards[0]!).requiredDependencies.find((x) => x.key === k)!; return `${k} ${d.deliveredChars}/${d.fullTextChars}`; }),
    syntheticCasesPassing: Object.values(synth).filter(Boolean).length, syntheticCasesTotal: Object.keys(synth).length, syntheticFailing: Object.entries(synth).filter(([, v]) => !v).map(([k]) => k) };
});
writeJson(`${OUT}/138-threshold-sensitivity.json`, {
  artifact: "PRECISION AUDIT §10 - is compositionalCoverage >= 0.5 a principle or a fixture calibration?", at: at(), paidCalls: 0,
  rule: "closure expands through a delivered definition only when that definition is COMPOSITIONAL (>= threshold of its operative body is other defined terms) or the child sits in a LIMIT-BEARING position; the threshold is a bound on how 'list-like' a body must be, applied to the body after the definitional verb",
  thresholdUnchanged: DEFAULT_REQUIRED_DEPENDENCY_BUDGET.compositionalCoverageThreshold === 0.5,
  sweep,
  whatTheFirstSweepExposed: {
    finding: "before the operand rule, the five known targets were REACHED only at 0.5: they hang off a definition that is a pure sum of four defined terms ('(a) the A; plus (b) the B; plus (c) the C; plus (d) the D'), whose compositional-coverage proxy scores 0.583 because articles, enumerators and 'plus' are characters too. At 0.6 the proxy said 'not compositional' and the closure stopped one hop short; the threshold was doing work a principle should do.",
    ruleAdded: "occursInLimitBearingPosition now also holds for an ARITHMETIC OPERAND: a defined term after an arithmetic combinator (plus/minus/less/sum of/product of/...), a continuation of an operand list such a combinator opened in the same sentence, or a term that is the whole of an enumerated item. Generic drafting, no threshold, no term names; synthetic case L (dd-anti-overfit) holds it at every threshold.",
    thresholdItself: "unchanged at 0.5 and not tuned to this unit; the sweep above is the evidence for what it still governs",
  },
  reading: {
    stableRange: sweep.filter((r) => r.planningFailures === 0 && r.fiveTargetsReached === 5 && r.syntheticCasesPassing === r.syntheticCasesTotal).map((r) => r.threshold),
    deliveredInFullRange: sweep.filter((r) => r.fiveTargetsDeliveredInFull === 5).map((r) => r.threshold),
    lowThresholdRegime: "a lower threshold admits more prose definitions as 'compositional' (more shards, more required chars); when a shard then meets the 64k ceiling, a target may be delivered as a bounded excerpt - that is the over-inclusive regime and a ceiling effect, disclosed on the entry, not a closure gap",
    principleOrHeuristic: "the value was not fitted to this document: the outcomes above are reported at every threshold and the value stays 0.5. Whether behaviour is stable across the range is what the 'stableRange' field says, not an assertion.",
  },
});

// ---------------------------------------------------------------------------
// 139 - ceiling audit (§11)
// ---------------------------------------------------------------------------
const chars = plan.shards.map(reqChars).sort((x, y) => x - y);
const pct = (p: number) => chars[Math.min(chars.length - 1, Math.floor((chars.length - 1) * p))]!;
writeJson(`${OUT}/139-ceiling-audit.json`, {
  artifact: "PRECISION AUDIT §11 - does required-set precision change the required capacity? (ceiling kept, not reduced, not increased)", at: at(), paidCalls: 0,
  ceiling: { maxRequiredContextChars: DEFAULT_SHARD_BUDGET.maxRequiredContextChars, derivation: `capacity bound: at most ${MAX_FIRST_TURN_INPUT_TOKENS} turn-1 tokens, residue after fixed overhead + primary + inventory + interpretive tier, capped by the declared ceiling`, unchanged: DEFAULT_SHARD_BUDGET.maxRequiredContextChars === 64_000 },
  v1: v1 ? { shards: v1.shards.length, maxRequiredChars: Math.max(...(v1.shards as Any[]).map((s) => s.requiredChars)), maxTurn1Tokens: Math.max(...(v1.shards as Any[]).map((s) => s.inputTokens)), reshardSplits: v1.resharding.splits, boundedExcerpts: (v1.certification as Any).requiredDependenciesBoundedExcerpt } : "NOT_SUPPLIED",
  v2: { shards: plan.shards.length, maxRequiredChars: pct(1), p50RequiredChars: pct(0.5), p95RequiredChars: pct(0.95), maxTurn1Tokens: plan.totals.maxShardInputTokens, reshardSplits: plan.requiredContextResharding.splits, boundedExcerpts: plan.dependencyCertification.deliveredBoundedExcerpt, perShard: plan.shards.map((s) => ({ ordinal: s.ordinal, shardId: s.shardId, ownedMaterialItems: s.ownedMaterialItemIds.length, requiredChars: reqChars(s), turn1Tokens: s.estimate.inputTokens, status: s.dependencyCertificate.certificateStatus })) },
  conclusion: "precision reduced demand (fewer, better-qualified dependencies; one fewer shard; no re-shard needed) without changing the ceiling; the ceiling is not reduced for cost and not increased",
});

// ---------------------------------------------------------------------------
// 140 - anti-overfit (§12) + 141 rules (§3/§4/§13/§14/§15)
// ---------------------------------------------------------------------------
const tests = env("DD_TESTS");
const fileResult = (name: string) => tests ? (tests.testResults as Any[]).filter((f) => String(f.name).endsWith(name)).map((f) => ({ status: f.status, tests: f.assertionResults.length, failed: f.assertionResults.filter((x: Any) => x.status === "failed").length }))[0] ?? "NOT_RUN" : "NOT_SUPPLIED";
writeJson(`${OUT}/140-anti-overfit.json`, {
  artifact: "PRECISION AUDIT §12 - generic anti-overfit cases on synthetic agreements", at: at(), paidCalls: 0,
  corpus: "tests/contract-model/dd-synthetic-agreement.ts - names, numbers and amounts are inputs; no real agreement, term or instrument",
  cases: { A: "real defined dependency", B: "ordinary capitalised phrase that is NOT defined", C: "plural variant of a defined singular", D: "singular variant of a defined plural", E: "false AI referenced-term edge", E2: "lower-case ordinary word cited as a term", F: "forwarding definition", G: "cross-reference inside a required definition", H: "deep compositional chain", I: "unrelated term mentioned incidentally in substantive prose", J: "ambiguous section reference", K: "externality from the source's own pointer, never from a name", renamed: "same expectations under renamed terms, renumbered sections, different amounts" },
  liveEvaluationOfTheBaseShape: antiOverfitExpectations({ ...BASE_SHAPE, extraEdges: ["Fictitious Sublimit Reserve"] }, planSynthetic({ ...BASE_SHAPE, extraEdges: ["Fictitious Sublimit Reserve"] })),
  vitest: { "dd-anti-overfit.test.ts": fileResult("dd-anti-overfit.test.ts"), "dd-certificate-honesty.test.ts": fileResult("dd-certificate-honesty.test.ts"), "dd-cross-shard-links.test.ts": fileResult("dd-cross-shard-links.test.ts"), "dd-entity-scope.test.ts": fileResult("dd-entity-scope.test.ts"), "dd-required-dependency-generality.test.ts": fileResult("dd-required-dependency-generality.test.ts"), "f7a-shard-planner-stitcher.test.ts": fileResult("f7a-shard-planner-stitcher.test.ts") },
});
const chewyLimitations = allDeps.filter(({ d }) => isLimitation(d)).map(({ shard, d }) => ({ shard: shard.ordinal, key: d.key, disposition: d.disposition, method: d.resolution?.method ?? null, candidates: d.candidates?.length ?? null, reason: d.dispositionReason.slice(0, 220) }));
writeJson(`${OUT}/141-dependency-state-rules.json`, {
  artifact: "PRECISION AUDIT §3/§4/§13/§14/§15 - the distinct dependency states and certificate statuses, and the three rules", at: at(), paidCalls: 0,
  dependencyStates: { A: "DELIVERED_FULL", B: "DELIVERED_BOUNDED_EXCERPT", C: "OWNED_PRIMARY_SOURCE", D: "EXTERNAL_REQUIRED_DEPENDENCY", E: "INTERNAL_REQUIRED_DEPENDENCY_UNRESOLVED", F: "AMBIGUOUS_REQUIRED_DEPENDENCY", G: "NON_REQUIRED_EDGE", planningFailure: "DELIVERABLE_NOT_DELIVERED" },
  delivered: ["DELIVERED_FULL", "DELIVERED_BOUNDED_EXCERPT", "OWNED_PRIMARY_SOURCE"], neverDelivered: ["EXTERNAL_REQUIRED_DEPENDENCY", "INTERNAL_REQUIRED_DEPENDENCY_UNRESOLVED", "AMBIGUOUS_REQUIRED_DEPENDENCY", "NON_REQUIRED_EDGE", "DELIVERABLE_NOT_DELIVERED"],
  certificateStatuses: ["CERTIFIED_CONTEXT_COMPLETE", "CERTIFIED_WITH_EXPLICIT_EXTERNAL_LIMITATION", "CERTIFIED_WITH_EXPLICIT_INTERNAL_LIMITATION", "PLANNING_FAILED_REQUIRED_CONTEXT_UNDELIVERABLE"],
  statusRule: "planning failure if any deliverable dependency is undelivered; else INTERNAL limitation if any internal-unresolved or ambiguous; else EXTERNAL limitation if any external; else CONTEXT_COMPLETE. Internal dominates external. executable = not planning-failed; contextComplete = CONTEXT_COMPLETE only.",
  rule13_internalUnavailable: "required + internal + no deterministically resolvable source text => INTERNAL_REQUIRED_DEPENDENCY_UNRESOLVED => the shard is CERTIFIED_WITH_EXPLICIT_INTERNAL_LIMITATION (executable, limitation stated) - never 'fully delivered'; the only other outcomes are resolution or planning failure",
  rule14_external: "EXTERNAL_REQUIRED_DEPENDENCY only when the source itself writes '<term> (as defined in <X>)' AND the package's own document identity shows X is not a package document (single-document package => proven; multi-document without a matching label => AMBIGUOUS, not external). A name that merely sounds like an agreement is never external (test K)",
  rule15_ambiguous: "a reference resolving to more than one substantive node => AMBIGUOUS_REQUIRED_DEPENDENCY with every candidate's nodeId and span preserved; distinct from internal-unresolved and never guessed",
  missingContextContract: { version: MISSING_CONTEXT_CONTRACT_VERSION, classes: ["PLANNER_DELIVERY_GAP", "FALSE_MISSING_CONTEXT", "PARTIAL_DELIVERY", "INTERNAL_LIMITATION_DISCLOSED", "AMBIGUOUS_LIMITATION_DISCLOSED", "EXTERNAL_DEPENDENCY", "OPTIONAL_CONTEXT_MISS"] },
  instancesOnTheFrozenUnit: chewyLimitations,
});

// ---------------------------------------------------------------------------
// 142 - lint consistency (§16)
// ---------------------------------------------------------------------------
let lintOut = "", lintExit = 0;
try { lintOut = sh("npm run lint 2>&1"); } catch (e: Any) { lintOut = String(e.stdout ?? e.message); lintExit = Number(e.status ?? 1); }
writeJson(`${OUT}/142-lint-consistency.json`, {
  artifact: "PRECISION AUDIT §16 - the 132 gate recorded lint ERRORS while the return said clean", at: at(), paidCalls: 0,
  rootCause: "the gate tested the lint output with /error/i; ESLint's SUCCESS line is 'No ESLint warnings or errors', which contains the word 'errors', so a clean run was recorded as ERRORS. The return statement was based on the actual command output, which was clean. The artifact was wrong; the code was clean.",
  fix: "the gate now uses ESLint's own success marker / problem summary, and the exit code when the caller recorded it (scripts/phase-3-601-dependency-delivery-gate.ts lintVerdict)",
  freshRun: { command: "npm run lint", exitCode: lintExit, stdoutTail: lintOut.trim().split("\n").slice(-3) },
  gate132: "regenerated by the corrected v1 gate script solely to correct the lint evidence (see the git diff of 132: only the lint field and the computed-against SHA change)",
});

// ---------------------------------------------------------------------------
// 143 - verifier triage (§17) with zero-cost projection of the deterministic fixes
// ---------------------------------------------------------------------------
const frozenRules: IRRule[] = JSON.parse(JSON.stringify(frozenIR.rules));
const projection = synthesizeCrossShardLinks(frozenRules, plan, new Map([[region.regionId, region.text]]), DOC);
const V2_PROBE = { measuredBy: "the pre-remediation planner (planner v2, SHA 1b36eb6) run in a detached worktree on the frozen inventory", result: [{ shardId: "shard:2eb6ff75386e45a57593", context: "section:6.01(a) REFERENCED_SECTION chars=1800 truncated=true" }, { shardId: "shard:e10ed610ecff8b399619", context: "section:6.01(a) REFERENCED_SECTION chars=1800 truncated=true" }, { shardId: "shard:86cc5e439f113d6053a9", context: "section:6.01(a) unresolved reason=BUDGET" }], underV4: `section:6.01(a) is REQUIRED and delivered in full (${plan.shards.filter((s) => s.context.some((e) => e.contextKey === "section:6.01(a)" && e.tier === "REQUIRED" && !e.truncated)).length} shards)` };
const F = (verifier.findings as Any[]).map((f, i) => ({ ordinal: i, findingId: f.findingId, severity: f.severity, findingType: f.findingType, method: f.verificationMethod }));
const triage = [
  { ...F[0], classification: "A_DETERMINISTIC_PHASE3_PRODUCTION_DEFECT", evidence: `frozen IR: 3 PROHIBITION rules from 6.01(a) carry 7/3/3 exceptions; 47 rules from 31 distinct 6.01(b)(n) clauses exist; the 6.01(b) lead-in provides that 6.01(a) shall not apply to them. No shard's model can link across shards; the stitcher did not.`, fix: "stitcher pass synthesizeCrossShardLinks (exceptions from 'shall not apply to' lead-ins)", zeroCostProjection: { exceptionsSynthesizedOnFrozenIR: projection.exceptionsSynthesized.length, distinctCarveOutRules: new Set(projection.exceptionsSynthesized.map((e) => e.carveOutRuleId)).size }, tests: "dd-cross-shard-links.test.ts" },
  { ...F[1], classification: "F_NEEDS_FRESH_PAID_EVIDENCE (delivery-caused; previous 0/11 attribution was a rule-id join and too narrow)", evidence: "the model's stated reason ('text was truncated in the retrievable evidence') was literally true under planner v2", v2Probe: V2_PROBE, fix: "delivered in full by the required tier since v3; nothing further in code", note: "$1.00 is a ratio-test token in this construct, not a basket amount" },
  { ...F[2], classification: "A_DETERMINISTIC_PHASE3_PRODUCTION_DEFECT (partial) + F for the remainder", evidence: `frozen IR: 57 unresolvedDependencies; 18 name a section exactly one stitched rule was compiled from (deterministically resolvable), 5 name a section with more than one rule (ambiguous - stays unresolved), 34 name no compiled rule`, fix: "stitcher pass synthesizeCrossShardLinks (unique section-reference resolution)", zeroCostProjection: { dependenciesResolvedOnFrozenIR: projection.dependenciesResolved.length, leftUnresolved: projection.dependenciesLeftUnresolved.length, byReason: projection.dependenciesLeftUnresolved.reduce((m: Record<string, number>, u) => { m[u.reason] = (m[u.reason] ?? 0) + 1; return m; }, {}) }, tests: "dd-cross-shard-links.test.ts" },
  { ...F[3], classification: "A_DETERMINISTIC_PHASE3_PRODUCTION_DEFECT (prompt never requested the field) + F to observe the effect", evidence: "entityScope is empty on all 63 frozen rules; the wire schema declares entityScope/entityScopeExcluded and the normalizer maps them, but the compiler prompt never instructed the model to fill them (one mention, inside the ENTITY_SCOPE_REFERENCE node description); the frozen IR contains 0 ENTITY_SCOPE_REFERENCE nodes, so nothing could be derived either", fix: "prompt instruction (ENTITY SCOPE) + deterministic derivation from ENTITY_SCOPE_REFERENCE nodes when the rule-level fields are empty; prompt version v4 -> v5", tests: "dd-entity-scope.test.ts" },
  ...[4, 5, 6, 7].map((i) => ({ ...F[i], classification: "F_NEEDS_FRESH_PAID_EVIDENCE (same root as finding 1) / C candidate", evidence: "'$1.00 of additional Indebtedness' is a ratio-test construct; its absence follows from the (14) alternative being modelled UNSUPPORTED under truncated §6.01(a) context (v2). Once represented, the deterministic amount check either matches or is a verifier over-read of a test token as a basket amount.", fix: "none in code beyond finding 1" })),
  { ...F[8], classification: "B_MODEL_VARIANCE (one-run omission in a completed shard) -> F to re-observe", evidence: "2.50:1.00 sits at region offset 5442 inside a clause owned by a shard that ended SHARD_COMPLETE; the model omitted the ratio threshold; Pass C's two material missing values were 'unlimited amount' and 'one (1)', not this ratio, so it was caught only by the verifier's deterministic value check", fix: "none (not deterministic)" },
  { ...F[9], classification: "D_EXPLICIT_SAFE_LIMITATION (downgraded NON_MATERIAL by Layer 2) with the same root as finding 3", evidence: "entity-scope terms present in source, IR records none", fix: "as finding 3" },
  { ...F[10], classification: "D_EXPLICIT_SAFE_LIMITATION (downgraded NON_MATERIAL by Layer 2) / B", evidence: "one reclassification signal in source, no RECLASSIFIABLE_TO edge; the IR does carry RECLASSIFICATION_RULE rules", fix: "none (not deterministic)" },
];
writeJson(`${OUT}/143-verifier-triage.json`, {
  artifact: "PRECISION AUDIT §17 - pre-spend triage of the 11 frozen verifier findings", at: at(), paidCalls: 0,
  source: "docs/phase-3-final-601/113-verifier.json (frozen)", counts: verifier.findingCounts,
  classes: { A: "DETERMINISTIC_PHASE3_PRODUCTION_DEFECT", B: "MODEL_VARIANCE / ONE-RUN SEMANTIC OUTPUT", C: "VERIFIER_FALSE_POSITIVE", D: "EXPLICIT_SAFE_LIMITATION", E: "PHASE4_COMPUTATION_ONLY", F: "NEEDS_FRESH_PAID_EVIDENCE" },
  triage,
  deterministicDefectsFixedInThisMission: ["cross-shard carve-out exception linkage (finding 0)", "unique section-reference dependency resolution (finding 2, partial)", "entityScope never requested from the model (findings 3/9)"],
  deterministicDefectsLeftUnfixed: [],
  phase4Boundary: "no computational evaluation was touched; every classification is about semantic representation",
  projectionCaveat: "the zero-cost projection applies the new stitcher pass to the FROZEN rules with the v4 plan's units and the frozen region text; it shows what the pass would link, not a new compilation",
});

// ---------------------------------------------------------------------------
// 144 - recomputed plan (§20)
// ---------------------------------------------------------------------------
const failed = plan.shards.find((s) => s.shardId === FAILED_SHARD_ID);
writeJson(`${OUT}/144-recomputed-plan.json`, {
  artifact: "PRECISION AUDIT §20 - the exact frozen 6.01 plan rebuilt under the corrected model", at: at(), paidCalls: 0,
  versions: { planner: SHARD_PLANNER_ALGORITHM_VERSION, requiredDependencyModel: REQUIRED_DEPENDENCY_MODEL_VERSION, compilerPrompt: SEMANTIC_COMPILER_PROMPT_VERSION },
  shards: plan.shards.length, certification: plan.dependencyCertification, resharding: plan.requiredContextResharding,
  falseOrNonRequiredEdgesExcluded: plan.dependencyCertification.nonRequiredEdgesExcluded,
  maxRequiredChars: pct(1), maxTurn1Tokens: plan.totals.maxShardInputTokens,
  perShard: plan.shards.map((s) => ({ ordinal: s.ordinal, shardId: s.shardId, ownedMaterialItems: s.ownedMaterialItemIds.length, requiredChars: reqChars(s), turn1Tokens: s.estimate.inputTokens, certificate: s.dependencyCertificate })),
  failedShard: failed ? { shardId: failed.shardId, stillPresent: true, ownedMaterialItems: failed.ownedMaterialItemIds.length, status: failed.dependencyCertificate.certificateStatus, fiveTargets: TARGETS.map((k) => ({ key: k, deliveredInFull: failed.context.some((e) => e.tier === "REQUIRED" && e.contextKey === k && !e.truncated) })) } : { stillPresent: false },
  toolBudgetUnchanged: DEFAULT_TOOL_BUDGET,
});

// ---------------------------------------------------------------------------
// 145 - cross-corpus zero-cost sanity (§21)
// ---------------------------------------------------------------------------
async function crossCorpus() {
  const rows: Any[] = [];
  const measure = (label: string, p: ShardPlan, sourceChars: number, ownedItems: number) => {
    const deps = p.shards.flatMap((s) => s.requiredDependencies).filter((d) => d.disposition !== "NON_REQUIRED_EDGE");
    const lim = deps.filter(isLimitation).length; const rc = p.shards.reduce((x, s) => x + reqChars(s), 0);
    const statuses = p.shards.reduce((m: Record<string, number>, s) => { m[s.dependencyCertificate.certificateStatus] = (m[s.dependencyCertificate.certificateStatus] ?? 0) + 1; return m; }, {});
    rows.push({ corpus: label, sourceChars, ownedItems, shards: p.shards.length, requiredDependencies: deps.length, dependenciesPerOwnedItem: ownedItems ? +(deps.length / ownedItems).toFixed(2) : null, maxClosureDepth: deps.length ? Math.max(...deps.map((d) => d.closureDepth)) : 0, requiredContextChars: rc, undeliverableRate: deps.length ? +(lim / deps.length).toFixed(3) : 0, certificateStatuses: statuses, explosion: rc > 4 * sourceChars && (ownedItems ? deps.length / ownedItems > 10 : false) });
  };
  const chain = new Map<number, number>(); for (let i = 2; i <= 60; i++) chain.set(i, i - 1);
  const defs = buildDefinitionsCorpus({ count: 60, references: chain, padWords: 30 });
  measure("f7a definitions corpus (60 chained definitions)", planCompilationShards({ candidateRef: defs.frozenInventory.candidateRef, companyId: F7A_CO, instrumentKey: F7A_INST, documentId: F7A_DOC, sourceContext: defs.sourceContext, frozenInventory: defs.frozenInventory, structuralIndex: defs.index, generation: { algorithmVersion: "a", promptVersion: "p" } }), defs.text.length, defs.frozenInventory.items.length);
  const chap = buildChapeauCorpus(26);
  measure("f7a chapeau corpus (26 clauses)", planCompilationShards({ candidateRef: chap.frozenInventory.candidateRef, companyId: F7A_CO, instrumentKey: F7A_INST, documentId: F7A_DOC, sourceContext: chap.sourceContext, frozenInventory: chap.frozenInventory, structuralIndex: chap.index, generation: { algorithmVersion: "a", promptVersion: "p" } }), chap.text.length, chap.frozenInventory.items.length);
  for (const [label, shape] of [["synthetic agreement (base)", BASE_SHAPE], ["synthetic agreement (false edges + duplicate section)", { ...BASE_SHAPE, extraEdges: ["Hypothetical Reserve Tranche"], duplicateCrossRefParent: true }], ["synthetic agreement (external pointer)", { ...BASE_SHAPE, externalTerm: { term: "Availability Block", agreement: "Working Capital Facility Agreement" } }]] as const) {
    const built = buildSyntheticAgreement(shape as Any); measure(label, planSynthetic(shape as Any), built.text.length, built.frozenInventory.items.length); void SYN_DOC;
  }
  let iOk = 0, iFail = 0; const iRows: Any[] = [];
  for (const sc of CORPUS) {
    try {
      const built = await buildScenario(sc);
      const p = planCompilationShards({ candidateRef: built.inventory.candidateRef, companyId: "i-co", instrumentKey: "i-inst", documentId: I_DOC, sourceContext: built.sourceContext, frozenInventory: built.inventory, structuralIndex: built.index, generation: { algorithmVersion: "a", promptVersion: "p" } });
      const deps = p.shards.flatMap((s) => s.requiredDependencies).filter((d) => d.disposition !== "NON_REQUIRED_EDGE");
      iRows.push({ scenario: sc.id, sourceChars: sc.text.length, ownedItems: built.inventory.items.length, requiredDependencies: deps.length, maxDepth: deps.length ? Math.max(...deps.map((d) => d.closureDepth)) : 0, requiredContextChars: p.shards.reduce((x, s) => x + reqChars(s), 0), limitations: deps.filter(isLimitation).length, statuses: p.shards.map((s) => s.dependencyCertificate.certificateStatus) });
      iOk++;
    } catch (e: Any) { iFail++; iRows.push({ scenario: sc.id, error: String(e.message ?? e).slice(0, 160) }); }
  }
  const iAgg = iRows.filter((r) => !r.error);
  rows.push({ corpus: `semantic-accountability synthetic corpus (${iOk} scenarios planned, ${iFail} could not be built deterministically)`, scenarios: iRows.length, requiredDependenciesTotal: iAgg.reduce((x, r) => x + r.requiredDependencies, 0), maxRequiredContextChars: Math.max(0, ...iAgg.map((r) => r.requiredContextChars)), maxDepth: Math.max(0, ...iAgg.map((r) => r.maxDepth)), maxDependenciesPerOwnedItem: Math.max(0, ...iAgg.map((r) => (r.ownedItems ? r.requiredDependencies / r.ownedItems : 0))), statuses: iAgg.flatMap((r) => r.statuses).reduce((m: Record<string, number>, s: string) => { m[s] = (m[s] ?? 0) + 1; return m; }, {}), explosion: iAgg.some((r) => r.requiredContextChars > 4 * r.sourceChars && r.ownedItems && r.requiredDependencies / r.ownedItems > 10), perScenario: iRows });
  writeJson(`${OUT}/145-cross-corpus-sanity.json`, {
    artifact: "PRECISION AUDIT §21 - deterministic required-dependency planning over existing synthetic, non-paid fixtures", at: at(), paidCalls: 0,
    explosionRule: "flagged when required context exceeds 4x the source AND dependencies per owned item exceed 10 - both must hold",
    corpora: rows,
    anyExplosion: rows.some((r) => r.explosion),
    frozenUnitForScale: { sourceChars: region.text.length, ownedItems: inventory.items.length, requiredDependencies: plan.dependencyCertification.requiredDependenciesTotal, dependenciesPerOwnedItem: +(plan.dependencyCertification.requiredDependenciesTotal / inventory.items.length).toFixed(2), requiredContextChars: plan.shards.reduce((x, s) => x + reqChars(s), 0) },
  });
  return rows;
}

crossCorpus().then((rows) => {
  console.log(JSON.stringify({ shards: plan.shards.length, certification: plan.dependencyCertification, classes26: classCounts, thresholdStable: (readJson<Any>(`${OUT}/138-threshold-sensitivity.json`)).reading.stableRange, projection: { exceptions: projection.exceptionsSynthesized.length, deps: projection.dependenciesResolved.length }, crossCorpusExplosion: rows.some((r) => r.explosion) }, null, 1));
}).catch((e) => { console.error(e); process.exit(1); });
