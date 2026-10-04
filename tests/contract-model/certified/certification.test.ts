/**
 * PHASE 3 CERTIFICATION - the decision, the paired artifacts, the exact-identity invariant, the semantic source
 * contract, and package certification over a sealed population. Zero provider calls (golden harness, scripted).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import type { IRRule } from "../../../lib/contract-model/ir/types";
import { assembleCovenantMap, assemblyInput, certifyDiscoveredCovenantPackage, compileCovenantMap, type CandidateMapResult } from "../../../lib/contract-model/covenant-map";
import { buildVerifiedUnitPackage, canonicalJson, identityOfUnit, parseVerifiedUnitPackage, serializeVerifiedUnitPackage, snapshotUnitsForVerification, stableContentJson, toVerifiedExecutionPackage, VERIFIED_UNIT_PACKAGE_SCHEMA, VERIFIED_UNIT_PACKAGE_SCHEMA_V1 } from "../../../lib/contract-model/verified-units";
import { certifyCandidate, type CertifyCandidateInput } from "../../../lib/contract-model/phase3-certification/certify";
import { certifiedMapToVerifiedExecutionPackage } from "../../../lib/contract-model/phase3-certification/phase4-adapter";
import { buildPackageCertificationManifest, certifyPackage } from "../../../lib/contract-model/phase3-certification/package-certification";
import { computeCandidatePopulationHash, sealDiscoveryPopulation } from "../../../lib/contract-model/phase3-certification/discovery-population";
import { evaluateVerifiedCapacity, type VerifiedExecutionPackage } from "../../../lib/contract-model/verified-execution";
import { operativeLineageFor } from "../../../lib/contract-model/covenant-map/candidate-input";
import * as tx from "../runtime/transaction/helpers";
import { buildPackage, buildPackageFrom, deps, DOCS, GOLDEN_AGREEMENT, CA, fakeClient, INVENTORY, type ScriptedInventory } from "./golden-harness";

const FACTS = [tx.figure("fig-1", "1000")];
const inputsFor = (p: VerifiedExecutionPackage) => tx.resolverFor(FACTS, [...(p.definitions ?? [])], [...p.rules]);

/** The certification input exactly as the pipeline built it for one result (so a test can perturb ONE dimension). */
function inputOf(r: CandidateMapResult, over: Partial<CertifyCandidateInput> = {}): CertifyCandidateInput {
  return {
    candidate: r.candidate, anchored: true, operativeSourceVersion: r.sourceContentVersion, operativeIdentityStrength: r.identityStrength, semanticSourceContract: r.semanticSourceContract ?? null,
    bundle: r.bundle, compilation: r.compilation, verification: r.verification, operativeProvision: r.operativeProvision, operativeLineage: operativeLineageFor(r.operativeProvision),
    snapshot: r.snapshot ?? null, verifiedPackage: r.verifiedPackage ?? null, currentUnits: r.compilation ? [...r.compilation.rules, ...r.compilation.definitions, ...r.compilation.sharedCapacities] : [], ...over,
  };
}
const withDoc = (text: string) => DOCS.map((d) => (d.documentId === CA ? { ...d, text } : d));
const byRef = (run: Awaited<ReturnType<typeof compileCovenantMap>>, ref: string) => run.results.find((r) => r.candidate.normalizedSourceRef === ref)!;

