/**
 * F-5.3 - DUAL-PASS SEMANTIC ENSEMBLE: deterministic canonical reconciliation of INDEPENDENT Pass A inventories into
 * ONE authoritative, support-aware union inventory.
 *
 *     SOURCE -> slots -> independent Pass A (pass 1) -> independent Pass A (pass 2)
 *            -> deterministic canonical reconciliation (THIS MODULE) -> SUPPORT-AWARE UNION -> Pass B / accountability
 *
 * Why: F-5.1/F-5.2A proved that one Pass A run is not reproducible at the proposition level (the model decides how
 * many propositions a slot holds) and that no source-form rule predicts that count. The ensemble converts STOCHASTIC
 * OMISSION into EXPLICIT SUPPORT ASYMMETRY: every source-verified proposition of either pass survives, canonically
 * de-duplicated under the F-5.1 source-owned identity rules, and carries its support provenance.
 *
 * What it must never do: turn two runs into an unsupported claim of completeness, delete singleton semantics, promote a
 * singleton to corroborated, or pick a side of a conflict. Raw source coverage is recomputed over the union and stays
 * independently authoritative - unaccounted source still blocks trust even when every item is corroborated.
 *
 * This module makes NO provider call. It accepts already-created FrozenSemanticInventory objects only.
 * Independence contract: Pass A side (imports inventory/coverage/functions/types only).
 */
import { hashParts } from "../hashing";
import { normalizeInventorySubmission, normalizedStart } from "./inventory";
import { effectsContradict, functionsOf, functionsSignature } from "./semantic-functions";
import { computeSourceCoverage, isAccountedDisposition, type ExternalAccountabilityLink } from "./source-coverage";
import { computePartitionHash, computeSourceContextHash } from "./source-identity";
import type { SlotPartition } from "./slots";
import { SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION, SEMANTIC_INVENTORY_PROMPT_VERSION } from "./types";
import type { EnsembleCompatibilityMode, EnsembleCompatibilityRecord, EnsembleRecord, FrozenSemanticInventory, ItemSupport, SemanticInventoryItem, SourceContextResult, SupportStatus } from "./types";
import type { WireInventoryItem } from "./wire-schema";
import type { StructuralIndex } from "../structural-index";

export const ENSEMBLE_ALGORITHM_VERSION = "semantic-ensemble.v1";
export type UnionPolicy = "INTERSECTION_ONLY" | "RAW_UNION" | "SUPPORT_AWARE_CANONICAL_UNION";
/** The Pass A evidence generations this ensemble may combine under STRICT. Exactly the current generation: a new generation is a deliberate, versioned decision, never an implicit one. */
export const ENSEMBLE_SUPPORTED_ALGORITHM_VERSIONS: readonly string[] = [SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION];
export const ENSEMBLE_SUPPORTED_PROMPT_VERSIONS: readonly string[] = [SEMANTIC_INVENTORY_PROMPT_VERSION];

export interface EnsemblePass {
  /** Generic pass identifier (e.g. "pass-1"); never a semantic label. */
  passId: string;
  inventory: FrozenSemanticInventory;
}
export interface EnsembleCompatibilityOptions {
  /** Default STRICT. EXPERIMENTAL_CROSS_VERSION is for diagnostics/historical controls only and must name the checks it accepts failing. */
  mode?: EnsembleCompatibilityMode;
  /** EXPERIMENTAL_CROSS_VERSION only: the check names (see COMPATIBILITY_CHECKS) that may fail without rejecting. Ignored - and must be empty - under STRICT. */
  acceptFailing?: string[];
}
export interface EnsembleInput {
  candidateRef: string;
  sourceContext: SourceContextResult;
  structuralIndex?: StructuralIndex | null;
  partition?: SlotPartition;
  passes: EnsemblePass[];
  externalAccountability?: ExternalAccountabilityLink[];
  /** F-5.3B input-compatibility gate (section 2). Omitted = STRICT. */
  compatibility?: EnsembleCompatibilityOptions;
}
export type EnsembleInventory = FrozenSemanticInventory & { ensemble: EnsembleRecord };

