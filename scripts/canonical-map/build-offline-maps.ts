/**
 * OFFLINE canonical maps - zero provider calls.
 *
 *   CONMED  full map reconstructed from the PRESERVED run-original evidence (p3-candidate-evidence.v1 records) over the
 *           sealed phase-2f population: every candidate the run attempted becomes a map candidate with its real
 *           compilation/verification outcome; nothing is re-run, nothing is re-scored.
 *   LSB / FWRG  structure-only maps: the fixtures carry discovery runs (candidate populations) and source text but no
 *           certified compilation evidence, so every candidate is an explicit UNSERVED unresolved item - the map's
 *           completeness report says exactly how much of the package remains to be compiled.
 *   DSGR    not buildable offline: the fixture has raw/extracted text but no discovery run; discovery is a paid call.
 *
 * Usage: npx tsx scripts/canonical-map/build-offline-maps.ts [outDir]   (default docs/canonical-covenant-map/maps)
 */
import fs from "node:fs";
import path from "node:path";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { detectStructuralReferences } from "../../lib/contract-model/compiler/structural-references";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import type { DiscoveredCandidate } from "../../lib/contract-model/compiler/discovery/types";
import type { SemanticCompilationResult } from "../../lib/contract-model/compiler/semantic/types";
import type { SemanticVerificationResult } from "../../lib/contract-model/compiler/semantic-verification/types";
import { isEligibleForSemanticCompilation } from "../../lib/contract-model/compiler/semantic/package-compile";
import { operativeSourceTextFor } from "../../lib/contract-model/compiler/candidate-span";
import { assembleCovenantMap, computeSourceContentVersion, renderCovenantMapMarkdown, validateCovenantMap, type CandidateMapResult, type CanonicalCovenantMap } from "../../lib/contract-model/covenant-map";
import { buildDeterministicStages, rehydrateNodeIds, sealedPopulation, COMPANY_ID, PACKAGE_KEY, INSTRUMENT_KEY, DOCS } from "../p3-conmed-pilot/pipeline";

const ROOT = process.cwd();
const CONMED_RUN = "docs/phase-3-conmed-population-verified/run-original";

export interface OfflineMapBuild { map: CanonicalCovenantMap; markdown: string; validation: ReturnType<typeof validateCovenantMap>; notes: string[] }

function outcomeFromEvidence(ev: { compilation: { status: string; rules: unknown[]; definitions: unknown[]; sharedCapacities: unknown[] }; verification: { status: string } | null }): CandidateMapResult["outcome"] {
  const c = ev.compilation;
  if (c.status === "FAILED") return "COMPILE_FAILED";
  if (!ev.verification) return "VERIFICATION_FAILED";
  const ok = c.status === "COMPLETED" && (ev.verification.status === "VERIFIED_NO_MATERIAL_GAP_FOUND" || ev.verification.status === "VERIFIED_WITH_NON_MATERIAL_FINDINGS");
  return ok ? "MAPPED" : "MAPPED_WITH_REVIEW";
}