describe("candidate certification is a dimension separate from the map outcome", () => {
  it("case 3: anchored, STRONG identities, complete compile, clean verification, complete paired package -> MAPPED + CERTIFIED, and the canonical result carries snapshot, verifiedPackage and certification", async () => {
    const run = await certifyDiscoveredCovenantPackage(buildPackage().pkg, deps());
    for (const r of run.results) {
      expect(r.outcome).toBe("MAPPED");
      expect(r.certification).toMatchObject({ status: "CERTIFIED", blockers: [], sourceIdentityStrength: "STRONG", semanticSourceIdentityStrength: "STRONG" });
      expect(r.snapshot!.units.length).toBeGreaterThan(0);
      expect(r.verifiedPackage).toMatchObject({ schema: VERIFIED_UNIT_PACKAGE_SCHEMA, complete: true, problems: [], unpaired: [] });
      expect(r.certification!.artifactPackageHash).toBe(r.verifiedPackage!.packageHash);
      expect(r.certification!.snapshotHash).toBe(r.snapshot!.snapshotHash);
      expect(r.semanticSourceContract!.strength).toBe("STRONG");
    }
    expect(run.map.completeness).toMatchObject({ mapComplete: true, certificationComplete: true });
    expect(run.packageCertification.status).toBe("CERTIFIED");
  });

  it("case 1: compile complete + verifier clean + WEAK source identity -> the map still says MAPPED, the certification says NOT_CERTIFIED (SOURCE_IDENTITY_WEAK)", async () => {
    const { pkg } = buildPackage();
    const run = await compileCovenantMap(pkg, deps());
    const r = byRef(run, "7.01");
    const weak = certifyCandidate(inputOf(r, { operativeIdentityStrength: "WEAK" }));
    expect(weak.status).toBe("NOT_CERTIFIED");
    expect(weak.blockers.map((b) => b.code)).toContain("SOURCE_IDENTITY_WEAK");
    // the map keeps the compile/verify facts (MAPPED) and exposes the separate certification verdict on every node of the candidate
    const map = assembleCovenantMap(assemblyInput(pkg, deps().config, run.results.map((x) => (x === r ? { ...x, certification: weak } : x))));
    expect(map.candidates.find((c) => c.sectionRef === "7.01")).toMatchObject({ outcome: "MAPPED", certificationStatus: "NOT_CERTIFIED" });
    for (const n of map.nodes.filter((n) => n.candidateRef === r.candidate.discoveryId)) expect(n.certification).toMatchObject({ status: "NOT_CERTIFIED", artifactHash: null, blockers: expect.arrayContaining(["SOURCE_IDENTITY_WEAK"]) });
    expect(map.completeness).toMatchObject({ mapComplete: true, certificationComplete: false, candidatesMapped: 3, candidatesCertified: 2, candidatesNotCertified: 1 });
    // a WEAK semantic contract is equally fatal
    const weakContract = certifyCandidate(inputOf(r, { semanticSourceContract: { ...r.semanticSourceContract!, strength: "WEAK" } }));
    expect(weakContract.status).toBe("NOT_CERTIFIED");
    expect(weakContract.blockers.map((b) => b.code)).toContain("SEMANTIC_SOURCE_IDENTITY_WEAK");
  });

  it("case 2: verified-unit package incomplete (unverified, or a unit missing from the snapshot) -> MAPPED + NOT_CERTIFIED (VERIFIED_PACKAGE_INCOMPLETE)", async () => {
    const run = await compileCovenantMap(buildPackage().pkg, deps());
    const r = byRef(run, "7.01");
    const unverified = buildVerifiedUnitPackage({ companyId: "golden-co", instrumentKey: "instrument:golden-ca", candidateRef: r.candidate.discoveryId, runId: "t", snapshot: r.snapshot!, verification: null });
    expect(unverified.complete).toBe(false);
    const c1 = certifyCandidate(inputOf(r, { verifiedPackage: unverified }));
    expect(c1.status).toBe("NOT_CERTIFIED");
    expect(c1.blockers.map((b) => b.code)).toContain("VERIFIED_PACKAGE_INCOMPLETE");
    const partialSnapshot = snapshotUnitsForVerification({ rules: r.compilation!.rules.slice(1), definitions: r.compilation!.definitions, sharedCapacities: [] });
    const partial = buildVerifiedUnitPackage({ companyId: "golden-co", instrumentKey: "instrument:golden-ca", candidateRef: r.candidate.discoveryId, runId: "t", snapshot: partialSnapshot, verification: r.verification });
    const c2 = certifyCandidate(inputOf(r, { snapshot: partialSnapshot, verifiedPackage: partial }));
    expect(c2.status).toBe("NOT_CERTIFIED");
    expect(c2.blockers.map((b) => b.code)).toContain("ARTIFACT_IDENTITY_MISMATCH"); // the first rule is in hand but was never persisted
    expect(c2.blockers.find((b) => b.code === "ARTIFACT_IDENTITY_MISMATCH")!.refs.some((x) => x.endsWith(":NOT_PERSISTED"))).toBe(true);
    // no certification without a verification at all
    const c3 = certifyCandidate(inputOf(r, { verification: null }));
    expect(c3.status).toBe("NOT_CERTIFIED");
    expect(c3.blockers.map((b) => b.code)).toContain("VERIFICATION_MISSING");
  });
});

