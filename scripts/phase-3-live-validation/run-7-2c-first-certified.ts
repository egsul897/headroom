/**
 * FIRST CERTIFIED LIVE VALIDATION - exactly ONE candidate (CONMED §7.2(c), discovery-candidate:7a3f36589dacd05c41331a80)
 * through the canonical Phase 3 path (certifyDiscoveredCovenantPackage -> compileCandidateToVerifiedIR), under the
 * production HardDispatchBudget with a $0.25 hard ceiling, the locked model, no fallback, no candidate retry.
 *
 * This script decides WHERE to write and WHAT to assert before dispatch. It builds nothing semantic itself.
 *
 *   npx tsx scripts/phase-3-live-validation/run-7-2c-first-certified.ts --dry-run   # resolve + assert + bounds, NO credential, NO provider
 *   npx tsx scripts/phase-3-live-validation/run-7-2c-first-certified.ts --live      # the one paid attempt
 *
 * Transport observation: the Anthropic SDK captures globalThis.fetch at client construction, so this runner installs an
 * observing fetch BEFORE building the certified callers. It records request bodies (model, max_tokens, thinking, tool
 * names, system-prompt head) and response model/usage from the SSE stream. It NEVER records headers.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { buildDeterministicStages, rehydrateNodeIds, sealedPopulation, COMPANY_ID, INSTRUMENT_KEY, PACKAGE_KEY } from "../p3-conmed-pilot/pipeline";
import { loadPreservedPhase2OperativeState, checkOperativeStateAsOf } from "./operative-state";
import { governingProvisionFor } from "../../lib/contract-model/compiler/candidate-span";
import { resolveOperativeSource } from "../../lib/contract-model/compiler/candidate-span";
import { resolveSourceContext } from "../../lib/contract-model/compiler/semantic-accountability/source-context";
import { batchSlots, partitionSourceSlots } from "../../lib/contract-model/compiler/semantic-accountability/slots";
import { splitOversizedBatches } from "../../lib/contract-model/compiler/semantic-accountability/inventory";
import { CERTIFIED_INVENTORY_EXECUTION_POLICY, deriveInventoryOutputBound, inventoryPolicyIdentity } from "../../lib/contract-model/compiler/semantic-accountability/inventory-policy";
import { certifiedConfig, certifiedConfigIdentity } from "../../lib/contract-model/compiler/certified-config";
import { InMemorySemanticCompilationCache } from "../../lib/contract-model/compiler/semantic/cache";
import { HardDispatchBudget } from "../../lib/contract-model/analyzer/dispatch-budget";
import { certifyDiscoveredCovenantPackage, renderCovenantMapMarkdown, validateCovenantMap, type CovenantMapPackageInput, type CertifiedExecutionDeps } from "../../lib/contract-model/covenant-map";
import { createCertifiedCallers } from "../../lib/contract-model/covenant-map/callers";
import { unsealedPopulation } from "../../lib/contract-model/phase3-certification/discovery-population";
import { certifiedMapToVerifiedExecutionPackage } from "../../lib/contract-model/phase3-certification/phase4-adapter";
import { evaluateVerifiedCapacity } from "../../lib/contract-model/verified-execution";
import { serializeVerifiedUnitPackage } from "../../lib/contract-model/verified-units";
import { buildSemanticVerificationProjection, renderSemanticVerificationProjectionMarkdown } from "../../lib/contract-model/compiler/semantic-verification/projection";
import { buildCandidateEvidence, writeCandidateEvidence, scanForSecrets } from "../p3-conmed-pilot/evidence";
import type { IRDefinition, IRRule, IRSharedCapacity } from "../../lib/contract-model/ir/types";
import type { InputResolver } from "../../lib/contract-model/runtime/types";

const TARGET_ID = "discovery-candidate:7a3f36589dacd05c41331a80";
const TARGET_REF = "7.2(c)";
const TARGET_DOC = "conmed-doc-a-eighth-ar-credit-agreement";
const EXPECTED_TEXT_SHA256 = "d1d9ba7d8d98729d30df82d6b5e3ac4016a7e9155917786247592d57d3477472";
const EXPECTED_CHARS = 529;
const MODEL = "deepseek/deepseek-v4-flash";
const HARD_CEILING_USD = 0.25;
// The first certified run's evidence (7.2c-first-certified/) is immutable. Every later attempt writes to its own directory,
// chosen with --out <dir>; the default names the operative-state rerun. Writing into the first run's directory is refused.
const FIRST_CERTIFIED_EVIDENCE = "docs/phase-3-live-validation/7.2c-first-certified";
const outArg = process.argv.find((a) => a.startsWith("--out="))?.slice("--out=".length) ?? (process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : undefined);
const OUT = outArg ?? "docs/phase-3-live-validation/7.2c-rerun-operative-state";
if (path.resolve(OUT) === path.resolve(FIRST_CERTIFIED_EVIDENCE)) throw new Error(`refusing to write into immutable evidence ${FIRST_CERTIFIED_EVIDENCE}; pass --out <new directory>`);
// Additive persistence only: an attempt directory already holding evidence from another attempt is never overwritten.
if (fs.existsSync(OUT) && fs.readdirSync(OUT).length > 0) throw new Error(`refusing to write into ${OUT}: already populated by another attempt; pass --out <new directory>`);
const LEGACY_MAX_TOKENS = 128_000;
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const mode = process.argv.includes("--live") ? "LIVE" : "DRY_RUN";

// ---------------------------------------------------------------------------------------------------------------
// transport observer (no headers, ever)
// ---------------------------------------------------------------------------------------------------------------
interface TransportObservation {
  seq: number; at: string; urlPath: string; method: string;
  request: { model: string | null; maxTokens: number | null; thinking: unknown; stream: boolean | null; toolNames: string[]; toolChoice: unknown; systemHead: string | null; messages: number; bodyChars: number } | null;
  response: { status: number | null; ok: boolean | null; responseModel: string | null; messageId: string | null; stopReason: string | null; usage: Record<string, unknown> | null; durationMs: number; bodyChars: number; error: string | null };
}
const observations: TransportObservation[] = [];
function installObserver(): void {
  const real = globalThis.fetch;
  let seq = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const n = ++seq; const started = Date.now();
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    let request: TransportObservation["request"] = null;
    try {
      const bodyText = typeof init?.body === "string" ? init.body : null;
      if (bodyText) {
        const b = JSON.parse(bodyText) as Record<string, unknown>;
        const sys = typeof b.system === "string" ? b.system : Array.isArray(b.system) ? JSON.stringify(b.system) : null;
        request = { model: typeof b.model === "string" ? b.model : null, maxTokens: typeof b.max_tokens === "number" ? b.max_tokens : null, thinking: b.thinking ?? null, stream: typeof b.stream === "boolean" ? b.stream : null, toolNames: Array.isArray(b.tools) ? (b.tools as { name?: string }[]).map((t) => t.name ?? "?") : [], toolChoice: b.tool_choice ?? null, systemHead: sys ? sys.slice(0, 120) : null, messages: Array.isArray(b.messages) ? b.messages.length : 0, bodyChars: bodyText.length };
      }
    } catch { request = null; }
    const rec: TransportObservation = { seq: n, at: new Date().toISOString(), urlPath: (() => { try { return new URL(url).pathname; } catch { return url; } })(), method: init?.method ?? "GET", request, response: { status: null, ok: null, responseModel: null, messageId: null, stopReason: null, usage: null, durationMs: 0, bodyChars: 0, error: null } };
    observations.push(rec);
    let res: Response;
    try { res = await real(input, init); } catch (err) { rec.response.error = err instanceof Error ? `${err.name}: ${err.message}` : String(err); rec.response.durationMs = Date.now() - started; throw err; }
    rec.response.status = res.status; rec.response.ok = res.ok;
    // tee the body: the SDK consumes the original; we parse a clone for model/usage (SSE or JSON)
    try {
      const clone = res.clone();
      void clone.text().then((text) => {
        rec.response.bodyChars = text.length; rec.response.durationMs = Date.now() - started;
        const usage: Record<string, unknown> = {};
        for (const line of text.split("\n")) {
          const t = line.startsWith("data:") ? line.slice(5).trim() : line.trim();
          if (!t || !t.startsWith("{")) continue;
          try {
            const ev = JSON.parse(t) as Record<string, unknown>;
            const msg = (ev.type === "message_start" ? ev.message : ev.type === undefined && ev.model ? ev : null) as Record<string, unknown> | null;
            if (msg) { if (typeof msg.model === "string") rec.response.responseModel = msg.model; if (typeof msg.id === "string") rec.response.messageId = msg.id; if (msg.usage && typeof msg.usage === "object") Object.assign(usage, msg.usage as Record<string, unknown>); if (typeof msg.stop_reason === "string") rec.response.stopReason = msg.stop_reason; }
            if (ev.type === "message_delta") { const d = ev.delta as Record<string, unknown> | undefined; if (d && typeof d.stop_reason === "string") rec.response.stopReason = d.stop_reason; if (ev.usage && typeof ev.usage === "object") Object.assign(usage, ev.usage as Record<string, unknown>); }
            if (ev.type === "error") rec.response.error = JSON.stringify(ev.error ?? ev).slice(0, 300);
          } catch { /* partial line */ }
        }
        rec.response.usage = Object.keys(usage).length > 0 ? usage : null;
      }).catch((e: unknown) => { rec.response.error = `clone read failed: ${e instanceof Error ? e.message : String(e)}`; });
    } catch (e) { rec.response.error = `clone failed: ${e instanceof Error ? e.message : String(e)}`; }
    return res;
  }) as typeof fetch;
}

