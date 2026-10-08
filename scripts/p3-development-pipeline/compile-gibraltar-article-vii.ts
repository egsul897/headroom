/**
 * Cheapest remaining Gibraltar DEVELOPMENT compile.
 *
 * One Article VII section body, once: 7.02, 7.08, 7.03, 7.06, 7.01, 7.05.
 * 7.04 is omitted because that body is already on the verification ledger.
 * Child clauses and table-of-contents lines are omitted because the section
 * body contains them. The caller is BoundedSemanticCaller: one submit_compilation
 * plus at most one refinement. Inventory and the verifier are not called.
 * The 12-turn loop is not used.
 *
 * DEVELOPMENT ≠ CERTIFIED. No pin. eligible is not set true.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { CovenantFamily } from "@prisma/client";
import { parseDocument } from "../../lib/extraction/parse";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex, type StructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../../lib/contract-model/compiler/structural-references";
import { DISCOVERY_RUN_VERSION } from "../../lib/contract-model/compiler/discovery/pipeline";
import { DISCOVERY_ROLES, type DiscoveredCandidate, type DiscoveryRole } from "../../lib/contract-model/compiler/discovery/types";
import { EMPTY_SUPERSESSION_INDEX, getNodeSupersessionStatus } from "../../lib/contract-model/compiler/amendment/operative-state";
import { buildPackageGraph } from "../../lib/contract-model/compiler/package-graph/pipeline";
import { operativeSourceTextFor } from "../../lib/contract-model/compiler/candidate-span";
import { authenticateStructuralOccurrence, selectAuthenticatedSectionBodies, type StructuralOccurrenceKind } from "../../lib/contract-model/compiler/operative-authority";
import type { NodeSupersessionStatus } from "../../lib/contract-model/compiler/amendment/types";
import { mayDispatchUnderSpendingTarget, settleListedSpend } from "./spending-target";
import { isEligibleForSemanticCompilation } from "../../lib/contract-model/compiler/semantic/package-compile";
import { compileCovenantToIR } from "../../lib/contract-model/compiler/semantic/compile";
import { InMemorySemanticCompilationCache } from "../../lib/contract-model/compiler/semantic/cache";
import { BoundedSemanticCaller } from "../../lib/contract-model/compiler/semantic/bounded-caller";
import { AI_GATEWAY_BASE_URL } from "../../lib/contract-model/analyzer/anthropic-analyzer";
import { buildCandidateCompilerInput } from "../../lib/contract-model/covenant-map/candidate-input";
import { detectCreditExhaustionInError, detectCreditExhaustionInResult } from "../p3-conmed-pilot/gateway-credit";
import { COMPANY_ID, DOCUMENT_ID, HAIKU_MODEL_ID, INSTRUMENT_KEY, PACKAGE_KEY } from "./verify-gibraltar";

/** Smallest body first, so a later stop still keeps the cheap sections. 7.04 is already compiled. */
export const ARTICLE_VII_BODY_REFS = ["7.02", "7.08", "7.03", "7.06", "7.01", "7.05"] as const;
/** One reply at this size is $0.12288 of Haiku output. Unused room is not billed. */
export const ARTICLE_VII_MAX_OUTPUT_TOKENS = 24_576;
/**
 * Development spending target for this diagnostic run. It left a buffer under
 * the gateway balance stated for that run. It is not an owner-grant hard ceiling
 * and it does not reserve the worst case of the next call.
 */
export const ARTICLE_VII_SPENDING_TARGET_USD = 12;
/** @deprecated Use ARTICLE_VII_SPENDING_TARGET_USD. The historical name said "ceiling"; the contract is a spending target. */
export const ARTICLE_VII_CEILING_USD = ARTICLE_VII_SPENDING_TARGET_USD;
const HAIKU_INPUT_PER_TOKEN = 1 / 1_000_000;
const HAIKU_OUTPUT_PER_TOKEN = 5 / 1_000_000;
const PACKAGE_DIR = "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement";
const EXECUTION_PATH = path.join(PACKAGE_DIR, "development-pipeline/execution.json");
const OUT_PATH = path.join(PACKAGE_DIR, "development-pipeline/article-vii-compile.json");
const LABEL = "Gibraltar Industries, Inc. Credit Agreement dated as of February 2, 2026 (EX-10.1)";
const FAMILY_VALUES = new Set<string>(Object.values(CovenantFamily));
const ROLE_VALUES = new Set<string>(DISCOVERY_ROLES);
const SECTION_TIMEOUT_MS = 420_000;

