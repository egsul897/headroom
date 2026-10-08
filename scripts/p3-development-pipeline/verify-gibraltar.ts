/**
 * Gibraltar DEVELOPMENT compile-then-verify.
 *
 * Reads the persisted Haiku discovery rows. Does not re-run Pass B.
 * Builds each compiler input with buildCandidateCompilerInput from the
 * rebuilt structural index and the existing discoveryId. Does not mint ids.
 *
 * Spend gate: the Haiku list-scaled verification figure previously shown
 * for these rows ($162.63). Compilation shares that ceiling. A call starts
 * only when compileReservationUsd / verifyReservationUsd still fit.
 * priceUsage has no Haiku card; tokens are priced at the list rates in
 * scripts/semantic-accountability-cost-plan.ts ($1 / $5 per million).
 *
 * DEVELOPMENT ≠ CERTIFIED. No pin. eligible is not set true.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CovenantFamily } from "@prisma/client";
import { parseDocument } from "../../lib/extraction/parse";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex, type StructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../../lib/contract-model/compiler/structural-references";
import { runPassADeterministicSignals } from "../../lib/contract-model/compiler/discovery/pass-a-signals";
import { DISCOVERY_RUN_VERSION } from "../../lib/contract-model/compiler/discovery/pipeline";
import { DISCOVERY_ROLES, type DiscoveredCandidate, type DiscoveryMethod, type DiscoveryRole } from "../../lib/contract-model/compiler/discovery/types";
import { EMPTY_SUPERSESSION_INDEX, getNodeSupersessionStatus } from "../../lib/contract-model/compiler/amendment/operative-state";
import type { NodeSupersessionStatus } from "../../lib/contract-model/compiler/amendment/types";
import { buildCandidateCompilerInput } from "../../lib/contract-model/covenant-map/candidate-input";
import { buildPackageGraph } from "../../lib/contract-model/compiler/package-graph/pipeline";
import { operativeSourceTextFor } from "../../lib/contract-model/compiler/candidate-span";
import { isEligibleForSemanticCompilation } from "../../lib/contract-model/compiler/semantic/package-compile";
import { getSemanticCaller } from "../../lib/contract-model/compiler/semantic/caller";
import { compileCovenantToIR } from "../../lib/contract-model/compiler/semantic/compile";
import { InMemorySemanticCompilationCache } from "../../lib/contract-model/compiler/semantic/cache";
import type { SemanticCompilationResult } from "../../lib/contract-model/compiler/semantic/types";
import { getStageCaller, type StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import { verifyCompiledCandidate } from "../../lib/contract-model/compiler/semantic-verification/verify";
import type { SemanticVerificationResult } from "../../lib/contract-model/compiler/semantic-verification/types";
import { observeDeterministicCrossCutText } from "../stratified-cert/lib/cross-cuts";
import type { GatewayModel } from "../p3-conmed-pilot/probe-models";
import { compileReservationUsd, compileShape, shapeExceeded, verifyReservationUsd } from "../p3-conmed-pilot/reservation-policy";
import { BudgetLedger, DEFAULT_CANDIDATE_TIMEOUT_MS, accountForRequest, type CostRecord } from "../p3-conmed-pilot/timeout-policy";
import { detectCreditExhaustionInError, detectCreditExhaustionInResult } from "../p3-conmed-pilot/gateway-credit";

export const DEVELOPMENT_BANNER = "DEVELOPMENT ≠ CERTIFIED ≠ PINNED_OFFLINE";
export const HAIKU_MODEL_ID = "anthropic/claude-haiku-4.5";
/** The Haiku figure already shown for 842 uncompiled rows. Compilation is inside this same ceiling. */
export const SHOWN_HAIKU_VERIFICATION_CEILING_USD = 162.63;
/**
 * Per-candidate abort. The 480s CONMED ceiling cut the first Gibraltar section off
 * mid-shard (wall clock 480022ms, SHARD_INCOMPLETE, 0 rules). Fifteen minutes lets a
 * multi-shard compile finish. The dollar reservation is unchanged: output is already
 * capped at 128000 tokens, so a longer wall clock does not raise compileReservationUsd.
 */