// ---------------------------------------------------------------------------------------------------------------
function loadKey(): string {
  const line = fs.readFileSync(".env.local", "utf8").split("\n").find((l) => l.startsWith("AI_GATEWAY_API_KEY="));
  const key = line ? line.slice("AI_GATEWAY_API_KEY=".length).trim().replace(/^["']|["']$/g, "") : "";
  if (!key) throw new Error("AI_GATEWAY_API_KEY not present in .env.local");
  return key;
}
function write(name: string, value: unknown): string {
  const body = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const hits = scanForSecrets(body);
  if (hits.length > 0) throw new Error(`refusing to write ${name}: credential-shaped content at ${JSON.stringify(hits)}`);
  fs.mkdirSync(OUT, { recursive: true });
  const p = path.join(OUT, name);
  fs.writeFileSync(p, body);
  return p;
}
const j = (v: unknown) => JSON.stringify(v);

function renderInventory(inv: Record<string, unknown> | null | undefined): string {
  if (!inv) return "# Pass A inventory\n\n(no frozen inventory on the compilation result)\n";
  const items = (inv.items as Record<string, unknown>[]) ?? [];
  const lines = ["# Pass A frozen inventory (human-readable)", "", `candidateRef: ${inv.candidateRef}`, `inventoryStatus: ${inv.inventoryStatus}`, `inventoryStatusReason: ${inv.inventoryStatusReason}`, `sourceContextState: ${inv.sourceContextState}`, `executionPolicy: ${inv.executionPolicy ?? "(none)"}`, `items: ${items.length}  rejectedOverBound: ${inv.rejectedOverBoundItems ?? 0}  rejectedUnverifiable: ${inv.rejectedUnverifiableItems}  rejectedDuplicate: ${inv.rejectedDuplicateItems}`, `unaccountedSource: ${j(inv.unaccountedSource)}`, `uninventoriedValues: ${j(inv.uninventoriedValues)}`, `ensemble: ${j(inv.ensemble ?? null)}`, ""];
  items.forEach((it, i) => {
    const span = it.sourceSpan as Record<string, unknown> | undefined;
    lines.push(`## item ${i + 1}  ${it.inventoryItemId}`, `- slot: ${it.slotId ?? "(none)"}  span: ${span?.sectionRef ?? ""} [${span?.charStart}-${span?.charEnd}] ${span?.sourceCitation ?? ""}`, `- excerpt: ${j((span?.text ?? span?.excerpt ?? it.excerpt ?? it.sourceExcerpt) ?? null)}`, `- proposition: ${it.proposition}`, `- primary role: ${it.semanticRole}  declared roles: ${j(it.declaredRoles ?? [])}  functions: ${j(it.semanticFunctions ?? null)}`, `- materiality: ${it.materiality}  operative: ${it.operative}  detection: ${it.detectionMethod}`, `- values: ${j(it.quantitativeValues)}`, `- referenced terms: ${j(it.referencedTerms)}  referenced sections: ${j(it.referencedSections)}`, `- ambiguity: ${it.ambiguity}${it.ambiguityReason ? ` (${it.ambiguityReason})` : ""}`, `- support: ${j(it.support ?? null)}`, "");
  });
  return lines.join("\n");
}
function renderIR(comp: { rules: IRRule[]; definitions: IRDefinition[]; sharedCapacities: IRSharedCapacity[] }, contract: { operativeSourceVersion: string | null; semanticSourceContractVersion: string | null }): string {
  // Diagnostics only: the SAME production projection the Layer-2 reviewer is shown (projection.ts), never a runner-maintained field list.
  return renderSemanticVerificationProjectionMarkdown(buildSemanticVerificationProjection(comp), contract);
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  // ---- 1. resolve the target from the sealed population through production rehydration; assert identity
  const stages = buildDeterministicStages();
  const pop = sealedPopulation();
  const { rehydrated, unresolved } = rehydrateNodeIds(pop.all, stages.index);
  const target = rehydrated.find((c) => c.discoveryId === TARGET_ID);
  if (!target) throw new Error(`target ${TARGET_ID} not in the sealed population`);
  const sameRef = rehydrated.filter((c) => c.normalizedSourceRef === TARGET_REF && c.documentId === TARGET_DOC);
  const anchor = target.structuralNodeIds[0] ? stages.index.getNodeById(target.structuralNodeIds[0]) : undefined;
  // ---- 1b. the REAL preserved Phase-2 operative state for this instrument (semantic fidelity §32/§33): supplied to the
  // canonical package input below; never faked, never used to overwrite what Phase 2 left unresolved
  const phase2 = loadPreservedPhase2OperativeState({ instrumentKey: INSTRUMENT_KEY, baseDocumentId: TARGET_DOC });
  const governing = governingProvisionFor(target, phase2.state);
  const src = resolveOperativeSource(target, stages.index, phase2.state);
  const runAsOfDate = startedAt.slice(0, 10);
  const asOf = checkOperativeStateAsOf(phase2, { asOfDate: runAsOfDate, documents: stages.documents.map((d) => ({ documentId: d.documentId, label: d.label })) });
  const identity = {
    discoveryId: target.discoveryId, documentId: target.documentId, normalizedSourceRef: target.normalizedSourceRef, structuralNodeKeys: target.structuralNodeKeys, structuralNodeIds: target.structuralNodeIds,
    anchor: anchor ? { nodeId: anchor.nodeId, nodeKey: anchor.nodeKey, nodeType: anchor.nodeType, sectionRef: anchor.sectionRef, charStart: anchor.charStart, charEnd: anchor.charEnd } : null,
    operativeSourceOrigin: src.origin, operativeSourceChars: src.text.length, operativeSourceSha256: sha256(src.text), operativeSourceText: src.text,
    expected: { chars: EXPECTED_CHARS, sha256: EXPECTED_TEXT_SHA256 }, occurrencesOfRefInDocument: sameRef.length, rehydrationUnresolvedForTarget: unresolved.filter((u) => u.discoveryId === TARGET_ID),
    families: target.families, role: target.role, discoveryRunVersion: target.discoveryRunVersion,
  };
  const assertions = {
    candidateIdMatches: target.discoveryId === TARGET_ID, documentMatches: target.documentId === TARGET_DOC, sectionRefMatches: target.normalizedSourceRef === TARGET_REF,
    structuralNodeResolved: !!anchor && anchor.sectionRef === TARGET_REF && anchor.documentId === TARGET_DOC, singleOccurrence: sameRef.length === 1,
    textSha256Matches: sha256(src.text) === EXPECTED_TEXT_SHA256, charsMatch: src.text.length === EXPECTED_CHARS,
  };
  write("01-target-identity.json", { identity, assertions });
  write("01b-operative-state.json", {
    adapter: phase2.adapterVersion, source: phase2.source, analyzedDocuments: phase2.analyzedDocuments, documentsProcessed: phase2.documentsProcessed, asOfConsistency: asOf,
    instrumentState: { status: phase2.state.status, asOfDate: phase2.state.asOfDate, summary: phase2.state.summary, provisions: phase2.state.provisions.map((p) => ({ provisionKey: p.provisionKey, kind: p.kind, sectionRef: p.sectionRef, definedTermRef: p.definedTermRef, status: p.status, currentSourceDocumentId: p.currentSourceDocumentId, unresolvedIssues: p.unresolvedIssues })), unattachedEffects: phase2.state.unattachedEffects.length, effects: phase2.effects.length },
    target: { governingProvision: governing ? { provisionKey: governing.provisionKey, status: governing.status, currentSourceDocumentId: governing.currentSourceDocumentId, appliedEffectIds: governing.appliedChain.map((c) => c.effectId), supersededSourceNodeIds: governing.supersededSourceNodeIds } : null, operativeSourceOrigin: src.origin, note: governing ? "a Phase-2 provision governs this candidate" : "no Phase-2 provision governs this candidate: the base structural node text is the operative source; relied-upon definitions carry their own operative state through the context bundle" },
  });
  if (Object.values(assertions).some((v) => !v)) throw new Error(`target identity assertions failed: ${j(assertions)} - NO paid request`);

  // ---- 2. derived Pass A bounds from the current code (the expectation the live run is held to)
  const policy = CERTIFIED_INVENTORY_EXECUTION_POLICY;
  const sc = resolveSourceContext({ index: stages.index, documentId: target.documentId, operativeSourceText: src.text, anchorNodeId: anchor?.nodeId ?? null, operativeCharStart: anchor?.charStart ?? null, documentText: stages.index.getDocumentText(target.documentId) ?? "" });
  const accountability = { ...sc, regions: sc.regions.filter((r) => r.kind === "OPERATIVE") };
  const partition = partitionSourceSlots({ sourceContext: accountability, structuralIndex: stages.index });
  const batches = splitOversizedBatches(batchSlots(partition, accountability, policy.batchChars), policy.maxBatchSlots);
  const bounds = batches.map((b) => deriveInventoryOutputBound(b.slots, stages.index, policy));
  const derived = { policy: inventoryPolicyIdentity(policy), sourceContextState: sc.state, slots: partition.slots.length, batches: batches.length, maxLegitimateItems: bounds.reduce((n, b) => n + b.maxItems, 0), parseCeilings: bounds.map((b) => b.parseCeiling), maxSerializedChars: bounds.reduce((n, b) => n + b.maxSerializedChars, 0), requestedMaxOutputTokensByBatch: bounds.map((b) => b.maxOutputTokens), reasoning: policy.reasoning, callDeadlineMs: policy.callDeadlineMs };

  const config = certifiedConfig({ semanticModel: MODEL, inventoryModel: MODEL, verifierModel: MODEL });
  const preflight = { mode, startedAt, headSha: fs.existsSync(".git") ? (() => { try { return fs.readFileSync(".git/" + fs.readFileSync(".git/HEAD", "utf8").trim().replace("ref: ", ""), "utf8").trim(); } catch { return null; } })() : null, target: TARGET_ID, model: MODEL, hardCeilingUsd: HARD_CEILING_USD, certifiedConfigIdentity: certifiedConfigIdentity(config), candidateDeadlineMs: config.candidateDeadlineMs, maxOutputTokensSemantic: config.maxOutputTokens, inventoryMode: config.inventoryMode, expansionRegionPolicy: config.expansionRegionPolicy, operativeState: { source: phase2.source.path, runId: phase2.source.runId, status: phase2.state.status, provisions: phase2.state.provisions.length, governingProvisionForTarget: governing?.provisionKey ?? null }, asOfDate: startedAt.slice(0, 10), derivedPassABounds: derived, inputs: { documents: stages.documents.map((d) => ({ documentId: d.documentId, chars: d.text.length, sha256: sha256(d.text) })), sealedPopulationCandidates: pop.all.length, rehydrationUnresolved: unresolved.length } };
  write("00-preflight.json", { ...preflight, asOfConsistency: asOf });
  if (!asOf.proven) { console.log(JSON.stringify({ stop: "OPERATIVE_STATE_AS_OF_NOT_PROVEN", asOf }, null, 1)); throw new Error("OPERATIVE_STATE_AS_OF_NOT_PROVEN: the preserved Phase-2 state cannot be shown current for this run's as-of; NO paid request"); }
  console.log(JSON.stringify({ mode, assertions, derived }, null, 1));
  if (mode === "DRY_RUN") { console.log("DRY_RUN complete: no credential loaded, no provider contacted"); return; }

  // ---- 3. LIVE: observer first, then the certified callers (they capture globalThis.fetch at construction)
  installObserver();
  const apiKey = loadKey();
  const callers = createCertifiedCallers(config, { apiKey });
  const budget = new HardDispatchBudget({ ceilingUsd: HARD_CEILING_USD, maxCalls: 40 });
  const asOfDate = runAsOfDate;
  const runId = `live-7.2c-rerun-operative-state-${startedAt}`;
  const pkg: CovenantMapPackageInput = {
    companyId: COMPANY_ID, packageKey: PACKAGE_KEY, instrumentKey: INSTRUMENT_KEY, asOfDate,
    documents: stages.documents.map((d) => ({ documentId: d.documentId, label: d.label, text: d.text, role: d.documentId === TARGET_DOC ? ("BASE" as const) : d.documentId.includes("amendment") ? ("AMENDMENT" as const) : ("ANCILLARY" as const) })),
    index: stages.index, packageGraph: stages.packageGraph, exactTermsByDocument: stages.access.exactTermsByDocument, operativeState: phase2.state, amendmentEffects: phase2.effects,
    candidates: [target], discoveryRunVersion: target.discoveryRunVersion, discoveryPopulation: unsealedPopulation([target], target.discoveryRunVersion, "PARTIAL_TARGET_SET"), runId,
    // the FULL sealed population (rehydrated), so references to separately-owned covenants resolve to known external candidates
    candidatePopulation: rehydrated.map((c) => ({ discoveryId: c.discoveryId, structuralNodeIds: c.structuralNodeIds })),
  };
  const deps: CertifiedExecutionDeps = { config, ...callers, budget, cache: new InMemorySemanticCompilationCache(), concurrency: 1 };
  const t0 = Date.now();
  let run: Awaited<ReturnType<typeof certifyDiscoveredCovenantPackage>> | null = null;
  let fatal: string | null = null;
  try { run = await certifyDiscoveredCovenantPackage(pkg, deps); } catch (err) { fatal = err instanceof Error ? `${err.name}: ${err.message}` : String(err); }
  const wallClockMs = Date.now() - t0;
  await new Promise((r) => setTimeout(r, 1500)); // let the observer's clone reads settle
  const snapshot = budget.snapshot();
  write("03-transport-observations.json", { note: "request/response observation at the fetch boundary; headers are never recorded", observations });
  if (!run) { write("02-run-summary.json", { mode, runId, fatal, wallClockMs, budget: snapshot }); console.log(JSON.stringify({ fatal, budget: snapshot }, null, 1)); return; }

  const r = run.results[0]!;
  const comp = r.compilation;
  const inv = (comp?.frozenInventory ?? null) as Record<string, unknown> | null;
  write("02-run-summary.json", { mode, runId, wallClockMs, outcome: r.outcome, failure: r.failure, stop: run.stop, telemetry: r.telemetry, budget: snapshot, compilationStatus: comp?.status ?? null, failureReasons: comp?.failureReasons ?? [], verificationStatus: r.verification?.status ?? null, certification: r.certification?.status ?? null, packageCertification: run.packageCertification.status, modelRequested: MODEL, modelsReported: [...new Set(observations.map((o) => o.response.responseModel).filter(Boolean))], requestMaxTokens: observations.map((o) => o.request?.maxTokens ?? null), legacy128kUsed: observations.some((o) => o.request?.maxTokens === LEGACY_MAX_TOKENS) });
  write("04-pass-a-calls.json", { inventoryMode: comp?.inventoryMode ?? null, inventoryPasses: comp?.inventoryPasses ?? null, calls: inv?.calls ?? null, executionPolicy: inv?.executionPolicy ?? null, derivedBounds: derived });
  write("05-inventory-human-readable.md", renderInventory(inv));
  write("06-compilation.json", comp);
  write("07-ir-human-readable.md", comp ? renderIR(comp, { operativeSourceVersion: r.sourceContentVersion, semanticSourceContractVersion: r.semanticSourceContract?.version ?? null }) : "(no compilation)");
  // semantic-fidelity artifacts (closure): support groups, retrieval state, context-only emissions, typed source dependencies
  const invItems = (inv?.items ?? []) as { inventoryItemId: string; sourceSpan: { charStart: number; charEnd: number }; semanticRole: string; materiality: string; proposition: string; support?: unknown }[];
  write("04b-support-groups.json", { ensemble: inv?.ensemble ?? null, items: invItems.map((it) => ({ inventoryItemId: it.inventoryItemId, span: [it.sourceSpan.charStart, it.sourceSpan.charEnd], semanticRole: it.semanticRole, materiality: it.materiality, proposition: it.proposition, support: it.support ?? null })) });
  const b = r.bundle;
  write("05b-context-retrieval.json", b ? { sufficiencyState: b.sufficiencyState, stopReasons: [...b.stopReasons], retrievalStops: b.retrievalStops ?? [], performance: b.performance, itemsRetained: b.items.length, items: b.items.map((i) => ({ type: i.type, normalizedRef: i.normalizedRef, retrievalDepth: i.retrievalDepth, excerptChars: i.excerptText.length, evidenceState: i.evidenceState })), unresolvedDependencies: b.unresolvedDependencies, hasUnresolvedOperativeEvidence: b.hasUnresolvedOperativeEvidence ?? null, unresolvedEvidenceItemIds: b.unresolvedEvidenceItemIds ?? [] } : null);
  write("06b-context-only-emissions.json", { contextOnlyEmissions: comp?.contextOnlyEmissions ?? [], invalidWireKinds: comp?.invalidWireKinds ?? [], dependencyProseDiagnostics: comp?.dependencyProseDiagnostics ?? [] });
  write("06c-source-dependencies.json", { rules: (comp?.rules ?? []).map((x) => ({ ruleId: x.ruleId, sourceSectionRef: x.sourceSectionRef, sourceDependencies: x.sourceDependencies ?? [], unresolvedDependencies: x.unresolvedDependencies ?? [], dependsOn: x.dependsOn, conditions: x.conditions.map((c) => ({ conditionId: c.conditionId, conditionType: c.conditionType, referencesRuleTargets: c.referencesRuleTargets ?? [], targetCombination: c.targetCombination ?? null, evaluationBasis: c.evaluationBasis ?? null, expressionKind: c.expression?.kind ?? null, description: c.description })), inheritedAttributes: x.inheritedAttributes ?? [], entityScope: x.entityScope, entityScopeExcluded: x.entityScopeExcluded, entityScopeAudit: x.entityScopeAudit ?? null })) });
  write("08-verification.json", r.verification);
  if (r.verifiedPackage) write("09-verified-units.json", serializeVerifiedUnitPackage(r.verifiedPackage));
  write("10-certification.json", { certification: r.certification, semanticSourceContract: r.semanticSourceContract, snapshotHash: r.snapshot?.snapshotHash ?? null, snapshotUnits: r.snapshot?.units.map((u) => ({ kind: u.kind, id: u.verifiedIdentity.ruleOrDefinitionId, identity: u.verifiedIdentity })) ?? [] });
  write("11-package-manifest.json", { packageCertification: run.packageCertification, manifest: run.manifest });
  write("12-map.json", run.map);
  write("12-map.md", renderCovenantMapMarkdown(run.map));
  write("13-map-validation.json", validateCovenantMap(run.map));
  write("11b-package-dependencies.json", run.map.packageDependencies);
  // evidence v2 through the pilot's production-backed builder (file I/O only here)
  if (r.input && comp) {
    const ev = buildCandidateEvidence(r.input, comp, r.verification, { model: MODEL, tier: 1, wallClockMs: r.telemetry?.wallClockMs ?? null, inputTokens: r.telemetry?.inputTokens ?? null, outputTokens: r.telemetry?.outputTokens ?? null, costUsd: r.telemetry?.costUsd ?? null, costStatus: r.telemetry?.pricingStatus ?? null, timedOut: r.telemetry?.timedOut ?? false, notes: ["FIRST_CERTIFIED_LIVE_VALIDATION", "PARTIAL_TARGET_SET", `budget ceiling $${HARD_CEILING_USD}`] }, { certified: { configIdentity: certifiedConfigIdentity(config), telemetry: r.telemetry } });
    const c = r.certification;
    if (c) ev.certification = { status: c.status, blockers: c.blockers.map((b) => b.code), warnings: c.warnings.map((w) => w.code), operativeSourceVersion: c.operativeSourceVersion, semanticSourceContractVersion: c.semanticSourceContractVersion, artifactPackageHash: c.artifactPackageHash, snapshotHash: c.snapshotHash };
    if (r.verifiedPackage) ev.verifiedUnits = { file: "09-verified-units.json", packageHash: r.verifiedPackage.packageHash, complete: r.verifiedPackage.complete, artifactsPersisted: r.verifiedPackage.counts.artifactsPersisted, unitsMissingVerification: r.verifiedPackage.counts.unitsMissingVerification, problems: [...new Set(r.verifiedPackage.problems.map((p) => p.code))].sort() };
    const body = JSON.stringify(ev);
    if (scanForSecrets(body).length > 0) throw new Error("evidence carries credential-shaped content; not written");
    writeCandidateEvidence(path.join(OUT, "evidence"), TARGET_ID, ev);
  }
  // ---- 4. Phase 4 handoff ONLY if CERTIFIED
  let adapter: unknown = { attempted: false, reason: `certification ${r.certification?.status ?? "none"}` };
  if (r.certification?.status === "CERTIFIED" && r.verifiedPackage) {
    const derivedPkg = certifiedMapToVerifiedExecutionPackage([{ certification: r.certification, verifiedPackage: serializeVerifiedUnitPackage(r.verifiedPackage) }]);
    let binding: unknown = null;
    if (derivedPkg.outcome === "DERIVED") {
      // binding test only: a null-returning resolver supplies NO financial inputs; nothing is fabricated
      const inputs: InputResolver = { resolveMetric: () => null, resolveTerm: () => ({ status: "UNRESOLVED", definitionId: null, value: null, provenance: null } as never), resolveRule: (id) => derivedPkg.package.rules.find((x) => x.ruleId === id) ?? null, resolveLedgerUsage: () => null, resolveTransactionInput: () => null, resolveEventActive: () => null };
      const out = evaluateVerifiedCapacity({ package: derivedPkg.package, inputs, asOf: asOfDate });
      binding = out.outcome === "EXECUTED" ? { outcome: out.outcome, policy: out.policy, packageHash: out.packageHash, coverage: out.coverage, envelopeUnits: out.envelope.units.map((u) => ({ id: u.identity.ruleOrDefinitionId, strength: u.identityStrength, status: u.verificationStatus })), capacities: out.state.capacities.map((c) => ({ capacityNodeId: c.capacityNodeId, ruleId: c.ruleId, status: c.status })) } : out;
    }
    adapter = { attempted: true, adapter: derivedPkg.outcome === "DERIVED" ? { outcome: derivedPkg.outcome, included: derivedPkg.included, excluded: derivedPkg.excluded, artifactPackageHashes: derivedPkg.artifactPackageHashes, rules: derivedPkg.package.rules.length, definitions: derivedPkg.package.definitions?.length ?? 0, sharedCapacities: derivedPkg.package.sharedCapacities?.length ?? 0, verifications: derivedPkg.package.verifications.map((v) => [v.kind, v.ruleOrDefinitionId]) } : derivedPkg, strictBinding: binding };
  }
  write("14-phase4-adapter.json", adapter);
  console.log(JSON.stringify({ outcome: r.outcome, compile: comp?.status, verify: r.verification?.status, cert: r.certification?.status, blockers: r.certification?.blockers.map((b) => b.code), pkg: run.packageCertification.status, budget: snapshot, telemetry: r.telemetry, maxTokens: observations.map((o) => [o.request?.maxTokens, o.request?.thinking, o.response.status, o.response.responseModel, o.response.usage]) }, null, 1));
}

main().catch((err) => { console.error(err); process.exit(1); });
