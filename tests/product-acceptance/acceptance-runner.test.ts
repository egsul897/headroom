/**
 * Harness contract + safety invariants for the offline product-acceptance runner.
 *
 * These tests assert (a) what the harness itself guarantees (no provider calls, every stage labelled, fixture and
 * repository identity recorded, deterministic results) and (b) the safety invariants that HOLD on the current
 * baseline and must keep holding (source integrity, semantic integrity, capacity honesty, evidence integrity).
 * Product defects that are currently open live in known-defects.test.ts, tied to the defect register.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { runAll } from "../../scripts/product-acceptance/runner";
import type { AcceptanceReport, Check } from "../../scripts/product-acceptance/report-types";
import { loadCorpus } from "../../scripts/product-acceptance/corpus";

let report: AcceptanceReport;
const RUN_TIMEOUT_MS = 600_000;

beforeAll(async () => { report = await runAll(); }, RUN_TIMEOUT_MS);

const check = (packageId: string, expectationRef: string): Check | undefined => report.packages.find((p) => p.packageId === packageId)?.checks.find((c) => c.expectationRef === expectationRef);
const expectPass = (packageId: string, expectationRef: string) => { const c = check(packageId, expectationRef); expect(c, `${packageId} ${expectationRef} present`).toBeDefined(); expect(c!.result, `${packageId} ${expectationRef}: ${c!.detail}`).toBe("PASS"); };

describe("harness contract", () => {
  it("made zero provider calls and no network access, and says so", () => {
    expect(report.executionContract.providerCalls).toBe(0);
    expect(report.executionContract.network).toBe("NONE");
    expect(process.env.AI_GATEWAY_API_KEY ?? "").toBe("");
  });
  it("labels every mocked and not-run stage and discloses what the mocks mean", () => {
    expect(report.executionContract.mockedStages).toEqual(expect.arrayContaining(["SEMANTIC_INVENTORY", "SEMANTIC_COMPOSITION", "SEMANTIC_VERIFICATION_LAYER2"]));
    expect(report.executionContract.notRunStages).toContain("DISCOVERY_PASS_B_PLUS");
    expect(report.executionContract.mockDisclosure.join(" ")).toMatch(/No certification evidence/);
    for (const p of report.packages) for (const s of p.stages) expect(["PRODUCTION", "MOCKED", "NOT_RUN"]).toContain(s.mode);
  });
  it("records repository SHA and the pinned fixture identity", () => {
    expect(report.repository.headSha).toMatch(/^[0-9a-f]{40}$/);
    const corpus = loadCorpus();
    expect(report.corpus.packages.map((p) => p.packageId)).toEqual(corpus.map((p) => p.packageId));
    for (const p of report.corpus.packages) { const pkg = corpus.find((x) => x.packageId === p.packageId)!; expect(p.manifestSha256).toBe(pkg.manifestSha256); for (const d of p.documents) expect(pkg.documents.find((x) => x.documentId === d.documentId)!.sha256).toBe(d.sha256); }
  });
  it("every finding carries a severity, an outcome class, a repro and a stage mode", () => {
    for (const p of report.packages) for (const f of p.findings) { expect(f.severity).toBeTruthy(); expect(f.outcomeClass).toBeTruthy(); expect(f.repro.length).toBeGreaterThan(10); expect(["PRODUCTION", "MOCKED", "NOT_RUN"]).toContain(f.stageMode); }
  });
  it("is deterministic: a second run yields the same checks and findings", async () => {
    const again = await runAll();
    const strip = (r: AcceptanceReport) => r.packages.map((p) => ({ id: p.packageId, checks: p.checks.map((c) => [c.expectationRef, c.result]), findings: p.findings.map((f) => [f.expectationRef, f.severity, f.outcomeClass]) }));
    expect(strip(again)).toEqual(strip(report));
    expect(again.corpus.corpusSha256).toBe(report.corpus.corpusSha256);
  }, RUN_TIMEOUT_MS);
  it("never records a test-infrastructure failure on the pinned corpus", () => {
    for (const p of report.packages) expect(p.findings.filter((f) => f.outcomeClass === "TEST_INFRASTRUCTURE_FAILURE").map((f) => f.expectationRef)).toEqual([]);
  });
});

describe("source integrity (holds on baseline)", () => {
  it("a stale amendment that targets another agreement produces no resolved effect against the package", () => expectPass("pkg-g-adversarial-evidence", "operative:stale:stale-amendment"));
  it("a figure from a non-operative recital/exhibit is refused when asserted as a basket", () => { expectPass("pkg-g-adversarial-evidence", "adversarial:G-P1"); expectPass("pkg-g-adversarial-evidence", "adversarial:G-P2"); });
  it("a superseded amount asserted at a later as-of date is refused", () => expectPass("pkg-c-amendment-supersession", "adversarial:C-P1"));
  it("the operative state applies a restated clause and a deleted clause at the right dates", () => { for (const d of ["2025-06-30", "2025-12-31", "2026-06-30"]) { expectPass("pkg-c-amendment-supersession", `operative:${d}:credit-agreement#7.01(b)`); expectPass("pkg-c-amendment-supersession", `operative:${d}:credit-agreement#7.01(e)`); } });
  it("a duplicated section label is reported AMBIGUOUS, never silently resolved", () => expectPass("pkg-g-adversarial-evidence", "structure:credit-agreement#7.01"));
  it("a TOC/non-operative occurrence never yields a certified rule", () => { for (const ref of ["semantic:credit-agreement::7.01#1", "semantic:credit-agreement::7.02#1", "semantic:credit-agreement::7.06#1"]) expectPass("pkg-e-structural-ambiguity", ref); });
});

describe("semantic integrity (holds on baseline)", () => {
  it("a wrong amount from a sibling document is refused", () => expectPass("pkg-b-multi-document", "adversarial:B-P1"));
  it("an undefined governing term cannot be claimed COMPLETE", () => { expectPass("pkg-d-qualitative-restrictions", "adversarial:D-P4"); expectPass("pkg-g-adversarial-evidence", "adversarial:G-P4"); });
  it("a truncated provision cannot be completed by inference", () => expectPass("pkg-g-adversarial-evidence", "adversarial:G-P5"));
  it("a pure omission of a material condition is refused (REVIEW)", () => { expectPass("pkg-a-basic-credit-agreement", "adversarial:A-P1"); expectPass("pkg-d-qualitative-restrictions", "adversarial:D-P1"); expectPass("pkg-h-unseen-composition", "adversarial:H-P3"); expectPass("pkg-h-unseen-composition", "adversarial:H-P4"); });
  it("a mislabelled family/action is refused", () => expectPass("pkg-g-adversarial-evidence", "adversarial:G-P3"));
  it("a EUR basket asserted as a USD amount is refused", () => expectPass("pkg-f-capacity-ledger-honesty", "adversarial:F-P4"));
  it("the faithful representation of the basic package certifies", () => { for (const ref of ["certification:credit-agreement::7.01", "certification:credit-agreement::7.02", "certification:credit-agreement::7.03"]) expectPass("pkg-a-basic-credit-agreement", ref); });
  it("every compiled rule's provenance excerpt is verbatim in an operative document", () => {
    // enforced inside the semantic auditor for every manifest covenant; any violation is a SOURCE_PROVENANCE_FAILURE finding on a semantic:<id> ref with 'not verbatim' in it
    for (const p of report.packages) expect(p.findings.filter((f) => f.actual.includes("not verbatim")).map((f) => f.expectationRef)).toEqual([]);
  });
});

describe("capacity honesty (production runtime over fixture IR)", () => {
  const cases = ["F-R1", "F-R2", "F-R2b", "F-R2c", "F-R3", "F-R4", "F-R5", "F-R6", "F-R7", "F-R8", "F-R9", "F-R10", "F-INV-trace", "F-INV-determinism"];
  for (const id of cases) it(id, () => expectPass("pkg-f-capacity-ledger-honesty", `runtime:${id}`));
});

describe("evidence integrity", () => {
  it("every manifest-declared non-operative text is accounted for in the report", () => {
    for (const pkg of loadCorpus()) for (const n of pkg.manifest.nonOperative) {
      const p = report.packages.find((x) => x.packageId === pkg.packageId)!;
      const seen = p.checks.some((c) => c.expectationRef.startsWith(`non-operative:${n.documentId}`)) || p.observations.some((o) => o.includes(n.textContains.slice(0, 40)));
      expect(seen, `${pkg.packageId}: ${n.textContains.slice(0, 40)}`).toBe(true);
    }
  });
  it("certification of definitions candidates is observed, never asserted (the mock does not formalize quantitative definitions)", () => {
    for (const p of report.packages) expect(p.findings.filter((f) => /^certification:.*::1\.01$/.test(f.expectationRef))).toEqual([]);
  });
});
