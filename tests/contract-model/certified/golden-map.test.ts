/**
 * GOLDEN CANONICAL MAP - the hand-authored expected map over the golden harness fixture. The expected structure is
 * written down before the test runs; the test does not read its expectations from the code under test.
 */
import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
const sha256 = (t: string) => crypto.createHash("sha256").update(t).digest("hex");
import { compileCovenantMap, validateCovenantMap, renderCovenantMapMarkdown, computeMapHash } from "../../../lib/contract-model/covenant-map";
import { AMEND, AMENDMENT_EFFECTS, buildPackage, deps } from "./golden-harness";
export { buildPackage, deps } from "./golden-harness";

describe("golden canonical map", () => {
  it("structure -> scripted discovery -> certified compile (fake provider) -> verify -> map matches the hand-authored expectation; identical across runs", async () => {
    const { pkg } = buildPackage();
    const d = deps();
    const run = await compileCovenantMap(pkg, d);
    const map = run.map;
    const md = renderCovenantMapMarkdown(map);
    if (!map.completeness.complete) console.log(JSON.stringify({ candidates: map.candidates.map((c) => ({ ref: c.sectionRef, outcome: c.outcome, compile: c.compilationStatus, reasons: c.compilationFailureReasons, verify: c.verificationStatus, failure: c.failure })), unresolved: map.unresolved.map((u) => `${u.kind}: ${u.detail}`), issues: run.results.map((r) => r.compilation?.unresolvedIssues) }, null, 2));

    // ---- execution shape: ONE semantic conversation per candidate, single-message requests, two independent Pass A executions
    expect(d.client.requests.length).toBe(3);
    for (const r of d.client.requests) expect(r.messages).toBe(1);
    expect(d.inventory[0].calls.filter((c) => c.stage === "semantic_inventory").length).toBe(3);
    expect(d.inventory[1].calls.filter((c) => c.stage === "semantic_inventory").length).toBe(3);
    expect(run.stop).toBeNull();

    // ---- the hand-authored expectation
    expect(map.candidates.map((c) => [c.sectionRef, c.outcome])).toEqual([["1.01", "MAPPED"], ["7.01", "MAPPED"], ["7.02", "MAPPED"]]);
    // ownership: the definitions are owned by the 1.01 candidate; 7.01 USES Consolidated EBITDA and emits no definition of its own
    expect(map.nodes.filter((n) => n.kind === "DEFINITION").every((n) => n.candidateRef === map.candidates[0]!.candidateRef)).toBe(true);
    for (const r of run.results) expect(r.compilation?.contextOnlyEmissions ?? []).toEqual([]);
    expect(map.unresolved).toEqual([]);
    expect(map.completeness).toMatchObject({ candidatesDiscovered: 3, candidatesEligible: 3, candidatesMapped: 3, candidatesFailed: 0, candidatesUnserved: 0, nodesByKind: { RULE: 5, DEFINITION: 6, SHARED_CAPACITY: 0 }, unresolvedBlocking: 0, unresolvedReview: 0, nodesStrongIdentity: 11, complete: true, mappedFraction: 1 });
    // source order: three definitions (1.01, document order), then 7.01 chapeau, (a), (b), (c), then 7.02
    expect(map.nodes.map((n) => `${n.kind}:${n.termName ?? n.sectionRef}`)).toEqual(["DEFINITION:Consolidated EBITDA", "DEFINITION:Consolidated Net Income", "DEFINITION:Indebtedness", "DEFINITION:Interest Expense", "DEFINITION:Loan Documents", "DEFINITION:Subsidiary", "RULE:7.01", "RULE:7.01(a)", "RULE:7.01(b)", "RULE:7.01(c)", "RULE:7.02"]);
    for (let i = 1; i < map.nodes.length; i++) expect(map.nodes[i]!.sourceOrder.charStart).toBeGreaterThanOrEqual(map.nodes[i - 1]!.sourceOrder.charStart);
    const byRef = (ref: string) => map.nodes.find((n) => n.kind === "RULE" && n.sectionRef === ref)!;
    const byTerm = (t: string) => map.nodes.find((n) => n.kind === "DEFINITION" && n.termName === t)!;
    const edge = (t: string, from: string, to: string) => map.edges.find((e) => e.edgeType === t && e.fromNodeId === from && e.toNodeId === to);
    // relationships
    expect(edge("RULE_MODIFIED_BY_EXCEPTION", byRef("7.01").nodeId, byRef("7.01(a)").nodeId)).toBeTruthy();
    expect(edge("RULE_MODIFIED_BY_EXCEPTION", byRef("7.01").nodeId, byRef("7.01(b)").nodeId)).toBeTruthy();
    expect(edge("RULE_MODIFIED_BY_EXCEPTION", byRef("7.01").nodeId, byRef("7.01(c)").nodeId)).toBeTruthy();
    for (const p of ["7.01(a)", "7.01(b)", "7.01(c)"]) expect(edge("RULE_SUBJECT_TO_GENERAL_PROHIBITION", byRef(p).nodeId, byRef("7.01").nodeId)).toBeTruthy();
    expect(edge("RULE_USES_DEFINITION", byRef("7.01(c)").nodeId, byTerm("Consolidated EBITDA").nodeId)).toBeTruthy();
    expect(edge("DEFINITION_USES_DEFINITION", byTerm("Consolidated EBITDA").nodeId, byTerm("Consolidated Net Income").nodeId)).toBeTruthy();
    expect(edge("DEFINITION_USES_DEFINITION", byTerm("Consolidated EBITDA").nodeId, byTerm("Interest Expense").nodeId)).toBeTruthy();
    expect(map.completeness.edgesByType).toMatchObject({ RULE_MODIFIED_BY_EXCEPTION: 3, RULE_SUBJECT_TO_GENERAL_PROHIBITION: 3, RULE_USES_DEFINITION: 1, DEFINITION_USES_DEFINITION: 2, RULE_DEPENDS_ON_RULE: 0, RULE_USES_SHARED_CAPACITY: 0 });
    // values
    const b = byRef("7.01(b)").unit as { capacityExpression: { kind: string; amount: number }; conditions: { conditionType: string }[] };
    expect(b.capacityExpression).toMatchObject({ kind: "MONEY", amount: 25_000_000 }); expect(b.conditions.map((c) => c.conditionType)).toEqual(["NO_DEFAULT"]);
    const c = byRef("7.01(c)").unit as { capacityExpression: { kind: string; operands: { kind: string; amount?: number }[] } };
    expect(c.capacityExpression.kind).toBe("MAX"); expect(c.capacityExpression.operands[0]).toMatchObject({ kind: "MONEY", amount: 10_000_000 });
    // amendment precedence: 7.02 is governed by the amendment; its operative record names the applied effect and the base node it supersedes
    const lien = byRef("7.02");
    expect(lien.operative).toMatchObject({ status: "OPERATIVE_STATE_RESOLVED", appliedEffectIds: ["golden-effect-1"], currentSourceDocumentId: AMEND });
    expect(byRef("7.01").operative).toBeNull();
    const lienCandidate = map.candidates.find((k) => k.sectionRef === "7.02")!;
    expect(lienCandidate.operativeSourceSha256).toBe(sha256(AMENDMENT_EFFECTS[0]!.newText!)); // the AMENDED text was compiled, not the superseded base text
    expect((lien.unit as { exceptions: { description: string }[] }).exceptions[0]!.description).toContain("7.01(c)");
    // every node: STRONG identity, sourceContentVersion populated, verified
    // binding identity = semantic source contract (sscv1); operative identity (scv1) carried beside it; every node CERTIFIED with a persisted artifact hash
    for (const n of map.nodes) { expect(n.identityStrength).toBe("STRONG"); expect(n.sourceContentVersion).toMatch(/^sscv1:[0-9a-f]{64}$/); expect(n.operativeSourceVersion).toMatch(/^scv1:[0-9a-f]{64}$/); expect(n.verification.status).toBe("VERIFIED_NO_MATERIAL_GAP_FOUND"); expect(n.certification).toMatchObject({ status: "CERTIFIED", blockers: [], semanticSourceContractVersion: n.sourceContentVersion }); expect(n.certification.artifactHash).toMatch(/^[0-9a-f]{64}$/); }
    expect(new Set(map.nodes.map((n) => n.operativeSourceVersion)).size).toBe(3); // one operative version per candidate source
    expect(new Set(map.nodes.map((n) => n.sourceContentVersion)).size).toBe(3);
    expect(map.completeness).toMatchObject({ mapComplete: true, certificationComplete: true, candidatesCertified: 3, candidatesReviewRequired: 0, candidatesNotCertified: 0, semanticUnits: 11, semanticUnitsCertified: 11 });
    for (const e of map.edges) expect(e.edgeAuthority).toBe("CERTIFIED_SEMANTIC"); // every golden edge is IR-established between certified units
    expect(run.packageCertification.status).toBe("CERTIFIED");
    expect(run.manifest).toMatchObject({ schema: "p3-package-certification-manifest.v1", discoveryPopulation: { scope: "COMPLETE" }, mapIdentity: { mapHash: map.mapHash } });
    expect(run.manifest.verifiedArtifactPackageHashes.length).toBe(3);
    // validation + hash
    const v = validateCovenantMap(map);
    expect(v.problems).toEqual([]); expect(v.ok).toBe(true);
    expect(map.mapHash).toMatch(/^[0-9a-f]{64}$/); expect(computeMapHash(map)).toBe(map.mapHash);
    expect(md).toContain("| 7.01(b) |"); expect(md).toContain("RULE_USES_DEFINITION");

    // ---- byte-identical across runs (fresh callers, fresh budget, fresh cache)
    const run2 = await compileCovenantMap(pkg, deps());
    expect(run2.map.mapHash).toBe(map.mapHash);
    expect(JSON.stringify({ ...run2.map, candidates: run2.map.candidates.map((k) => ({ ...k, telemetry: null })) })).toBe(JSON.stringify({ ...map, candidates: map.candidates.map((k) => ({ ...k, telemetry: null })) }));
    // telemetry is honest and separated: 1 semantic conversation, 0 refinements, priced usage
    for (const k of map.candidates) expect(k.telemetry).toMatchObject({ candidateAttempt: 1, semanticConversations: 1, refinementConversations: 0, transportAttempts: 1, shardAttempts: 0, pricingStatus: "PRICED" });
  });
});