export const GIBRALTAR_CANDIDATE_TIMEOUT_MS = 900_000;
export const COMPANY_ID = "gibraltar-2026-credit-agreement";
export const PACKAGE_KEY = "gibraltar-2026-credit-agreement";
export const INSTRUMENT_KEY = "gibraltar-doc-a-2026-02-02-credit-agreement";
export const DOCUMENT_ID = "gibraltar-doc-a-2026-02-02-credit-agreement";

const PACKAGE_DIR = "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement";
const EXECUTION_PATH = path.join(PACKAGE_DIR, "development-pipeline/execution.json");
const OUT_PATH = path.join(PACKAGE_DIR, "development-pipeline/verification.json");
const PREFLIGHT_PATH = path.join(PACKAGE_DIR, "development-pipeline/verification-preflight.json");
const LABEL = "Gibraltar Industries, Inc. Credit Agreement dated as of February 2, 2026 (EX-10.1)";
const FAMILY_VALUES = new Set<string>(Object.values(CovenantFamily));
const ROLE_VALUES = new Set<string>(DISCOVERY_ROLES);
const SEVERITY_RANK: Record<NodeSupersessionStatus, number> = { KNOWN_SUPERSEDED: 2, UNKNOWN_SUPERSESSION_STATUS: 1, CURRENT_OPERATIVE: 0 };

export function haikuGatewayModel(): GatewayModel {
  return {
    id: HAIKU_MODEL_ID,
    context_window: 200_000,
    max_tokens: 128_000,
    type: "language",
    pricing: { input: String(1 / 1_000_000), output: String(5 / 1_000_000) },
  };
}

export function verificationDispatchRank(args: {
  normalizedSourceRef: string;
  structuralNodeIds: readonly string[];
  phraseNodeIds: ReadonlySet<string>;
  reclassNodeIds: ReadonlySet<string>;
  assetNodeIds: ReadonlySet<string>;
}): number {
  const ref = args.normalizedSourceRef;
  if (args.structuralNodeIds.some((id) => args.phraseNodeIds.has(id))) return 0;
  if (args.structuralNodeIds.some((id) => args.reclassNodeIds.has(id))) return 1;
  if (args.structuralNodeIds.some((id) => args.assetNodeIds.has(id)) || ref === "7.04" || ref.startsWith("7.04")) return 2;
  if (ref === "7.05" || ref.startsWith("7.05")) return 3;
  return 4;
}

interface PersistedRow {
  discoveryId: string;
  role: string;
  families: string[];
  normalizedSourceRef: string;
  structuralNodeIds: string[];
  description: string;
}

interface PreparedCandidate {
  candidate: DiscoveredCandidate;
  operativeChars: number;
  droppedFamilies: string[];
  rank: number;
  sourceIndex: number;
}

interface StoredAttempt {
  discoveryId?: string;
  compile?: { costUsd?: number; rules?: number; definitions?: number; wallClockMs?: number };
  verify?: { costUsd?: number | null; status?: string | null };
}

function loadPriorAttempts(): StoredAttempt[] {
  try {
    const parsed = JSON.parse(readFileSync(OUT_PATH, "utf8")) as { model?: string; ceilingUsd?: number; attempts?: StoredAttempt[] };
    if (parsed.model !== HAIKU_MODEL_ID || parsed.ceilingUsd !== SHOWN_HAIKU_VERIFICATION_CEILING_USD || !Array.isArray(parsed.attempts)) return [];
    return parsed.attempts;
  } catch {
    return [];
  }
}

function writeJson(file: string, body: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(body, null, 2) + "\n");
  renameSync(tmp, file);
}

function worstSupersession(nodeIds: string[]): { status: NodeSupersessionStatus; reason: string } {
  if (nodeIds.length === 0) {
    return { status: "UNKNOWN_SUPERSESSION_STATUS", reason: "This discovery carries no structural node identity at all - supersession status cannot be determined." };
  }
  let worst = getNodeSupersessionStatus(EMPTY_SUPERSESSION_INDEX, DOCUMENT_ID, nodeIds[0] ?? null);
  for (const nodeId of nodeIds.slice(1)) {
    const current = getNodeSupersessionStatus(EMPTY_SUPERSESSION_INDEX, DOCUMENT_ID, nodeId);
    if (SEVERITY_RANK[current.status] > SEVERITY_RANK[worst.status]) worst = current;
  }
  const reason = nodeIds.length > 1
    ? `${nodeIds.length} structural nodes span this discovery; worst-case supersession status reported. ${worst.reason}`
    : worst.reason;
  return { status: worst.status, reason };
}

