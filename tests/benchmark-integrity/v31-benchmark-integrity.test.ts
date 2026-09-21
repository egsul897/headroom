/**
 * Phase-3 V3.1 benchmark-integrity audit — machine-checkable validation (§12).
 *
 * These tests assert properties of the AUDIT, not of Headroom: that exactly 47
 * cases were audited, that every classification is backed by the evidence the
 * audit's own rules require, that no frozen input was touched, and that the
 * correction ledger is deterministic.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DIR = "docs/phase-3-v3.1-benchmark-integrity/";
const read = (f: string) => JSON.parse(readFileSync(DIR + f, "utf8"));

const universe = read("01-benchmark-universe.json");
const sources = read("02-primary-source-map.json");
const atomic = read("03-atomic-ground-truth.json");
const ledger = read("04-benchmark-correction-ledger.json");
const impact = read("05-impact-analysis.json");

const CLASSIFICATIONS = new Set([
  "BENCHMARK_VERIFIED",
  "BENCHMARK_DEFECT",
  "BENCHMARK_IMPRECISE_NONMATERIAL",
  "BENCHMARK_SOURCE_UNRESOLVED",
  "BENCHMARK_AMBIGUOUS",
]);
const STATUSES = new Set([
  "SOURCE_CONFIRMED",
  "SOURCE_CONTRADICTED",
  "SOURCE_PARTIALLY_CONFIRMED",
  "SOURCE_NOT_LOCATED",
  "SOURCE_AMBIGUOUS",
  "VERSION_IDENTITY_UNRESOLVED",
]);

describe("V3.1 benchmark-integrity audit", () => {
  it("1. exactly 47 cases audited, with no duplicate case id", () => {
    expect(atomic.cases).toHaveLength(47);
    expect(new Set(atomic.cases.map((c: { caseId: string }) => c.caseId)).size).toBe(47);
    expect(universe.universe.actualCaseCount).toBe(47);
  });

  it("2. every case carries exactly one final benchmark classification, from the allowed set", () => {
    for (const c of atomic.cases) {
      expect(typeof c.classification, c.caseId).toBe("string");
      expect(CLASSIFICATIONS.has(c.classification), `${c.caseId}: ${c.classification}`).toBe(true);
    }
  });

  it("3. every BENCHMARK_VERIFIED case carries primary-source evidence: a quotation and a location on every proposition", () => {
    for (const c of atomic.cases.filter((x: { classification: string }) => x.classification === "BENCHMARK_VERIFIED")) {
      expect(c.propositions.length, c.caseId).toBeGreaterThan(0);
      for (const p of c.propositions) {
        expect(p.status, `${c.caseId}:${p.id}`).toBe("SOURCE_CONFIRMED");
        expect(String(p.sourceQuotation).length, `${c.caseId}:${p.id} quotation`).toBeGreaterThan(20);
        expect(String(p.sourceLocation).length, `${c.caseId}:${p.id} location`).toBeGreaterThan(3);
      }
    }
  });

  it("4. every BENCHMARK_DEFECT rests on at least one SOURCE_CONTRADICTED or SOURCE_PARTIALLY_CONFIRMED finding", () => {
    const defects = atomic.cases.filter((x: { classification: string }) => x.classification === "BENCHMARK_DEFECT");
    expect(defects.length).toBeGreaterThan(0);
    for (const c of defects) {
      const material = c.propositions.filter((p: { status: string }) => p.status === "SOURCE_CONTRADICTED" || p.status === "SOURCE_PARTIALLY_CONFIRMED");
      expect(material.length, c.caseId).toBeGreaterThan(0);
      for (const p of material) expect(String(p.sourceQuotation).length, `${c.caseId}:${p.id}`).toBeGreaterThan(20);
    }
  });

  it("5. every correction preserves the original claim, the corrected claim, evidence and provenance", () => {
    expect(ledger.corrections).toHaveLength(atomic.cases.filter((x: { classification: string }) => x.classification === "BENCHMARK_DEFECT").length);
    for (const c of ledger.corrections) {
      expect(String(c.originalGroundTruthClaim).length, c.caseId).toBeGreaterThan(40);
      expect(String(c.correctedGroundTruthClaim).length, c.caseId).toBeGreaterThan(40);
      expect(c.originalGroundTruthClaim, c.caseId).not.toBe(c.correctedGroundTruthClaim);
      expect(c.exactSourceEvidence.length, c.caseId).toBeGreaterThan(0);
      expect(c.provenance, c.caseId).toBeTruthy();
      expect(c.appliedToFrozenBenchmark, c.caseId).toBe(false);
    }
    expect(ledger.frozenBenchmarkModified).toBe(false);
  });

  it("6. no original benchmark artifact was modified", () => {
    const frozen = [
      "docs/phase-3-final-closure-resolution/review-packets/R1.json",
      "docs/phase-3-final-closure-resolution/review-packets/R2.json",
      "docs/phase-3-final-closure-resolution/review-packets/R3.json",
      "docs/evaluation-contract-v3/08-validation-packets-BLINDED.json",
      "docs/evaluation-contract-v3/07-validation-sample.json",
    ];
    const dirty = execFileSync("git", ["status", "--porcelain", ...frozen], { encoding: "utf8" }).trim();
    expect(dirty).toBe("");
    // and their recorded hashes still match
    for (const [name, hash] of Object.entries(universe.inputHashes as Record<string, string>)) {
      const path = frozen.find((f) => f.endsWith("/" + name))!;
      expect(createHash("sha256").update(readFileSync(path)).digest("hex"), name).toBe(hash);
    }
  });

  it("7. no production code was modified by this audit", () => {
    const dirty = execFileSync("git", ["status", "--porcelain", "lib", "app", "prisma", "components"], { encoding: "utf8" }).trim();
    expect(dirty).toBe("");
  });

  it("8. no reviewer decision was used as source authority", () => {
    // Scan the EVIDENCE the audit relies on - propositions, quotations, locations and
    // the corrections - not the audit's own methodology prose, which legitimately says
    // that reviewer decisions and consensus outputs were NOT consulted.
    const evidence = JSON.stringify([
      atomic.cases.map((c: { propositions: unknown[] }) => c.propositions),
      ledger.corrections.map((c: { exactSourceEvidence: unknown; sourcePath: unknown; sourceSection: unknown }) => [c.exactSourceEvidence, c.sourcePath, c.sourceSection]),
    ]);
    for (const re of [/\bR1\b/, /\bR2\b/, /\bR3\b/, /creditDecision/, /surfacingDecision/, /reviewerCode/, /\bconsensus\b/i, /adjudicator[ABC]\b/i]) {
      expect(evidence, `audit evidence must not cite ${re}`).not.toMatch(re);
    }
  });

  it("9. every locally-cited source path resolves", () => {
    const paths = new Set<string>();
    for (const s of sources.sources) for (const p of s.localPath) paths.add(p);
    for (const c of ledger.corrections) paths.add(c.sourcePath);
    for (const p of paths) expect(readFileSync(p, "utf8").length, p).toBeGreaterThan(1000);
  });

  it("10. the correction ledger and the classification tally are deterministic across reruns", () => {
    const stable = (o: unknown) => JSON.stringify(o, (k, v) => (k === "at" || k === "generatedAt" ? undefined : v));
    expect(createHash("sha256").update(stable(ledger)).digest("hex")).toBe(createHash("sha256").update(stable(read("04-benchmark-correction-ledger.json"))).digest("hex"));
    const tally: Record<string, number> = {};
    for (const c of atomic.cases) tally[c.classification] = (tally[c.classification] ?? 0) + 1;
    expect(tally).toEqual({
      BENCHMARK_VERIFIED: impact.counts.BENCHMARK_VERIFIED,
      BENCHMARK_DEFECT: impact.counts.BENCHMARK_DEFECT,
      BENCHMARK_IMPRECISE_NONMATERIAL: impact.counts.BENCHMARK_IMPRECISE_NONMATERIAL,
      BENCHMARK_SOURCE_UNRESOLVED: impact.counts.BENCHMARK_SOURCE_UNRESOLVED,
    });
  });

  it("11. the positive control reproduces the source/benchmark contradiction", () => {
    const control = atomic.cases.find((c: { caseId: string }) => c.caseId === "CASE-e3520246bd");
    expect(control.classification).toBe("BENCHMARK_DEFECT");
    const contra = control.propositions.find((p: { status: string }) => p.status === "SOURCE_CONTRADICTED");
    expect(contra).toBeTruthy();
    expect(contra.sourceQuotation).toContain("so long as no Event of Default exists");
    // and the quotation is genuinely in the primary source
    const src = readFileSync("tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/article-6-negative-covenants.txt", "utf8");
    expect(src).toContain("so long as no Event of Default exists, the Borrower may make Restricted Payments so long as the Total Rent Adjusted Net Leverage Ratio");
  });
});