export interface ArticleSevenRow {
  discoveryId: string;
  normalizedSourceRef: string;
  operativeChars: number;
  role: string;
  structuralKind: StructuralOccurrenceKind | "MISSING";
  supersessionStatus: NodeSupersessionStatus;
  sourceHashOk: boolean;
  occurrenceId: string | null;
}

export function haikuListUsd(inputTokens: number, outputTokens: number): number {
  return Number((inputTokens * HAIKU_INPUT_PER_TOKEN + outputTokens * HAIKU_OUTPUT_PER_TOKEN).toFixed(6));
}

/** One diagnostic body per exact section ref. Length is not a vote. Child refs and 7.04 are not in the ref list. */
export function selectArticleSevenBodies<T extends ArticleSevenRow>(rows: readonly T[], refs: readonly string[] = ARTICLE_VII_BODY_REFS): T[] {
  return selectAuthenticatedSectionBodies(rows, refs);
}

interface PersistedRow {
  discoveryId: string;
  role: string;
  families: string[];
  normalizedSourceRef: string;
  structuralNodeIds: string[];
  description: string;
}

function writeJson(file: string, body: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(body, null, 2) + "\n");
  renameSync(tmp, file);
}

function candidateFor(row: PersistedRow, index: StructuralIndex): { candidate: DiscoveredCandidate; operativeChars: number } | null {
  if (!ROLE_VALUES.has(row.role)) return null;
  const structuralNodeKeys: string[] = [];
  for (const nodeId of row.structuralNodeIds) {
    const node = index.getNodeById(nodeId);
    if (!node || node.documentId !== DOCUMENT_ID) return null;
    structuralNodeKeys.push(node.nodeKey);
  }
  if (structuralNodeKeys.length === 0) return null;
  const families = row.families.filter((family) => FAMILY_VALUES.has(family)) as DiscoveredCandidate["families"];
  const supersession = getNodeSupersessionStatus(EMPTY_SUPERSESSION_INDEX, DOCUMENT_ID, row.structuralNodeIds[0] ?? null);
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
    discoveryMethods: ["SEMANTIC_CLASSIFICATION"],
    evidenceSignals: [],
    reviewStatus: "NEEDS_REVIEW",
    confidence: null,
    sourceCitation: "",
    discoveryRunVersion: DISCOVERY_RUN_VERSION,
    supersessionStatus: supersession.status,
    supersessionReason: supersession.reason,
  };
  if (!isEligibleForSemanticCompilation(candidate).eligible) return null;
  const operativeChars = operativeSourceTextFor(candidate, index).length;
  if (operativeChars === 0) return null;
  return { candidate, operativeChars };
}

async function loadIndex(): Promise<{ index: StructuralIndex; exactTerms: Map<string, Map<string, string>>; packageGraph: ReturnType<typeof buildPackageGraph> }> {
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
  return { index, exactTerms, packageGraph };
}

interface AttemptRecord {
  discoveryId: string;
  normalizedSourceRef: string;
  operativeChars: number;
  status: string | null;
  failureReasons: string[];
  rules: number;
  definitions: number;
  inputTokens: number | null;
  outputTokens: number | null;
  conversations: number | null;
  refinements: number | null;
  costUsd: number | null;
  costStatus?: "EXACT" | "UNKNOWN";
  wallClockMs: number;
  certified: false;
  pinnedOffline: false;
  eligibleClaimed: false;
}

