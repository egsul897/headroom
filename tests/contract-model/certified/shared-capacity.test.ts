/**
 * SHARED CAPACITY (OPTION A: a first-class verified semantic unit). A model-asserted shared basket is compiled,
 * inventoried, verified, snapshotted, packaged and certified exactly like a rule; an unsupported pool is caught by
 * the verifier and never reaches Phase 4; the strict boundary refuses an unverified, stale or mutated pool under
 * REQUIRE. Zero provider calls.
 */
import { describe, expect, it } from "vitest";
import type { IRSharedCapacity } from "../../../lib/contract-model/ir/types";
import { certifyDiscoveredCovenantPackage } from "../../../lib/contract-model/covenant-map";
import { parseVerifiedUnitPackage, serializeVerifiedUnitPackage, toVerifiedExecutionPackage, VERIFIED_UNIT_PACKAGE_SCHEMA } from "../../../lib/contract-model/verified-units";
import { certifiedMapToVerifiedExecutionPackage } from "../../../lib/contract-model/phase3-certification/phase4-adapter";
import { evaluateVerifiedCapacity, simulateVerifiedTransaction, type VerifiedExecutionPackage } from "../../../lib/contract-model/verified-execution";
import { sharedNodeId } from "../../../lib/contract-model/runtime/capacity/graph";
import * as tx from "../runtime/transaction/helpers";
import { buildPackageFrom, deps, fakeClient, idsFor, money, DOCS, CA, GOLDEN_AGREEMENT, type ScriptedInventory } from "./golden-harness";

const FACTS = [tx.figure("fig-1", "1000")];
const inputsFor = (p: VerifiedExecutionPackage) => tx.resolverFor(FACTS, [...(p.definitions ?? [])], [...p.rules]);