export function buildConmedOfflineMap(): OfflineMapBuild {
  const notes: string[] = [];
  const stages = buildDeterministicStages();
  const pop = sealedPopulation();
  const { rehydrated, unresolved } = rehydrateNodeIds(pop.all, stages.index);
  if (unresolved.length > 0) notes.push(`${unresolved.length} sealed node key(s) did not rehydrate uniquely`);
  const evidenceDir = path.join(ROOT, CONMED_RUN, "evidence");
  const evidenceByRef = new Map<string, Record<string, unknown>>();
  for (const f of fs.readdirSync(evidenceDir)) {
    if (!f.endsWith(".json")) continue;
    const ev = JSON.parse(fs.readFileSync(path.join(evidenceDir, f), "utf8")) as Record<string, unknown>;
    if (typeof ev.candidateRef === "string" && ev.compilation) evidenceByRef.set(ev.candidateRef, ev);
  }
  const results: CandidateMapResult[] = [];
  for (const candidate of rehydrated) {
    const eligibility = isEligibleForSemanticCompilation(candidate);
    const opText = operativeSourceTextFor(candidate, stages.index);
    const anchor = candidate.structuralNodeIds[0] ?? null;
    const scv = computeSourceContentVersion({ documentId: candidate.documentId, structuralNodeId: anchor, operativeSourceText: opText });
    const base = { candidate, input: null, bundle: null, verification: null, operativeProvision: null, operativeSourceText: opText, sourceContentVersion: scv.version, identityStrength: scv.strength, telemetry: null } as const;
    if (!eligibility.eligible) { results.push({ ...base, compilation: null, outcome: "INELIGIBLE", failure: { kind: "INELIGIBLE", detail: eligibility.reason ?? "ineligible" } }); continue; }
    if (!anchor) { results.push({ ...base, compilation: null, outcome: "NO_STRUCTURAL_ANCHOR", failure: { kind: "NO_STRUCTURAL_ANCHOR", detail: "sealed candidate has no resolvable structural node" } }); continue; }
    if (opText.trim().length === 0) { results.push({ ...base, compilation: null, outcome: "EMPTY_OPERATIVE_TEXT", failure: { kind: "EMPTY_OPERATIVE_TEXT", detail: "anchor node carries no text" } }); continue; }
    const ev = evidenceByRef.get(candidate.discoveryId) as { compilation: SemanticCompilationResult & { outputHash: string }; verification: (SemanticVerificationResult & { findings: SemanticVerificationResult["findings"] }) | null; run: { timedOut: boolean; costUsd: number | null; inputTokens: number | null; outputTokens: number | null; wallClockMs: number | null } } | undefined;
    if (!ev) { results.push({ ...base, compilation: null, outcome: "UNSERVED", failure: { kind: "UNSERVED", detail: "no preserved evidence record for this candidate in run-original (never attempted or unserved at HTTP 402)" } }); continue; }
    const compilation = { ...ev.compilation, cacheKey: `offline:${ev.compilation.outputHash}`, compiledAt: ev.compilation.compiledAt ?? "", telemetry: ev.compilation.telemetry ?? null } as SemanticCompilationResult;
    const verification = ev.verification ? ({ ...ev.verification, candidateRef: candidate.discoveryId, verifiedAt: "", semanticReviewSkippedReason: null } as unknown as SemanticVerificationResult) : null;
    const outcome = outcomeFromEvidence({ compilation: ev.compilation, verification: ev.verification });
    const failure = outcome === "COMPILE_FAILED" ? { kind: ev.compilation.failureReasons[0] ?? "FAILED", detail: ev.compilation.errorDetail?.sanitizedMessage ?? ev.compilation.unresolvedIssues[0] ?? (ev.run.timedOut ? "WALL_CLOCK_TIMEOUT" : "") } : outcome === "VERIFICATION_FAILED" ? { kind: "NOT_VERIFIED", detail: "compilation produced units but no verification record was preserved" } : null;
    results.push({ ...base, compilation, verification, outcome, failure, telemetry: { candidateAttempt: 1, semanticConversations: 1, refinementConversations: 0, transportAttempts: (compilation.telemetry?.attemptCount ?? 1), shardAttempts: 0, inventoryCalls: 0, verifierCalls: 0, providerCalls: 0, inputTokens: ev.run.inputTokens, outputTokens: ev.run.outputTokens, costUsd: ev.run.costUsd, pricingStatus: null, wallClockMs: ev.run.wallClockMs, deadlineMs: null, timedOut: ev.run.timedOut } });
  }
  notes.push("legacy run: telemetry conversations/transport counts are not distinguishable in v1 evidence and are recorded as 1/attemptCount; execution mode was not captured by v1 evidence");
  const documents = DOCS.map((d) => ({ documentId: d.documentId, label: d.label, text: stages.index.getDocumentText(d.documentId) ?? "", role: d.documentId.includes("amendment") ? ("AMENDMENT" as const) : d.documentId.includes("eighth-ar-credit-agreement") ? ("BASE" as const) : ("ANCILLARY" as const) }));
  const map = assembleCovenantMap({ companyId: COMPANY_ID, packageKey: PACKAGE_KEY, instrumentKey: INSTRUMENT_KEY, asOfDate: null, documents, index: stages.index, operativeState: null, certifiedConfigIdentity: null, discoveryRunVersion: rehydrated[0]?.discoveryRunVersion ?? null, candidates: rehydrated, results });
  return { map, markdown: renderCovenantMapMarkdown(map), validation: validateCovenantMap(map), notes };
}

