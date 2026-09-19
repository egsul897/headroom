/**
 * PHASE 3 / 6.01 DEPENDENCY-DELIVERY REMEDIATION §22 - THE MISSING_CONTEXT CONTRACT.
 *
 * Before this layer, SHARD_MISSING_CONTEXT was an unclassified signal: the model said "I needed X and did not have it"
 * and nothing checked that claim against what the shard was actually handed. The paid 6.01 revalidation failed exactly
 * there - a shard ended MISSING_CONTEXT naming five dependencies, and the plan itself proved that 25 statically known,
 * resolvable, owned-item-required dependencies had been dropped for budget before the call was ever made.
 *
 * With required-dependency prematerialization (required-dependencies.ts + the planner's REQUIRED tier), that claim is
 * now checkable. Every shard carries a ShardDependencyCertificate and a typed context whose REQUIRED entries name the
 * dependency they deliver. So each dependency the model reports as missing can be classified against the evidence
 * package it was actually given:
 *
 *   PLANNER_DELIVERY_GAP        the dependency was REQUIRED, deliverable, and NOT delivered. The architecture defect
 *                               this remediation exists to make impossible. A certified shard can never produce one -
 *                               `certificateStatus === "CERTIFIED_EXECUTABLE"` means requiredDependenciesUnresolved is
 *                               0 - so this classification is an alarm, not a diagnosis.
 *   FALSE_MISSING_CONTEXT       the dependency WAS delivered in full in the initial context. The signal is a model
 *                               error (it did not read what it was given), never a planning failure.
 *   PARTIAL_DELIVERY            the dependency was delivered as a disclosed bounded excerpt. The model may legitimately
 *                               need the rest; the bounded tool route is the right answer and the excerpt disclosed it.
 *   DISCLOSED_UNDELIVERABLE     the dependency is genuinely absent from the package or ambiguous, and the shard was
 *                               told so by name. Honest missing context; nothing was fabricated.
 *   EXTERNAL_DEPENDENCY         the dependency lives outside this document/package and was disclosed as external.
 *   OPTIONAL_CONTEXT_MISS       the dependency is not in the required closure at all - interpretive context the model
 *                               wanted. The tool budget is the designed route for these, and this is the ONLY class
 *                               for which "the model should have called a tool" is an acceptable answer.
 *
 * This module is deterministic, provider-free, and never mutates a compilation. It is an audit of a claim.
 */
import type { IRUnresolvedDependency } from "../../ir/types";
import type { CompilationShard, ShardContextEntry } from "./shard-types";
import type { RequiredDependency } from "./required-dependencies";

export const MISSING_CONTEXT_CONTRACT_VERSION = "missing-context-contract.v1";

export type MissingContextClass =
  | "PLANNER_DELIVERY_GAP"
  | "FALSE_MISSING_CONTEXT"
  | "PARTIAL_DELIVERY"
  /** required, internal, no resolvable text - disclosed on the shard as an explicit limitation before the call */
  | "INTERNAL_LIMITATION_DISCLOSED"
  /** required, structurally ambiguous - candidates preserved, disclosed before the call */
  | "AMBIGUOUS_LIMITATION_DISCLOSED"
  | "EXTERNAL_DEPENDENCY"
  /** the Pass-A edge was excluded as non-required; if the model still wanted it, it was interpretive context */
  | "OPTIONAL_CONTEXT_MISS";

export interface MissingContextClassification {
  /** The reference exactly as the composition emitted it. */
  targetRef: string;
  /** The normalized dependency key it resolves to (`term:...` / `section:...`), so it joins to the certificate. */
  key: string | null;
  classification: MissingContextClass;
  /** What the shard's evidence package actually contained for this key. */
  deliveredChars: number | null;
  fullTextChars: number | null;
  detail: string;
  requestingRuleId: string | null;
}

export interface ShardMissingContextAudit {
  contractVersion: string;
  shardId: string;
  shardHash: string;
  /** The shard's own certificate status at plan time - the thing a PLANNER_DELIVERY_GAP would contradict. */
  certificateStatus: string;
  requested: MissingContextClassification[];
  counts: Record<MissingContextClass, number>;
  /** The contract: a shard certified executable may not report a required, deliverable dependency as missing. */
  contractHeld: boolean;
  violations: string[];
}

const EMPTY_COUNTS = (): Record<MissingContextClass, number> => ({ PLANNER_DELIVERY_GAP: 0, FALSE_MISSING_CONTEXT: 0, PARTIAL_DELIVERY: 0, INTERNAL_LIMITATION_DISCLOSED: 0, AMBIGUOUS_LIMITATION_DISCLOSED: 0, EXTERNAL_DEPENDENCY: 0, OPTIONAL_CONTEXT_MISS: 0 });