export const COMPATIBILITY_CHECKS = ["candidate-ref", "source-context-hash", "source-identity-recorded", "partition", "document", "algorithm-generation", "prompt-generation", "provider-model", "pass-status"] as const;
export type CompatibilityCheck = (typeof COMPATIBILITY_CHECKS)[number];

export class EnsembleIncompatibleInputError extends Error {
  constructor(public readonly failures: { check: string; detail: string }[], public readonly record: EnsembleCompatibilityRecord) {
    super(`ensemble refused: incompatible pass inputs - ${failures.map((f) => `[${f.check}] ${f.detail}`).join("; ")}`);
    this.name = "EnsembleIncompatibleInputError";
  }
}

/**
 * INPUT-COMPATIBILITY GATE (F-5.3B section 2). Two passes may count as independent corroboration only if they are
 * independent executions over semantically identical input under a compatible semantic inventory contract. Checked:
 * candidateRef; the source-context hash of every pass against the supplied source context (a pass with NO recorded
 * identity is rejected - see source-identity.ts's versioned migration for pre-F-5.3B evidence); the slot partition; the
 * document; the accountability algorithm generation (must be the current one); the prompt generation; provider+model
 * (identical for this certification); and that every pass actually ran (no FAILED/SKIPPED pass can corroborate).
 * STRICT rejects on any failure. EXPERIMENTAL_CROSS_VERSION records every failure and admits only the ones the caller
 * named in acceptFailing - never silently.
 */