interface FixtureSpec { key: string; companyId: string; instrumentKey: string; dir: string; files: { documentId: string; label: string; file: string; role: "BASE" | "ANCILLARY" }[]; discoveryRun: string }
const FIXTURES: FixtureSpec[] = [
  { key: "lsb-2023-abl-credit-agreement", companyId: "lsb-offline", instrumentKey: "lsb-2023-abl-credit-agreement", dir: "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement", files: [{ documentId: "lsb-ca", label: "LSB 2023 ABL Credit Agreement (definitions + Article VI)", file: "definitions-excerpt.txt", role: "BASE" }, { documentId: "lsb-ca-article-6", label: "LSB Article VI negative covenants", file: "article-6-negative-covenants.txt", role: "BASE" }, { documentId: "lsb-intercreditor-joinder", label: "LSB intercreditor joinder", file: "intercreditor-joinder.txt", role: "ANCILLARY" }], discoveryRun: "discovery-runs/run-1787801821.json" },
  { key: "fwrg-2021-credit-agreement", companyId: "fwrg-offline", instrumentKey: "fwrg-2021-credit-agreement", dir: "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement", files: [{ documentId: "fwrg-ca", label: "FWRG 2021 Credit Agreement (definitions)", file: "definitions-excerpt.txt", role: "BASE" }, { documentId: "fwrg-ca-article-6", label: "FWRG Article VI negative covenants", file: "article-6-negative-covenants.txt", role: "BASE" }], discoveryRun: "" },
];