function loadPrior(): AttemptRecord[] {
  try {
    const parsed = JSON.parse(readFileSync(OUT_PATH, "utf8")) as { model?: string; attempts?: AttemptRecord[] };
    if (parsed.model !== HAIKU_MODEL_ID || !Array.isArray(parsed.attempts)) return [];
    return parsed.attempts;
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const dry = process.argv.includes("--dry");
  const record = JSON.parse(readFileSync(EXECUTION_PATH, "utf8")) as { discoveredCandidates?: PersistedRow[] };
  const loaded = await loadIndex();
  const seen = new Set<string>();
  const prepared: Array<ArticleSevenRow & { candidate: DiscoveredCandidate }> = [];
  for (const row of record.discoveredCandidates ?? []) {
    if (seen.has(row.discoveryId)) continue;
    seen.add(row.discoveryId);
    const built = candidateFor(row, loaded.index);
    if (!built) continue;
    const anchorId = built.candidate.structuralNodeIds[0] ?? null;
    const anchor = anchorId ? loaded.index.getNodeById(anchorId) : undefined;
    const authority = anchor ? authenticateStructuralOccurrence({ node: anchor, index: loaded.index, supersessionStatus: built.candidate.supersessionStatus }) : null;
    prepared.push({
      discoveryId: row.discoveryId,
      normalizedSourceRef: row.normalizedSourceRef,
      operativeChars: built.operativeChars,
      role: row.role,
      structuralKind: authority?.structuralKind ?? "MISSING",
      supersessionStatus: built.candidate.supersessionStatus,
      sourceHashOk: authority ? !authority.reason.startsWith("SOURCE_HASH_MISMATCH") : false,
      occurrenceId: anchor?.nodeId ?? null,
      candidate: built.candidate,
    });
  }
  const selected = selectArticleSevenBodies(prepared);
  if (dry) {
    process.stdout.write(`${JSON.stringify({ dry: true, ceilingUsd: ARTICLE_VII_CEILING_USD, maxOutputTokens: ARTICLE_VII_MAX_OUTPUT_TOKENS, selected: selected.map((row) => ({ ref: row.normalizedSourceRef, discoveryId: row.discoveryId, operativeChars: row.operativeChars, role: row.role })) })}\n`);
    return;
  }
  if (!process.env.AI_GATEWAY_API_KEY) throw new Error("Refusing to compile. AI_GATEWAY_API_KEY is unset.");
  if (process.env.SEMANTIC_COMPILER_MODEL !== HAIKU_MODEL_ID) throw new Error("Refusing to compile. SEMANTIC_COMPILER_MODEL must be anthropic/claude-haiku-4.5.");

  const caller = new BoundedSemanticCaller(
    "vercel-ai-gateway",
    HAIKU_MODEL_ID,
    new Anthropic({ apiKey: process.env.AI_GATEWAY_API_KEY, baseURL: AI_GATEWAY_BASE_URL }),
    { maxOutputTokens: ARTICLE_VII_MAX_OUTPUT_TOKENS },
  );
  const cache = new InMemorySemanticCompilationCache();
  const prior = loadPrior();
  const attempts: AttemptRecord[] = [...prior];
  const done = new Set(prior.filter((attempt) => (attempt.inputTokens ?? 0) > 0 || attempt.rules > 0).map((attempt) => attempt.discoveryId));
  let spent = 0;
  let unknownDispatches = 0;
  for (const attempt of prior) {
    if (attempt.costStatus === "UNKNOWN" || attempt.costUsd == null) unknownDispatches += 1;
    else spent += attempt.costUsd;
  }
  let stop: { reason: string; detail: string | null } | null = null;

  const flush = () => {
    writeJson(OUT_PATH, {
      banner: "DEVELOPMENT ≠ CERTIFIED ≠ PINNED_OFFLINE",
      designation: "DEVELOPMENT",
      certified: false,
      pinnedOffline: false,
      eligibleClaimed: false,
      pinWritten: false,
      model: HAIKU_MODEL_ID,
      caller: "BoundedSemanticCaller",
      inventory: false,
      verifier: false,
      maxOutputTokens: ARTICLE_VII_MAX_OUTPUT_TOKENS,
      spendingAuthorization: "DEVELOPMENT_TARGET_NOT_HARD_CEILING",
      spendingTargetUsd: ARTICLE_VII_SPENDING_TARGET_USD,
      ceilingUsd: ARTICLE_VII_CEILING_USD,
      unknownDispatches,
      priceBasis: "Haiku list $1 input and $5 output per million tokens. priceUsage has no Haiku card. Missing tokens are UNKNOWN, not $0.",
      manner: "One Article VII section body each. 7.04 skipped (already compiled). No child rows, no table-of-contents lines, no inventory pass, no verifier, no 12-turn loop.",
      attempts,
      spentUsd: Number(spent.toFixed(6)),
      stop,
    });
  };
  flush();

  for (const item of selected) {
    if (done.has(item.discoveryId)) continue;
    const targetDecision = mayDispatchUnderSpendingTarget({ knownSpentUsd: spent, unknownDispatches, targetUsd: ARTICLE_VII_SPENDING_TARGET_USD });
    if (!targetDecision.allowed) {
      stop = { reason: targetDecision.reason, detail: targetDecision.detail };
      break;
    }
    const started = Date.now();
    const signal = AbortSignal.timeout(SECTION_TIMEOUT_MS);
    let result: Awaited<ReturnType<typeof compileCovenantToIR>> | null = null;
    let thrown: unknown = null;
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
      });
      result = await compileCovenantToIR(built.input, { caller, accountability: false, cache, callOptions: { signal } });
    } catch (error) {
      thrown = error;
    }
    const telemetry = result?.telemetry;
    const extra = telemetry as { semanticConversations?: number; refinementConversations?: number } | null;
    const inputTokens = telemetry?.inputTokens ?? null;
    const outputTokens = telemetry?.outputTokens ?? null;
    const settlement = settleListedSpend(inputTokens, outputTokens, haikuListUsd);
    if (settlement.status === "UNKNOWN") unknownDispatches += 1;
    else spent += settlement.knownUsd ?? 0;
    const credit = detectCreditExhaustionInError(thrown) ?? detectCreditExhaustionInResult(result);
    const attempt: AttemptRecord = {
      discoveryId: item.discoveryId,
      normalizedSourceRef: item.normalizedSourceRef,
      operativeChars: item.operativeChars,
      status: result?.status ?? null,
      failureReasons: result?.failureReasons ?? (thrown instanceof Error ? [thrown.name] : []),
      rules: result?.rules.length ?? 0,
      definitions: result?.definitions.length ?? 0,
      inputTokens,
      outputTokens,
      conversations: extra?.semanticConversations ?? null,
      refinements: extra?.refinementConversations ?? null,
      costUsd: settlement.knownUsd,
      costStatus: settlement.status,
      wallClockMs: Date.now() - started,
      certified: false,
      pinnedOffline: false,
      eligibleClaimed: false,
    };
    attempts.push(attempt);
    process.stdout.write(`${item.normalizedSourceRef} status=${attempt.status ?? "THROWN"} rules=${attempt.rules} in=${inputTokens ?? "unknown"} out=${outputTokens ?? "unknown"} usd=${settlement.knownUsd ?? "UNKNOWN"} spent=${spent.toFixed(4)} unknownDispatches=${unknownDispatches}\n`);
    flush();
    if (credit || (thrown && !result)) {
      stop = { reason: credit ? "GATEWAY_CREDIT_EXHAUSTED" : "PROVIDER_FAILURE", detail: credit?.errorType ?? (thrown instanceof Error ? thrown.message.slice(0, 240) : "no result"), };
      flush();
      break;
    }
    if (signal.aborted) {
      stop = { reason: "TIMEOUT", detail: `${item.normalizedSourceRef} aborted at ${SECTION_TIMEOUT_MS}ms` };
      flush();
      break;
    }
  }
  if (!stop) stop = { reason: "COMPLETED", detail: null };
  flush();
  process.stdout.write(`STOP ${stop.reason} spent=${spent.toFixed(4)}\n`);
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked.endsWith(`${path.sep}compile-gibraltar-article-vii.ts`)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