// ---- 7.04: two baskets. In the ATTACK text they are independent; in the HONEST text they share a $10,000,000 pool.
const INV_ATTACK = [
  "SECTION 7.04 Investments . The Borrower shall not make any Investment, except:",
  "",
  "(a) Investments in joint ventures in an aggregate amount not to exceed $20,000,000 at any time outstanding; and",
  "",
  "(b) other Investments in an aggregate amount not to exceed $30,000,000 at any time outstanding.",
  "",
].join("\n");
const POOL_SENTENCE = "The aggregate amount of Investments made in reliance on clauses (a) and (b) together shall not exceed $10,000,000.";
const INV_HONEST = INV_ATTACK + POOL_SENTENCE + "\n\n";
const docWith = (section: string) => DOCS.map((d) => (d.documentId === CA ? { ...d, text: GOLDEN_AGREEMENT.replace("SECTION 7.02 Liens .", section + "SECTION 7.02 Liens .") } : d));
const inventoryFor = (honest: boolean): ScriptedInventory => ({
  "7.04": [
    { excerpt: "The Borrower shall not make any Investment, except:", role: "PROHIBITION", materiality: "CRITICAL", proposition: "investment prohibition" },
    { excerpt: "(a) Investments in joint ventures in an aggregate amount not to exceed $20,000,000 at any time outstanding;", role: "PERMISSION", materiality: "CRITICAL", proposition: "JV basket $20,000,000" },
    { excerpt: "(b) other Investments in an aggregate amount not to exceed $30,000,000 at any time outstanding", role: "PERMISSION", materiality: "CRITICAL", proposition: "general basket $30,000,000" },
    ...(honest ? [{ excerpt: POOL_SENTENCE, role: "SHARED_CAP", materiality: "CRITICAL", proposition: "shared pool $10,000,000 across (a) and (b)" }] : []),
  ],
});
/** The model asserts a $10,000,000 shared pool across (a) and (b) in BOTH texts; only the honest text supports it. */
function submission(user: string): unknown {
  const prohibition = idsFor(user, "shall not make any Investment"), a = idsFor(user, "$20,000,000"), b = idsFor(user, "$30,000,000"), pool = idsFor(user, "together shall not exceed $10,000,000");
  const capIds = pool.length > 0 ? pool : b;
  return {
    rules: [
      { localRef: "r0", sourceSectionRef: "7.04", covenantFamily: "INVESTMENTS", ruleType: "PROHIBITION", posture: "PROHIBITION", action: "MAKE_INVESTMENT", entityScope: ["BORROWER"], capacityExpression: null, conditions: [], exceptions: [{ description: "clause (a)", permissionRef: "rA", citation: "7.04(a)", excerpt: "(a) Investments in joint ventures", inventoryItemIds: a }, { description: "clause (b)", permissionRef: "rB", citation: "7.04(b)", excerpt: "(b) other Investments", inventoryItemIds: b }], dependsOn: [], sufficiency: "COMPLETE", citation: "7.04", excerpt: "The Borrower shall not make any Investment", inventoryItemIds: prohibition },
      { localRef: "rA", sourceSectionRef: "7.04(a)", covenantFamily: "INVESTMENTS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "MAKE_INVESTMENT", entityScope: ["BORROWER"], capacityExpression: { ...money(20_000_000, a, "not to exceed $20,000,000 at any time outstanding"), citation: "7.04(a)" }, conditions: [], exceptions: [], dependsOn: [], sufficiency: "COMPLETE", citation: "7.04(a)", excerpt: "(a) Investments in joint ventures in an aggregate amount not to exceed $20,000,000", inventoryItemIds: a },
      { localRef: "rB", sourceSectionRef: "7.04(b)", covenantFamily: "INVESTMENTS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "MAKE_INVESTMENT", entityScope: ["BORROWER"], capacityExpression: { ...money(30_000_000, b, "not to exceed $30,000,000 at any time outstanding"), citation: "7.04(b)" }, conditions: [], exceptions: [], dependsOn: [], sufficiency: "COMPLETE", citation: "7.04(b)", excerpt: "(b) other Investments in an aggregate amount not to exceed $30,000,000", inventoryItemIds: b },
    ],
    definitions: [],
    sharedCapacities: [{ localRef: "cap1", description: "aggregate pool across clauses (a) and (b)", capExpression: { ...money(10_000_000, capIds, "shall not exceed $10,000,000"), citation: "7.04" }, memberRefs: ["rA", "rB"], citation: "7.04", excerpt: "clauses (a) and (b) together shall not exceed $10,000,000", inventoryItemIds: capIds }],
    irExtensionCandidates: [], overallNotes: [],
  };
}
const spec = (): [string, ["INVESTMENTS"], "GENERAL_PROHIBITION", string] => ["7.04", ["INVESTMENTS"], "GENERAL_PROHIBITION", "investment covenant with baskets"];

describe("shared capacity is a first-class verified semantic unit (OPTION A)", () => {
  it("ATTACK: Rule A $20m, Rule B $30m, and a model-asserted $10m shared pool the source never states -> the verifier charges the pool (MATERIAL, owner = sharedCapId), the candidate is MAPPED_WITH_REVIEW + REVIEW_REQUIRED, the adapter excludes it, Phase 4 never sees the pool", async () => {
    const { pkg } = buildPackageFrom({ docs: docWith(INV_ATTACK), candidateSpecs: [spec()] });
    const run = await certifyDiscoveredCovenantPackage(pkg, deps(fakeClient(submission), inventoryFor(false)));
    const r = run.results[0]!;
    expect(r.compilation!.sharedCapacities.length).toBe(1);
    const cap = r.compilation!.sharedCapacities[0]!;
    expect(cap.sharedCapId).toMatch(/^ir-sharedcap:/);
    expect(cap.sourceContentVersion).toBe(r.semanticSourceContract!.version); // identity stamped on the pool like on every unit
    expect(r.snapshot!.units.map((u) => u.kind)).toContain("SHARED_CAPACITY");
    const material = r.verification!.findings.filter((f) => f.severity === "MATERIAL");
    expect(material.length).toBeGreaterThan(0);
    expect(material.some((f) => f.ruleOrDefinitionId === cap.sharedCapId && /10,?000,?000|1e7/.test(f.proposedIrEvidence + f.sourceEvidence + f.verifierReasoning))).toBe(true);
    expect(r.verification!.status).toBe("MATERIAL_DISCREPANCY");
    expect(r.outcome).toBe("MAPPED_WITH_REVIEW");
    expect(r.certification!.status).toBe("REVIEW_REQUIRED");
    expect(r.certification!.blockers.map((b) => b.code)).toEqual(expect.arrayContaining(["VERIFICATION_NOT_CLEAN", "OPEN_MATERIAL_OR_UNCERTAIN_FINDING"]));
    expect(r.verifiedPackage).toMatchObject({ schema: VERIFIED_UNIT_PACKAGE_SCHEMA, complete: true, counts: { sharedCapacitiesCompiled: 1 } }); // the artifacts are sound; the SEMANTICS are not clean
    const capNode = run.map.nodes.find((n) => n.kind === "SHARED_CAPACITY")!;
    expect(capNode.certification.status).toBe("REVIEW_REQUIRED");
    expect(capNode.verification.materialFindings).toBeGreaterThan(0);
    expect(run.packageCertification.status).toBe("REVIEW_REQUIRED");
    const adapted = certifiedMapToVerifiedExecutionPackage(run.results.map((x) => ({ certification: x.certification!, verifiedPackage: x.verifiedPackage! })));
    expect(adapted.outcome).toBe("REFUSED");
    if (adapted.outcome !== "REFUSED") throw new Error("unreachable");
    expect(adapted.refusals.map((x) => x.code)).toEqual(["NO_CERTIFIED_ARTIFACTS"]);
    expect(adapted.excluded).toEqual([{ candidateRef: r.candidate.discoveryId, status: "REVIEW_REQUIRED", blockers: r.certification!.blockers.map((b) => b.code) }]);
    // even the raw artifact package, handed straight to the boundary, cannot execute the pool: its verification is not clean
    const raw = toVerifiedExecutionPackage([r.verifiedPackage!]);
    const out = evaluateVerifiedCapacity({ package: raw, inputs: inputsFor(raw), asOf: tx.WHEN });
    expect(out.outcome).toBe("REFUSED");
    if (out.outcome !== "REFUSED") throw new Error("unreachable");
    expect(out.refusals.map((x) => x.code)).toEqual(["VERIFICATION_ARTIFACT_INCOMPLETE"]);
  });

  it("HONEST: the source states the $10m pool across (a) and (b) -> verified clean, CERTIFIED as a SHARED_CAPACITY unit in the v2 package, derived into Phase 4 from the persisted artifact, executed under REQUIRE with the pool in the graph", async () => {
    const { pkg } = buildPackageFrom({ docs: docWith(INV_HONEST), candidateSpecs: [spec()] });
    const run = await certifyDiscoveredCovenantPackage(pkg, deps(fakeClient(submission), inventoryFor(true)));
    const r = run.results[0]!;
    expect(r.verification!.status).toBe("VERIFIED_NO_MATERIAL_GAP_FOUND");
    expect(r.outcome).toBe("MAPPED");
    expect(r.certification!.status).toBe("CERTIFIED");
    const persistedCap = r.verifiedPackage!.units.find((u) => u.kind === "SHARED_CAPACITY")!;
    expect(persistedCap.verifiedIdentity).toMatchObject({ ruleOrDefinitionId: r.compilation!.sharedCapacities[0]!.sharedCapId, sourceContentVersion: r.semanticSourceContract!.version });
    expect(persistedCap.verifiedIdentity.compilerVersion).toBeTruthy(); expect(persistedCap.verifiedIdentity.irSchemaVersion).toBeTruthy();
    const reloaded = parseVerifiedUnitPackage(serializeVerifiedUnitPackage(r.verifiedPackage!));
    expect(reloaded.units.filter((u) => u.kind === "SHARED_CAPACITY").length).toBe(1);
    const capNode = run.map.nodes.find((n) => n.kind === "SHARED_CAPACITY")!;
    expect(capNode.certification).toMatchObject({ status: "CERTIFIED", artifactHash: persistedCap.artifactHash });
    expect(run.map.edges.filter((e) => e.edgeType === "RULE_USES_SHARED_CAPACITY").map((e) => e.edgeAuthority)).toEqual(["CERTIFIED_SEMANTIC", "CERTIFIED_SEMANTIC"]);
    expect(run.packageCertification.status).toBe("CERTIFIED");
    const adapted = certifiedMapToVerifiedExecutionPackage([{ certification: r.certification!, verifiedPackage: serializeVerifiedUnitPackage(r.verifiedPackage!) }]);
    expect(adapted.outcome).toBe("DERIVED");
    if (adapted.outcome !== "DERIVED") throw new Error("unreachable");
    expect(adapted.package.sharedCapacities!.length).toBe(1);
    expect(adapted.package.verifications.map((v) => v.kind).sort()).toEqual(["RULE", "RULE", "RULE", "SHARED_CAPACITY"]);
    const out = evaluateVerifiedCapacity({ package: adapted.package, inputs: inputsFor(adapted.package), asOf: tx.WHEN });
    expect(out.outcome).toBe("EXECUTED");
    if (out.outcome !== "EXECUTED") throw new Error("unreachable");
    expect(out.coverage).toMatchObject({ complete: true, unitsInPackage: 4, unitsWithVerification: 4, identityStrength: { STRONG: 4, WEAK: 0 } });
    const capId = adapted.package.sharedCapacities![0]!.sharedCapId;
    expect(out.graph.nodes.some((n) => n.capacityNodeId === sharedNodeId(capId))).toBe(true);
    expect(out.state.sharedConstraints.length).toBe(1);
  });
});

describe("Phase 4 strict boundary (REQUIRE): unverified, stale or mutated shared-cap semantics cannot influence CapacityGraph / CapacityState / TransactionSimulation", () => {
  async function certifiedPackage(): Promise<VerifiedExecutionPackage> {
    const { pkg } = buildPackageFrom({ docs: docWith(INV_HONEST), candidateSpecs: [spec()] });
    const run = await certifyDiscoveredCovenantPackage(pkg, deps(fakeClient(submission), inventoryFor(true)));
    const adapted = certifiedMapToVerifiedExecutionPackage([{ certification: run.results[0]!.certification!, verifiedPackage: run.results[0]!.verifiedPackage! }]);
    if (adapted.outcome !== "DERIVED") throw new Error("fixture: not derived");
    return adapted.package;
  }
  const transaction = (p: VerifiedExecutionPackage) => ({ transaction: tx.proposal("tx-1", [], { companyId: p.companyId, instrumentKey: p.instrumentKey }), selectedPath: tx.route({ ruleIds: [p.rules.find((r) => r.sourceSectionRef === "7.04(a)")!.ruleId] }) });
  const refusedBoth = (p: VerifiedExecutionPackage, expectRef: RegExp) => {
    const cap = evaluateVerifiedCapacity({ package: p, inputs: inputsFor(p), asOf: tx.WHEN });
    expect(cap.outcome).toBe("REFUSED");
    if (cap.outcome !== "REFUSED") throw new Error("unreachable");
    expect(cap.refusals.map((x) => x.code)).toEqual(["VERIFICATION_ARTIFACT_INCOMPLETE"]);
    expect(cap.refusals[0]!.refs.join("\n")).toMatch(expectRef);
    const sim = simulateVerifiedTransaction({ package: p, inputs: inputsFor(p), asOf: tx.WHEN, ...transaction(p) });
    expect(sim.outcome).toBe("REFUSED");
    expect("graph" in cap || "state" in cap || "simulation" in sim).toBe(false);
  };

  it("UNVERIFIED pool: a shared capacity carried without a SHARED_CAPACITY artifact refuses the whole package (no graph, no state, no simulation)", async () => {
    const p = await certifiedPackage();
    refusedBoth({ ...p, verifications: p.verifications.filter((v) => v.kind !== "SHARED_CAPACITY") }, /no verification artifact/);
    // a pool smuggled in beside verified rules is the same refusal
    const injected: IRSharedCapacity = { ...p.sharedCapacities![0]!, sharedCapId: "ir-sharedcap:000000000000000000000000", memberRuleIds: [p.rules[1]!.ruleId] };
    refusedBoth({ ...p, sharedCapacities: [...p.sharedCapacities!, injected] }, /ir-sharedcap:000000000000000000000000: no verification artifact/);
  });

  it("MUTATED pool: the cap figure or the member set edited after verification (identity unchanged) is refused - the artifact's own IR inventory is the content witness", async () => {
    const p = await certifiedPackage();
    const cap = p.sharedCapacities![0]!;
    const bigger = { ...cap, capExpression: { ...cap.capExpression, amount: 50_000_000 } as IRSharedCapacity["capExpression"] };
    refusedBoth({ ...p, sharedCapacities: [bigger] }, /figures differ/);
    const narrower = { ...cap, memberRuleIds: [cap.memberRuleIds[0]!] };
    refusedBoth({ ...p, sharedCapacities: [narrower] }, /member set differs/);
  });

  it("STALE pool: an artifact whose identity is WEAK, or that binds a different source version, is refused; an artifact with a material finding on the pool is refused", async () => {
    const p = await certifiedPackage();
    const capArt = p.verifications.find((v) => v.kind === "SHARED_CAPACITY")!;
    const others = p.verifications.filter((v) => v !== capArt);
    refusedBoth({ ...p, verifications: [...others, { ...capArt, verifiedIdentity: { ...capArt.verifiedIdentity, sourceContentVersion: null } }] }, /WEAK/);
    refusedBoth({ ...p, verifications: [...others, { ...capArt, verifiedIdentity: { ...capArt.verifiedIdentity, sourceContentVersion: "sscv1:" + "f".repeat(64) } }] }, /does not bind/);
    const finding = { ...capArt.result.findings[0] ?? { findingId: "f", companyId: p.companyId, instrumentKey: p.instrumentKey, sourceDocumentId: CA, candidateRef: "c", irPath: null, findingType: "UNSUPPORTED_IR_ADDITION", sourceEvidence: "", sourceCitation: "", proposedIrEvidence: "", verifierReasoning: "", deterministicSignals: [], verificationMethod: "DETERMINISTIC_ONLY", provider: null, model: null, verifierAlgorithmVersion: "v", verifierPromptVersion: null, resolutionStatus: "OPEN", createdAt: "" }, ruleOrDefinitionId: capArt.ruleOrDefinitionId, severity: "MATERIAL" as const };
    refusedBoth({ ...p, verifications: [...others, { ...capArt, result: { ...capArt.result, status: "MATERIAL_DISCREPANCY", findings: [finding as never] } }] }, /material verification finding|verification MATERIAL_DISCREPANCY/);
  });

  it("the adapter refuses a tampered persisted package (hash chain) and a certification whose artifact hashes do not match", async () => {
    const { pkg } = buildPackageFrom({ docs: docWith(INV_HONEST), candidateSpecs: [spec()] });
    const run = await certifyDiscoveredCovenantPackage(pkg, deps(fakeClient(submission), inventoryFor(true)));
    const r = run.results[0]!;
    const tampered = serializeVerifiedUnitPackage(r.verifiedPackage!).replace('"amount":10000000', '"amount":90000000');
    expect(tampered).not.toBe(serializeVerifiedUnitPackage(r.verifiedPackage!));
    const a = certifiedMapToVerifiedExecutionPackage([{ certification: r.certification!, verifiedPackage: tampered }]);
    expect(a.outcome).toBe("REFUSED");
    if (a.outcome !== "REFUSED") throw new Error("unreachable");
    expect(a.refusals.map((x) => x.code)).toEqual(["PACKAGE_UNREADABLE"]);
    const b = certifiedMapToVerifiedExecutionPackage([{ certification: { ...r.certification!, artifactPackageHash: "0".repeat(64) }, verifiedPackage: r.verifiedPackage! }]);
    expect(b.outcome).toBe("REFUSED");
    if (b.outcome !== "REFUSED") throw new Error("unreachable");
    expect(b.refusals.map((x) => x.code)).toEqual(["ARTIFACT_HASH_MISMATCH"]);
  });
});
