/**
 * Semantic stage of the offline acceptance run: the production certification pipeline
 * (certifyDiscoveredCovenantPackage → compileCandidateToVerifiedIR → normalize → verify → certify) executed over a
 * MANIFEST-DECLARED candidate population with MOCKED model stages (see mocks.ts / semantic-plan.ts).
 *
 * What this stage can and cannot show:
 *  - CAN: whether the deterministic layers accept a correct (faithful) representation of each package and what they
 *    produce from it; whether they refuse an adversarial representation when the reviewer is silent.
 *  - CANNOT: anything about discovery coverage or model extraction quality. Every result is labelled MOCKED.
 */
import { certifyDiscoveredCovenantPackage, type CovenantMapPackageInput, type CertifiedExecutionDeps } from "../../lib/contract-model/covenant-map/pipeline";
import { certifiedConfig } from "../../lib/contract-model/compiler/certified-config";
import { BoundedSemanticCaller } from "../../lib/contract-model/compiler/semantic/bounded-caller";
import { InMemorySemanticCompilationCache } from "../../lib/contract-model/compiler/semantic/cache";
import { HardDispatchBudget } from "../../lib/contract-model/analyzer/dispatch-budget";
import { CERTIFIED_TRANSPORT_RETRY_POLICY } from "../../lib/contract-model/analyzer/transport-retry";
import { sealDiscoveryPopulation } from "../../lib/contract-model/phase3-certification/discovery-population";
import type { DiscoveredCandidate } from "../../lib/contract-model/compiler/discovery/types";
import type { IRRule } from "../../lib/contract-model/ir/types";
import type { CorpusPackage } from "./corpus";
import type { DeterministicStages } from "./stages";
import { Ledger, candidateFor } from "./auditor";
import { mockInventoryCaller, mockSemanticClient, MOCK_MODEL, ws, type SubmissionPlan } from "./mocks";
import { faithfulPlan, adversarialCases, mutate, type CandidateSpec, type AdversarialCase } from "./semantic-plan";

export interface SemanticRunResult {
  specs: CandidateSpec[];
  instrumentKey: string;
  faithful: Awaited<ReturnType<typeof certifyDiscoveredCovenantPackage>> | null;
  faithfulError: string | null;
  adversarial: Array<{ case: AdversarialCase; variant: "PURE_OMISSION" | "LINEAGE_ON_RULE"; run: Awaited<ReturnType<typeof certifyDiscoveredCovenantPackage>> | null; error: string | null }>;
  mockCalls: { inventory: number; passB: number; verifier: number };
  /** Prompt sizes (user-content characters) seen by the mocked callers - the only offline cost signal available; a token proxy at ≈4 chars/token. */
  promptChars: { inventory: number[]; passB: number[]; verifier: number[] };
}