export function checkEnsembleCompatibility(input: EnsembleInput): { record: EnsembleCompatibilityRecord; failures: { check: string; detail: string }[]; admitted: boolean } {
  const mode: EnsembleCompatibilityMode = input.compatibility?.mode ?? "STRICT";
  const accept = new Set(mode === "EXPERIMENTAL_CROSS_VERSION" ? input.compatibility?.acceptFailing ?? [] : []);
  if (mode === "STRICT" && (input.compatibility?.acceptFailing?.length ?? 0) > 0) throw new Error("STRICT compatibility admits no declared exceptions - use EXPERIMENTAL_CROSS_VERSION explicitly for diagnostics");
  const sourceContextHash = computeSourceContextHash(input.sourceContext);
  const partitionHash = input.partition ? computePartitionHash(input.partition) : null;
  const documentIds = [...new Set(input.sourceContext.regions.filter((r) => r.kind === "OPERATIVE").map((r) => r.documentId))].sort();
  const checks: EnsembleCompatibilityRecord["checks"] = [];
  const push = (check: CompatibilityCheck, pass: boolean, detail: string) => checks.push({ check, pass, detail });
  const passes: EnsembleCompatibilityRecord["passes"] = {};
  // Order-free record: passes are examined in passId order so Union(A,B) and Union(B,A) produce the same record.
  const ordered = [...input.passes].sort((a, b) => a.passId.localeCompare(b.passId));
  for (const p of ordered) {
    const inv = p.inventory;
    const invPartitionHash = inv.partition ? computePartitionHash(inv.partition) : inv.sourceIdentity?.partitionHash ?? null;
    passes[p.passId] = { algorithmVersion: inv.algorithmVersion, promptVersion: inv.promptVersion, provider: inv.provider, model: inv.model, sourceContextHash: inv.sourceContextHash ?? null, sourceIdentityMethod: inv.sourceIdentity?.method ?? null, partitionHash: invPartitionHash, documentId: inv.documentId ?? null };
    push("candidate-ref", inv.candidateRef === input.candidateRef, `${p.passId}: candidateRef ${inv.candidateRef}${inv.candidateRef === input.candidateRef ? " matches" : ` differs from ${input.candidateRef}`}`);
    push("source-identity-recorded", !!inv.sourceContextHash, `${p.passId}: ${inv.sourceContextHash ? `source identity ${inv.sourceIdentity?.method ?? "recorded"}` : "no recorded source identity (pre-F-5.3B evidence must be verified by the source-identity migration first)"}`);
    push("source-context-hash", inv.sourceContextHash === sourceContextHash, `${p.passId}: source-context hash ${inv.sourceContextHash ? inv.sourceContextHash.slice(0, 16) : "(none)"} vs ensemble ${sourceContextHash.slice(0, 16)}`);
    push("partition", partitionHash === null ? true : invPartitionHash === partitionHash, partitionHash === null ? `${p.passId}: ensemble supplied no slot partition - not checked (source-context hash still binds the input)` : `${p.passId}: slot partition ${invPartitionHash ? invPartitionHash.slice(0, 16) : "(none recorded)"} vs ensemble ${partitionHash.slice(0, 16)}`);
    const passDoc = inv.documentId ?? null;
    push("document", passDoc === null ? documentIds.length <= 1 : documentIds.includes(passDoc), `${p.passId}: document ${passDoc ?? "(not recorded)"} vs ensemble ${documentIds.join(",") || "(none)"}`);
    push("algorithm-generation", ENSEMBLE_SUPPORTED_ALGORITHM_VERSIONS.includes(inv.algorithmVersion), `${p.passId}: algorithm ${inv.algorithmVersion}${ENSEMBLE_SUPPORTED_ALGORITHM_VERSIONS.includes(inv.algorithmVersion) ? " supported" : ` not in [${ENSEMBLE_SUPPORTED_ALGORITHM_VERSIONS.join(", ")}] - a later versioned migration may declare compatibility; this ensemble does not`}`);
    push("prompt-generation", ENSEMBLE_SUPPORTED_PROMPT_VERSIONS.includes(inv.promptVersion), `${p.passId}: prompt ${inv.promptVersion}${ENSEMBLE_SUPPORTED_PROMPT_VERSIONS.includes(inv.promptVersion) ? " supported" : " unsupported"}`);
    const ran = inv.inventoryStatus === "INVENTORY_OK" || inv.inventoryStatus === "INVENTORY_COVERAGE_GAP";
    push("pass-status", ran, `${p.passId}: ${inv.inventoryStatus}${ran ? "" : " - a pass that did not run cannot corroborate or be corroborated"}`);
  }
  // Cross-pass agreement: every pass must share generation, prompt, provider+model with every other pass.
  const first = ordered[0]?.inventory;
  for (const p of ordered.slice(1)) {
    const inv = p.inventory;
    push("algorithm-generation", inv.algorithmVersion === first!.algorithmVersion, `${p.passId} vs ${ordered[0]!.passId}: algorithm ${inv.algorithmVersion} vs ${first!.algorithmVersion}`);
    push("prompt-generation", inv.promptVersion === first!.promptVersion, `${p.passId} vs ${ordered[0]!.passId}: prompt ${inv.promptVersion} vs ${first!.promptVersion}`);
    push("provider-model", inv.provider === first!.provider && inv.model === first!.model, `${p.passId} vs ${ordered[0]!.passId}: ${inv.provider}/${inv.model} vs ${first!.provider}/${first!.model}`);
  }
  const failures = checks.filter((c) => !c.pass).map((c) => ({ check: c.check, detail: c.detail }));
  const unaccepted = failures.filter((f) => !accept.has(f.check));
  const record: EnsembleCompatibilityRecord = { mode, sourceContextHash, partitionHash, documentIds, passes, checks, declaredExceptions: [...accept].sort() };
  return { record, failures, admitted: unaccepted.length === 0 };
}

const MATERIAL = new Set(["CRITICAL", "MATERIAL"]);
const SEP = "::";

function toWire(passId: string, i: SemanticInventoryItem): WireInventoryItem {
  const ref = (id: string) => `${passId}${SEP}${id}`;
  return { localRef: ref(i.inventoryItemId), semanticRole: i.semanticRole, additionalRoles: (i.declaredRoles ?? []).filter((r) => r !== i.semanticRole), proposition: i.proposition, excerpt: i.sourceSpan.excerpt, regionId: i.sourceSpan.regionId, slotId: i.slotId ?? null, quantitativeValues: (i.quantitativeValues ?? []).map((v) => ({ kind: v.kind, rawText: v.rawText, normalizedValue: v.normalizedValue, unit: v.unit })), referencedTerms: i.referencedTerms ?? [], referencedSections: i.referencedSections ?? [], parentRef: i.parentItemId ? ref(i.parentItemId) : null, relatedRefs: (i.relatedItemIds ?? []).map(ref), materiality: i.materiality, ambiguity: i.ambiguity, ambiguityReason: i.ambiguityReason, operative: i.operative };
}

