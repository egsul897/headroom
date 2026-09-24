/**
 * PHASE-3 -> PHASE-4 VERIFICATION ENVELOPE RESOLVER (migration step 2).
 *
 * Turns a completed semantic-verification result into the runtime's RuntimeVerificationEnvelope.
 * It resolves nothing at runtime and gates nothing anywhere: it is a pure transformation, and the
 * envelope it produces has no effect on execution until migration step 3 lands.
 *
 * Layering: this is an ADAPTER, and it lives in neither core layer. The repository holds a
 * one-directional invariant - no module under compiler/ or ir/ may import runtime/ - enforced by a
 * grep, and a type-only import would still trip it, correctly: the rule is about which layer may
 * know the other exists, not about what survives compilation. So the resolver sits beside both and
 * depends on both, while compiler/ and runtime/ stay ignorant of each other.
 *
 * The resolution has to happen on this side of the boundary - never inside the runtime - for one
 * decisive reason:
 *
 *   A finding's irPath is POSITIONAL. "rules[0].capacityExpression.operands[1]" indexes the array
 *   of the compilation unit that was verified. buildCapacityGraph re-sorts rules by ruleId and
 *   callers routinely pass subsets, so rules[0] at verification time is not rules[0] at runtime.
 *   Resolving here - against the very unit the verifier saw - is the only place the index is still
 *   meaningful. What travels onward is the exprId, which identity.ts derives from content and
 *   which every evaluated node already carries.
 *
 * The other decisive rule is fail-closed: a MATERIAL finding that cannot be resolved to exactly one
 * expression node becomes UNIT-scoped. It is never dropped, never softened to non-material, and
 * never given an invented exprId. Path parsing failure must not turn a defect into silence.
 */
import type {
  RuntimeMaterialFinding,
  RuntimeVerificationEnvelope,
  RuntimeVerificationIdentity,
  RuntimeVerificationUnit,
} from "../runtime/verification-envelope";
import type { IRDefinition, IRRule } from "../ir/types";
import type { SemanticVerificationFinding, SemanticVerificationResult } from "../compiler/semantic-verification/types";

export const RUNTIME_ENVELOPE_RESOLVER_VERSION = "phase-3-runtime-envelope-resolver.v1";
const ENVELOPE_VERSION = "phase-4-verification-envelope.v1";

/**
 * The ONLY path dialect this resolver will walk: a root segment naming the unit array with a
 * concrete index, followed by property steps and concrete array indices. Anything else - a
 * wildcard `rules[]`, a predicate `definitions[termName="X"]`, a trailing annotation, two paths
 * joined by a semicolon - fails this test and becomes UNIT-scoped. There is deliberately no
 * fuzzy fallback.
 */
const STRICT_PATH = /^(rules|definitions|sharedCapacities)\[\d+\]((?:\.[A-Za-z_][A-Za-z0-9_]*(?:\[\d+\])?)*)$/;

export type UnitKind = "RULE" | "DEFINITION";

export interface ResolverUnitInput {
  kind: UnitKind;
  /** The compiled unit exactly as the verifier saw it. */
  unit: IRRule | IRDefinition;
  verification: SemanticVerificationResult;
}

export interface ResolveEnvelopeArgs {
  companyId: string;
  instrumentKey: string;
  units: ResolverUnitInput[];
}

/** Per-finding audit of how its path was treated - the resolver's own evidence, not a runtime input. */
export type PathResolution = "NODE_EXACT" | "UNIT_NO_PATH" | "UNIT_WILDCARD" | "UNIT_PROSE" | "UNIT_MALFORMED" | "UNIT_NO_SUCH_NODE" | "UNIT_NOT_AN_EXPRESSION" | "UNIT_WRONG_ROOT_KIND";

export interface ResolverAudit {
  findingId: string;
  irPathAsGiven: string | null;
  resolution: PathResolution;
  exprIds: string[];
}

export interface ResolveEnvelopeResult {
  envelope: RuntimeVerificationEnvelope;
  audit: ResolverAudit[];
  counts: Record<PathResolution | "MATERIAL_IN" | "MATERIAL_OUT" | "EXCLUDED_NON_MATERIAL", number>;
}

function identityOf(kind: UnitKind, unit: IRRule | IRDefinition): RuntimeVerificationIdentity {
  return {
    ruleOrDefinitionId: kind === "RULE" ? (unit as IRRule).ruleId : (unit as IRDefinition).definitionId,
    companyId: unit.companyId,
    instrumentKey: unit.instrumentKey,
    irSchemaVersion: unit.irSchemaVersion,
    compilerVersion: unit.compilerVersion ?? null,
    sourceContentVersion: unit.sourceContentVersion ?? null,
  };
}

/** STRONG only when both nullable version fields are actually present - see the envelope's own doc comment. */
function strengthOf(identity: RuntimeVerificationIdentity): "STRONG" | "WEAK" {
  return identity.compilerVersion !== null && identity.sourceContentVersion !== null && identity.irSchemaVersion.length > 0 ? "STRONG" : "WEAK";
}