export function buildStructureOnlyMap(spec: FixtureSpec): OfflineMapBuild | null {
  const notes: string[] = [];
  const nodesByDocument = new Map<string, { text: string; nodes: ReturnType<typeof parseDocumentStructure> }>();
  const defs: ReturnType<typeof detectStructuralDefinitions> = [], refs: ReturnType<typeof detectStructuralReferences> = [];
  const documents: { documentId: string; label: string; text: string; role: "BASE" | "ANCILLARY" }[] = [];
  for (const f of spec.files) {
    const p = path.join(ROOT, spec.dir, f.file);
    if (!fs.existsSync(p)) { notes.push(`missing ${f.file}`); continue; }
    const text = fs.readFileSync(p, "utf8");
    const nodes = parseDocumentStructure({ documentId: f.documentId, label: f.label, text });
    nodesByDocument.set(f.documentId, { text, nodes });
    refs.push(...detectStructuralReferences(f.documentId, text, nodes));
    defs.push(...detectStructuralDefinitions(f.documentId, text, nodes));
    documents.push({ documentId: f.documentId, label: f.label, text, role: f.role });
  }
  const index = buildStructuralIndex(nodesByDocument, defs, refs);
  let discovered: DiscoveredCandidate[] = [];
  const runDir = path.join(ROOT, spec.dir, "discovery-runs");
  const runFile = spec.discoveryRun ? path.join(ROOT, spec.dir, spec.discoveryRun) : fs.existsSync(runDir) ? path.join(runDir, fs.readdirSync(runDir).filter((f) => f.endsWith(".json")).sort().at(-1) ?? "") : "";
  if (runFile && fs.existsSync(runFile)) {
    const run = JSON.parse(fs.readFileSync(runFile, "utf8")) as { candidates: DiscoveredCandidate[] };
    discovered = run.candidates;
    notes.push(`discovery population from ${path.relative(ROOT, runFile)} (${discovered.length} candidates)`);
  } else { notes.push("no discovery run in the fixture; a discovery pass is a paid call and was not run"); return null; }
  // the fixture's discovery run predates node ids and may name documents differently from this offline index: rehydrate by section ref within the fixture's documents
  const candidates: DiscoveredCandidate[] = discovered.map((c) => {
    if (Array.isArray(c.structuralNodeIds) && c.structuralNodeIds.length > 0) return c;
    const ids: string[] = [];
    for (const key of c.structuralNodeKeys ?? []) {
      const sep = key.indexOf("::"); const ref = sep >= 0 ? key.slice(sep + 2) : key;
      for (const doc of documents) { const r = index.resolveUniqueNodeByRef(doc.documentId, ref); if (r.status === "UNIQUE") { ids.push(r.node.nodeId); break; } }
    }
    return { ...c, documentId: ids[0] ? index.getNodeById(ids[0])!.documentId : c.documentId, structuralNodeIds: ids };
  });
  const results: CandidateMapResult[] = candidates.map((candidate) => {
    const eligibility = isEligibleForSemanticCompilation(candidate);
    const opText = operativeSourceTextFor(candidate, index);
    const scv = computeSourceContentVersion({ documentId: candidate.documentId, structuralNodeId: candidate.structuralNodeIds[0] ?? null, operativeSourceText: opText });
    const base = { candidate, input: null, bundle: null, compilation: null, verification: null, operativeProvision: null, operativeSourceText: opText, sourceContentVersion: scv.version, identityStrength: scv.strength, telemetry: null } as const;
    if (!eligibility.eligible) return { ...base, outcome: "INELIGIBLE", failure: { kind: "INELIGIBLE", detail: eligibility.reason ?? "ineligible" } };
    if (candidate.structuralNodeIds.length === 0) return { ...base, outcome: "NO_STRUCTURAL_ANCHOR", failure: { kind: "NO_STRUCTURAL_ANCHOR", detail: `node keys ${JSON.stringify(candidate.structuralNodeKeys)} do not resolve in the offline index` } };
    if (opText.trim().length === 0) return { ...base, outcome: "EMPTY_OPERATIVE_TEXT", failure: { kind: "EMPTY_OPERATIVE_TEXT", detail: "anchor node carries no text" } };
    return { ...base, outcome: "UNSERVED", failure: { kind: "UNSERVED", detail: "structure-only offline map: no certified compilation has been run for this fixture (paid)" } };
  });
  const map = assembleCovenantMap({ companyId: spec.companyId, packageKey: spec.key, instrumentKey: spec.instrumentKey, asOfDate: null, documents, index, operativeState: null, certifiedConfigIdentity: null, discoveryRunVersion: candidates[0]?.discoveryRunVersion ?? null, candidates, results });
  return { map, markdown: renderCovenantMapMarkdown(map), validation: validateCovenantMap(map), notes };
}

export function buildAllOfflineMaps(): Record<string, OfflineMapBuild | null> {
  const out: Record<string, OfflineMapBuild | null> = { "conmed-2025-credit-facility": buildConmedOfflineMap() };
  for (const spec of FIXTURES) out[spec.key] = buildStructureOnlyMap(spec);
  out["dsgr-2022-2025-credit-facility"] = null;
  return out;
}

if (process.argv[1]?.endsWith("build-offline-maps.ts")) {
  const outDir = path.resolve(process.argv[2] ?? "docs/canonical-covenant-map/maps");
  fs.mkdirSync(outDir, { recursive: true });
  const summary: Record<string, unknown> = {};
  for (const [key, build] of Object.entries(buildAllOfflineMaps())) {
    if (!build) { summary[key] = { built: false, reason: "no discovery run in the fixture; discovery is a paid call and was not run" }; continue; }
    fs.writeFileSync(path.join(outDir, `${key}.map.json`), JSON.stringify(build.map, null, 2));
    fs.writeFileSync(path.join(outDir, `${key}.map.md`), build.markdown);
    summary[key] = { built: true, mapHash: build.map.mapHash, validation: build.validation.ok ? "ok" : build.validation.problems, completeness: build.map.completeness, notes: build.notes };
  }
  fs.writeFileSync(path.join(outDir, "00-offline-maps-summary.json"), JSON.stringify({ builtAt: new Date().toISOString(), paidCalls: 0, maps: summary }, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}