/**
 * Builds the SUPPORT-AWARE CANONICAL UNION of the given passes. Every pass item is re-verified against the source and
 * canonicalized under the F-5.1 identity rules (role-blind, start-anchored, value-pinned, contradictory-effect split,
 * coordination sub-index) TOGETHER with the other passes' items, so two passes' descriptions of one source proposition
 * become one canonical item whose support lists both passes. Pass order never matters: items are sorted by source
 * position and id before reconciliation and the freeze hash is order-independent.
 */
export function buildEnsembleInventory(input: EnsembleInput): EnsembleInventory {
  if (input.passes.length < 2) throw new Error("an ensemble needs at least two independent passes");
  const passIds = [...new Set(input.passes.map((p) => p.passId))].sort();
  if (passIds.length !== input.passes.length) throw new Error("passIds must be unique");
  const regionText = new Map(input.sourceContext.regions.map((r) => [r.regionId, r.text] as const));
  // F-5.3B section 2: explicit rejection of incompatible inputs - never a silent downgrade, never a union anyway.
  const compat = checkEnsembleCompatibility(input);
  if (!compat.admitted) throw new EnsembleIncompatibleInputError(compat.failures.filter((f) => !compat.record.declaredExceptions.includes(f.check)), compat.record);
  // Deterministic member order: by source position, then id, then passId - so the surviving wording/parent of a merged
  // item is the same whichever order the passes were supplied in.
  const members = input.passes
    .flatMap((p) => p.inventory.items.map((i) => ({ passId: p.passId, item: i })))
    .sort((a, b) => a.item.sourceSpan.regionId.localeCompare(b.item.sourceSpan.regionId) || a.item.sourceSpan.charStart - b.item.sourceSpan.charStart || a.item.sourceSpan.charEnd - b.item.sourceSpan.charEnd || a.item.inventoryItemId.localeCompare(b.item.inventoryItemId) || a.passId.localeCompare(b.passId));
  const wire = members.map((m) => toWire(m.passId, m.item));
  const r = normalizeInventorySubmission({ candidateRef: input.candidateRef, sourceContext: input.sourceContext, structuralIndex: input.structuralIndex ?? null }, wire, input.partition);

  // Support provenance from the normalizer's own member accounting (never inferred by overlap).
  const items: SemanticInventoryItem[] = r.items.map((it) => {
    const refs = r.memberLocalRefs[it.inventoryItemId] ?? [];
    const memberItemIds: Record<string, string[]> = {};
    for (const ref of refs) {
      const at = ref.indexOf(SEP);
      const passId = ref.slice(0, at), id = ref.slice(at + SEP.length);
      memberItemIds[passId] = [...(memberItemIds[passId] ?? []), id].sort();
    }
    const supporting = Object.keys(memberItemIds).sort();
    const support: ItemSupport = { supportingPasses: supporting, supportStatus: supporting.length > 1 ? "CORROBORATED" : "SINGLE_RUN", memberItemIds: Object.fromEntries(Object.entries(memberItemIds).sort(([a], [b]) => a.localeCompare(b))) };
    return { ...it, support };
  });

  // CONFLICTS: incompatible claims over the SAME source (same region, same normalized start within one word, mutual
  // overlap >= 50%): contradictory deontic effects (the normalizer keeps them apart on purpose) or different stated
  // values asserted by DIFFERENT passes. Both sides are kept and marked; nothing is chosen.
  const conflicts: EnsembleRecord["conflicts"] = [];
  const wordsBetween = (t: string, a: number, b: number) => (t.slice(Math.min(a, b), Math.max(a, b)).match(/\S+/g) ?? []).length;
  // A stated AMOUNT is a value of a quantitative kind (money, percent, ratio, days, dates, periods, multipliers, plain
  // numbers). OTHER-kind numerals (an ordinal such as "first (1st) day") are not stated amounts and never make a
  // conflict. Two value SETS conflict only when neither is a subset of the other: a pass that lists fewer of the same
  // values made the same claim with less detail, not an incompatible one (both items stay distinct singletons anyway).
  const amountSet = (i: SemanticInventoryItem) => new Set(i.quantitativeValues.filter((v) => v.kind !== "OTHER").map((v) => `${v.kind}:${v.normalizedValue ?? v.rawText.replace(/\s+/g, " ").trim().toLowerCase()}`));
  const subset = (p: Set<string>, q: Set<string>) => [...p].every((v) => q.has(v));
  // ... unless the extra values were never LOCATED in the source span (charStart < 0): an asserted amount the source
  // does not contain is an incompatible claim even when the other pass's values are a subset of it.
  const unlocated = (i: SemanticInventoryItem) => new Set(i.quantitativeValues.filter((v) => v.kind !== "OTHER" && v.charStart < 0).map((v) => `${v.kind}:${v.normalizedValue ?? v.rawText.replace(/\s+/g, " ").trim().toLowerCase()}`));
  const valuesConflict = (x: SemanticInventoryItem, y: SemanticInventoryItem) => {
    const p = amountSet(x), q = amountSet(y);
    if (p.size === 0 || q.size === 0) return false;
    if (!subset(p, q) && !subset(q, p)) return true;
    const diff = [...new Set([...p, ...q])].filter((v) => !(p.has(v) && q.has(v)));
    return diff.some((v) => unlocated(x).has(v) || unlocated(y).has(v));
  };
  const vsig = (i: SemanticInventoryItem) => [...amountSet(i)].sort().join("|");
  for (let a = 0; a < items.length; a++) {
    for (let b = a + 1; b < items.length; b++) {
      const x = items[a]!, y = items[b]!;
      if (x.sourceSpan.regionId !== y.sourceSpan.regionId) continue;
      const t = regionText.get(x.sourceSpan.regionId) ?? "";
      const ov = Math.max(0, Math.min(x.sourceSpan.charEnd, y.sourceSpan.charEnd) - Math.max(x.sourceSpan.charStart, y.sourceSpan.charStart));
      const mutual = ov / Math.max(1, Math.max(x.sourceSpan.charEnd - x.sourceSpan.charStart, y.sourceSpan.charEnd - y.sourceSpan.charStart));
      if (mutual < 0.5 || wordsBetween(t, normalizedStart(t, x.sourceSpan.charStart), normalizedStart(t, y.sourceSpan.charStart)) > 1) continue;
      const fx = functionsOf(x), fy = functionsOf(y);
      let reason: string | null = null;
      if (effectsContradict(fx.effect, fy.effect)) reason = `contradictory deontic effects ${fx.effect} vs ${fy.effect} over one source stretch`;
      else if (valuesConflict(x, y) && !x.support!.supportingPasses.some((p) => y.support!.supportingPasses.includes(p))) reason = `different stated values (${vsig(x)} vs ${vsig(y)}) asserted by different passes over one source stretch`;
      if (!reason) continue;
      conflicts.push({ itemIds: [x.inventoryItemId, y.inventoryItemId].sort(), reason, slotId: x.slotId ?? null });
      for (const [self, other] of [[x, y], [y, x]] as const) {
        self.support!.supportStatus = "CONFLICTED";
        self.support!.conflictWith = [...new Set([...(self.support!.conflictWith ?? []), other.inventoryItemId])].sort();
        self.support!.conflictReason = reason;
      }
    }
  }

  // Raw source coverage RECOMPUTED over the union (never OR-ed from the passes' statuses).
  const cov = computeSourceCoverage({ regions: input.sourceContext.regions, spans: items.map((i) => ({ regionId: i.sourceSpan.regionId, charStart: i.sourceSpan.charStart, charEnd: i.sourceSpan.charEnd, materiality: i.materiality })), externalAccountability: input.externalAccountability });
  const unaccounted = cov.unaccounted.map((s) => ({ regionId: s.regionId, charStart: s.charStart, charEnd: s.charEnd, excerpt: s.excerpt, reason: s.reason, values: s.values }));
  const uninventoried = cov.unaccountedValues.map((v) => ({ ...v }));
  const totalChars = Object.values(cov.charsByDisposition).reduce((a, b) => a + b, 0);
  const accountedChars = Object.entries(cov.charsByDisposition).filter(([d]) => isAccountedDisposition(d as never)).reduce((a, [, n]) => a + n, 0);
  const links = input.externalAccountability ?? [];

  const counts: EnsembleRecord["counts"] = { canonicalItems: items.length, corroborated: 0, singleRun: 0, singleRunByPass: Object.fromEntries(passIds.map((p) => [p, 0])), conflicted: 0, materialSingleRun: 0, informationalSingleRun: 0, materialConflicted: 0, rejectedUnverifiable: r.rejectedUnverifiable };
  for (const i of items) {
    const s = i.support!;
    if (s.supportStatus === "CONFLICTED") { counts.conflicted++; if (MATERIAL.has(i.materiality)) counts.materialConflicted++; }
    else if (s.supportStatus === "CORROBORATED") counts.corroborated++;
    else { counts.singleRun++; counts.singleRunByPass[s.supportingPasses[0]!] = (counts.singleRunByPass[s.supportingPasses[0]!] ?? 0) + 1; if (MATERIAL.has(i.materiality)) counts.materialSingleRun++; else counts.informationalSingleRun++; }
  }
  const reviewItems = counts.materialSingleRun + counts.materialConflicted;
  const status = unaccounted.length > 0 ? "INVENTORY_COVERAGE_GAP" : items.length === 0 ? "INVENTORY_EMPTY_SUSPECT" : "INVENTORY_OK";
  const reasonParts = [`${items.length} canonical item(s) from ${passIds.length} independent passes: ${counts.corroborated} corroborated, ${counts.singleRun} single-run (${counts.materialSingleRun} CRITICAL/MATERIAL), ${counts.conflicted} conflicted`];
  if (unaccounted.length > 0) reasonParts.push(`${unaccounted.length} stretch(es) of source remain UNACCOUNTED_SOURCE after the union - accountability for that text is not established by either pass`);
  if (reviewItems > 0) reasonParts.push(`${reviewItems} CRITICAL/MATERIAL item(s) carry support asymmetry or conflict - REVIEW_REQUIRED unless independently resolved later`);
  const passHashes = Object.fromEntries(input.passes.map((p) => [p.passId, p.inventory.frozenContentHash] as [string, string]).sort(([a], [b]) => a.localeCompare(b)));
  const ensemble: EnsembleRecord = { algorithmVersion: ENSEMBLE_ALGORITHM_VERSION, policy: "SUPPORT_AWARE_CANONICAL_UNION", passIds, passHashes, counts, supportReviewRequired: reviewItems > 0, supportReviewFraction: items.length ? Number((reviewItems / items.length).toFixed(4)) : 0, conflicts: conflicts.sort((a, b) => a.itemIds[0]!.localeCompare(b.itemIds[0]!)), compatibility: compat.record };
  const first = input.passes[0]!.inventory;
  const sorted = [...items].sort((a, b) => a.sourceSpan.regionId.localeCompare(b.sourceSpan.regionId) || a.sourceSpan.charStart - b.sourceSpan.charStart || a.sourceSpan.charEnd - b.sourceSpan.charEnd || a.inventoryItemId.localeCompare(b.inventoryItemId));
  return {
    candidateRef: input.candidateRef,
    items: sorted,
    uninventoriedValues: uninventoried,
    unaccountedSource: unaccounted,
    sourceCoverage: { regionsConsidered: cov.regionsConsidered, countsByDisposition: { ...cov.countsByDisposition }, charsByDisposition: { ...cov.charsByDisposition }, accountedCharFraction: totalChars === 0 ? 1 : Number((accountedChars / totalChars).toFixed(4)), externallyAccountedRegions: links.filter((l) => cov.regionsConsidered.includes(l.regionId)).map((l) => ({ regionId: l.regionId, ownerCandidateRef: l.ownerCandidateRef, ownerInventoryHash: l.ownerInventoryHash })) },
    gapReinventory: null,
    inventoryStatus: status,
    inventoryStatusReason: reasonParts.join("; "),
    rejectedUnverifiableItems: r.rejectedUnverifiable,
    rejectedDuplicateItems: r.rejectedDuplicates,
    sourceContextState: input.sourceContext.state,
    frozenContentHash: ensembleFreezeHash(sorted, uninventoried, unaccounted, passHashes),
    frozenAt: new Date().toISOString(),
    algorithmVersion: `${first.algorithmVersion}+${ENSEMBLE_ALGORITHM_VERSION}`,
    promptVersion: first.promptVersion,
    provider: first.provider,
    model: first.model,
    telemetryCostUsd: input.passes.reduce<number | null>((acc, p) => (acc === null && p.inventory.telemetryCostUsd === null ? null : (acc ?? 0) + (p.inventory.telemetryCostUsd ?? 0)), null),
    ...(first.partition ? { partition: first.partition } : {}),
    ...(compat.record.documentIds.length === 1 ? { documentId: compat.record.documentIds[0] } : first.documentId ? { documentId: first.documentId } : {}),
    sourceContextHash: compat.record.sourceContextHash,
    sourceIdentity: { method: "RECORDED_AT_FREEZE", sourceContextHash: compat.record.sourceContextHash, partitionHash: compat.record.partitionHash },
    ensemble,
  };
}

