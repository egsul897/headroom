/**
 * Phase 2G §12/§13/§22 - amendment chain construction + conflict
 * detection. Groups every resolved AmendmentEffectCandidate by the
 * single provision (a section ref or a defined term, scoped to one
 * instrument) it targets, orders each group by EFFECTIVE-DATE evidence
 * (never amendment number alone - task's own explicit instruction), and
 * flags real ambiguity rather than picking silently.
 */
import type { AmendmentChainEntry, AmendmentConflict, AmendmentEffectCandidate } from "./types";

export interface ProvisionGroup {
  instrumentKey: string;
  kind: "SECTION" | "DEFINITION";
  ref: string;
  provisionKey: string;
  effects: AmendmentEffectCandidate[];
}

export function normalizeDefinedTermRef(term: string): string {
  return term.replace(/\s+/g, " ").trim().toLowerCase();
}

function provisionKeyFor(effect: AmendmentEffectCandidate): { kind: "SECTION" | "DEFINITION"; ref: string } | null {
  if (!effect.target.targetInstrumentKey) return null;
  if (effect.target.targetSectionRef) return { kind: "SECTION", ref: effect.target.targetSectionRef };
  if (effect.target.targetDefinedTermRef) return { kind: "DEFINITION", ref: normalizeDefinedTermRef(effect.target.targetDefinedTermRef) };
  return null;
}

/** Effects with no resolvable (instrument, section/definition) target are never silently dropped - they are excluded from provision grouping (since there is nothing to attach a chain entry to) but returned separately for the pipeline summary to surface. */
export function groupEffectsByProvision(effects: AmendmentEffectCandidate[]): { groups: ProvisionGroup[]; unattachedEffects: AmendmentEffectCandidate[] } {
  const byKey = new Map<string, ProvisionGroup>();
  const unattached: AmendmentEffectCandidate[] = [];

  for (const effect of effects) {
    const p = provisionKeyFor(effect);
    if (!p) {
      unattached.push(effect);
      continue;
    }
    const provisionKey = `${effect.target.targetInstrumentKey}::${p.kind}::${p.ref}`;
    if (!byKey.has(provisionKey)) byKey.set(provisionKey, { instrumentKey: effect.target.targetInstrumentKey!, kind: p.kind, ref: p.ref, provisionKey, effects: [] });
    byKey.get(provisionKey)!.effects.push(effect);
  }

  return { groups: [...byKey.values()], unattachedEffects: unattached };
}

export interface ChainResult {
  fullChain: AmendmentChainEntry[];
  conflicts: AmendmentConflict[];
}

/** Builds one provision's full chronological amendment chain plus any conflicts within it. Effects whose effective date cannot be safely established (CONDITIONAL_UNRESOLVED/UNKNOWN) are placed at the END of the chain (never silently ordered as if dated), and each contributes an AMENDMENT_SEQUENCE_UNRESOLVED conflict - task §22's own "amendment target resolves... stated effective date conditional and unresolved" scenario. */
export function buildProvisionChain(group: ProvisionGroup): ChainResult {
  const conflicts: AmendmentConflict[] = [];

  const dated = group.effects.filter((e) => e.effectiveDate.date !== null);
  const undated = group.effects.filter((e) => e.effectiveDate.date === null);

  dated.sort((a, b) => new Date(a.effectiveDate.date!).getTime() - new Date(b.effectiveDate.date!).getTime());

  // §22 - two effects on the SAME provision sharing the identical effective date is a real conflict (which one actually governs cannot be determined from date alone).
  for (let i = 0; i < dated.length - 1; i++) {
    if (dated[i]!.effectiveDate.date === dated[i + 1]!.effectiveDate.date) {
      conflicts.push({
        conflictType: "AMENDMENT_CONFLICT",
        provisionKey: group.provisionKey,
        involvedEffectIds: [dated[i]!.effectId, dated[i + 1]!.effectId],
        reason: `Two amendment effects targeting the same provision (${group.ref}) share the identical effective date (${dated[i]!.effectiveDate.date}) - which one actually governs cannot be determined from date evidence alone.`,
      });
    }
  }

  for (const u of undated) {
    conflicts.push({
      conflictType: "AMENDMENT_SEQUENCE_UNRESOLVED",
      provisionKey: group.provisionKey,
      involvedEffectIds: [u.effectId],
      reason: `An amendment effect targeting ${group.ref} has an effective date that could not be safely established (${u.effectiveDate.status}: ${u.effectiveDate.reason}) - its position in the amendment chain is unknown, so it cannot be safely applied or safely excluded.`,
    });
  }

  const orderedEffects = [...dated, ...undated];
  const fullChain: AmendmentChainEntry[] = orderedEffects.map((e) => ({
    effectId: e.effectId,
    amendmentDocumentId: e.amendmentDocumentId,
    operation: e.operation,
    effectiveDate: e.effectiveDate,
    sourceCitation: e.sourceCitation,
    appliedAsOfQuery: false,
  }));

  return { fullChain, conflicts };
}
