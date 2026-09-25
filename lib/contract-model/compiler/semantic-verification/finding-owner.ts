/**
 * Verifier finding ownership - normalized, never trusted from the model.
 *
 * The review wire schema accepts an arbitrary `ruleOrDefinitionId: string`. The population run showed
 * what that admits: 7.16(a) produced "rule[r1].condition[1]" (a path-shaped string; the real unit was
 * rules[0]) and 7.6(b) produced two real rule ids comma-joined in one field. Persistence correctly
 * refused those packages (VERIFICATION_WITHOUT_IR), and at the strict boundary such a finding bound to
 * nothing. Ownership is now normalized here, deterministically:
 *
 *   exact valid unit id                              -> kept (OWNER_EXACT)
 *   invalid id, irPath resolves to exactly one unit  -> replaced; VERIFIER_OWNER_REPAIRED_FROM_IR_PATH
 *   id or path resolves to several units             -> null owner; UNIT scope; VERIFIER_OWNER_AMBIGUOUS_MULTI_UNIT
 *   invalid id, path unresolvable                    -> null owner; VERIFIER_OWNER_UNRESOLVED
 *
 * Never fabricated: a repair happens only when the IR PATH names one real unit of THIS compilation.
 */
import type { IRDefinition, IRRule } from "../../ir/types";

export type FindingOwnerRepair = "OWNER_EXACT" | "OWNER_NONE_CANDIDATE_LEVEL" | "VERIFIER_OWNER_REPAIRED_FROM_IR_PATH" | "VERIFIER_OWNER_AMBIGUOUS_MULTI_UNIT" | "VERIFIER_OWNER_UNRESOLVED";

export interface FindingOwnerNormalization {
  ownerId: string | null;
  scope: "UNIT" | "CANDIDATE";
  repair: FindingOwnerRepair;
  suppliedOwnerId: string | null;
  suppliedIrPath: string | null;
  /** Every real unit id the supplied id/path pointed at (0, 1 or many). */
  resolvedUnitIds: string[];
  note: string | null;
}

export interface CompiledUnitsForOwnership { rules: readonly Pick<IRRule, "ruleId">[]; definitions: readonly Pick<IRDefinition, "definitionId">[] }

const ID_TOKEN = /ir-(?:rule|definition):[0-9a-f]{6,}/g;
const PATH_INDEX = /^(rules|definitions)\[(\d+)\]/;

/** Each `rules[N]` / `definitions[N]` head in a (possibly multi-path) irPath, resolved against this compilation. */
export function resolveIrPathOwners(irPath: string | null, units: CompiledUnitsForOwnership): string[] {
  if (!irPath) return [];
  const out: string[] = [];
  for (const segment of irPath.split(/\s*;\s*|\s*,\s*/).map((s) => s.trim()).filter(Boolean)) {
    const m = PATH_INDEX.exec(segment);
    if (!m) continue;
    const idx = Number(m[2]);
    const id = m[1] === "rules" ? units.rules[idx]?.ruleId : units.definitions[idx]?.definitionId;
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

export function normalizeFindingOwner(wire: { ruleOrDefinitionId: string | null; irPath: string | null }, units: CompiledUnitsForOwnership): FindingOwnerNormalization {
  const valid = new Set<string>([...units.rules.map((r) => r.ruleId), ...units.definitions.map((d) => d.definitionId)]);
  const supplied = wire.ruleOrDefinitionId?.trim() || null;
  const base = { suppliedOwnerId: supplied, suppliedIrPath: wire.irPath ?? null };
  if (supplied === null) return { ...base, ownerId: null, scope: "CANDIDATE", repair: "OWNER_NONE_CANDIDATE_LEVEL", resolvedUnitIds: [], note: null };
  if (valid.has(supplied)) return { ...base, ownerId: supplied, scope: "UNIT", repair: "OWNER_EXACT", resolvedUnitIds: [supplied], note: null };
  // ids embedded in the supplied string (comma-joined, prose, etc.) that are real units of this compilation
  const embedded = [...new Set((supplied.match(ID_TOKEN) ?? []).filter((id) => valid.has(id)))];
  const fromPath = resolveIrPathOwners(wire.irPath, units);
  const resolved = [...new Set([...embedded, ...fromPath])];
  if (resolved.length > 1) return { ...base, ownerId: null, scope: "UNIT", repair: "VERIFIER_OWNER_AMBIGUOUS_MULTI_UNIT", resolvedUnitIds: resolved, note: `the verifier named ${resolved.length} compiled units in one finding (${resolved.join(", ")}); ownership is not fabricated - the finding is held at unit-level scope over all of them` };
  if (resolved.length === 1) return { ...base, ownerId: resolved[0]!, scope: "UNIT", repair: "VERIFIER_OWNER_REPAIRED_FROM_IR_PATH", resolvedUnitIds: resolved, note: `the verifier supplied "${supplied}", which is not a unit id; ${embedded.length === 1 ? "the one real unit id embedded in it" : `irPath "${wire.irPath}"`} resolves to exactly ${resolved[0]}` };
  return { ...base, ownerId: null, scope: "CANDIDATE", repair: "VERIFIER_OWNER_UNRESOLVED", resolvedUnitIds: [], note: `the verifier supplied "${supplied}"${wire.irPath ? ` with irPath "${wire.irPath}"` : ""}; neither names a unit of this compilation - ownership left unresolved, never guessed` };
}