/** Order-independent freeze hash: canonical propositions, support (passes + status + member ids), source provenance, values, semantic functions, plus the union's own unaccounted source/values and the input pass hashes. */
export function ensembleFreezeHash(items: SemanticInventoryItem[], uninventoried: FrozenSemanticInventory["uninventoriedValues"], unaccounted: FrozenSemanticInventory["unaccountedSource"], passHashes: Record<string, string>): string {
  const parts = items.map((i) => {
    const s = i.support;
    const members = s ? Object.entries(s.memberItemIds).sort(([a], [b]) => a.localeCompare(b)).map(([p, ids]) => `${p}=${[...ids].sort().join(",")}`).join(";") : "";
    return `${i.inventoryItemId}|${i.semanticFunctions ? functionsSignature(i.semanticFunctions) : i.semanticRole}|${i.materiality}|${i.sourceSpan.regionId}:${i.sourceSpan.charStart}-${i.sourceSpan.charEnd}|${i.quantitativeValues.map((v) => `${v.kind}=${v.normalizedValue ?? v.rawText}`).join(",")}|${s ? `${s.supportStatus}:${[...s.supportingPasses].sort().join("+")}:${members}` : "single-pass"}`;
  });
  parts.push(...uninventoried.map((v) => `uninv|${v.regionId}:${v.charStart}-${v.charEnd}|${v.kind}=${v.normalizedValue ?? v.rawText}`));
  parts.push(...unaccounted.map((s) => `unacc|${s.regionId}:${s.charStart}-${s.charEnd}`));
  parts.push(...Object.entries(passHashes).sort(([a], [b]) => a.localeCompare(b)).map(([p, h]) => `pass|${p}|${h}`));
  return hashParts([ENSEMBLE_ALGORITHM_VERSION, ...parts.sort()]);
}

/** Evaluation helper: the items a policy would keep. INTERSECTION_ONLY keeps corroborated items only (a DELETE rule - evaluated, not recommended); RAW_UNION and the canonical union keep everything source-verified. */
export function selectByPolicy(ensemble: EnsembleInventory, policy: UnionPolicy): SemanticInventoryItem[] {
  if (policy === "INTERSECTION_ONLY") return ensemble.items.filter((i) => i.support?.supportStatus === "CORROBORATED");
  return ensemble.items;
}

/** A canonical, order-independent serialization of an ensemble inventory (frozenAt excluded) for equality checks. */
export function canonicalEnsembleJson(e: EnsembleInventory): string {
  const strip = { ...e, frozenAt: undefined } as Record<string, unknown>;
  const sortKeys = (v: unknown): unknown => Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, sortKeys(x)])) : v;
  return JSON.stringify(sortKeys(strip));
}

/** Support status of an item from any evidence generation (single-pass evidence has none). */
export function supportStatusOf(item: SemanticInventoryItem): SupportStatus | null {
  return item.support?.supportStatus ?? null;
}