function sectionOf(ref: string): string { return ref.replace(/\(.*$/, ""); }

/** Manifest-declared population: one candidate per operative section (per physical occurrence) plus the definitions section per document. */
export function buildCandidateSpecs(pkg: CorpusPackage, s: DeterministicStages): { specs: CandidateSpec[]; untestable: string[] } {
  const { index } = s;
  const m = pkg.manifest;
  const specs: CandidateSpec[] = [];
  const untestable: string[] = [];
  const groups = new Map<string, typeof m.covenants>();
  for (const c of m.covenants.filter((c) => c.operative)) {
    const key = `${c.documentId}::${sectionOf(c.sectionRef)}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  for (const [key, covs] of groups) {
    const [documentId, sectionRef] = key.split("::") as [string, string];
    const nodes = index.findNodesByRef(documentId, sectionRef);
    const occurrences = nodes.length <= 1 ? [undefined] : nodes.map((_, i) => i + 1);
    for (const occurrence of occurrences) {
      const node = occurrence ? nodes[occurrence - 1] : nodes[0];
      if (!node) { untestable.push(`${key}: no node`); continue; }
      const descendants = new Set([node.nodeId, ...index.getDescendants(node.nodeId).map((n) => n.nodeId)]);
      const fullText = ws(index.getNodeText(node.nodeId, "DESCENDANTS"));
      const inside = covs.filter((c) => {
        if (c.occurrence && c.occurrence !== occurrence) return false;
        const cn = index.findNodesByRef(c.documentId, c.sectionRef);
        const n = c.occurrence ? cn[c.occurrence - 1] : cn.find((x) => descendants.has(x.nodeId));
        if (!n || !descendants.has(n.nodeId)) return false;
        // the covenant's own literal text must sit inside this physical occurrence (a TOC line never carries it)
        return c.operativeTextDocumentId ? true : c.mustContain.every((t) => fullText.includes(ws(t)));
      });
      const lead = inside.find((c) => c.sectionRef === sectionRef) ?? inside[0];
      specs.push({ key: `${key}${occurrence ? `#${occurrence}` : ""}`, documentId, sectionRef, occurrence: occurrence ?? undefined, nodeId: node.nodeId, ownText: index.getNodeText(node.nodeId, "OWN"), fullText: index.getNodeText(node.nodeId, "DESCENDANTS"), kind: "COVENANT_SECTION", covenants: inside, families: [...new Set(covs.map((c) => c.family))], role: lead?.role ?? "OTHER_RELEVANT_RULE" });
    }
  }
  // a provision whose current text lives in an amendment is also compiled as its own sub-clause candidate (the
  // granularity at which the operative state attaches), so the report shows both the section-level and clause-level behaviour
  for (const c of m.covenants.filter((c) => c.operative && c.operativeTextDocumentId)) {
    const nodes = index.findNodesByRef(c.documentId, c.sectionRef);
    if (nodes.length !== 1) continue;
    const node = nodes[0]!;
    specs.push({ key: `${c.documentId}::${c.sectionRef}@clause`, documentId: c.documentId, sectionRef: c.sectionRef, nodeId: node.nodeId, ownText: index.getNodeText(node.nodeId, "OWN"), fullText: index.getNodeText(node.nodeId, "DESCENDANTS"), kind: "COVENANT_SECTION", covenants: [c], families: [c.family], role: c.role });
  }
  for (const documentId of new Set(m.definitions.exact.map((d) => d.documentId))) {
    if (m.documents.find((d) => d.documentId === documentId)?.role === "AMENDMENT") continue; // an amendment's restated definition is tested through OPERATIVE_STATE, not as a definitions candidate
    const defRef = m.definitions.exact.find((d) => d.documentId === documentId)?.expectedSourceSectionRef ?? "1.01";
    const nodes = index.findNodesByRef(documentId, defRef);
    const node = nodes.length === 1 ? nodes[0] : nodes.find((n) => /As used in this/.test(index.getNodeText(n.nodeId, "OWN")));
    if (!node) { untestable.push(`${documentId}::${defRef}: definitions node not unique`); continue; }
    specs.push({ key: `${documentId}::${defRef}`, documentId, sectionRef: defRef, nodeId: node.nodeId, ownText: index.getNodeText(node.nodeId, "OWN"), fullText: index.getNodeText(node.nodeId, "DESCENDANTS"), kind: "DEFINITIONS", covenants: [], families: ["DEFINITIONS_CALCULATION_RULES"], role: "DEFINITIONAL_DEPENDENCY_CANDIDATE" });
  }
  return { specs, untestable };
}

function toCandidate(index: DeterministicStages["index"], spec: CandidateSpec): DiscoveredCandidate {
  const c = candidateFor(index, spec.documentId, spec.sectionRef, spec.families as never, spec.role as never, spec.key, spec.occurrence);
  if (c) return c;
  // multiple occurrences without a declared one: anchor to the spec's own node id
  return { ...candidateFor(index, spec.documentId, spec.sectionRef, spec.families as never, spec.role as never, spec.key, 1)!, discoveryId: `discovery-candidate:manifest-${spec.key}`, structuralNodeIds: [spec.nodeId], structuralNodeKeys: [index.getNodeById(spec.nodeId)!.nodeKey] };
}

/** The prompt's operative-text head only (never the context/inventory sections, whose excerpts belong to other units). */
function promptHead(user: string): string {
  const markers = ["\n\nSOURCE CONTEXT STATE", "\n\nGOVERNING", "\n\nDUAL-PASS", "\n\nFROZEN SEMANTIC INVENTORY", "\n\nADDITIONAL SOURCE", "\n\nOperative-state status", "\n\nThis provision has no recorded"];
  const cut = Math.min(...markers.map((m) => { const i = user.indexOf(m); return i < 0 ? user.length : i; }));
  return user.slice(0, cut);
}
function planRouter(plans: Map<string, { probe: string; sectionRef: string; plan: SubmissionPlan; altProbe?: string }>): SubmissionPlan {
  return (user: string) => {
    const head = promptHead(user);
    const ref = head.match(/^Operative source text \((.*?)\):\n/)?.[1] ?? "";
    const byRef = [...plans.values()].filter((p) => p.sectionRef === ref);
    for (const { probe, altProbe, plan } of byRef.length ? byRef : plans.values()) if ((probe && (head.includes(probe) || ws(head).includes(ws(probe)))) || (altProbe && ws(head).includes(ws(altProbe)))) return plan(user);
    if (byRef.length === 1) return byRef[0]!.plan(user);
    throw new Error(`MOCKED Pass B: no plan matches prompt head "${head.slice(0, 100)}"`);
  };
}

function deps(plan: SubmissionPlan, counters: SemanticRunResult["mockCalls"], inventoryOpts: { linkProvisos?: boolean } = {}, chars: SemanticRunResult["promptChars"] = { inventory: [], passB: [], verifier: [] }): CertifiedExecutionDeps {
  const client = mockSemanticClient((user) => { counters.passB += 1; chars.passB.push(user.length); return plan(user); });
  const inv1 = mockInventoryCaller(inventoryOpts), inv2 = mockInventoryCaller(inventoryOpts), verifier = mockInventoryCaller();
  const wrap = (c: ReturnType<typeof mockInventoryCaller>, bump: (user: string) => void) => ({ ...c, call: async (schema: never, stage: string, sys: string, user: string, o?: never) => { bump(user); return c.call(schema, stage, sys, user, o); } });
  return {
    config: certifiedConfig({ semanticModel: MOCK_MODEL, inventoryModel: MOCK_MODEL, verifierModel: MOCK_MODEL, transportRetry: { ...CERTIFIED_TRANSPORT_RETRY_POLICY, baseDelayMs: 1 } }),
    semanticCaller: new BoundedSemanticCaller("MOCKED", MOCK_MODEL, client, { maxOutputTokens: 8000 }),
    inventoryPassCallers: [wrap(inv1, (u) => { counters.inventory += 1; chars.inventory.push(u.length); }) as never, wrap(inv2, (u) => { counters.inventory += 1; chars.inventory.push(u.length); }) as never],
    inventoryCaller: null,
    reviewCaller: wrap(verifier, (u) => { counters.verifier += 1; chars.verifier.push(u.length); }) as never,
    conditionSuspicionCaller: wrap(verifier, (u) => { counters.verifier += 1; chars.verifier.push(u.length); }) as never,
    budget: new HardDispatchBudget({ ceilingUsd: 1, maxCalls: 500 }),
    concurrency: 1,
    cache: new InMemorySemanticCompilationCache(),
  };
}

export async function runSemanticStage(pkg: CorpusPackage, s: DeterministicStages): Promise<SemanticRunResult & { untestable: string[] }> {
  const { index } = s;
  const m = pkg.manifest;
  const { specs, untestable } = buildCandidateSpecs(pkg, s);
  const asOfDate = m.operativeState.asOfDates[m.operativeState.asOfDates.length - 1]!;
  const instrumentKey = s.instrumentKeys.get(s.baseDocumentId) ?? m.instrumentKey;
  const candidates = specs.map((spec) => toCandidate(index, spec));
  const docs = pkg.documents.map((d) => ({ documentId: d.documentId, label: d.label, text: d.text }));
  const population = sealDiscoveryPopulation({ documents: docs, discoveryVersion: "manifest-declared-population.v1", candidates, scope: "COMPLETE" });
  const input: CovenantMapPackageInput = { companyId: m.companyId, packageKey: `${pkg.packageId}-package`, instrumentKey, asOfDate, documents: docs, index, packageGraph: s.packageGraph, exactTermsByDocument: s.exactTermsByDocument, operativeState: s.operativeStates.get(asOfDate) ?? null, amendmentEffects: s.amendment?.effects ?? [], supersessionIndex: s.supersessionIndexes.get(asOfDate), candidates, discoveryRunVersion: "manifest-declared-population.v1", discoveryPopulation: population };
  const plans = new Map(specs.map((spec) => [spec.key, { probe: spec.ownText.trim().slice(0, 600), altProbe: spec.covenants.find((c) => c.operativeTextDocumentId)?.mustContain[0], sectionRef: spec.sectionRef, plan: faithfulPlan(index, m, spec) }] as const));
  const mockCalls = { inventory: 0, passB: 0, verifier: 0 };
  const promptChars: SemanticRunResult["promptChars"] = { inventory: [], passB: [], verifier: [] };
  let faithful: SemanticRunResult["faithful"] = null, faithfulError: string | null = null;
  try { faithful = await certifyDiscoveredCovenantPackage(input, deps(planRouter(plans), mockCalls, {}, promptChars)); } catch (e) { faithfulError = e instanceof Error ? `${e.message}\n${e.stack?.split("\n").slice(1, 4).join("\n")}` : String(e); }
  const adversarial: SemanticRunResult["adversarial"] = [];
  for (const c of adversarialCases(m, specs)) {
    const spec = specs.find((x) => x.key === c.candidateKey)!;
    const single: CovenantMapPackageInput = { ...input, candidates: [toCandidate(index, spec)], candidatePopulation: candidates.map((x) => ({ discoveryId: x.discoveryId, structuralNodeIds: x.structuralNodeIds })), discoveryPopulation: population };
    // A dropped unit is tested two ways: PURE_OMISSION strips the dropped unit's inventory lineage everywhere (the item is
    // simply not represented); LINEAGE_ON_RULE keeps the item cited on the parent rule node (a model that omits the
    // condition/shared cap but still "accounts" for the item). Both are mocked inputs; the outcomes differ in meaning.
    const dropping = c.mutation.kind === "DROP_CONDITIONS" || c.mutation.kind === "DROP_GATE" || c.mutation.kind === "DROP_SHARED_CAPS";
    const variants: Array<["PURE_OMISSION" | "LINEAGE_ON_RULE", boolean]> = dropping ? [["PURE_OMISSION", true], ["LINEAGE_ON_RULE", false]] : [["PURE_OMISSION", true]];
    for (const [variant, strip] of variants) {
      const vplans = new Map(plans);
      vplans.set(spec.key, { ...plans.get(spec.key)!, plan: mutate(plans.get(spec.key)!.plan, c.mutation, { stripLineage: strip }) });
      try { adversarial.push({ case: c, variant, run: await certifyDiscoveredCovenantPackage(single, deps(planRouter(vplans), mockCalls)), error: null }); }
      catch (e) { adversarial.push({ case: c, variant, run: null, error: e instanceof Error ? e.message : String(e) }); }
    }
  }
  return { specs, instrumentKey, faithful, faithfulError, adversarial, mockCalls, promptChars, untestable };
}

// ----------------------------------------------------------------------------------------------------------------
// Audit of the semantic stage against the manifest
// ----------------------------------------------------------------------------------------------------------------

const money = (r: IRRule): { amount: number; currency: string } | null => r.capacityExpression && r.capacityExpression.kind === "MONEY" ? { amount: (r.capacityExpression as { amount: number }).amount, currency: (r.capacityExpression as { currency: string }).currency } : null;

export function auditSemantic(pkg: CorpusPackage, s: DeterministicStages, r: SemanticRunResult & { untestable: string[] }, L: Ledger): void {
  const m = pkg.manifest;
  const MODE = "MOCKED" as const;
  for (const u of r.untestable) L.notTested("SEMANTIC_COMPOSITION", MODE, "EXACT", `semantic:${u}`, "candidate not anchorable (see STRUCTURE findings)");
  L.observe(`semantic stage mock calls: inventory=${r.mockCalls.inventory} passB=${r.mockCalls.passB} verifier/classifier=${r.mockCalls.verifier}; candidates=${r.specs.length}; adversarial cases=${r.adversarial.length}`);
  if (!r.faithful) {
    L.fail("SEMANTIC_COMPOSITION", MODE, "INVARIANT", "semantic:faithful-run", { severity: "EVIDENCE_INCOMPLETE", outcomeClass: "TEST_INFRASTRUCTURE_FAILURE", expected: "certification pipeline completes over the manifest population", actual: `threw: ${r.faithfulError}`, repro: "certifyDiscoveredCovenantPackage(manifest population, mocked deps)", deterministic: true });
    return;
  }
  const run = r.faithful;
  L.observe(`faithful run: package certification ${run.packageCertification.status} (${run.packageCertification.candidates.certified} certified / ${run.packageCertification.candidates.reviewRequired} review / ${run.packageCertification.candidates.notCertified} not certified of ${run.packageCertification.candidates.total}); blockers: ${run.packageCertification.blockers.map((b) => b.code).join(", ") || "none"}`);
  const results = run.results;
  const byKey = new Map(results.map((x) => [x.candidate.description, x] as const));
  for (const spec of r.specs) {
    const res = byKey.get(spec.key);
    const ref = `semantic:${spec.key}`;
    if (!res) { L.notTested("SEMANTIC_COMPOSITION", MODE, "EXACT", ref, "no result for candidate"); continue; }
    const cert = res.certification;
    const comp = res.compilation;
    const blockers = cert?.blockers.map((b) => `${b.code}${b.severity === "BLOCKING" ? "!" : ""}`) ?? [];
    const verification = res.verification;
    const vFindings = verification?.findings.map((f) => `${f.findingType}/${f.severity}`) ?? [];
    L.observe(`${spec.key}: outcome ${res.outcome}, compilation ${comp?.status ?? "none"} (${comp?.rules.length ?? 0} rules, ${comp?.definitions.length ?? 0} defs, ${comp?.sharedCapacities.length ?? 0} shared), verification ${verification?.status ?? "none"} [${vFindings.join(", ")}], certification ${cert?.status ?? "none"} [${blockers.join(", ")}]${res.failure ? ` failure=${res.failure.kind}:${res.failure.detail.slice(0, 160)}` : ""}`);
    if (spec.kind === "DEFINITIONS") {
      const want = m.definitions.exact.filter((d) => d.documentId === spec.documentId);
      const got = new Set((comp?.definitions ?? []).map((d) => d.termName.toLowerCase()));
      const missing = want.filter((d) => !got.has(d.term.toLowerCase())).map((d) => d.term);
      if (missing.length === 0 && comp) L.pass("SEMANTIC_COMPOSITION", MODE, "EXACT", ref, `${got.size} definitions compiled; certification ${cert?.status} [${blockers.join(", ")}] (definitions-candidate certification is observed, not asserted: the mock does not formalize quantitative definitions)`);
      else L.fail("SEMANTIC_COMPOSITION", MODE, "EXACT", ref, { severity: "MISSING_REQUIRED_COVENANT", outcomeClass: comp ? "INCORRECT_RESULT" : "TEST_INFRASTRUCTURE_FAILURE", expected: `definitions for ${want.map((d) => d.term).join(", ")}`, actual: comp ? `missing ${missing.join(", ")}` : `no compilation (${res.failure?.kind}: ${res.failure?.detail.slice(0, 200)})`, repro: `faithful submission for ${spec.key}`, deterministic: true });
      continue;
    }
    // a non-operative occurrence (e.g. a TOC line) must yield no certified rule
    if (spec.covenants.length === 0) {
      const certifiedRules = cert?.status === "CERTIFIED" ? comp?.rules.length ?? 0 : 0;
      if (certifiedRules === 0) L.pass("CERTIFICATION", MODE, "INVARIANT", ref, `occurrence with no operative covenant yields no certified rule (certification ${cert?.status ?? "none"})`);
      else L.fail("CERTIFICATION", MODE, "INVARIANT", ref, { severity: "SOURCE_PROVENANCE_FAILURE", outcomeClass: "INCORRECT_RESULT", expected: "no certified rule from a non-operative occurrence", actual: `${certifiedRules} certified rule(s)`, repro: `faithful (empty) submission for ${spec.key}`, deterministic: true });
      continue;
    }
    // operative-text integrity: a candidate's operative text must not carry text the manifest says is superseded/deleted at this as-of
    const runAsOf = m.operativeState.asOfDates[m.operativeState.asOfDates.length - 1]!;
    const staleHits = m.operativeState.exact.filter((e) => e.asOfDate === runAsOf && e.documentId === spec.documentId && e.status !== "CURRENT" && (e.sectionRef === spec.sectionRef || e.sectionRef.startsWith(spec.sectionRef + "("))).flatMap((e) => e.mustNotContain.filter((t) => ws(res.input?.operativeSourceText ?? "").includes(ws(t))).map((t) => `${e.sectionRef} ${e.status}: "${t}"`));
    if (staleHits.length > 0) L.fail("SEMANTIC_COMPOSITION", MODE, "INVARIANT", `operative-text:${spec.key}`, { severity: "WRONG_OPERATIVE_SOURCE", outcomeClass: "INCORRECT_RESULT", expected: `operative text as of ${runAsOf} excludes superseded/deleted text`, actual: `operative text handed to Pass B still contains ${staleHits.join("; ")}; lineage ${res.input?.operativeLineage ? res.input.operativeLineage.operativeStatus : "null"}; Layer-1 source findings: ${(res.verification?.findings ?? []).filter((f) => f.severity === "MATERIAL").map((f) => `${f.findingType}:${f.sourceEvidence.slice(0, 20)}`).join(", ") || "none"}`, repro: `buildCandidateCompilerInput(candidate ${spec.sectionRef}, operativeState@${runAsOf}).operativeSourceText`, deterministic: true });
    else if (m.operativeState.exact.some((e) => e.asOfDate === runAsOf && e.status !== "CURRENT" && e.sectionRef.startsWith(spec.sectionRef))) L.pass("SEMANTIC_COMPOSITION", MODE, "INVARIANT", `operative-text:${spec.key}`, `operative text excludes superseded/deleted text (lineage ${res.input?.operativeLineage?.operativeStatus ?? "null"})`);
    if (!comp) { L.fail("SEMANTIC_COMPOSITION", MODE, "EXACT", ref, { severity: "EVIDENCE_INCOMPLETE", outcomeClass: res.failure?.kind === "PROVIDER" ? "TEST_INFRASTRUCTURE_FAILURE" : "CORRECT_FAIL_CLOSED", expected: "compiled IR for the faithful submission", actual: `no compilation: ${res.failure?.kind ?? res.outcome}: ${res.failure?.detail.slice(0, 240) ?? ""}`, repro: `faithful submission for ${spec.key}`, deterministic: true }); continue; }
    for (const c of spec.covenants) {
      const cref = `semantic:${c.id}`;
      const rules = comp.rules.filter((x) => x.sourceSectionRef === c.sectionRef && (c.role !== "GENERAL_PROHIBITION" ? x.posture === c.posture : x.posture === "PROHIBITION"));
      const rule = rules[0];
      const sufficiencyExpected = (c.value as { kind?: string } | undefined)?.kind;
      const mustNotCertify = c.truncated || sufficiencyExpected === "UNRESOLVABLE";
      if (!rule) { L.fail("SEMANTIC_COMPOSITION", MODE, "EXACT", cref, { severity: "MISSING_REQUIRED_COVENANT", outcomeClass: "INCORRECT_RESULT", expected: `an IR rule for ${c.sectionRef} (${c.posture})`, actual: `none among ${comp.rules.map((x) => `${x.sourceSectionRef}/${x.posture}`).join(", ")}`, repro: `faithful submission for ${spec.key}; normalizeSubmission`, deterministic: true }); continue; }
      const problems: string[] = [];
      if (rule.covenantFamily !== c.family) problems.push(`family ${rule.covenantFamily} ≠ ${c.family}`);
      if (rule.sourceDocumentId !== c.documentId && rule.sourceDocumentId !== c.operativeTextDocumentId) problems.push(`sourceDocumentId ${rule.sourceDocumentId}`);
      const v = c.value as Record<string, unknown> | undefined;
      if (v?.kind === "MONEY") { const got = money(rule); if (!got) problems.push(`no MONEY capacity (got ${rule.capacityExpression?.kind ?? "null"})`); else if (got.amount !== v.amount || got.currency !== v.currency) problems.push(`amount ${got.currency} ${got.amount} ≠ ${v.currency} ${v.amount}`); }
      const material = c.conditions.filter((k) => k.independent && k.material && k.kind !== "SHARED_CAP");
      if (rule.conditions.length < material.length) problems.push(`${rule.conditions.length} condition(s) < ${material.length} material`);
      if (!rule.provenance?.excerpt) problems.push("provenance excerpt null");
      else { const srcDocs = [c.documentId, ...(c.operativeTextDocumentId ? [c.operativeTextDocumentId] : [])]; const ok = srcDocs.some((id) => ws(pkg.documents.find((d) => d.documentId === id)?.text ?? "").includes(ws(rule.provenance!.excerpt!))); if (!ok) problems.push("provenance excerpt not verbatim in source"); }
      if (c.operativeTextDocumentId && rule.provenance?.documentId && rule.provenance.documentId !== c.operativeTextDocumentId && rule.provenance.documentId !== c.documentId) problems.push(`provenance document ${rule.provenance.documentId}`);
      if (mustNotCertify && rule.sufficiency === "COMPLETE") problems.push(`sufficiency COMPLETE on an unresolvable/truncated unit`);
      if (c.unresolvedTerms?.length && !(rule.unresolvedDependencies?.length || rule.sufficiency !== "COMPLETE")) problems.push(`undefined term(s) ${c.unresolvedTerms.join(", ")} not carried as unresolved`);
      if (problems.length === 0) L.pass("SEMANTIC_COMPOSITION", MODE, "EXACT", cref, `rule ${rule.ruleId.slice(0, 24)}… family/value/conditions/provenance as expected (sufficiency ${rule.sufficiency})`);
      else L.fail("SEMANTIC_COMPOSITION", MODE, "EXACT", cref, { severity: problems.some((p) => p.startsWith("amount") || p.startsWith("no MONEY")) ? "CRITICAL_FALSE_PERMISSION" : problems.some((p) => p.includes("condition")) ? "MATERIAL_CONDITION_OMISSION" : problems.some((p) => p.includes("provenance")) ? "SOURCE_PROVENANCE_FAILURE" : problems.some((p) => p.includes("COMPLETE") || p.includes("unresolved")) ? "UNSUPPORTED_AS_COMPLETE" : "WRONG_OPERATIVE_SOURCE", outcomeClass: "INCORRECT_RESULT", expected: `${c.family} ${c.posture}${v?.kind === "MONEY" ? ` ${v.currency} ${v.amount}` : ""}, ≥${material.length} conditions, verbatim provenance`, actual: problems.join("; "), repro: `faithful submission for ${spec.key} → compiled rule ${rule.ruleId}`, deterministic: true });
    }
    // action-ontology guard misreads surface as compilation issues naming a wrong "source act"
    for (const issue of comp.unresolvedIssues.filter((x) => x.includes("ACTION_INCONSISTENT_WITH_SOURCE_ACT"))) {
      const m2 = issue.match(/the source act "([^"]+)" is ([A-Z_]+)/);
      L.fail("SEMANTIC_COMPOSITION", MODE, "INVARIANT", `action-ontology:${spec.key}`, { severity: "NONMATERIAL_OMISSION", outcomeClass: "INCORRECT_RESULT", expected: "the guard reads the clause's act consistently with its covenant family", actual: m2 ? `guard reads "${m2[1]}" as ${m2[2]} (forces REVIEW on a correct submission)` : issue.slice(0, 200), repro: `faithful submission for ${spec.key} → action-ontology guard`, deterministic: true });
    }
    if (spec.covenants.every((c) => !c.material)) { L.observe(`${spec.key}: non-material candidate, certification ${cert?.status} [${blockers.join(", ")}] observed only`); continue; }
    // certification verdict on a faithful submission
    const needsFailClosed = spec.covenants.some((c) => c.truncated || (c.value as { kind?: string } | undefined)?.kind === "UNRESOLVABLE" || (c.unresolvedTerms?.length ?? 0) > 0);
    const cref = `certification:${spec.key}`;
    const bundleReasons = res.bundle ? res.bundle.unresolvedDependencies.filter((u) => u.severity !== "LOW").map((u) => `${u.dependencyType}/${u.severity}: ${u.sourceText.slice(0, 40)}`).join("; ") : "";
    if (!cert) L.notTested("CERTIFICATION", MODE, "INVARIANT", cref, "no certification record");
    else if (needsFailClosed) {
      if (cert.status !== "CERTIFIED") L.pass("CERTIFICATION", MODE, "INVARIANT", cref, `${cert.status} on a unit with unresolvable/truncated content [${blockers.join(", ")}]`);
      else L.fail("CERTIFICATION", MODE, "INVARIANT", cref, { severity: "UNSUPPORTED_AS_COMPLETE", outcomeClass: "INCORRECT_RESULT", expected: "not CERTIFIED (undefined term / truncated source declared in the faithful submission)", actual: "CERTIFIED", repro: `faithful submission for ${spec.key}`, deterministic: true });
    } else if (cert.status === "CERTIFIED") L.pass("CERTIFICATION", MODE, "INVARIANT", cref, "CERTIFIED on the faithful submission (deterministic layers + silent mocked reviewer)");
    else L.fail("CERTIFICATION", MODE, "INVARIANT", cref, { severity: "NONMATERIAL_OMISSION", outcomeClass: cert.blockers.some((b) => b.severity === "BLOCKING") ? "CAPABILITY_NOT_IMPLEMENTED" : "CORRECT_FAIL_CLOSED", expected: "CERTIFIED (faithful, complete representation)", actual: `${cert.status} [${blockers.join(", ")}] ${cert.blockers.map((b) => b.detail.slice(0, 160)).join(" | ")}${bundleReasons ? ` | bundle: ${bundleReasons}` : ""}${comp?.unresolvedIssues.length ? ` | issues: ${comp.unresolvedIssues.map((x) => x.slice(0, 140)).join(" | ")}` : ""}`, repro: `faithful submission for ${spec.key}`, deterministic: true });
  }
  // adversarial cases
  for (const a of r.adversarial) {
    const ref = `adversarial:${a.case.prohibitedClaimId}${a.variant === "LINEAGE_ON_RULE" ? ":lineage-on-rule" : ""}`;
    if (!a.run) { L.fail("CERTIFICATION", MODE, "PROHIBITED_CLAIM", ref, { severity: "EVIDENCE_INCOMPLETE", outcomeClass: "TEST_INFRASTRUCTURE_FAILURE", expected: "pipeline completes", actual: `threw: ${a.error}`, repro: `adversarial ${a.case.mutation.kind} on ${a.case.candidateKey}`, deterministic: true }); continue; }
    const res = a.run.results[0]!;
    const cert = res.certification;
    const comp = res.compilation;
    const sectionRef = "sectionRef" in a.case.mutation ? a.case.mutation.sectionRef : null;
    const target = sectionRef ? comp?.rules.find((x) => x.sourceSectionRef === sectionRef && x.posture === "PERMISSION") ?? comp?.rules.find((x) => x.sourceSectionRef === sectionRef) : undefined;
    const blockers = cert?.blockers.map((b) => `${b.code}${b.severity === "BLOCKING" ? "!" : ""}`) ?? [];
    const vf = res.verification?.findings.map((f) => `${f.findingType}/${f.severity}`) ?? [];
    const scope = target?.entityScopeAudit ? ` scope=[${target.entityScope.join(",")}] audit ${target.entityScopeAudit.status}/safe=${target.entityScopeAudit.safeToRely}` : "";
    const detail = `certification ${cert?.status ?? "none"} [${blockers.join(", ")}]; verification ${res.verification?.status ?? "none"} [${vf.join(", ")}]; compilation ${comp?.status ?? "none"}${target ? `; target rule sufficiency ${target.sufficiency}, ${target.conditions.length} cond, capacity ${target.capacityExpression?.kind ?? "null"}${scope}` : ""}`;
    const certified = cert?.status === "CERTIFIED";
    // the claim is "asserted" if a certified rule carries it; a REVIEW_REQUIRED/NOT_CERTIFIED outcome is a refusal
    if (!certified) L.pass("CERTIFICATION", MODE, "PROHIBITED_CLAIM", ref, `refused: ${detail}`);
    else L.fail("CERTIFICATION", MODE, "PROHIBITED_CLAIM", ref, { severity: a.case.severity as never, outcomeClass: "INCORRECT_RESULT", expected: `not CERTIFIED when the submission asserts "${a.case.claim}"`, actual: detail, repro: `adversarial ${a.case.mutation.kind} on ${a.case.candidateKey}: ${JSON.stringify(a.case.mutation)}`, deterministic: true });
  }
}