/** Why an unusable path is unusable - recorded so the corpus report can say which dialect cost what. */
function classifyUnusable(path: string): PathResolution {
  if (path.includes("[]")) return "UNIT_WILDCARD";
  if (/[=;"']|\bstarts with\b|\(/.test(path)) return "UNIT_PROSE";
  return "UNIT_MALFORMED";
}

/**
 * Walks the path's property steps against the unit the finding belongs to. The ROOT segment's
 * index is deliberately ignored: it is positional and the binding is by id, not by position.
 * The root's KIND is checked, because a `definitions[0]...` path on a rule is a real mismatch.
 */
function walk(kind: UnitKind, unit: IRRule | IRDefinition, path: string): { resolution: PathResolution; exprIds: string[] } {
  const m = STRICT_PATH.exec(path);
  if (!m) return { resolution: classifyUnusable(path), exprIds: [] };

  const root = m[1]!;
  const expectedRoot = kind === "RULE" ? "rules" : "definitions";
  if (root !== expectedRoot) return { resolution: "UNIT_WRONG_ROOT_KIND", exprIds: [] };

  const steps = (m[2] ?? "").split(".").filter((s) => s.length > 0);
  let node: unknown = unit;
  for (const step of steps) {
    const withIndex = /^([A-Za-z_][A-Za-z0-9_]*)\[(\d+)\]$/.exec(step);
    const key = withIndex ? withIndex[1]! : step;
    if (node === null || typeof node !== "object" || !(key in (node as Record<string, unknown>))) return { resolution: "UNIT_NO_SUCH_NODE", exprIds: [] };
    node = (node as Record<string, unknown>)[key];
    if (withIndex) {
      const i = Number(withIndex[2]);
      if (!Array.isArray(node) || i >= node.length) return { resolution: "UNIT_NO_SUCH_NODE", exprIds: [] };
      node = node[i];
    }
  }

  if (node === null || typeof node !== "object") return { resolution: "UNIT_NOT_AN_EXPRESSION", exprIds: [] };
  const exprId = (node as { exprId?: unknown }).exprId;
  // A landing that is not an expression node - a description string, a sufficiency value, an
  // UNLIMITED_CAPACITY node (which carries no exprId by construction) - is NOT a node target.
  // Hopping to a nearby sibling that does have an exprId would be inventing one.
  if (typeof exprId !== "string" || exprId.length === 0) return { resolution: "UNIT_NOT_AN_EXPRESSION", exprIds: [] };
  return { resolution: "NODE_EXACT", exprIds: [exprId] };
}

function toRuntimeFinding(kind: UnitKind, unit: IRRule | IRDefinition, finding: SemanticVerificationFinding): { runtime: RuntimeMaterialFinding; audit: ResolverAudit } {
  const path = finding.irPath ?? null;
  const { resolution, exprIds } = path === null ? { resolution: "UNIT_NO_PATH" as PathResolution, exprIds: [] as string[] } : walk(kind, unit, path);
  const scope = resolution === "NODE_EXACT" && exprIds.length === 1 ? "NODE" : "UNIT";
  return {
    runtime: {
      findingId: finding.findingId,
      findingType: finding.findingType,
      scope,
      exprIds: scope === "NODE" ? [...new Set(exprIds)].sort() : [],
      irPathAsGiven: path,
      reason: finding.verifierReasoning,
    },
    audit: { findingId: finding.findingId, irPathAsGiven: path, resolution, exprIds },
  };
}

/**
 * Pure. Same input yields byte-identical output: units are sorted by id, findings by (scope,
 * findingId), exprIds sorted and de-duplicated. Nothing depends on map or object iteration order.
 */
export function resolveRuntimeVerificationEnvelope(args: ResolveEnvelopeArgs): ResolveEnvelopeResult {
  const audit: ResolverAudit[] = [];
  const counts: ResolveEnvelopeResult["counts"] = {
    MATERIAL_IN: 0, MATERIAL_OUT: 0, EXCLUDED_NON_MATERIAL: 0,
    NODE_EXACT: 0, UNIT_NO_PATH: 0, UNIT_WILDCARD: 0, UNIT_PROSE: 0, UNIT_MALFORMED: 0, UNIT_NO_SUCH_NODE: 0, UNIT_NOT_AN_EXPRESSION: 0, UNIT_WRONG_ROOT_KIND: 0,
  };

  const units: RuntimeVerificationUnit[] = args.units.map(({ kind, unit, verification }) => {
    const identity = identityOf(kind, unit);
    const all = verification.findings ?? [];
    const material = all.filter((f) => f.severity === "MATERIAL" && f.ruleOrDefinitionId === identity.ruleOrDefinitionId);
    counts.EXCLUDED_NON_MATERIAL += all.length - all.filter((f) => f.severity === "MATERIAL").length;
    counts.MATERIAL_IN += material.length;

    const resolved = material.map((f) => toRuntimeFinding(kind, unit, f));
    for (const r of resolved) { audit.push(r.audit); counts[r.audit.resolution] += 1; }
    counts.MATERIAL_OUT += resolved.length;

    return {
      identity,
      identityStrength: strengthOf(identity),
      verificationStatus: verification.status,
      verifierAlgorithmVersion: verification.verifierAlgorithmVersion ?? null,
      evidenceSetHash: verification.evidenceSetHash ?? null,
      materialFindings: resolved
        .map((r) => r.runtime)
        .sort((a, b) => (a.scope === b.scope ? (a.findingId < b.findingId ? -1 : a.findingId > b.findingId ? 1 : 0) : a.scope === "NODE" ? -1 : 1)),
    };
  });

  return {
    envelope: {
      envelopeVersion: ENVELOPE_VERSION,
      companyId: args.companyId,
      instrumentKey: args.instrumentKey,
      units: units.sort((a, b) => (a.identity.ruleOrDefinitionId < b.identity.ruleOrDefinitionId ? -1 : a.identity.ruleOrDefinitionId > b.identity.ruleOrDefinitionId ? 1 : 0)),
    },
    audit: audit.sort((a, b) => (a.findingId < b.findingId ? -1 : a.findingId > b.findingId ? 1 : 0)),
    counts,
  };
}