describe("exact identity: verified object == persisted object == executed object", () => {
  it("every persisted unit is byte-identical to the unit in hand and to the unit Phase 4 derives; the artifact round-trips through serialization; Phase 4 binds it STRONG and complete", async () => {
    const run = await compileCovenantMap(buildPackage().pkg, deps());
    for (const r of run.results) {
      const current = [...r.compilation!.rules, ...r.compilation!.definitions, ...r.compilation!.sharedCapacities];
      expect(r.verifiedPackage!.units.length).toBe(current.length);
      for (const u of current) {
        const persisted = r.verifiedPackage!.units.find((p) => p.ruleOrDefinitionId === identityOfUnit(u).ruleOrDefinitionId)!;
        expect(canonicalJson(persisted.unit)).toBe(canonicalJson(u));
        expect(canonicalJson(persisted.verifiedIdentity)).toBe(canonicalJson(identityOfUnit(u)));
        expect(persisted.verifiedIdentity.sourceContentVersion).toBe(r.semanticSourceContract!.version);
        expect(stableContentJson(persisted.verification)).toBe(stableContentJson(r.verification));
      }
      const reloaded = parseVerifiedUnitPackage(serializeVerifiedUnitPackage(r.verifiedPackage!));
      expect(canonicalJson(reloaded)).toBe(canonicalJson(r.verifiedPackage));
    }
    const derived = certifiedMapToVerifiedExecutionPackage(run.results.map((r) => ({ certification: r.certification!, verifiedPackage: serializeVerifiedUnitPackage(r.verifiedPackage!) })));
    expect(derived.outcome).toBe("DERIVED");
    if (derived.outcome !== "DERIVED") throw new Error("unreachable");
    const live = new Map(run.results.flatMap((r) => [...r.compilation!.rules, ...r.compilation!.definitions]).map((u) => [identityOfUnit(u).ruleOrDefinitionId, u] as const));
    for (const u of [...derived.package.rules, ...(derived.package.definitions ?? [])]) expect(canonicalJson(u)).toBe(canonicalJson(live.get(identityOfUnit(u).ruleOrDefinitionId)));
    const executed = evaluateVerifiedCapacity({ package: derived.package, inputs: inputsFor(derived.package), asOf: tx.WHEN });
    expect(executed.outcome).toBe("EXECUTED");
    if (executed.outcome !== "EXECUTED") throw new Error("unreachable");
    expect(executed.coverage).toMatchObject({ complete: true, unitsMissingVerification: [], unitsRefusedByGate: [], identityStrength: { STRONG: 11, WEAK: 0 } });
  });

  it("mutation after the snapshot is caught: the snapshot is frozen, the package refuses the drifted unit, the certification is NOT_CERTIFIED, the gate refuses the stale artifact", async () => {
    const run = await compileCovenantMap(buildPackage().pkg, deps());
    const r = byRef(run, "7.01");
    expect(Object.isFrozen(r.snapshot!.units[0]!.unit)).toBe(true);
    expect(() => { (r.snapshot!.units[0]!.unit as { ruleId: string }).ruleId = "x"; }).toThrow();
    const basket = r.compilation!.rules.find((x) => x.sourceSectionRef === "7.01(b)")!;
    const mutated: IRRule = { ...basket, capacityExpression: { ...(basket.capacityExpression as unknown as Record<string, unknown>), amount: 250_000_000 } as unknown as IRRule["capacityExpression"] };
    const current = [...r.compilation!.rules.map((x) => (x === basket ? mutated : x)), ...r.compilation!.definitions];
    // the packager compares identity AND content against the snapshot the verifier saw
    const pkg = buildVerifiedUnitPackage({ companyId: "golden-co", instrumentKey: "instrument:golden-ca", candidateRef: r.candidate.discoveryId, runId: "t", snapshot: r.snapshot!, verification: r.verification, currentUnits: current });
    expect(pkg.complete).toBe(false);
    expect(pkg.problems.map((p) => p.code)).toContain("IDENTITY_MISMATCH");
    expect(pkg.unpaired.map((u) => u.ruleOrDefinitionId)).toEqual([basket.ruleId]);
    // the decision over the ORIGINAL (complete) package with the mutated unit in hand: ARTIFACT_IDENTITY_MISMATCH
    const cert = certifyCandidate(inputOf(r, { currentUnits: current }));
    expect(cert.status).toBe("NOT_CERTIFIED");
    expect(cert.blockers.find((b) => b.code === "ARTIFACT_IDENTITY_MISMATCH")!.refs).toEqual([`${basket.ruleId}:CONTENT`]);
    // identity drift (a re-stamped source version) is a different refusal, equally fatal
    const restamped = [...r.compilation!.rules.map((x) => (x === basket ? { ...basket, sourceContentVersion: "sscv1:" + "0".repeat(64) } : x)), ...r.compilation!.definitions];
    const certIdentity = certifyCandidate(inputOf(r, { currentUnits: restamped }));
    expect(certIdentity.blockers.find((b) => b.code === "ARTIFACT_IDENTITY_MISMATCH")!.refs).toEqual([`${basket.ruleId}:IDENTITY`]);
    // Phase 4: the ORIGINAL artifacts over the RESTAMPED unit fail the gate under REQUIRE (identity mismatch), never execute it as verified
    const exec = toVerifiedExecutionPackage([r.verifiedPackage!]);
    const stale: VerifiedExecutionPackage = { ...exec, rules: exec.rules.map((x) => (x.ruleId === basket.ruleId ? (restamped.find((y) => "ruleId" in y && y.ruleId === basket.ruleId) as IRRule) : x)) };
    const out = evaluateVerifiedCapacity({ package: stale, inputs: inputsFor(stale), asOf: tx.WHEN });
    expect(out.outcome).toBe("EXECUTED");
    if (out.outcome !== "EXECUTED") throw new Error("unreachable");
    expect(out.coverage.complete).toBe(false);
    expect(out.coverage.unitsRefusedByGate).toEqual([{ unitId: basket.ruleId, reason: "IDENTITY_MISMATCH", identityStrength: "STRONG" }]);
  });
});

