/**
 * The explicit configuration of certified semantic execution. Every semantically material setting
 * is a field here; NOTHING in the certified path reads an environment variable to decide algorithm
 * behaviour (credentials and endpoints are the only ambient inputs). The configuration identity is
 * persisted in evidence and enters the compile cache key, so two runs with different settings can
 * never share a result.
 *
 * inventoryMode - DUAL_PASS_ENSEMBLE is the certified mode. Reason (from the architecture, not the
 * price): the accountability layer's support signals (supportReviewRequired, materialSingleRun,
 * materialConflicted -> SEMANTIC_SUPPORT_REVIEW_REQUIRED) exist only when two independent Pass A
 * executions are reconciled by the deterministic ensemble (dual-pass.ts); a single run cannot detect
 * its own support asymmetry, and the certified phase-3 closure runs (docs/phase-3-final-601) were
 * executed and validated in that mode. SINGLE_PASS remains selectable, explicitly, for diagnostics.
 */
import type { ToolBudget } from "./semantic/types";
import type { SemanticInventoryMode } from "./semantic-accountability/dual-pass";
import type { TransportRetryPolicy } from "../analyzer/transport-retry";
import { CERTIFIED_TRANSPORT_RETRY_POLICY } from "../analyzer/transport-retry";
import { DEFAULT_TOOL_BUDGET } from "./semantic/types";
import { CERTIFIED_INVENTORY_EXECUTION_POLICY, inventoryPolicyIdentity, type Phase3InventoryExecutionPolicy } from "./semantic-accountability/inventory-policy";

export const CERTIFIED_COMPILER_CONFIG_VERSION = "certified-compiler-config.v1";
export const CERTIFIED_INVENTORY_MODE: SemanticInventoryMode = "DUAL_PASS_ENSEMBLE";

export interface CertifiedCompilerConfig {
  configVersion: typeof CERTIFIED_COMPILER_CONFIG_VERSION;
  inventoryMode: SemanticInventoryMode;
  /** Model ids as the provider reports them; the same locked model may serve every stage. */
  semanticModel: string;
  inventoryModel: string;
  verifierModel: string;
  /** Bounds the deterministic pass-2 retrieval (count and chars). */
  toolBudget: ToolBudget;
  /** Real code limits enforced by the bounded caller and the dispatch budget. */
  maxSemanticConversations: 1;
  maxRefinementConversations: 0 | 1;
  /** Per-shard attempts in the certified path: 1 (transport retries are the transport layer's, never a second conversation). */
  shardMaxAttempts: 1;
  maxOutputTokens: number;
  /** Wall-clock deadline for ONE candidate (inventory + compile + verify), propagated as an AbortSignal. */
  candidateDeadlineMs: number;
  transportRetry: TransportRetryPolicy;
  executionPolicyVersion: string;
  /**
   * How cross-reference / enclosing-node expansion regions take part in accountability and planning.
   * CONTEXT_ONLY (certified): Pass A inventories and Pass C reconciles the unit's OWN operative region only; expansion
   * regions are delivered to Pass B as context text and are compiled by their own candidates in the map. Before this,
   * every expansion region became an owned EXPANSION_REGION unit in a shard of its own, so any candidate carrying a
   * cross-reference expansion was executed SHARDED (53 of 161 CONMED candidates, measured offline). OWNED: the
   * pre-remediation behaviour, selectable explicitly.
   */
  expansionRegionPolicy: "CONTEXT_ONLY" | "OWNED";
  /** P3-E10..E13: the Pass A execution policy (derived output ceilings, explicit reasoning, bounded schema, call caps). */
  inventory: Phase3InventoryExecutionPolicy;
}

export function certifiedConfig(overrides: Pick<CertifiedCompilerConfig, "semanticModel" | "inventoryModel" | "verifierModel"> & Partial<Omit<CertifiedCompilerConfig, "configVersion" | "semanticModel" | "inventoryModel" | "verifierModel">>): CertifiedCompilerConfig {
  return {
    configVersion: CERTIFIED_COMPILER_CONFIG_VERSION,
    inventoryMode: CERTIFIED_INVENTORY_MODE,
    toolBudget: DEFAULT_TOOL_BUDGET,
    maxSemanticConversations: 1,
    maxRefinementConversations: 1,
    shardMaxAttempts: 1,
    maxOutputTokens: 32_000,
    candidateDeadlineMs: 480_000,
    transportRetry: CERTIFIED_TRANSPORT_RETRY_POLICY,
    executionPolicyVersion: "certified-execution.v1",
    expansionRegionPolicy: "CONTEXT_ONLY",
    inventory: CERTIFIED_INVENTORY_EXECUTION_POLICY,
    ...overrides,
  };
}

/** Refuses a config that would let ambient state decide semantics. */
export function validateCertifiedConfig(c: CertifiedCompilerConfig): string[] {
  const problems: string[] = [];
  if (c.configVersion !== CERTIFIED_COMPILER_CONFIG_VERSION) problems.push("configVersion");
  if (c.inventoryMode !== "SINGLE_PASS" && c.inventoryMode !== "DUAL_PASS_ENSEMBLE") problems.push("inventoryMode must be explicit");
  for (const k of ["semanticModel", "inventoryModel", "verifierModel"] as const) if (!c[k] || typeof c[k] !== "string") problems.push(`${k} must be explicit`);
  if (c.maxSemanticConversations !== 1) problems.push("maxSemanticConversations must be 1");
  if (c.maxRefinementConversations !== 0 && c.maxRefinementConversations !== 1) problems.push("maxRefinementConversations must be 0 or 1");
  if (c.shardMaxAttempts !== 1) problems.push("shardMaxAttempts must be 1");
  if (!(c.candidateDeadlineMs > 0)) problems.push("candidateDeadlineMs");
  if (!(c.maxOutputTokens > 0)) problems.push("maxOutputTokens");
  if (c.transportRetry.maxAttempts < 1 || c.transportRetry.maxAttempts > 3) problems.push("transportRetry.maxAttempts must be 1..3");
  if (c.expansionRegionPolicy !== "CONTEXT_ONLY" && c.expansionRegionPolicy !== "OWNED") problems.push("expansionRegionPolicy must be explicit");
  if (!c.inventory || (c.inventory.reasoning !== "DISABLED" && c.inventory.reasoning !== "MINIMAL" && c.inventory.reasoning !== "PROVIDER_DEFAULT")) problems.push("inventory.reasoning must be explicit");
  if (c.inventory && !(c.inventory.perSlot.cap >= 1 && c.inventory.maxCallsPerPass >= 1 && c.inventory.bounds.excerptChars > 0)) problems.push("inventory policy bounds");
  return problems;
}

/** Deterministic identity string entering cache keys and evidence. */
export function certifiedConfigIdentity(c: CertifiedCompilerConfig): string {
  return [c.configVersion, `inventory=${c.inventoryMode}`, `semantic=${c.semanticModel}`, `inventoryModel=${c.inventoryModel}`, `verifier=${c.verifierModel}`, `tools=${c.toolBudget.maxToolCalls}/${c.toolBudget.maxRecursionDepth}/${c.toolBudget.maxAdditionalSourceChars}`, `conv=${c.maxSemanticConversations}+${c.maxRefinementConversations}`, `shardAttempts=${c.shardMaxAttempts}`, `maxOut=${c.maxOutputTokens}`, `deadline=${c.candidateDeadlineMs}`, `retry=${c.transportRetry.maxAttempts}`, `expansions=${c.expansionRegionPolicy}`, `passA=${inventoryPolicyIdentity(c.inventory)}`, c.executionPolicyVersion].join("|");
}