/** Normalizes a composition's free-text reference into the same key space the planner's required tier uses. */
export function dependencyKeyOf(targetRef: string): string | null {
  const raw = targetRef.trim();
  if (!raw) return null;
  const explicit = /^(term|section):(.*)$/i.exec(raw);
  const body = (explicit ? explicit[2]! : raw).trim();
  const looksSectional = explicit ? explicit[1]!.toLowerCase() === "section" : /^(?:§+\s*)?(?:section|sec\.?|clause|article)\b/i.test(raw) || /^\d+(?:\.\d+)/.test(body);
  const normalized = body
    .replace(/^\s*(?:§+\s*)?(?:section|sec\.?|clause|article)\s+/i, "")
    .replace(/^["“”']+|["“”']+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!normalized) return null;
  return `${looksSectional ? "section" : "term"}:${normalized}`;
}

export function auditShardMissingContext(input: {
  shard: Pick<CompilationShard, "shardId" | "shardHash" | "context" | "requiredDependencies" | "dependencyCertificate">;
  /** Every dependency the shard's own composition reported as unresolved, with the rule that reported it. */
  reported: { dependency: IRUnresolvedDependency; ruleId: string | null }[];
}): ShardMissingContextAudit {
  const { shard } = input;
  const requiredByKey = new Map<string, RequiredDependency>(shard.requiredDependencies.map((d) => [d.key, d]));
  const deliveredByKey = new Map<string, ShardContextEntry>(shard.context.filter((e) => e.tier === "REQUIRED").map((e) => [e.contextKey, e]));
  const counts = EMPTY_COUNTS();
  const violations: string[] = [];
  const requested: MissingContextClassification[] = [];

  for (const { dependency, ruleId } of input.reported) {
    const key = dependencyKeyOf(dependency.targetRef);
    const req = key ? requiredByKey.get(key) : undefined;
    const entry = key ? deliveredByKey.get(key) : undefined;
    let classification: MissingContextClass;
    let detail: string;
    if (!req || req.disposition === "NON_REQUIRED_EDGE") {
      classification = "OPTIONAL_CONTEXT_MISS";
      detail = req ? `excluded from the required closure by deterministic qualification (${req.resolution?.method ?? "n/a"}) - if the model wanted it, it was interpretive context and the bounded tool route is the designed answer` : "not in this shard's required-dependency closure - interpretive context; the bounded tool route is the designed answer";
    } else if (req.disposition === "DELIVERABLE_NOT_DELIVERED") {
      classification = "PLANNER_DELIVERY_GAP";
      detail = `REQUIRED and deliverable, but the plan did not deliver it: ${req.dispositionReason}`;
      violations.push(`${key}: required dependency reported missing by ${ruleId ?? "(unattributed rule)"} was never delivered - ${req.dispositionReason}`);
    } else if (req.disposition === "INTERNAL_REQUIRED_DEPENDENCY_UNRESOLVED") {
      classification = "INTERNAL_LIMITATION_DISCLOSED";
      detail = `required and internal, with no resolvable source text; disclosed on the shard as an explicit limitation before the call: ${req.dispositionReason}`;
    } else if (req.disposition === "AMBIGUOUS_REQUIRED_DEPENDENCY") {
      classification = "AMBIGUOUS_LIMITATION_DISCLOSED";
      detail = `required and structurally ambiguous (${req.candidates?.length ?? 0} candidates preserved); disclosed before the call: ${req.dispositionReason}`;
    } else if (req.disposition === "EXTERNAL_REQUIRED_DEPENDENCY") {
      classification = "EXTERNAL_DEPENDENCY";
      detail = `external to this document and disclosed as such: ${req.dispositionReason}`;
    } else if (req.disposition === "OWNED_PRIMARY_SOURCE") {
      classification = "FALSE_MISSING_CONTEXT";
      detail = "the shard's OWN primary source contains it - it was never context to retrieve";
    } else if (entry?.truncated) {
      classification = "PARTIAL_DELIVERY";
      detail = `delivered as a disclosed bounded excerpt (${entry.chars} of ${req.fullTextChars} chars); retrieving the remainder with a bounded tool call is the designed route`;
    } else if (entry) {
      classification = "FALSE_MISSING_CONTEXT";
      detail = `delivered IN FULL in the initial context (${entry.chars} chars) before the first turn - the missing-context claim is not about delivery`;
    } else {
      classification = "PLANNER_DELIVERY_GAP";
      detail = `required with disposition ${req.disposition} but no REQUIRED context entry carries it`;
      violations.push(`${key}: certificate claims disposition ${req.disposition} but the shard carries no required context entry for it`);
    }
    counts[classification]++;
    requested.push({ targetRef: dependency.targetRef, key, classification, deliveredChars: entry?.chars ?? null, fullTextChars: req?.fullTextChars ?? null, detail, requestingRuleId: ruleId });
  }

  return {
    contractVersion: MISSING_CONTEXT_CONTRACT_VERSION,
    shardId: shard.shardId,
    shardHash: shard.shardHash,
    certificateStatus: shard.dependencyCertificate.certificateStatus,
    requested,
    counts,
    contractHeld: violations.length === 0,
    violations,
  };
}

/** Pulls every unresolved dependency a shard's composition reported, with the rule that reported it. */
export function reportedMissingDependencies(composition: { rules: { ruleId: string; unresolvedDependencies?: IRUnresolvedDependency[] }[] } | null): { dependency: IRUnresolvedDependency; ruleId: string | null }[] {
  if (!composition) return [];
  return composition.rules.flatMap((r) => (r.unresolvedDependencies ?? []).map((dependency) => ({ dependency, ruleId: r.ruleId })));
}