function meter(inner: StageCaller): { caller: StageCaller; read: () => { inputTokens: number; outputTokens: number; calls: number } } {
  let inputTokens = 0;
  let outputTokens = 0;
  let calls = 0;
  const caller: StageCaller = {
    providerName: inner.providerName,
    model: inner.model,
    isSynthetic: inner.isSynthetic,
    async call(schema, stage, systemPrompt, userContent, options) {
      try {
        return await inner.call(schema, stage, systemPrompt, userContent, options);
      } finally {
        const telemetry = inner.lastTelemetry();
        if (telemetry) {
          inputTokens += telemetry.inputTokens ?? 0;
          outputTokens += telemetry.outputTokens ?? 0;
          calls += 1;
        }
      }
    },
    lastTelemetry: () => inner.lastTelemetry(),
  };
  return { caller, read: () => ({ inputTokens, outputTokens, calls }) };
}

class CandidateTimeoutError extends Error {
  constructor(ms: number) {
    super(`candidate exceeded the ${ms}ms wall-clock ceiling`);
    this.name = "CandidateTimeoutError";
  }
}

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new CandidateTimeoutError(ms)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? 0;
}

async function loadIndex(): Promise<{ index: StructuralIndex; exactTerms: Map<string, Map<string, string>>; packageGraph: ReturnType<typeof buildPackageGraph>; signalsByNodeId: Map<string, string[]>; phraseNodeIds: Set<string>; reclassNodeIds: Set<string>; assetNodeIds: Set<string> }> {
  const packageDir = path.resolve(PACKAGE_DIR);
  const rawHtml = readFileSync(path.join(packageDir, "raw-html/ef20064499_ex10-1.htm"));
  const extractedText = readFileSync(path.join(packageDir, "extracted-text/credit-agreement.txt"), "utf8");
  const parsed = await parseDocument(rawHtml, "text/html");
  const text = parsed.fullText === extractedText ? parsed.fullText : extractedText;
  const nodes = parseDocumentStructure({ documentId: DOCUMENT_ID, label: LABEL, text });
  const definitions = detectStructuralDefinitions(DOCUMENT_ID, text, nodes);
  const references = detectStructuralReferences(DOCUMENT_ID, text, nodes);
  const index = buildStructuralIndex(new Map([[DOCUMENT_ID, { text, nodes }]]), definitions, references);
  const exactTerms = new Map<string, Map<string, string>>();
  for (const definition of definitions) {
    const byTerm = exactTerms.get(definition.documentId) ?? new Map<string, string>();
    byTerm.set(definition.normalizedTerm, definition.exactTerm);
    exactTerms.set(definition.documentId, byTerm);
  }
  const packageGraph = buildPackageGraph(COMPANY_ID, PACKAGE_KEY, [{ documentId: DOCUMENT_ID, label: LABEL, text }]);
  const deterministic = runPassADeterministicSignals(DOCUMENT_ID, index, EMPTY_SUPERSESSION_INDEX);
  const signalsByNodeId = new Map(deterministic.map((candidate) => [candidate.nodeId, [...candidate.signals]]));
  const phraseNodeIds = new Set(
    index.allNodes().filter((node) => node.documentId === DOCUMENT_ID && index.getNodeText(node.nodeId, "OWN").includes("Available Amount Builder Basket")).map((node) => node.nodeId),
  );
  const reclassNodeIds = new Set(
    index.allNodes().filter((node) => node.documentId === DOCUMENT_ID && observeDeterministicCrossCutText(index.getNodeText(node.nodeId, "OWN")).reclassificationHeuristic).map((node) => node.nodeId),
  );
  const asset = index.resolveUniqueNodeByRef(DOCUMENT_ID, "7.04");
  const assetNodes = asset.status === "UNIQUE" ? [asset.node] : asset.status === "AMBIGUOUS" ? asset.candidates : [];
  return { index, exactTerms, packageGraph, signalsByNodeId, phraseNodeIds, reclassNodeIds, assetNodeIds: new Set(assetNodes.map((node) => node.nodeId)) };
}

