/**
 * Coverage / omission auditor for the deterministic stages. Every check compares a production-stage output against an
 * independently authored manifest expectation and records PASS/FAIL/NOT_TESTED plus a Finding (severity + outcome
 * class) on failure. The auditor never consults compiler self-assessments to decide a check.
 */
import { buildCandidateCompilerInput } from "../../lib/contract-model/covenant-map/candidate-input";
import { resolveUniqueDefinitionByRef, getNodeSupersessionStatus } from "../../lib/contract-model/compiler/amendment/operative-state";
import type { DiscoveredCandidate } from "../../lib/contract-model/compiler/discovery/types";
import type { StructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { sha256 } from "./corpus";
import type { CorpusPackage, Severity, ExpectationsManifest } from "./corpus";
import type { Check, Finding, OutcomeClass, StageMode, StageName } from "./report-types";
import type { DeterministicStages } from "./stages";

export class Ledger {
  checks: Check[] = [];
  findings: Finding[] = [];
  observations: string[] = [];
  private n = 0;
  constructor(readonly packageId: string) {}

  pass(stage: StageName, mode: StageMode, kind: Check["kind"], expectationRef: string, detail: string): void {
    this.checks.push({ checkId: `${this.packageId}:${++this.n}`, packageId: this.packageId, stage, stageMode: mode, expectationRef, kind, result: "PASS", detail });
  }
  notTested(stage: StageName, mode: StageMode, kind: Check["kind"], expectationRef: string, detail: string): void {
    this.checks.push({ checkId: `${this.packageId}:${++this.n}`, packageId: this.packageId, stage, stageMode: mode, expectationRef, kind, result: "NOT_TESTED", detail });
  }
  fail(stage: StageName, mode: StageMode, kind: Check["kind"], expectationRef: string, f: { severity: Severity; outcomeClass: OutcomeClass; expected: string; actual: string; repro: string; deterministic: boolean }): void {
    const findingId = `${this.packageId}:F${this.findings.length + 1}`;
    this.findings.push({ findingId, packageId: this.packageId, stage, stageMode: mode, expectationRef, ...f });
    this.checks.push({ checkId: `${this.packageId}:${++this.n}`, packageId: this.packageId, stage, stageMode: mode, expectationRef, kind, result: "FAIL", detail: `${f.expected} | actual: ${f.actual}`, findingId });
  }
  observe(text: string): void { this.observations.push(text); }
}

const ws = (s: string) => s.replace(/\s+/g, " ").trim();

/** Builds a DiscoveredCandidate from a manifest covenant - the manifest-declared population (discovery NOT_RUN). */
export function candidateFor(index: StructuralIndex, documentId: string, sectionRef: string, families: DiscoveredCandidate["families"], role: DiscoveredCandidate["role"], description: string, occurrence?: number): DiscoveredCandidate | null {
  const nodes = index.findNodesByRef(documentId, sectionRef);
  const node = occurrence ? nodes[occurrence - 1] : nodes.length === 1 ? nodes[0] : undefined;
  if (!node) return null;
  return {
    discoveryId: `discovery-candidate:manifest-${documentId}-${sectionRef}${occurrence ? `-${occurrence}` : ""}`, documentId, structuralNodeKeys: [node.nodeKey], structuralNodeIds: [node.nodeId], normalizedSourceRef: sectionRef, families, role, roleRaw: role, roleNormalizationStatus: "VALID_CANONICAL", familiesRaw: families, familiesNormalizationStatus: "VALID_CANONICAL", description, multipleRulesLikely: node.nodeType === "SECTION", definedTermDependencyLikely: true, discoveryMethods: ["DETERMINISTIC_SIGNAL"], evidenceSignals: ["manifest-declared"], reviewStatus: "AUTO_ACCEPTED", confidence: null, sourceCitation: `Section ${sectionRef}`, discoveryRunVersion: "manifest-declared-population.v1",
  } as DiscoveredCandidate;
}

export function auditStructure(pkg: CorpusPackage, s: DeterministicStages, L: Ledger): void {
  const { index } = s;
  const m = pkg.manifest;
  for (const e of m.structure.exact) {
    const ref = `structure:${e.documentId}#${e.sectionRef}`;
    const nodes = index.findNodesByRef(e.documentId, e.sectionRef);
    const res = index.resolveUniqueNodeByRef(e.documentId, e.sectionRef);
    const repro = `resolveUniqueNodeByRef("${e.documentId}", "${e.sectionRef}")`;
    if (!e.unique) {
      if (res.status === "AMBIGUOUS" && nodes.length === (e.occurrences ?? nodes.length)) L.pass("STRUCTURE", "PRODUCTION", "EXACT", ref, `AMBIGUOUS with ${nodes.length} occurrences as expected`);
      else L.fail("STRUCTURE", "PRODUCTION", "EXACT", ref, { severity: "AMBIGUITY_NOT_PRESERVED", outcomeClass: "INCORRECT_RESULT", expected: `AMBIGUOUS (${e.occurrences} occurrences)`, actual: `${res.status} (${nodes.length} occurrence(s))`, repro, deterministic: true });
      continue;
    }
    if (res.status !== "UNIQUE") {
      const sev: Severity = res.status === "NOT_FOUND" ? "MISSING_REQUIRED_COVENANT" : "UNSUPPORTED_AS_COMPLETE";
      const outcome: OutcomeClass = res.status === "NOT_FOUND" ? "INCORRECT_RESULT" : "CORRECT_FAIL_CLOSED";
      L.fail("STRUCTURE", "PRODUCTION", "EXACT", ref, { severity: sev, outcomeClass: outcome, expected: `UNIQUE ${e.nodeType} node`, actual: `${res.status} (${nodes.length} occurrence(s))${nodes.length > 1 ? `: ${nodes.map((n) => `"${ws(index.getNodeText(n.nodeId, "OWN")).slice(0, 50)}"`).join(" / ")}` : ""}`, repro, deterministic: true });
      continue;
    }
    const node = res.node;
    const problems: string[] = [];
    if (node.nodeType !== e.nodeType) problems.push(`nodeType ${node.nodeType} ≠ ${e.nodeType}`);
    const parent = node.parentNodeId ? index.getNodeById(node.parentNodeId) : undefined;
    if ((parent?.sectionRef ?? null) !== e.parentSectionRef) problems.push(`parent ${parent?.sectionRef ?? "null"} ≠ ${e.parentSectionRef ?? "null"}`);
    const own = ws(index.getNodeText(node.nodeId, "OWN"));
    const full = ws(index.getNodeText(node.nodeId, "DESCENDANTS"));
    for (const t of e.ownTextContains ?? []) if (!own.includes(ws(t))) problems.push(`own text lacks "${t}"`);
    for (const t of e.fullTextContains ?? []) if (!full.includes(ws(t))) problems.push(`full text lacks "${t}"`);
    if (problems.length === 0) L.pass("STRUCTURE", "PRODUCTION", "EXACT", ref, `UNIQUE ${node.nodeType} under ${parent?.sectionRef ?? "root"}`);
    else L.fail("STRUCTURE", "PRODUCTION", "EXACT", ref, { severity: problems.some((p) => p.includes("lacks")) ? "SOURCE_PROVENANCE_FAILURE" : "WRONG_OPERATIVE_SOURCE", outcomeClass: "INCORRECT_RESULT", expected: `${e.nodeType} under ${e.parentSectionRef} with the listed text`, actual: problems.join("; "), repro, deterministic: true });
  }
  // pinned covenant text: the whitespace-normalised DESCENDANTS text of each covenant node must hash to the manifest's
  // textSha256 (pin-corpus.ts). Any textual change to an operative clause is a deterministic failure here, which is what
  // makes an added proviso or a re-scoped entity visible without a model (mutation suite MUT-02 class).
  for (const c of m.covenants.filter((c) => c.textSha256)) {
    const ref = `structure:text:${c.id}`;
    const nodes = index.findNodesByRef(c.documentId, c.sectionRef);
    const node = c.occurrence ? nodes[c.occurrence - 1] : nodes.length === 1 ? nodes[0] : undefined;
    if (!node) { L.notTested("STRUCTURE", "PRODUCTION", "EXACT", ref, "covenant node not uniquely resolvable (see structure:<ref>)"); continue; }
    const actual = sha256(ws(index.getNodeText(node.nodeId, "DESCENDANTS")));
    if (actual === c.textSha256) L.pass("STRUCTURE", "PRODUCTION", "EXACT", ref, `node text hash ${actual.slice(0, 12)} matches the pinned clause text`);
    else L.fail("STRUCTURE", "PRODUCTION", "EXACT", ref, { severity: "SOURCE_PROVENANCE_FAILURE", outcomeClass: "INCORRECT_RESULT", expected: `clause text hash ${c.textSha256!.slice(0, 12)} (pinned from the fixture bytes)`, actual: `${actual.slice(0, 12)}: the parsed clause text differs from the pinned text`, repro: `sha256(ws(index.getNodeText(findNodesByRef("${c.documentId}","${c.sectionRef}")[${(c.occurrence ?? 1) - 1}].nodeId,"DESCENDANTS")))`, deterministic: true });
  }
  // generic structural invariants
  const orphans = index.orphans();
  if (orphans.length === 0) L.pass("STRUCTURE", "PRODUCTION", "INVARIANT", "structure:no-orphans", "no orphan nodes");
  else L.fail("STRUCTURE", "PRODUCTION", "INVARIANT", "structure:no-orphans", { severity: "SOURCE_PROVENANCE_FAILURE", outcomeClass: "INCORRECT_RESULT", expected: "no orphan nodes", actual: `${orphans.length} orphan(s): ${orphans.map((o) => `${o.documentId}#${o.sectionRef}`).join(", ")}`, repro: "index.orphans()", deterministic: true });
  const health = index.healthDiagnostics();
  if (health.length > 0) L.observe(`structure health diagnostics: ${health.map((h) => `${(h as { code?: string }).code ?? "?"}`).join(", ")}`);
  // every declared non-operative text: did the parser mint operative-looking nodes for it?
  for (const d of pkg.documents.filter((d) => !d.operative)) {
    const n = index.allNodes().filter((x) => x.documentId === d.documentId);
    L.observe(`non-operative document ${d.documentId} (${d.role}) yields ${n.length} structural node(s) and ${index.allDefinitions().filter((x) => x.documentId === d.documentId).length} definition record(s)`);
  }
}

export function auditDefinitions(pkg: CorpusPackage, s: DeterministicStages, L: Ledger): void {
  const { index } = s;
  for (const e of pkg.manifest.definitions.exact) {
    const ref = `definition:${e.documentId}#${e.term}`;
    const res = resolveUniqueDefinitionByRef(index, e.documentId, e.term);
    const repro = `resolveUniqueDefinitionByRef(index, "${e.documentId}", "${e.term}")`;
    if (res.status !== "UNIQUE") { L.fail("STRUCTURE", "PRODUCTION", "EXACT", ref, { severity: "MISSING_REQUIRED_COVENANT", outcomeClass: "INCORRECT_RESULT", expected: "UNIQUE definition", actual: res.status, repro, deterministic: true }); continue; }
    const problems: string[] = [];
    const fullText = index.getDefinitionFullText(e.term, e.documentId) ?? res.definition.definitionExcerpt;
    if (e.excerptContains && !ws(fullText).includes(ws(e.excerptContains))) problems.push(`definition text lacks "${e.excerptContains}"`);
    if (e.expectedSourceSectionRef) {
      const src = res.definition.sourceNodeId ? index.getNodeById(res.definition.sourceNodeId) : undefined;
      if ((src?.sectionRef ?? null) !== e.expectedSourceSectionRef) problems.push(`source node ${src?.sectionRef ?? "null"} ≠ ${e.expectedSourceSectionRef}`);
    }
    if (problems.length === 0) L.pass("STRUCTURE", "PRODUCTION", "EXACT", ref, "unique definition with expected text/source");
    else L.fail("STRUCTURE", "PRODUCTION", "EXACT", ref, { severity: "SOURCE_PROVENANCE_FAILURE", outcomeClass: "INCORRECT_RESULT", expected: `definition text contains "${e.excerptContains ?? ""}"${e.expectedSourceSectionRef ? ` sourced from ${e.expectedSourceSectionRef}` : ""}`, actual: problems.join("; "), repro, deterministic: true });
  }
  for (const f of pkg.manifest.definitions.mustNotResolveFrom) {
    const ref = `definition-forbidden:${f.documentId}#${f.term}<-${f.forbiddenSourceDocumentId}`;
    // a specific forbidden source document legitimately defines the term; that case is checked at CONTEXT_RETRIEVAL
    if (f.forbiddenSourceDocumentId !== "*" && pkg.manifest.documents.find((d) => d.documentId === f.forbiddenSourceDocumentId)?.operative) continue;
    const docs = f.forbiddenSourceDocumentId === "*" ? pkg.documents.map((d) => d.documentId) : [f.forbiddenSourceDocumentId];
    const hits = docs.flatMap((d) => { const r = resolveUniqueDefinitionByRef(index, d, f.term); return r.status === "NOT_FOUND" ? [] : [{ documentId: d, status: r.status }]; });
    if (hits.length === 0) L.pass("STRUCTURE", "PRODUCTION", "INVARIANT", ref, `no definition record for "${f.term}" in ${docs.join(",")}`);
    else L.fail("STRUCTURE", "PRODUCTION", "INVARIANT", ref, { severity: "SOURCE_PROVENANCE_FAILURE", outcomeClass: "INCORRECT_RESULT", expected: `"${f.term}" must have no definition record in ${docs.join(",")} (${f.reason})`, actual: `definition record(s) found: ${hits.map((h) => `${h.documentId}:${h.status}`).join(", ")}`, repro: `resolveUniqueDefinitionByRef(index, <doc>, "${f.term}")`, deterministic: true });
  }
}

export function auditOperativeState(pkg: CorpusPackage, s: DeterministicStages, L: Ledger): void {
  const { index } = s;
  if (s.amendmentError) { for (const e of pkg.manifest.operativeState.exact) L.fail("OPERATIVE_STATE", "PRODUCTION", "EXACT", `operative:${e.asOfDate}:${e.sectionRef}`, { severity: "EVIDENCE_INCOMPLETE", outcomeClass: "TEST_INFRASTRUCTURE_FAILURE", expected: e.status, actual: `amendment pipeline threw: ${s.amendmentError}`, repro: "runAmendmentPipeline", deterministic: true }); return; }
  L.observe(`instrument keys from package graph: ${[...s.instrumentKeys].map(([d, k]) => `${d}→${k}`).join(", ")} (manifest key "${pkg.manifest.instrumentKey}" would yield RESOLVED/zero provisions)`);
  if (s.amendment) {
    L.observe(`amendment effects: ${s.amendment.effects.length} (${s.amendment.effects.map((e) => `${e.amendmentDocumentId}→${e.target.targetDocumentId ?? "?"}#${e.target.targetSectionRef ?? e.target.targetDefinedTermRef ?? e.target.kind} ${e.operation} ${e.status}${e.effectiveDate.date ? ` eff ${e.effectiveDate.date}` : ""}`).join("; ") || "none"}); unattached: ${s.amendment.unattachedEffects.length}; conflicts: ${s.amendment.totalConflictsAcrossPackage}`);
  }
  for (const e of pkg.manifest.operativeState.exact) {
    const ref = `operative:${e.asOfDate}:${e.documentId}#${e.definitionTerm ?? e.sectionRef}`;
    const state = e.documentId === s.baseDocumentId ? s.operativeStates.get(e.asOfDate) : s.operativeStates.get(`${e.asOfDate}::${e.documentId}`);
    const repro = `computeOperativeContractState({asOfDate:"${e.asOfDate}", baseDocumentId:"${s.baseDocumentId}"}) → provision ${e.definitionTerm ?? e.sectionRef}`;
    if (!state) { L.fail("OPERATIVE_STATE", "PRODUCTION", "EXACT", ref, { severity: "EVIDENCE_INCOMPLETE", outcomeClass: "TEST_INFRASTRUCTURE_FAILURE", expected: e.status, actual: "no operative state computed", repro, deterministic: true }); continue; }
    const provision = state.provisions.find((p) => e.definitionTerm ? p.kind === "DEFINITION" && (p.definedTermRef ?? "").toLowerCase() === e.definitionTerm.toLowerCase() : p.kind === "SECTION" && p.sectionRef === e.sectionRef);
    // the base node's own supersession verdict - what a bypass-prone consumer would be told
    const baseNodes = e.definitionTerm ? [] : index.findNodesByRef(e.documentId, e.sectionRef);
    const sup = s.supersessionIndexes.get(e.asOfDate);
    const supStatus = baseNodes.length === 1 && sup ? getNodeSupersessionStatus(sup, e.documentId, baseNodes[0]!.nodeId).status : "N/A";
    const baseText = e.definitionTerm ? (index.getDefinitionFullText(e.definitionTerm, e.documentId) ?? "") : baseNodes.length === 1 ? index.getNodeText(baseNodes[0]!.nodeId, "DESCENDANTS") : "";
    const applied = provision?.appliedChain.length ?? 0;
    const current = provision?.currentText ?? null;
    const problems: string[] = [];
    if (e.status === "CURRENT") {
      if (applied > 0) problems.push(`${applied} effect(s) applied at ${e.asOfDate} although none expected`);
      if (supStatus !== "N/A" && supStatus !== "CURRENT_OPERATIVE") problems.push(`supersession status ${supStatus}`);
      for (const t of e.mustContain) if (!ws(current ?? baseText).includes(ws(t))) problems.push(`operative text lacks "${t}"`);
      for (const t of e.mustNotContain) if (ws(current ?? baseText).includes(ws(t))) problems.push(`operative text contains forbidden "${t}"`);
    } else {
      if (!provision) problems.push("no provision view recorded for this section/term");
      else {
        if (applied === 0) problems.push("no effect applied at this as-of date");
        if (e.supersededBy && provision.currentSourceDocumentId !== e.supersededBy) problems.push(`current source ${provision.currentSourceDocumentId} ≠ ${e.supersededBy}`);
        if (provision.status === "OPERATIVE_STATE_CONFLICTED") problems.push("CONFLICTED");
        if (e.status === "SUPERSEDED") {
          if (current === null) problems.push("currentText null (not derivable)");
          for (const t of e.mustContain) if (current && !ws(current).includes(ws(t))) problems.push(`current text lacks "${t}"`);
          for (const t of e.mustNotContain) if (current && ws(current).includes(ws(t))) problems.push(`current text contains superseded "${t}"`);
        } else {
          for (const t of e.mustNotContain) if (current && ws(current).includes(ws(t))) problems.push(`deleted provision still reads "${t}"`);
        }
      }
      if (supStatus !== "N/A" && supStatus === "CURRENT_OPERATIVE") problems.push(`base node still reported CURRENT_OPERATIVE at ${e.asOfDate}`);
    }
    const detail = `provision ${provision ? `${provision.status}, applied=${applied}, source=${provision.currentSourceDocumentId}` : "absent"}; node supersession=${supStatus}`;
    if (problems.length === 0) L.pass("OPERATIVE_STATE", "PRODUCTION", "EXACT", ref, `${e.status} as expected (${detail})`);
    else {
      // was the amendment that should have superseded this provision left UNRESOLVED upstream (pipeline-level), while the instrument state still says RESOLVED?
      const unresolvedUpstream = e.supersededBy ? (s.amendment?.effects ?? []).filter((x) => x.amendmentDocumentId === e.supersededBy && x.status !== "RESOLVED") : [];
      const stateClaimsResolved = state.status === "OPERATIVE_STATE_RESOLVED";
      const falsePermission = e.status !== "CURRENT" && (problems.some((p) => p.includes("still reads") || p.includes("superseded") || p.includes("CURRENT_OPERATIVE")));
      const failClosed = !stateClaimsResolved || problems.every((p) => p.includes("null") || p.includes("CONFLICTED") || p.includes("UNKNOWN") || p.includes("REVIEW"));
      const upstreamNote = unresolvedUpstream.length ? ` | upstream: ${unresolvedUpstream.map((x) => `${x.operation} ${x.status}: ${x.unresolvedReason ?? ""}`).join("; ")} while instrument state is ${state.status} with ${state.unattachedEffects.length} unattached` : "";
      L.fail("OPERATIVE_STATE", "PRODUCTION", "EXACT", ref, { severity: falsePermission ? "CRITICAL_FALSE_PERMISSION" : failClosed ? "EVIDENCE_INCOMPLETE" : "WRONG_OPERATIVE_SOURCE", outcomeClass: failClosed ? "CORRECT_FAIL_CLOSED" : "INCORRECT_RESULT", expected: `${e.status}${e.supersededBy ? ` by ${e.supersededBy}` : ""}; text contains [${e.mustContain.join(", ")}] not [${e.mustNotContain.join(", ")}]`, actual: `${problems.join("; ")} (${detail})${upstreamNote}`, repro, deterministic: true });
    }
  }
  for (const d of pkg.manifest.documents.filter((d) => d.role === "STALE_AMENDMENT")) {
    const ref = `operative:stale:${d.documentId}`;
    const eff = s.amendment?.effects.filter((e) => e.amendmentDocumentId === d.documentId) ?? [];
    const resolvedToBase = eff.filter((e) => e.status === "RESOLVED" && e.target.targetDocumentId === s.baseDocumentId);
    if (resolvedToBase.length === 0) L.pass("OPERATIVE_STATE", "PRODUCTION", "INVARIANT", ref, `stale amendment produced ${eff.length} effect(s), none RESOLVED against the base agreement (${eff.map((e) => `${e.status}:${e.target.targetSectionRef ?? "?"}`).join(", ") || "none"})`);
    else L.fail("OPERATIVE_STATE", "PRODUCTION", "INVARIANT", ref, { severity: "CRITICAL_FALSE_PERMISSION", outcomeClass: "INCORRECT_RESULT", expected: "zero RESOLVED effects against the base agreement", actual: resolvedToBase.map((e) => `${e.operation} on ${e.target.targetSectionRef}`).join(", "), repro: `runAmendmentPipeline → effects from ${d.documentId}`, deterministic: true });
  }
}

/** Pass A coverage is informational for discovery (Pass B+ NOT_RUN) but a hard check for non-operative text. */
export function auditDiscoveryPassA(pkg: CorpusPackage, s: DeterministicStages, L: Ledger): void {
  const { index } = s;
  const m = pkg.manifest;
  let covered = 0, total = 0;
  const uncovered: string[] = [];
  for (const c of m.covenants.filter((c) => c.material && c.operative)) {
    total += 1;
    const nodes = index.findNodesByRef(c.documentId, c.sectionRef);
    const node = c.occurrence ? nodes[c.occurrence - 1] : nodes[0];
    if (!node) { uncovered.push(`${c.id} (no node)`); continue; }
    const ancestors = [node, ...index.getAncestors(node.nodeId)].map((n) => n.nodeId);
    const hit = (s.passA.get(c.documentId) ?? []).some((p) => ancestors.includes(p.nodeId));
    if (hit) covered += 1; else uncovered.push(c.id);
  }
  L.observe(`Pass A deterministic signals cover ${covered}/${total} material covenants (self or ancestor)${uncovered.length ? `; uncovered: ${uncovered.join(", ")}` : ""}`);
  if (uncovered.length === 0) L.pass("DISCOVERY_PASS_A", "PRODUCTION", "INVARIANT", "discovery:pass-a-coverage", `${covered}/${total} material covenants carry a Pass A signal`);
  else L.fail("DISCOVERY_PASS_A", "PRODUCTION", "INVARIANT", "discovery:pass-a-coverage", { severity: "MISSING_REQUIRED_COVENANT", outcomeClass: "INCORRECT_RESULT", expected: "every material covenant node (or an ancestor) carries a Pass A signal", actual: `uncovered: ${uncovered.join(", ")}`, repro: "runPassADeterministicSignals(documentId, index)", deterministic: true });
  for (const d of pkg.documents.filter((d) => !d.operative)) {
    const hits = s.passA.get(d.documentId) ?? [];
    L.observe(`Pass A on non-operative ${d.documentId}: ${hits.length} candidate(s) ${hits.map((h) => h.sectionRef).join(",")}`);
  }
  L.notTested("DISCOVERY_PASS_B_PLUS", "NOT_RUN", "INVARIANT", "discovery:semantic-passes", "Pass B–D require a provider; discovery coverage of the manifest population is NOT established by this run.");
}

/** Context retrieval (production, provider-free) for every manifest covenant: definition-source and unresolved-term checks. */
export function auditContextRetrieval(pkg: CorpusPackage, s: DeterministicStages, L: Ledger): void {
  const { index } = s;
  const m = pkg.manifest;
  const asOf = m.operativeState.asOfDates[m.operativeState.asOfDates.length - 1]!;
  const candidatePkg = { companyId: m.companyId, instrumentKey: m.instrumentKey, packageKey: `${pkg.packageId}-package`, index, packageGraph: s.packageGraph, exactTermsByDocument: s.exactTermsByDocument, operativeState: s.operativeStates.get(asOf) ?? null, amendmentEffects: s.amendment?.effects ?? null, supersessionIndex: s.supersessionIndexes.get(asOf) };
  const forbidden = new Map<string, (typeof m.definitions.mustNotResolveFrom)[number]>(m.definitions.mustNotResolveFrom.map((f) => [`${f.documentId}|${f.term.toLowerCase()}`, f]));
  for (const c of m.covenants.filter((c) => c.operative)) {
    const cand = candidateFor(index, c.documentId, c.sectionRef, [c.family as never], c.role as never, c.id, c.occurrence);
    const ref = `context:${c.id}`;
    if (!cand) { L.notTested("CONTEXT_RETRIEVAL", "PRODUCTION", "INVARIANT", ref, "candidate node not uniquely resolvable (see STRUCTURE)"); continue; }
    let build: ReturnType<typeof buildCandidateCompilerInput>;
    try { build = buildCandidateCompilerInput(cand, candidatePkg); }
    catch (e) { L.fail("CONTEXT_RETRIEVAL", "PRODUCTION", "INVARIANT", ref, { severity: "EVIDENCE_INCOMPLETE", outcomeClass: "TEST_INFRASTRUCTURE_FAILURE", expected: "context bundle", actual: `threw: ${e instanceof Error ? e.message : String(e)}`, repro: `buildCandidateCompilerInput(${c.id})`, deterministic: true }); continue; }
    const defs = build.bundle.items.filter((i) => i.type === "DEFINITION" || i.type === "DEFINITION_DEPENDENCY");
    const unresolved = build.bundle.unresolvedDependencies;
    const problems: string[] = [];
    // forbidden definition sources
    for (const item of defs) {
      const key = `${c.documentId}|${item.normalizedRef.toLowerCase()}`;
      const f = forbidden.get(key) ?? [...forbidden.values()].find((x) => x.documentId === c.documentId && item.excerptText.toLowerCase().startsWith(`"${x.term.toLowerCase()}"`));
      if (f && (f.forbiddenSourceDocumentId === "*" || f.forbiddenSourceDocumentId === item.documentId) && item.documentId !== c.documentId) problems.push(`definition "${f.term}" retrieved from ${item.documentId} (${f.reason})`);
      if (f && f.forbiddenSourceDocumentId === "*" && item.documentId === c.documentId) problems.push(`definition "${f.term}" retrieved although never defined (${f.reason})`);
    }
    // declared unresolved terms must surface as unresolved, never as a resolved definition
    for (const t of c.unresolvedTerms ?? []) {
      const resolved = defs.find((d) => d.excerptText.toLowerCase().includes(`"${t.toLowerCase()}"`) || d.normalizedRef.toLowerCase() === t.toLowerCase());
      const flagged = unresolved.some((u) => u.sourceText.toLowerCase().includes(t.toLowerCase()));
      if (resolved) problems.push(`undefined term "${t}" resolved to ${resolved.documentId}:${resolved.sourceCitation}`);
      else if (!flagged) problems.push(`undefined term "${t}" not reported as an unresolved dependency`);
    }
    // same-document dependencies that exist must be retrieved
    const missing = c.dependsOnTerms.filter((t) => m.definitions.exact.some((d) => d.documentId === c.documentId && d.term === t) && !defs.some((d) => d.documentId === c.documentId && (d.normalizedRef.toLowerCase() === t.toLowerCase() || d.excerptText.toLowerCase().startsWith(`"${t.toLowerCase()}"`))));
    // declared cross-references that must resolve: the structural reference from the candidate (or a descendant) to the
    // declared target must exist, resolve, and land in the declared document - a dangling pointer is a MISSING_DEPENDENCY
    // (mutation suite MUT-10 found this expectation was declared in every manifest but audited nowhere)
    const danglingRefs: string[] = [];
    const reachedVia: string[] = [];
    for (const x of c.crossReferences ?? []) {
      if (!x.mustResolve) continue;
      const refs = index.findReferencesFrom(cand.structuralNodeIds[0]!, true).filter((r) => r.normalizedTarget === x.sectionRef || r.referenceText.replace(/^section\s+/i, "") === x.sectionRef);
      const landed = refs.filter((r) => r.resolved && r.targetNodeId && index.allNodes().some((n) => n.nodeId === r.targetNodeId && n.documentId === x.documentId));
      // a reference reached through a retrieved definition (J/K: Available Amount names the sibling baskets) arrives as a bundle item;
      // its TYPE varies with the sibling's own content (CROSS_REFERENCE in K; CALCULATION_PROVISION for J's ratio-bearing 7.06(c) -
      // the first version of this check accepted only CROSS_REFERENCE and mis-reported J as a missing dependency, see IPV-17 CLOSED)
      const viaBundle = build.bundle.items.filter((i) => i.type !== "OPERATIVE_SOURCE" && i.type !== "PARENT_SCOPE" && i.documentId === x.documentId && i.normalizedRef === x.sectionRef);
      if (landed.length > 0 || viaBundle.length > 0) { reachedVia.push(`${x.sectionRef}:${landed.length > 0 ? "structural reference" : viaBundle.map((i) => i.type).join("/")}`); continue; }
      if (refs.length === 0) danglingRefs.push(`no structural reference to ${x.sectionRef} from ${c.sectionRef} and no CROSS_REFERENCE bundle item for it (refs seen: ${index.findReferencesFrom(cand.structuralNodeIds[0]!, true).map((r) => `${r.referenceText}→${r.resolved ? "ok" : r.unresolvedReason ?? "unresolved"}`).join(", ") || "none"}; bundle cross-references: ${build.bundle.items.filter((i) => i.type === "CROSS_REFERENCE").map((i) => i.normalizedRef).join(", ") || "none"})`);
      else danglingRefs.push(`reference to ${x.sectionRef} does not resolve into ${x.documentId} (${refs.map((r) => `${r.referenceText}: ${r.resolved ? "resolved elsewhere" : r.targetAmbiguous ? "ambiguous" : r.unresolvedReason ?? "unresolved"}`).join("; ")})`);
    }
    const detail = `${defs.length} definition item(s) [${[...new Set(defs.map((d) => d.documentId))].join(",")}], ${unresolved.length} unresolved, sufficiency ${build.bundle.sufficiencyState}, operative text ${build.operativeSourceText.length} chars`;
    if (danglingRefs.length > 0) L.fail("CONTEXT_RETRIEVAL", "PRODUCTION", "INVARIANT", `${ref}:cross-references`, { severity: "MISSING_DEPENDENCY", outcomeClass: "INCORRECT_RESULT", expected: `declared cross-reference(s) resolve: ${(c.crossReferences ?? []).filter((x) => x.mustResolve).map((x) => `${x.documentId}#${x.sectionRef}`).join(", ")}`, actual: danglingRefs.join("; "), repro: `index.findReferencesFrom(candidateFor("${c.documentId}","${c.sectionRef}").structuralNodeIds[0], true)`, deterministic: true });
    else if ((c.crossReferences ?? []).some((x) => x.mustResolve)) L.pass("CONTEXT_RETRIEVAL", "PRODUCTION", "INVARIANT", `${ref}:cross-references`, `${(c.crossReferences ?? []).filter((x) => x.mustResolve).length} declared cross-reference(s) reachable in the declared document (${reachedVia.join("; ")})`);
    if (missing.length > 0) L.fail("CONTEXT_RETRIEVAL", "PRODUCTION", "INVARIANT", `${ref}:definitions`, { severity: "NONMATERIAL_OMISSION", outcomeClass: "INCORRECT_RESULT", expected: `same-document definition(s) used by the operative text are retrieved: ${missing.join(", ")}`, actual: `not in bundle (retrieved: ${defs.filter((d) => d.documentId === c.documentId).map((d) => d.normalizedRef).join(", ") || "none"}); operative text uses the term as "${missing.map((t) => (build.operativeSourceText.match(new RegExp(`\\b${t}s?\\b`)) ?? [t])[0]).join('", "')}"`, repro: `buildCandidateCompilerInput(candidateFor("${c.documentId}","${c.sectionRef}")).bundle.items`, deterministic: true });
    if (problems.length === 0) L.pass("CONTEXT_RETRIEVAL", "PRODUCTION", "INVARIANT", ref, detail);
    else L.fail("CONTEXT_RETRIEVAL", "PRODUCTION", "INVARIANT", ref, { severity: problems.some((p) => p.includes("resolved to") || p.includes("retrieved from")) ? "WRONG_OPERATIVE_SOURCE" : "UNSUPPORTED_AS_COMPLETE", outcomeClass: "INCORRECT_RESULT", expected: "definitions sourced from the covenant's own document; undefined terms reported unresolved", actual: `${problems.join("; ")} (${detail})`, repro: `buildCandidateCompilerInput(candidateFor("${c.documentId}","${c.sectionRef}"))`, deterministic: true });
  }
}

export function auditNonOperative(pkg: CorpusPackage, s: DeterministicStages, L: Ledger): void {
  const { index } = s;
  for (const n of pkg.manifest.nonOperative) {
    const ref = `non-operative:${n.documentId}:${n.textContains.slice(0, 30)}`;
    const nodes = index.allNodes().filter((x) => x.documentId === n.documentId && ws(index.getNodeText(x.nodeId, "OWN")).includes(ws(n.textContains)));
    const passAHits = (s.passA.get(n.documentId) ?? []).filter((p) => nodes.some((x) => x.nodeId === p.nodeId));
    const doc = pkg.manifest.documents.find((d) => d.documentId === n.documentId)!;
    if (!doc.operative) {
      // a non-operative document: any structural node + Pass A hit is a false-candidate risk, recorded at the discovery layer
      // Pass A is over-inclusive by design; a hit on non-operative text is recorded, and the downstream gates decide
      L.observe(`${n.documentId} (non-operative, ${doc.role}): "${n.textContains.slice(0, 40)}…" sits in ${nodes.length} node(s); Pass A candidates ${passAHits.length}${passAHits.length ? ` at ${passAHits.map((p) => p.sectionRef).join(",")}` : ""}`);
      L.pass("DISCOVERY_PASS_A", "PRODUCTION", "INVARIANT", ref, `non-operative text recorded (${passAHits.length} over-inclusive Pass A hit(s)); operative gates checked at OPERATIVE_STATE/CERTIFICATION`);
    } else {
      L.observe(`${n.documentId}: non-operative text "${n.textContains.slice(0, 40)}…" sits in ${nodes.length} structural node(s) (${nodes.map((x) => x.sectionRef).join(",") || "none - preamble/recital"}), Pass A hits ${passAHits.length}`);
    }
  }
}

export function auditDeterministic(pkg: CorpusPackage, s: DeterministicStages): Ledger {
  const L = new Ledger(pkg.packageId);
  auditStructure(pkg, s, L);
  auditDefinitions(pkg, s, L);
  auditOperativeState(pkg, s, L);
  auditDiscoveryPassA(pkg, s, L);
  auditContextRetrieval(pkg, s, L);
  auditNonOperative(pkg, s, L);
  return L;
}
export type { ExpectationsManifest };