describe("semantic source contract: relied-upon context invalidates, unrelated context does not", () => {
  const EBITDA_LINE = "\"Consolidated EBITDA\" means, for any period, Consolidated Net Income for such period plus Interest Expense for such period.";
  const LOAN_DOCUMENTS_LINE = "\"Loan Documents\" means this Agreement, the Notes and the Security Documents.";
  const INTEREST_LINE = "\"Interest Expense\" means, for any period, total interest expense of the Borrower and its Subsidiaries for such period.";

  it("two identities: scv1 binds the operative text; sscv1 binds it PLUS the relied-upon definitions, retrievals, lineage and as-of date; CERTIFIED requires sscv1 STRONG", async () => {
    const run = await compileCovenantMap(buildPackage().pkg, deps());
    const r = byRef(run, "7.01");
    expect(r.sourceContentVersion).toMatch(/^scv1:[0-9a-f]{64}$/);
    expect(r.semanticSourceContract!.version).toMatch(/^sscv1:[0-9a-f]{64}$/);
    expect(r.semanticSourceContract!.components.operativeSourceVersion).toBe(r.sourceContentVersion);
    expect(r.semanticSourceContract!.attributionMode).toBe("RELIED_UPON");
    // 7.01 USES Consolidated EBITDA; the definition's own dependency chain (CNI, Interest Expense) is relied upon transitively through the bundle's DEPENDS_ON_DEFINITION edges
    expect(r.semanticSourceContract!.reliedUpon.definedTerms).toEqual(["consolidated ebitda"]);
    expect(r.semanticSourceContract!.reliedUpon.contextItems.map((i) => `${i.type}:${i.normalizedRef}`).sort()).toEqual(["AMENDMENT_LEAD:7.02", "DEFINITION:Consolidated EBITDA", "DEFINITION_DEPENDENCY:Consolidated Net Income", "DEFINITION_DEPENDENCY:Interest Expense", "OPERATIVE_SOURCE:7.01"]);
    expect(r.compilation!.definitions).toEqual([]); // definitions are owned by the 1.01 candidate
    for (const u of [...r.compilation!.rules, ...r.compilation!.definitions]) expect(u.sourceContentVersion).toBe(r.semanticSourceContract!.version);
    // the contract never binds model output, verification or cost: the same input yields the same version
    const again = await compileCovenantMap(buildPackage().pkg, deps());
    expect(byRef(again, "7.01").semanticSourceContract!.version).toBe(r.semanticSourceContract!.version);
  });

  it("DEPENDENCY CHANGE: 7.01(c) relies on Consolidated EBITDA, which relies on Interest Expense; editing the Interest Expense definition (same length) leaves scv1 unchanged, changes sscv1, and the OLD artifact no longer binds the NEW units", async () => {
    const before = await compileCovenantMap(buildPackage().pkg, deps());
    const edited = GOLDEN_AGREEMENT.replace(INTEREST_LINE, INTEREST_LINE.replace("for such period.", "for each period."));
    expect(edited.length).toBe(GOLDEN_AGREEMENT.length);
    const after = await compileCovenantMap(buildPackageFrom({ docs: withDoc(edited) }).pkg, deps());
    const a = byRef(before, "7.01"), b = byRef(after, "7.01");
    expect(b.sourceContentVersion).toBe(a.sourceContentVersion); // the covenant's own text did not change
    expect(b.semanticSourceContract!.version).not.toBe(a.semanticSourceContract!.version); // but a definition it relies on (transitively) did
    expect(b.semanticSourceContract!.components.contextDependencyHash).not.toBe(a.semanticSourceContract!.components.contextDependencyHash);
    expect(b.semanticSourceContract!.attributionMode).toBe("RELIED_UPON");
    expect(b.certification!.status).toBe("CERTIFIED"); // the new run is certified on its own terms
    expect(byRef(after, "7.02").semanticSourceContract!.version).toBe(byRef(before, "7.02").semanticSourceContract!.version); // 7.02 relies on nothing that changed
    // old artifacts over the new units: the gate refuses every 7.01 unit as IDENTITY_MISMATCH; nothing executes as verified
    const stale: VerifiedExecutionPackage = { ...toVerifiedExecutionPackage([b.verifiedPackage!]), verifications: toVerifiedExecutionPackage([a.verifiedPackage!]).verifications };
    const out = evaluateVerifiedCapacity({ package: stale, inputs: inputsFor(stale), asOf: tx.WHEN });
    expect(out.outcome).toBe("EXECUTED");
    if (out.outcome !== "EXECUTED") throw new Error("unreachable");
    expect(out.coverage.complete).toBe(false);
    expect(out.coverage.unitsRefusedByGate.map((u) => u.reason)).toEqual(Array(stale.rules.length + (stale.definitions?.length ?? 0)).fill("IDENTITY_MISMATCH"));
    // and the adapter refuses the old certification over the new package outright
    const adapted = certifiedMapToVerifiedExecutionPackage([{ certification: a.certification!, verifiedPackage: b.verifiedPackage! }]);
    expect(adapted.outcome).toBe("REFUSED");
    if (adapted.outcome !== "REFUSED") throw new Error("unreachable");
    expect(adapted.refusals.map((x) => x.code)).toContain("ARTIFACT_HASH_MISMATCH");
  });

  it("DEPENDENCY CHANGE (direct): editing the Consolidated EBITDA definition itself changes sscv1 AND the verifier catches the scripted compile that still cites the old wording (stale IR is REVIEW_REQUIRED, never CERTIFIED)", async () => {
    const before = await compileCovenantMap(buildPackage().pkg, deps());
    const editedLine = EBITDA_LINE.replace("plus Interest Expense", "less Interest Expense");
    const edited = GOLDEN_AGREEMENT.replace(EBITDA_LINE, editedLine);
    expect(edited.length).toBe(GOLDEN_AGREEMENT.length);
    // Pass A reads the REAL (edited) text, so its inventory anchors the new wording; the scripted Pass B submission is the
    // stale one that still cites "plus Interest Expense" - exactly the drift the verifier exists to catch
    const freshInventory: ScriptedInventory = { ...INVENTORY, "1.01": INVENTORY["1.01"]!.map((i) => (i.excerpt === EBITDA_LINE ? { ...i, excerpt: editedLine } : i)) };
    const after = await compileCovenantMap(buildPackageFrom({ docs: withDoc(edited) }).pkg, deps(fakeClient(), freshInventory));
    const a = byRef(before, "7.01"), b = byRef(after, "7.01");
    expect(b.sourceContentVersion).toBe(a.sourceContentVersion);
    expect(b.semanticSourceContract!.version).not.toBe(a.semanticSourceContract!.version);
    // the stale scripted DEFINITION is now the 1.01 candidate's unit: the verifier catches it there
    const defs = byRef(after, "1.01");
    expect(defs.verification!.findings.some((f) => f.severity === "MATERIAL" && f.findingType === "QUALITATIVE_ASSERTION_UNGROUNDED" && f.ruleOrDefinitionId === defs.compilation!.definitions.find((d) => d.termName === "Consolidated EBITDA")!.definitionId)).toBe(true);
    expect(defs.outcome).toBe("MAPPED_WITH_REVIEW");
    expect(defs.certification!.status).toBe("REVIEW_REQUIRED");
    expect(defs.certification!.blockers.map((x) => x.code)).toEqual(expect.arrayContaining(["VERIFICATION_NOT_CLEAN", "OPEN_MATERIAL_OR_UNCERTAIN_FINDING"]));
  });

  it("UNRELATED CHANGE: editing the 'Loan Documents' definition (retrieved into 7.01's bundle but referenced by no compiled unit, directly or transitively) leaves sscv1, the artifact hashes and the certification unchanged", async () => {
    const before = await compileCovenantMap(buildPackage().pkg, deps());
    const edited = GOLDEN_AGREEMENT.replace(LOAN_DOCUMENTS_LINE, LOAN_DOCUMENTS_LINE.replace("the Notes", "the Bonds"));
    expect(edited.length).toBe(GOLDEN_AGREEMENT.length);
    const after = await compileCovenantMap(buildPackageFrom({ docs: withDoc(edited) }).pkg, deps());
    for (const ref of ["7.01", "7.02"]) {
      const a = byRef(before, ref), b = byRef(after, ref);
      if (ref === "7.01") expect(a.bundle!.items.some((i) => i.type === "DEFINITION" && i.normalizedRef === "Loan Documents")).toBe(true);
      expect(b.semanticSourceContract!.attributionMode).toBe("RELIED_UPON");
      expect(b.semanticSourceContract!.version).toBe(a.semanticSourceContract!.version);
      expect(b.certification!.unitArtifactHashes).toEqual(a.certification!.unitArtifactHashes);
      expect(b.certification!.status).toBe("CERTIFIED");
    }
    expect(byRef(after, "7.01").bundle!.contentIdentity).not.toBe(byRef(before, "7.01").bundle!.contentIdentity); // the bundle DID change; attribution kept it out of the contract
  });
});