function rehydrate(row: PersistedRow, index: StructuralIndex, signalsByNodeId: Map<string, string[]>, windows: { phraseNodeIds: Set<string>; reclassNodeIds: Set<string>; assetNodeIds: Set<string> }, sourceIndex: number): { prepared: PreparedCandidate | null; skip: { discoveryId: string; reason: string } | null } {
  if (!ROLE_VALUES.has(row.role)) return { prepared: null, skip: { discoveryId: row.discoveryId, reason: `role ${row.role} is not a DISCOVERY_ROLES member` } };
  const structuralNodeKeys: string[] = [];
  for (const nodeId of row.structuralNodeIds) {
    const node = index.getNodeById(nodeId);
    if (!node || node.documentId !== DOCUMENT_ID) return { prepared: null, skip: { discoveryId: row.discoveryId, reason: `structural node ${nodeId} is not in the rebuilt index` } };
    structuralNodeKeys.push(node.nodeKey);
  }
  if (structuralNodeKeys.length === 0) return { prepared: null, skip: { discoveryId: row.discoveryId, reason: "no structural node id" } };
  const droppedFamilies = row.families.filter((family) => !FAMILY_VALUES.has(family));
  const families = row.families.filter((family) => FAMILY_VALUES.has(family)) as DiscoveredCandidate["families"];
  const signals = [...new Set(row.structuralNodeIds.flatMap((nodeId) => signalsByNodeId.get(nodeId) ?? []))];
  const discoveryMethods: DiscoveryMethod[] = ["SEMANTIC_CLASSIFICATION"];
  if (signals.length > 0) discoveryMethods.push("DETERMINISTIC_SIGNAL");
  if (row.structuralNodeIds.length > 1) discoveryMethods.push("NEIGHBORHOOD_EXPANSION");
  const supersession = worstSupersession(row.structuralNodeIds);
  const candidate: DiscoveredCandidate = {
    discoveryId: row.discoveryId,
    documentId: DOCUMENT_ID,
    structuralNodeKeys,
    structuralNodeIds: [...row.structuralNodeIds],
    normalizedSourceRef: row.normalizedSourceRef,
    families,
    role: row.role as DiscoveryRole,
    roleRaw: "",
    roleNormalizationStatus: "FALLBACK_REVIEW_REQUIRED",
    familiesRaw: [],
    familiesNormalizationStatus: "FALLBACK_REVIEW_REQUIRED",
    description: row.description,
    multipleRulesLikely: false,
    definedTermDependencyLikely: false,
    discoveryMethods,
    evidenceSignals: signals,
    reviewStatus: "NEEDS_REVIEW",
    confidence: null,
    sourceCitation: "",
    discoveryRunVersion: DISCOVERY_RUN_VERSION,
    supersessionStatus: supersession.status,
    supersessionReason: supersession.reason,
  };
  const operativeChars = operativeSourceTextFor(candidate, index).length;
  return {
    prepared: {
      candidate,
      operativeChars,
      droppedFamilies,
      rank: verificationDispatchRank({
        normalizedSourceRef: row.normalizedSourceRef,
        structuralNodeIds: row.structuralNodeIds,
        phraseNodeIds: windows.phraseNodeIds,
        reclassNodeIds: windows.reclassNodeIds,
        assetNodeIds: windows.assetNodeIds,
      }),
      sourceIndex,
    },
    skip: null,
  };
}

function findingSummary(verification: SemanticVerificationResult) {
  return verification.findings.map((finding) => ({
    findingId: finding.findingId,
    findingType: finding.findingType,
    severity: finding.severity,
    irPath: finding.irPath,
    sourceEvidence: finding.sourceEvidence.replace(/\s+/g, " ").trim().slice(0, 180),
  }));
}

function compileUsage(result: SemanticCompilationResult, passA: { inputTokens: number; outputTokens: number }): { inputTokens: number; outputTokens: number } | null {
  const semanticIn = result.telemetry?.inputTokens;
  const semanticOut = result.telemetry?.outputTokens;
  if (semanticIn == null && semanticOut == null && passA.inputTokens === 0 && passA.outputTokens === 0) return null;
  return { inputTokens: (semanticIn ?? 0) + passA.inputTokens, outputTokens: (semanticOut ?? 0) + passA.outputTokens };
}

