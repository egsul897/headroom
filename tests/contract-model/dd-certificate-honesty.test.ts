/**
 * PHASE 3 / 6.01 REQUIRED-DEPENDENCY PRECISION AUDIT §19 - CERTIFICATE REGRESSION.
 *
 * Permanent proofs that the dependency certificate can no longer say "delivered" about a dependency that was not:
 *   - an unresolved internal required dependency does not count as delivered;
 *   - a disclosed unavailable dependency is not "materialized";
 *   - an external limitation is represented separately from an internal one;
 *   - an ambiguous limitation is represented separately, with candidates;
 *   - a false Pass-A term edge does not force required-definition closure, a genuine one does;
 *   - the certificate state is a deterministic function of the dependency set.
 */
import { describe, expect, it } from "vitest";
import { buildShardDependencyCertificate, isDelivered, isLimitation, type RequiredDependency } from "../../lib/contract-model/compiler/semantic/required-dependencies";
import { BASE_SHAPE, depsOf, deliveredKeys, planSynthetic, termKey } from "./dd-synthetic-agreement";

const dep = (key: string, disposition: RequiredDependency["disposition"], chars = 100): RequiredDependency => ({
  key, kind: "REQUIRED_DEFINITION", target: key, citedAs: [key], documentId: "d", sourceNodeId: null, sourceUnitKey: null, absCharStart: null, absCharEnd: null,
  fullText: "x".repeat(chars), fullTextChars: chars, fullTextHash: `h:${key}`, evidence: ["INVENTORY_REFERENCED_TERM_EDGE"], requiredBy: ["i1"], closureDepth: 1, viaKey: null, disposition, dispositionReason: disposition,
});
const alloc = { ceilingChars: 64_000, perEntryAllowanceChars: 4_000, waterFilled: false };

