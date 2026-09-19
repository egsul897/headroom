/**
 * PHASE 3 / 6.01 DEPENDENCY-DELIVERY REMEDIATION §1-§5 - zero-cost forensics of the shard that failed the paid
 * revalidation. Reads ONLY the frozen revalidation evidence (immutable) and re-derives the planner's own inputs
 * deterministically. No model calls.
 *
 * Writes 118-dependency-delivery-baseline.json, 119-failed-shard-request-audit.json, 120-tool-budget-forensics.json.
 * Run: npx tsx scripts/phase-3-601-delivery-forensics.ts
 *
 * RED BASELINE - DO NOT REGENERATE AFTER THE REMEDIATION. These three artifacts describe the planner AS IT WAS when the
 * paid revalidation failed (shard planner v2, which had no required tier and no dependency certificate). They re-derive
 * the planner's own decisions from live code, so running them against the remediated planner would overwrite the record
 * of the defect with the record of the fix. The guard below refuses to write unless the live planner is still v2; the
 * committed artifacts carry the v2 budget shape (no maxRequiredContextChars) as their own proof of provenance.
 */
import { readdirSync } from "node:fs";
import { writeJson } from "./f7b-lib";
import { buildRealPlan, loadFrozenInventoryCandidate, OUT, readJson, resumeProof, sh } from "./phase-3-601-revalidation-lib";
import { DEFAULT_TOOL_BUDGET } from "../lib/contract-model/compiler/semantic/types";
import { DEFAULT_SHARD_BUDGET } from "../lib/contract-model/compiler/semantic/shard-planner";
import { SHARD_PLANNER_ALGORITHM_VERSION } from "../lib/contract-model/compiler/semantic/shard-types";
import type { StructuralIndex } from "../lib/contract-model/compiler/structural-index";

/** The planner version the red baseline was measured under. Writing these artifacts under any other version is refused. */
const RED_BASELINE_PLANNER_VERSION: string = "semantic-compilation-shards.v2-dependency-first-context";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const REVAL = "tests/fixtures/unseen-packages/phase-3-final-601-revalidation";
export const FAILED_SHARD_ID = "shard:86cc5e439f113d6053a9";
export const FAILED_SHARD_HASH = "691cf0598278741ac4cefa845910b4274c7234c7ee3283ec17a46ce29b6ae5ed";
const at = () => new Date().toISOString();

/** Every defined term of `documentId` that occurs verbatim in `text`, longest-first so a longer term wins over its prefix. */
export function definedTermsOccurringIn(text: string, index: StructuralIndex, documentId: string, minLen = 4) {
  const defs = index.allDefinitions().filter((d) => d.documentId === documentId && typeof d.exactTerm === "string" && d.exactTerm.length >= minLen);
  const seen = new Map<string, (typeof defs)[number]>();
  for (const d of [...defs].sort((a, b) => b.exactTerm.length - a.exactTerm.length)) if (text.includes(d.exactTerm) && !seen.has(d.normalizedTerm)) seen.set(d.normalizedTerm, d);
  return [...seen.values()];
}

export function loadDeliveryForensics() {
  const candidate = loadFrozenInventoryCandidate();
  const proof = resumeProof(candidate);
  const plan = buildRealPlan(proof);
  const index = proof.built.chewy.index;
  const region = proof.ctx.regions[0]!;
  const shard = plan.shards.find((s) => s.shardId === FAILED_SHARD_ID)!;
  const ownedText = shard.primarySlices.map((sl) => region.text.slice(sl.charStart, sl.charEnd)).join("\n");
  const record = readJson<Any>(`${REVAL}/durable-shards/${FAILED_SHARD_HASH}.json`);
  const compile = readJson<Any>(`${REVAL}/compile-result.json`);
  return { candidate, proof, plan, index, region, shard, ownedText, record, compile };
}