describe("package certification over a sealed population", () => {
  it("a declared PARTIAL_TARGET_SET is never package-certified, however good its candidates are; an unsealed population is PARTIAL too", async () => {
    const partial = await certifyDiscoveredCovenantPackage(buildPackageFrom({ scope: "PARTIAL_TARGET_SET" }).pkg, deps());
    expect(partial.results.every((r) => r.certification!.status === "CERTIFIED")).toBe(true);
    expect(partial.packageCertification.status).toBe("PARTIAL");
    expect(partial.packageCertification.blockers.map((b) => b.code)).toEqual(["PARTIAL_TARGET_SET"]);
    const unsealed = await certifyDiscoveredCovenantPackage(buildPackageFrom({ sealed: false }).pkg, deps());
    expect(unsealed.packageCertification.status).toBe("PARTIAL");
    expect(unsealed.packageCertification.blockers.map((b) => b.code)).toEqual(["DISCOVERY_POPULATION_UNSEALED"]);
    expect(unsealed.map.discoveryPopulation).toMatchObject({ scope: "COMPLETE", sealedDiscoveryIdentity: null });
    // a caller that hands the pipeline no population identity at all (a benchmark subset runner) is an unsealed PARTIAL_TARGET_SET
    const { discoveryPopulation: _dropped, ...noPopulation } = buildPackage().pkg; void _dropped;
    const fallback = await certifyDiscoveredCovenantPackage(noPopulation, deps());
    expect(fallback.packageCertification.status).toBe("PARTIAL");
    expect(fallback.packageCertification.blockers.map((b) => b.code)).toEqual(["DISCOVERY_POPULATION_UNSEALED", "PARTIAL_TARGET_SET"]);
    expect(fallback.map.discoveryPopulation).toMatchObject({ scope: "PARTIAL_TARGET_SET", sealedDiscoveryIdentity: null, candidatesDiscovered: 3 });
  });

  it("a package certification cannot be claimed over a subset: a seal over the full population with only one candidate attempted is FAILED (POPULATION_HASH_MISMATCH)", async () => {
    const full = buildPackage().pkg;
    const subset = { ...full, candidates: full.candidates.slice(0, 1) };
    const run = await certifyDiscoveredCovenantPackage(subset, deps());
    expect(run.results.length).toBe(1);
    expect(run.results[0]!.certification!.status).toBe("CERTIFIED");
    expect(run.packageCertification.status).toBe("FAILED");
    expect(run.packageCertification.blockers.map((b) => b.code)).toContain("POPULATION_HASH_MISMATCH");
    expect(run.packageCertification.representedPopulationHash).not.toBe(full.discoveryPopulation!.candidatePopulationHash);
    expect(computeCandidatePopulationHash(subset.candidates)).toBe(run.packageCertification.representedPopulationHash);
    // the seal itself: order-independent, telemetry-free, bound to the documents
    const resealed = sealDiscoveryPopulation({ documents: DOCS, discoveryVersion: "golden-discovery.v1", candidates: [...full.candidates].reverse(), scope: "COMPLETE" });
    expect(resealed).toEqual(full.discoveryPopulation);
    expect(sealDiscoveryPopulation({ documents: withDoc(GOLDEN_AGREEMENT + " "), discoveryVersion: "golden-discovery.v1", candidates: full.candidates, scope: "COMPLETE" }).sealedDiscoveryIdentity).not.toBe(full.discoveryPopulation!.sealedDiscoveryIdentity);
  });

  it("a NOT_CERTIFIED candidate fails the package; a REVIEW_REQUIRED candidate makes it REVIEW_REQUIRED; the manifest records every identity and recomputes its hash", async () => {
    const { pkg } = buildPackage();
    const run = await certifyDiscoveredCovenantPackage(pkg, deps());
    const r = byRef(run, "7.02");
    const weak = certifyCandidate(inputOf(r, { operativeIdentityStrength: "WEAK" }));
    const map = assembleCovenantMap(assemblyInput(pkg, deps().config, run.results.map((x) => (x === r ? { ...x, certification: weak } : x))));
    const failed = certifyPackage({ map, certifications: run.results.map((x) => (x === r ? weak : x.certification!)), discoveryPopulation: pkg.discoveryPopulation! });
    expect(failed.status).toBe("FAILED");
    expect(failed.blockers.map((b) => b.code)).toEqual(expect.arrayContaining(["CANDIDATE_NOT_CERTIFIED", "WEAK_IDENTITY"]));
    const review = { ...r.certification!, status: "REVIEW_REQUIRED" as const, blockers: [{ code: "UNIT_SUFFICIENCY_INCOMPLETE" as const, severity: "REVIEW" as const, detail: "t", refs: [] }] };
    const reviewed = certifyPackage({ map: run.map, certifications: run.results.map((x) => (x === r ? review : x.certification!)), discoveryPopulation: pkg.discoveryPopulation! });
    expect(reviewed.status).toBe("REVIEW_REQUIRED");
    expect(reviewed.candidates).toEqual({ total: 3, eligible: 3, represented: 3, certified: 2, reviewRequired: 1, notCertified: 0 });
    const m = run.manifest;
    expect(m.schema).toBe("p3-package-certification-manifest.v1");
    expect(m.discoveryPopulation).toEqual(pkg.discoveryPopulation);
    expect(m.sourcePackage.documents.map((d) => d.documentId)).toEqual(DOCS.map((d) => d.documentId));
    expect(m.mapIdentity.mapHash).toBe(run.map.mapHash);
    expect(m.candidateCertifications.map((c) => [c.sectionRef, c.status, c.artifactPackageHash !== null, c.semanticSourceContractVersion?.slice(0, 5)])).toEqual([["1.01", "CERTIFIED", true, "sscv1"], ["7.01", "CERTIFIED", true, "sscv1"], ["7.02", "CERTIFIED", true, "sscv1"]]);
    expect(m.verifiedArtifactPackageHashes).toEqual(run.results.map((x) => x.verifiedPackage!.packageHash).sort());
    expect(m.packageCertification.status).toBe("CERTIFIED");
    expect(buildPackageCertificationManifest({ map: run.map, certifications: run.certifications, packageCertification: run.packageCertification }).manifestHash).toBe(m.manifestHash);
  });
});

describe("verified-unit package v2 is additive", () => {
  it("historical v1 packages (run-original CONMED evidence) still parse under their own hashing rule and derive an execution package with no shared capacities", () => {
    const dir = "docs/phase-3-conmed-population-verified/run-original/evidence/verified-units";
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".verified-units.json")).sort().slice(0, 3);
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const parsed = parseVerifiedUnitPackage(fs.readFileSync(`${dir}/${f}`, "utf8"));
      expect(parsed.schema).toBe(VERIFIED_UNIT_PACKAGE_SCHEMA_V1);
      expect(parsed.units.every((u) => u.kind === "RULE" || u.kind === "DEFINITION")).toBe(true);
      const exec = toVerifiedExecutionPackage([parsed]);
      expect(exec.sharedCapacities).toEqual([]);
      expect(exec.verifications.length).toBe(parsed.units.length);
    }
  });
});