async function main(): Promise<void> {
  const dry = process.argv.includes("--dry");
  const record = JSON.parse(readFileSync(EXECUTION_PATH, "utf8")) as {
    passB?: { executed?: boolean; model?: string; terminal?: string };
    discoveredCandidates?: PersistedRow[];
  };
  if (record.passB?.executed !== true || record.passB.model !== HAIKU_MODEL_ID || record.passB.terminal !== "PASS_B_REAL_PROVIDER") {
    throw new Error("Refusing to verify. execution.json is not the Haiku PASS_B_REAL_PROVIDER record.");
  }
  const rows = record.discoveredCandidates ?? [];
  const loaded = await loadIndex();
  const seen = new Set<string>();
  const skipped: Array<{ discoveryId: string; reason: string }> = [];
  const prepared: PreparedCandidate[] = [];
  rows.forEach((row, sourceIndex) => {
    if (seen.has(row.discoveryId)) {
      skipped.push({ discoveryId: row.discoveryId, reason: "duplicate discoveryId; first row kept" });
      return;
    }
    seen.add(row.discoveryId);
    const built = rehydrate(row, loaded.index, loaded.signalsByNodeId, loaded, sourceIndex);
    if (!built.prepared) {
      skipped.push(built.skip ?? { discoveryId: row.discoveryId, reason: "not rehydrated" });
      return;
    }
    const eligibility = isEligibleForSemanticCompilation(built.prepared.candidate);
    if (!eligibility.eligible) {
      skipped.push({ discoveryId: row.discoveryId, reason: eligibility.reason ?? "ineligible" });
      return;
    }
    if (built.prepared.operativeChars === 0) {
      skipped.push({ discoveryId: row.discoveryId, reason: "operative source text is empty" });
      return;
    }
    prepared.push(built.prepared);
  });
  prepared.sort((a, b) => a.rank - b.rank || a.sourceIndex - b.sourceIndex);

  const model = haikuGatewayModel();
  const reservations = prepared.map((item) => compileReservationUsd(model, item.operativeChars, DEFAULT_CANDIDATE_TIMEOUT_MS) + verifyReservationUsd(model, DEFAULT_CANDIDATE_TIMEOUT_MS));
  const sortedReservations = [...reservations].sort((a, b) => a - b);
  const population = prepared.map((item) => ({ discoveryId: item.candidate.discoveryId, structuralNodeIds: item.candidate.structuralNodeIds }));
  const preflight = {
    banner: DEVELOPMENT_BANNER,
    designation: "DEVELOPMENT" as const,
    certified: false as const,
    pinnedOffline: false as const,
    eligibleClaimed: false as const,
    pinWritten: false as const,
    matrixCellSelected: false as const,
    executed: false as const,
    model: HAIKU_MODEL_ID,
    inventoryMode: "SINGLE_PASS" as const,
    timeoutMs: DEFAULT_CANDIDATE_TIMEOUT_MS,
    ceilingUsd: SHOWN_HAIKU_VERIFICATION_CEILING_USD,
    priceBasis: "List prices in scripts/semantic-accountability-cost-plan.ts: $1 input and $5 output per million tokens. priceUsage returns UNKNOWN_MODEL for anthropic/claude-haiku-4.5. Reservation shape is scripts/p3-conmed-pilot/reservation-policy.ts at that list price and a 128000 max_tokens request.",
    rows: rows.length,
    dispatchable: prepared.length,
    skipped,
    reservationUsd: {
      min: sortedReservations[0] ?? 0,
      p50: percentile(sortedReservations, 50),
      max: sortedReservations[sortedReservations.length - 1] ?? 0,
      sum: Number(reservations.reduce((sum, value) => sum + value, 0).toFixed(2)),
      verifyEach: verifyReservationUsd(model, DEFAULT_CANDIDATE_TIMEOUT_MS),
    },
    rankCounts: [0, 1, 2, 3, 4].map((rank) => ({ rank, count: prepared.filter((item) => item.rank === rank).length })),
    rehydration: "roleRaw, familiesRaw, confidence, sourceCitation, valueAnchors, and verifiedQuoteFingerprint were not in execution.json. They are not compiler inputs. roleNormalizationStatus and familiesNormalizationStatus are FALLBACK_REVIEW_REQUIRED. reviewStatus is NEEDS_REVIEW. multipleRulesLikely and definedTermDependencyLikely use the Pass B schema default false and are not compiler inputs. structural node keys and supersession come from the rebuilt index and the empty supersession index.",
  };
  process.stdout.write(`${JSON.stringify({ dry, dispatchable: prepared.length, skipped: skipped.length, reservation: preflight.reservationUsd, ranks: preflight.rankCounts })}\n`);
  process.stdout.write(`order ${prepared.slice(0, 24).map((item) => `${item.rank}:${item.candidate.normalizedSourceRef}`).join(" ")}\n`);
  if (dry) {
    writeJson(PREFLIGHT_PATH, preflight);
    return;
  }
  if (!process.env.AI_GATEWAY_API_KEY) throw new Error("Refusing to verify. AI_GATEWAY_API_KEY is unset. The synthetic caller is not verification.");
  if (process.env.SEMANTIC_COMPILER_MODEL !== HAIKU_MODEL_ID || process.env.ANALYZER_MODEL !== HAIKU_MODEL_ID) {
    throw new Error("Refusing to verify. SEMANTIC_COMPILER_MODEL and ANALYZER_MODEL must both be anthropic/claude-haiku-4.5.");
  }
  if (getStageCaller().isSynthetic || getSemanticCaller().isSynthetic) throw new Error("Refusing to verify. Caller resolved synthetic.");

  const ledger = new BudgetLedger(SHOWN_HAIKU_VERIFICATION_CEILING_USD, SHOWN_HAIKU_VERIFICATION_CEILING_USD);
  const cache = new InMemorySemanticCompilationCache();
  const priorAttempts = loadPriorAttempts();
  const attempts: unknown[] = [...priorAttempts];
  const skipIds = new Set<string>();
  const priorCount = new Map<string, number>();
  priorAttempts.forEach((attempt, index) => {
    const id = attempt.discoveryId;
    if (!id) return;
    priorCount.set(id, (priorCount.get(id) ?? 0) + 1);
    const produced = (attempt.compile?.rules ?? 0) + (attempt.compile?.definitions ?? 0);
    if (produced > 0 || attempt.verify?.status) skipIds.add(id);
    const charged = (attempt.compile?.costUsd ?? 0) + (attempt.verify?.costUsd ?? 0);
    if (charged > 0) {
      const reservationId = `prior:${index}:${id}`;
      ledger.reserve(reservationId, charged);
      ledger.settle(reservationId, {
        model: HAIKU_MODEL_ID,
        elapsedWallClockMs: attempt.compile?.wallClockMs ?? 0,
        streamedOutputTokensObserved: null,
        providerUsageObserved: null,
        locallyCalculatedCostUsd: charged,
        finalProviderBillingUnavailable: false,
        costAccountingStatus: "EXACT",
        chargedToBudgetUsd: charged,
      });
    }
  });
  for (const [id, count] of priorCount) {
    if (count >= 2) skipIds.add(id);
  }
  let stop: { reason: string; detail: string | null; atIndex: number } | null = null;

  const flush = () => {
    writeJson(OUT_PATH, {
      ...preflight,
      executed: attempts.length > 0,
      candidateTimeoutMs: GIBRALTAR_CANDIDATE_TIMEOUT_MS,
      reservationTimeoutMs: DEFAULT_CANDIDATE_TIMEOUT_MS,
      shapeStop: "Input and output token exceedance stops the run. The CONMED conversation cap of 5 is recorded on the attempt and does not stop it.",
      verificationCommand: 'ANALYZER_MODEL=anthropic/claude-haiku-4.5 SEMANTIC_COMPILER_MODEL=anthropic/claude-haiku-4.5 npx tsx scripts/p3-development-pipeline/verify-gibraltar.ts',
      attempts,
      stop,
      spend: ledger.snapshot(),
    });
  };
  flush();

  for (let i = 0; i < prepared.length; i++) {
    const item = prepared[i]!;
    if (skipIds.has(item.candidate.discoveryId)) continue;
    const compileReservation = compileReservationUsd(model, item.operativeChars, DEFAULT_CANDIDATE_TIMEOUT_MS);
    const decision = ledger.reserveOrRefuse(`${item.candidate.discoveryId}:compile`, compileReservation);
    if (!decision.allowed) {
      stop = { reason: "BUDGET_STOP", detail: `${decision.reason}: next compile reservation ${compileReservation} would commit ${decision.wouldCommitUsd} against ceiling ${decision.ceilingUsd}. Not dispatched.`, atIndex: i };
      flush();
      break;
    }
    const inventory = meter(getStageCaller());
    const started = Date.now();
    const signal = AbortSignal.timeout(GIBRALTAR_CANDIDATE_TIMEOUT_MS);
    let result: SemanticCompilationResult | null = null;
    let thrown: unknown = null;
    let timedOut = false;
    try {
      const built = buildCandidateCompilerInput(item.candidate, {
        companyId: COMPANY_ID,
        instrumentKey: INSTRUMENT_KEY,
        packageKey: PACKAGE_KEY,
        index: loaded.index,
        packageGraph: loaded.packageGraph,
        exactTermsByDocument: loaded.exactTerms,
        operativeState: null,
        amendmentEffects: null,
        supersessionIndex: EMPTY_SUPERSESSION_INDEX,
        candidatePopulation: population,
      });
      result = await withTimeout(
        compileCovenantToIR(built.input, { caller: getSemanticCaller(), inventoryCaller: inventory.caller, cache, callOptions: { signal } }),
        GIBRALTAR_CANDIDATE_TIMEOUT_MS,
      );
    } catch (error) {
      thrown = error;
      timedOut = error instanceof CandidateTimeoutError || signal.aborted || (error instanceof Error && error.name === "TimeoutError");
    }
    const passA = inventory.read();
    const usage = result ? compileUsage(result, passA) : passA.calls > 0 ? passA : null;
    const providerFailed = thrown != null || (result?.failureReasons ?? []).some((reason) => reason === "PROVIDER_FAILURE" || reason === "TRANSPORT_OR_INTERNAL_ERROR");
    const compileCost: CostRecord = accountForRequest({
      model,
      elapsedWallClockMs: Date.now() - started,
      timedOut,
      providerUsage: timedOut ? null : usage,
      streamedOutputTokensObserved: timedOut ? (usage?.outputTokens ?? null) : (usage?.outputTokens ?? null),
      reservationUsd: compileReservation,
      providerRefused: !timedOut && !usage && providerFailed,
    });
    ledger.settle(`${item.candidate.discoveryId}:compile`, compileCost);
    const credit = detectCreditExhaustionInError(thrown) ?? detectCreditExhaustionInResult(result);
    const rules = result?.rules.length ?? 0;
    const definitions = result?.definitions.length ?? 0;
    const compileCompleted = !timedOut && !credit && rules + definitions > 0;
    const shapeReasons = shapeExceeded(
      { attemptCount: result?.telemetry?.attemptCount ?? null, inputTokens: usage?.inputTokens ?? null, outputTokens: usage?.outputTokens ?? null },
      compileShape(model, item.operativeChars, DEFAULT_CANDIDATE_TIMEOUT_MS),
    );
    // The conversation bound is the reservation's declared shape, for every document.
    // A Gibraltar run does not drop that reason. Exceeding it means the hold did not cover the call.
    const exceeded = shapeReasons;

    let verifyCost: CostRecord | null = null;
    let verification: SemanticVerificationResult | null = null;
    let verifyTimedOut = false;
    let verifyError: string | null = null;
    if (compileCompleted && result) {
      const verifyReservation = verifyReservationUsd(model, DEFAULT_CANDIDATE_TIMEOUT_MS);
      const verifyDecision = ledger.reserveOrRefuse(`${item.candidate.discoveryId}:verify`, verifyReservation);
      if (!verifyDecision.allowed) {
        stop = { reason: "BUDGET_STOP", detail: `${verifyDecision.reason}: verify reservation ${verifyReservation} would commit ${verifyDecision.wouldCommitUsd}. Compiled and not verified.`, atIndex: i };
      } else {
        const review = meter(getStageCaller());
        const suspicion = meter(getStageCaller());
        const verifyStarted = Date.now();
        const verifySignal = AbortSignal.timeout(GIBRALTAR_CANDIDATE_TIMEOUT_MS);
        try {
          const built = buildCandidateCompilerInput(item.candidate, {
            companyId: COMPANY_ID,
            instrumentKey: INSTRUMENT_KEY,
            packageKey: PACKAGE_KEY,
            index: loaded.index,
            packageGraph: loaded.packageGraph,
            exactTermsByDocument: loaded.exactTerms,
            operativeState: null,
            amendmentEffects: null,
            supersessionIndex: EMPTY_SUPERSESSION_INDEX,
            candidatePopulation: population,
          });
          verification = await withTimeout(
            verifyCompiledCandidate(
              { compilerInput: built.input, compilationResult: result },
              { reviewCaller: review.caller, conditionSuspicionCaller: suspicion.caller, signal: verifySignal },
            ),
            GIBRALTAR_CANDIDATE_TIMEOUT_MS,
          );
        } catch (error) {
          verifyTimedOut = error instanceof CandidateTimeoutError || verifySignal.aborted || (error instanceof Error && error.name === "TimeoutError");
          verifyError = error instanceof Error ? error.message : String(error);
        }
        const reviewUsage = review.read();
        const suspicionUsage = suspicion.read();
        const verifyUsage = reviewUsage.calls + suspicionUsage.calls > 0
          ? { inputTokens: reviewUsage.inputTokens + suspicionUsage.inputTokens, outputTokens: reviewUsage.outputTokens + suspicionUsage.outputTokens }
          : null;
        verifyCost = accountForRequest({
          model,
          elapsedWallClockMs: Date.now() - verifyStarted,
          timedOut: verifyTimedOut,
          providerUsage: verifyTimedOut ? null : verifyUsage,
          streamedOutputTokensObserved: verifyUsage?.outputTokens ?? null,
          reservationUsd: verifyReservation,
          providerRefused: !verifyTimedOut && !verifyUsage && verifyError != null,
        });
        ledger.settle(`${item.candidate.discoveryId}:verify`, verifyCost);
      }
    }

    attempts.push({
      discoveryId: item.candidate.discoveryId,
      normalizedSourceRef: item.candidate.normalizedSourceRef,
      role: item.candidate.role,
      families: item.candidate.families,
      rank: item.rank,
      operativeChars: item.operativeChars,
      droppedFamilies: item.droppedFamilies,
      certified: false,
      pinnedOffline: false,
      eligibleClaimed: false,
      compile: {
        status: result?.status ?? null,
        failureReasons: result?.failureReasons ?? (thrown instanceof Error ? [thrown.name] : []),
        rules,
        definitions,
        sharedCapacities: result?.sharedCapacities?.length ?? 0,
        inputTokens: usage?.inputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
        passACalls: passA.calls,
        reservationUsd: compileReservation,
        costUsd: compileCost.chargedToBudgetUsd,
        costStatus: compileCost.costAccountingStatus,
        timedOut,
        wallClockMs: Date.now() - started,
        ...(shapeReasons.length > 0 ? { shapeExceeded: shapeReasons, shapeStop: exceeded } : {}),
      },
      verify: verification
        ? {
            status: verification.status,
            semanticReviewInvoked: verification.semanticReviewInvoked,
            semanticReviewSkippedReason: verification.semanticReviewSkippedReason,
            conditionSuspicionStatus: verification.conditionSuspicion?.status ?? null,
            findings: findingSummary(verification),
            costUsd: verifyCost?.chargedToBudgetUsd ?? null,
            costStatus: verifyCost?.costAccountingStatus ?? null,
            timedOut: verifyTimedOut,
          }
        : { status: null, semanticReviewInvoked: null, findings: [], costUsd: verifyCost?.chargedToBudgetUsd ?? 0, costStatus: verifyCost?.costAccountingStatus ?? null, timedOut: verifyTimedOut, error: verifyError },
      committedUsd: ledger.committedUsd,
    });
    process.stdout.write(`verify ${i + 1}/${prepared.length} ${item.candidate.normalizedSourceRef} compile=${result?.status ?? (timedOut ? "TIMEOUT" : "THROWN")} rules=${rules} committed=${ledger.committedUsd.toFixed(4)}\n`);
    flush();
    if (credit) {
      stop = { reason: "GATEWAY_CREDIT_EXHAUSTED", detail: credit.errorType ?? credit.source, atIndex: i + 1 };
      flush();
      break;
    }
    if (exceeded.length > 0) {
      stop = { reason: "RESERVATION_SHAPE_EXCEEDED", detail: exceeded.join("; "), atIndex: i + 1 };
      flush();
      break;
    }
    if (stop) {
      flush();
      break;
    }
  }
  if (!stop) {
    stop = { reason: "COMPLETED", detail: null, atIndex: prepared.length };
    flush();
  }
  process.stdout.write(`STOP ${stop.reason} committed=${ledger.committedUsd.toFixed(4)} attempts=${attempts.length}\n`);
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked.endsWith(`${path.sep}verify-gibraltar.ts`)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