describe("§19 certificate honesty", () => {
  it("an unresolved INTERNAL required dependency is never delivered and yields an INTERNAL limitation, not a complete certificate", () => {
    const deps = [dep("term:a", "DELIVERED_FULL"), dep("term:b", "INTERNAL_REQUIRED_DEPENDENCY_UNRESOLVED", 0)];
    const cert = buildShardDependencyCertificate("s", deps, new Set(["term:a"]), 0, 100, alloc);
    expect(isDelivered(deps[1]!)).toBe(false);
    expect(cert.certificateStatus).toBe("CERTIFIED_WITH_EXPLICIT_INTERNAL_LIMITATION");
    expect(cert.contextComplete).toBe(false);
    expect(cert.executable).toBe(true);
    expect(cert.deliveredFull).toBe(1);
    expect(cert.internalUnresolved).toBe(1);
    expect(cert.limitations.map((l) => l.key)).toEqual(["term:b"]);
  });

  it("disclosed-unavailable is not materialized: the delivered counters exclude it and the status is not CONTEXT_COMPLETE", () => {
    const deps = [dep("term:b", "INTERNAL_REQUIRED_DEPENDENCY_UNRESOLVED", 0)];
    const cert = buildShardDependencyCertificate("s", deps, new Set(), 0, 0, alloc);
    expect(cert.deliveredFull + cert.deliveredBoundedExcerpt + cert.ownedPrimarySource).toBe(0);
    expect(cert.certificateStatus).not.toBe("CERTIFIED_CONTEXT_COMPLETE");
  });

  it("an EXTERNAL limitation is represented separately from an internal one, and internal dominates when both are present", () => {
    const ext = buildShardDependencyCertificate("s", [dep("term:a", "DELIVERED_FULL"), dep("term:x", "EXTERNAL_REQUIRED_DEPENDENCY", 0)], new Set(["term:a"]), 0, 100, alloc);
    expect(ext.certificateStatus).toBe("CERTIFIED_WITH_EXPLICIT_EXTERNAL_LIMITATION");
    expect(ext.external).toBe(1);
    expect(ext.internalUnresolved).toBe(0);
    const both = buildShardDependencyCertificate("s", [dep("term:x", "EXTERNAL_REQUIRED_DEPENDENCY", 0), dep("term:b", "INTERNAL_REQUIRED_DEPENDENCY_UNRESOLVED", 0)], new Set(), 0, 0, alloc);
    expect(both.certificateStatus).toBe("CERTIFIED_WITH_EXPLICIT_INTERNAL_LIMITATION");
    expect(both.limitations.map((l) => l.disposition).sort()).toEqual(["EXTERNAL_REQUIRED_DEPENDENCY", "INTERNAL_REQUIRED_DEPENDENCY_UNRESOLVED"]);
  });

  it("an AMBIGUOUS limitation is its own state, carries candidates, and is never delivered", () => {
    const d = { ...dep("section:4.02(b)", "AMBIGUOUS_REQUIRED_DEPENDENCY", 0), kind: "REQUIRED_REFERENCED_SECTION" as const, candidates: [{ nodeId: "n1", charStart: 10, charEnd: 20 }, { nodeId: "n2", charStart: 30, charEnd: 40 }] };
    const cert = buildShardDependencyCertificate("s", [d], new Set(), 0, 0, alloc);
    expect(isDelivered(d)).toBe(false);
    expect(isLimitation(d)).toBe(true);
    expect(cert.ambiguous).toBe(1);
    expect(cert.certificateStatus).toBe("CERTIFIED_WITH_EXPLICIT_INTERNAL_LIMITATION");
    expect(d.candidates.length).toBe(2);
  });

  it("a required, deliverable dependency the plan did not carry is a PLANNING FAILURE - not executable, whatever its provisional disposition", () => {
    const cert = buildShardDependencyCertificate("s", [dep("term:a", "DELIVERED_FULL")], new Set(), 0, 0, alloc);
    expect(cert.certificateStatus).toBe("PLANNING_FAILED_REQUIRED_CONTEXT_UNDELIVERABLE");
    expect(cert.executable).toBe(false);
    expect(cert.deliverableNotDelivered).toBe(1);
    const explicit = buildShardDependencyCertificate("s", [dep("term:a", "DELIVERABLE_NOT_DELIVERED")], new Set(), 0, 0, alloc);
    expect(explicit.certificateStatus).toBe("PLANNING_FAILED_REQUIRED_CONTEXT_UNDELIVERABLE");
  });

  it("a NON_REQUIRED_EDGE is excluded: not required, not a limitation, not delivery, not a failure", () => {
    const deps = [dep("term:a", "DELIVERED_FULL"), dep("term:junk", "NON_REQUIRED_EDGE", 0)];
    const cert = buildShardDependencyCertificate("s", deps, new Set(["term:a"]), 0, 100, alloc);
    expect(cert.requiredDependenciesTotal).toBe(1);
    expect(cert.nonRequiredEdgesExcluded).toBe(1);
    expect(cert.certificateStatus).toBe("CERTIFIED_CONTEXT_COMPLETE");
  });

  it("the certificate is a deterministic function of the dependency set: same input, same output; permuted input, same status", () => {
    const deps = [dep("term:a", "DELIVERED_FULL"), dep("term:b", "DELIVERED_BOUNDED_EXCERPT", 9000), dep("term:c", "OWNED_PRIMARY_SOURCE", 0), dep("term:x", "EXTERNAL_REQUIRED_DEPENDENCY", 0)];
    const delivered = new Set(["term:a", "term:b"]);
    const a = buildShardDependencyCertificate("s", deps, delivered, 5, 9100, alloc);
    const b = buildShardDependencyCertificate("s", deps, delivered, 5, 9100, alloc);
    const c = buildShardDependencyCertificate("s", [...deps].reverse(), delivered, 5, 9100, alloc);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(c.certificateStatus).toBe(a.certificateStatus);
    expect(a.certificateStatus).toBe("CERTIFIED_WITH_EXPLICIT_EXTERNAL_LIMITATION");
  });

  it("end to end: a false Pass-A term edge does not force required-definition closure; a genuine required definition does", () => {
    const shape = { ...BASE_SHAPE, extraEdges: ["Fictitious Sublimit Reserve"] };
    const plan = planSynthetic(shape);
    const deps = depsOf(plan);
    const fake = deps.find((d) => d.key === termKey("Fictitious Sublimit Reserve"))!;
    expect(fake.disposition).toBe("NON_REQUIRED_EDGE");
    expect(deliveredKeys(plan).has(fake.key)).toBe(false);
    const real = deps.find((d) => d.key === termKey(BASE_SHAPE.capTerm))!;
    expect(real.disposition).toBe("DELIVERED_FULL");
    expect(deliveredKeys(plan).has(real.key)).toBe(true);
    // and the closure the real dependency opens is delivered too
    for (const c of BASE_SHAPE.components) expect(deliveredKeys(plan).has(termKey(c)), c).toBe(true);
  });
});