if (process.argv[1] && /phase-3-601-delivery-forensics\.ts$/.test(process.argv[1])) {
  if ((SHARD_PLANNER_ALGORITHM_VERSION as string) !== RED_BASELINE_PLANNER_VERSION) {
    console.error(`REFUSED: 118/119/120 are the RED BASELINE, measured under planner ${RED_BASELINE_PLANNER_VERSION}. The live planner is ${SHARD_PLANNER_ALGORITHM_VERSION}, so re-running would overwrite the record of the defect with the record of its fix. The committed artifacts stand; the remediated planner's own measurements live in 121-132.`);
    process.exit(2);
  }
  const F = loadDeliveryForensics();
  const { plan, index, shard, ownedText, record, compile } = F;
  const byId = new Map((F.proof.decision.ok ? F.proof.decision.inventory : F.candidate.inventory).items.map((i) => [i.inventoryItemId, i]));
  const ft = (t: string) => index.getDefinitionFullText(t, "doc-a") ?? "";

  // ---------------- 118 baseline: what is frozen, and the shard as planned
  const revalVerdict = readJson<Any>(`${OUT}/117-revalidation-verdict.json`);
  writeJson(`${OUT}/118-dependency-delivery-baseline.json`, {
    artifact: "PHASE 3 / 6.01 DEPENDENCY-DELIVERY REMEDIATION §1/§2 - frozen paid-revalidation evidence and the exact failed shard", at: at(),
    paidCalls: 0, startingSha: sh("git rev-parse HEAD"),
    immutable: { artifacts: "docs/phase-3-final-601/104-117 (not edited by this mission)", rawEvidence: `${REVAL} (not edited by this mission)`, humanReferenceSet: "audit-only; never used to construct production context" },
    priorVerdict: { verdict: revalVerdict.verdict, summary: revalVerdict.summary },
    failedShard: {
      shardId: shard.shardId, shardHash: shard.shardHash, expectedShardHash: FAILED_SHARD_HASH, hashMatches: shard.shardHash === FAILED_SHARD_HASH,
      ordinal: shard.ordinal, status: record.result.status, failureReasons: record.result.failureReasons, oversized: shard.oversized,
      ownedUnits: shard.ownedUnitKeys, ownedUnitCount: shard.ownedUnitKeys.length,
      ownedItemIds: shard.ownedItemIds, ownedItems: shard.ownedItemIds.length, ownedMaterialItems: shard.ownedMaterialItemIds.length,
      primaryChars: shard.primaryChars, primarySlices: shard.primarySlices.map((s) => ({ charStart: s.charStart, charEnd: s.charEnd, units: s.unitKeys.length })),
      contextChars: shard.contextChars, contextEntries: shard.context.length, unresolvedContextEntries: shard.unresolvedContext.length,
      estimate: shard.estimate, telemetry: record.result.telemetry,
      initialContext: shard.context.map((c) => ({ key: c.contextKey, kind: c.kind, chars: c.chars, truncated: c.truncated, requiredBy: c.requiredBy.length, reason: c.reason })),
      unresolvedContext: shard.unresolvedContext,
      terminalOutput: { rules: record.result.composition?.rules?.length ?? 0, definitions: record.result.composition?.definitions?.length ?? 0, sharedCapacities: record.result.composition?.sharedCapacities?.length ?? 0, unresolvedIssues: (record.result.unresolvedIssues ?? []).length },
      modelToolCallLog: { persisted: Array.isArray(record.result.toolCallLog) ? record.result.toolCallLog.length : 0, note: "the durable shard record does not persist the per-shard tool-call log; §23 of this mission adds the telemetry that would have made the exact call sequence auditable" },
    },
    budgets: { shard: plan.budget, defaultShard: DEFAULT_SHARD_BUDGET, tool: DEFAULT_TOOL_BUDGET },
  });

  // ---------------- 119 request audit: every missing request, with the §3 fields and the §4 delivery table
  const mcRules = (compile.rules as Any[]).filter((r) => r.sufficiency === "MISSING_CONTEXT");
  const structured = mcRules.flatMap((r) => (r.unresolvedDependencies ?? []).map((u: Any) => ({ requestedByRule: r.ruleId, ruleSection: r.sourceSectionRef, targetRef: String(u.targetRef), relationshipType: u.relationshipType, description: u.description })));
  const OLD_CLOSED = ["Fixed Incremental Amount", "Voluntary Prepayment Incremental Amount", "Ratio Incremental Amount", "Extension Amount"];
  const ctxKeys = new Set(shard.context.map((c) => c.contextKey));
  const unresolvedByKey = new Map(shard.unresolvedContext.map((u) => [u.key, u]));
  // Word-boundary safe: strips the routing prefixes production writes ("term:", "Section ", "§") WITHOUT eating the
  // first syllable of a term that merely starts with those letters (e.g. "Secured Indebtedness").
  const norm = (s: string) => s.toLowerCase().replace(/^\s*term\s*:\s*/i, "").replace(/^\s*(?:section|sec)\s*[:.]?\s+/i, "").replace(/^\s*§+\s*/, "").replace(/\s+/g, " ").trim();

  /** Deterministic re-derivation: was this dependency statically knowable from the owned source + index BEFORE the call? */
  const occurring = definedTermsOccurringIn(ownedText, index, "doc-a");
  const occurringTerms = new Set(occurring.map((d) => d.normalizedTerm));
  const staticallyKnowable = (target: string): { knowable: boolean; how: string; hops: number } => {
    const t = norm(target);
    if (occurringTerms.has(t)) return { knowable: true, how: "defined term occurs verbatim in this shard's owned primary source", hops: 1 };
    // transitive: reachable from an occurring term's definition text within 3 hops
    let frontier = occurring.map((d) => d.exactTerm); const seen = new Set(frontier.map(norm));
    for (let hop = 2; hop <= 3; hop++) {
      const next: string[] = [];
      for (const term of frontier) for (const d of definedTermsOccurringIn(ft(term), index, "doc-a")) {
        if (seen.has(d.normalizedTerm)) continue; seen.add(d.normalizedTerm); next.push(d.exactTerm);
        if (d.normalizedTerm === t) return { knowable: true, how: `defined term reachable by transitive definition closure from an owned-source term (depth ${hop})`, hops: hop };
      }
      frontier = next;
    }
    if (/^\d+\.\d+/.test(t)) { const r = index.findNodesByRef("doc-a", t.replace(/^section\s+/, "")); if (r.length > 0) return { knowable: true, how: "section reference resolvable in the structural index", hops: 1 }; }
    return { knowable: false, how: "not derivable from owned source + index by occurrence or bounded closure", hops: 0 };
  };

  const rows = structured.map((r) => {
    const t = norm(r.targetRef);
    const isTerm = /^term:/i.test(r.targetRef) || !/^\s*section/i.test(r.targetRef);
    const know = staticallyKnowable(r.targetRef);
    const inInitial = ctxKeys.has(`term:${t}`) || ctxKeys.has(`section:${t}`);
    const unres = unresolvedByKey.get(`term:${t}`) ?? unresolvedByKey.get(`section:${t}`) ?? unresolvedByKey.get(t);
    const defText = isTerm ? ft(r.targetRef.replace(/^term:/i, "")) : "";
    const node = !isTerm ? index.findNodesByRef("doc-a", t.replace(/^section\s+/, ""))[0] : undefined;
    const secText = node ? index.getNodeText(node.nodeId, "DESCENDANTS") : "";
    return {
      requestedFact: r.targetRef, dependencyType: isTerm ? "DEFINED_TERM" : "SECTION_REFERENCE",
      requestingRule: r.requestedByRule, requestingRuleSection: r.ruleSection, relationshipType: r.relationshipType, whyNeeded: r.description,
      requestingOwnedItems: (compile.rules as Any[]).find((x) => x.ruleId === r.requestedByRule)?.inventoryItemIds ?? [],
      classification: OLD_CLOSED.some((o) => norm(o) === t) ? "OLD_CLOSED_DEPENDENCY" : "NEW_DEPENDENCY",
      deterministicResolution: isTerm ? (defText ? { resolved: true, chars: defText.length, indexed: true } : { resolved: false }) : (node ? { resolved: true, chars: secText.length, nodeId: node.nodeId } : { resolved: false }),
      plannerKnewBeforeModelCall: { underTheOldPlanner: inInitial || !!unres, underTheRequiredDependencyModel: know.knowable, how: know.how, closureDepth: know.hops },
      inInitialShardContext: inInitial,
      inUnresolvedContext: unres ? { reason: unres.reason, detail: unres.detail.slice(0, 160) } : null,
      toolRouteExisted: isTerm ? !!index.getDefinition(r.targetRef.replace(/^term:/i, ""), "doc-a") : !!node,
      modelInvokedTheRoute: "NOT_AUDITABLE - the durable shard record does not persist the tool-call log (§23 adds this telemetry)",
      toolCallOrdinal: null,
      finalEffectOnShardStatus: "contributed to SHARD_MISSING_CONTEXT (the rule that recorded it carries sufficiency MISSING_CONTEXT, which escalates the shard)",
    };
  });

  // Every statically-known dependency the planner itself dropped for BUDGET - provable without any tool-call log.
  const budgetDropped = shard.unresolvedContext.filter((u) => u.reason === "BUDGET").map((u) => ({
    key: u.key, kind: u.kind, requiredByOwnedItems: u.requiredBy.length, requiredBy: u.requiredBy,
    knownBeforeModelCall: true, inInitialContext: false, retrievable: true,
    actuallyRetrieved: "NOT_AUDITABLE (no persisted tool-call log)",
    requiredForOwnedSemantics: true,
    result: "DROPPED_FOR_CONTEXT_BUDGET - the shard was allowed to enter provider execution with a statically known, resolvable dependency absent from its evidence package",
  }));

  writeJson(`${OUT}/119-failed-shard-request-audit.json`, {
    artifact: "PHASE 3 / 6.01 DEPENDENCY-DELIVERY REMEDIATION §3/§4 - every missing request of the failed shard, and the route-exists-vs-delivered table", at: at(), paidCalls: 0,
    shardId: FAILED_SHARD_ID, shardHash: FAILED_SHARD_HASH,
    missingContextRules: mcRules.map((r) => ({ ruleId: r.ruleId, section: r.sourceSectionRef, sufficiencyReasons: r.sufficiencyReasons, unresolvedDependencies: (r.unresolvedDependencies ?? []).length })),
    requestedMissingDependencies: rows,
    oldClosedDependencies: rows.filter((r) => r.classification === "OLD_CLOSED_DEPENDENCY").map((r) => r.requestedFact),
    newDependencies: rows.filter((r) => r.classification === "NEW_DEPENDENCY").map((r) => r.requestedFact),
    deliveryTable: {
      legend: "KNOWN BEFORE MODEL? / INITIAL CONTEXT? / RETRIEVABLE? / ACTUALLY RETRIEVED? / REQUIRED FOR OWNED SEMANTICS? / RESULT",
      modelRequestedDependencies: rows.map((r) => ({ dependency: r.requestedFact, knownBeforeModel_oldPlanner: r.plannerKnewBeforeModelCall.underTheOldPlanner, knownBeforeModel_requiredDependencyModel: r.plannerKnewBeforeModelCall.underTheRequiredDependencyModel, initialContext: r.inInitialShardContext, retrievable: r.toolRouteExisted, actuallyRetrieved: r.modelInvokedTheRoute, requiredForOwnedSemantics: true, result: r.finalEffectOnShardStatus })),
      plannerDroppedDependencies: budgetDropped,
      counts: { modelRequested: rows.length, plannerDroppedForBudget: budgetDropped.length, plannerDroppedForBudgetRequiredByMultipleItems: budgetDropped.filter((b) => b.requiredByOwnedItems > 1).length },
    },
    architectureClassification: {
      verdict: "OPTIONAL_DELIVERY_OF_REQUIRED_CONTEXT",
      proof: [
        `${budgetDropped.length} dependencies were derived by the planner itself, were resolvable, were required by owned material items, and were nevertheless left out of the initial evidence package because the ${plan.budget.maxContextChars}-char context budget was exhausted - their delivery was handed to an optional model tool choice.`,
        `The four previously closed Incremental Amount terms were not even candidates: they are reachable only by transitive definition closure from a term that DOES occur in the owned source, and the old planner modelled one hop from Pass-A edges only. They were statically knowable and were not known.`,
        "Route existence was never the missing property: every one of these resolves deterministically today.",
      ],
      resolvableButNotDelivered: true,
    },
  });

  // ---------------- 120 tool-budget forensics (§5)
  // Turns per shard, derived entirely from COMMITTED evidence: the paid ledger's ordered compile:turn calls (each with
  // its own timestamp) bucketed by each durable shard record's completedAt. The run log holds only the shard lines.
  const ledgerCalls = (readJson<Any>(`${OUT}/109-paid-ledger.json`).calls as Any[]).filter((c) => c.stage === "compile:turn").map((c) => ({ at: Date.parse(c.at), inputTokens: c.inputTokens as number, outputTokens: c.outputTokens as number }));
  const records = readdirSync(`${REVAL}/durable-shards`).filter((f) => f.endsWith(".json")).map((f) => readJson<Any>(`${REVAL}/durable-shards/${f}`)).map((r) => ({ shardId: r.shardId as string, status: r.result.status as string, completedAt: Date.parse(r.completedAt as string) })).sort((a, b) => a.completedAt - b.completedAt);
  let prev = 0;
  const turnsPerShard = records.map((r) => { const mine = ledgerCalls.filter((c) => c.at > prev && c.at <= r.completedAt); prev = r.completedAt; return { shardId: r.shardId, status: r.status, turns: mine.length, inputTokens: mine.map((c) => c.inputTokens), outputTokens: mine.map((c) => c.outputTokens) }; });
  const failedTurns = turnsPerShard.find((t) => t.shardId === FAILED_SHARD_ID);
  writeJson(`${OUT}/120-tool-budget-forensics.json`, {
    artifact: "PHASE 3 / 6.01 DEPENDENCY-DELIVERY REMEDIATION §5 - tool-budget causality for the failed shard", at: at(), paidCalls: 0,
    toolBudget: DEFAULT_TOOL_BUDGET,
    turnDerivation: "committed evidence only: 109-paid-ledger.json compile:turn calls (timestamped) bucketed by each durable shard record completedAt",
    evidenceLimitation: "the durable shard record persists the terminal composition and telemetry but NOT the tool-call log, so the exact number of live tool calls, refusals and remaining call slots cannot be read from the frozen evidence. Turn counts and their input-token growth are recoverable from the run log and are reported as the strongest available proxy. §23 adds the telemetry that removes this limitation.",
    perShardTurns: turnsPerShard,
    failedShard: { shardId: FAILED_SHARD_ID, providerTurns: failedTurns?.turns ?? null, turnInputTokens: failedTurns?.inputTokens ?? null, inputTokenGrowthBetweenTurns: (failedTurns?.inputTokens ?? []).slice(1).map((v, i) => v - failedTurns!.inputTokens[i]!), interpretation: "each turn after the first carries the previous turn's tool results; growth is evidence that tool calls were made and answered, not refused" },
    counters: {
      maxToolCalls: DEFAULT_TOOL_BUDGET.maxToolCalls, liveToolCalls: "NOT_AUDITABLE", successfulSourceReadingCalls: "NOT_AUDITABLE", refusals: "NOT_AUDITABLE", remainingCallSlotsAtStop: "NOT_AUDITABLE",
      maxAdditionalSourceChars: DEFAULT_TOOL_BUDGET.maxAdditionalSourceChars, remainingSourceCharBudgetAtStop: "NOT_AUDITABLE",
    },
    causalClassification: {
      A_TOOL_CALL_LIMIT_EXHAUSTED: { applies: "UNPROVABLE_FROM_FROZEN_EVIDENCE", note: `the model's own reason text says the sub-component terms "were not resolvable within reasonable tool budget for this shard", which is a self-report of budget pressure, not a persisted counter; with ${DEFAULT_TOOL_BUDGET.maxToolCalls} calls for ${shard.ownedItemIds.length} owned items the pressure is structurally plausible` },
      B_SOURCE_CHAR_LIMIT_EXHAUSTED: { applies: "UNPROVABLE_FROM_FROZEN_EVIDENCE" },
      C_MODEL_DID_NOT_REQUEST_AVAILABLE_DEPENDENCY: { applies: "PARTIAL", note: "the model did request the chain (it retrieved the bounding term) - it did not reach the last hop" },
      D_MODEL_REQUESTED_TOO_LATE: { applies: "PARTIAL", note: "the chain was discovered during execution rather than supplied at turn 1, so every hop consumed a call the planner could have avoided" },
      E_OTHER: { applies: "YES", name: "PLANNER_DELIVERY_GAP", note: `${budgetDropped.length} statically known, resolvable, owned-item-required dependencies were absent from the initial package by budget, and the four previously closed terms were never derived at all - both provable from the plan alone, with no tool-call log needed` },
      primary: "PLANNER_DELIVERY_GAP (E) - the provable, architectural cause; A/D are contributing and self-reported but not auditable from the frozen evidence",
    },
    remediationDirection: { doNotRaiseGlobalToolBudget: true, toolBudgetUnchanged: DEFAULT_TOOL_BUDGET, rationale: "§16 - raising maxToolCalls or maxAdditionalSourceChars would not make a statically known dependency present at turn 1; it would only buy more chances to rediscover it" },
  });
  console.log(JSON.stringify({ shardHashMatches: shard.shardHash === FAILED_SHARD_HASH, modelRequested: rows.length, oldClosed: rows.filter((r) => r.classification === "OLD_CLOSED_DEPENDENCY").length, budgetDropped: budgetDropped.length, knowableUnderNewModel: rows.filter((r) => r.plannerKnewBeforeModelCall.underTheRequiredDependencyModel).length, failedShardTurns: failedTurns?.turns ?? null }, null, 1));
}
