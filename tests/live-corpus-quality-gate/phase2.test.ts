/**
 * Phase 2 — freeze integrity, replay classification, adjudication, corpus expansion.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  adjudicateCriticalFindings,
  buildDefectTickets,
  buildExpandedCorpus,
  measureExtractionAndSafety,
  runIndependentReplay,
  verifyFreezeIntact,
} from "../../lib/evaluation/live-corpus-quality-gate";

describe("live corpus quality gate phase 2", () => {
  it("keeps Phase-1 freeze artifacts intact and immutable", () => {
    const { intact, meta } = verifyFreezeIntact();
    expect(intact).toBe(true);
    expect(meta.frozenEvaluationContentSha).toBe("cebec8ab3aaecd894b1903ac0b758828655a88df");
    expect(meta.phase1TipSha).toBe("084405770a02f5eebe88b0b7ffb192a46fd7960c");
    const freezeDir = path.join(process.cwd(), "docs/live-corpus-quality-gate/phase1-freeze");
    expect(fs.existsSync(path.join(freezeDir, "01-findings.json"))).toBe(true);
    const findings = JSON.parse(fs.readFileSync(path.join(freezeDir, "01-findings.json"), "utf8")) as {
      findings: unknown[];
    };
    expect(findings.findings).toHaveLength(46);
  });

  it("independently replays Phase-1 findings without mutating the oracle", () => {
    const replay = runIndependentReplay();
    expect(replay.oracleUntouched).toBe(true);
    expect(replay.freezeIntact).toBe(true);
    expect(replay.frozenFindingCount).toBe(46);
    expect(replay.frozenUniqueFindingIds).toBe(45);
    expect(replay.reproduced).toBe(45);
    expect(replay.evaluationHarnessDefects.some((d) => d.defectId === "LCQG-HARNESS-FINDING-ID-COLLISION")).toBe(
      true,
    );
    // Oracle file bytes unchanged after replay
    const { intact } = verifyFreezeIntact();
    expect(intact).toBe(true);
  });

  it("adjudicates the five prioritized critical/high defects with owners", () => {
    const adj = adjudicateCriticalFindings();
    const ids = adj.map((a) => a.defectId);
    expect(ids).toEqual(
      expect.arrayContaining([
        "LCQG-GIB-XREF-BUILDER-MARKER-CONFLICT",
        "LCQG-GIB-FALSE-AFFIRM-SHARED-CAP",
        "LCQG-SUP-AMEND-RESTATES-MISSING",
        "LCQG-GIB-STRUCT-AMBIGUOUS-TOC",
        "LCQG-GIB-XREF-LOW-RESOLVE",
      ]),
    );
    expect(adj.every((a) => a.productionFixInThisBranch === false)).toBe(true);
    expect(adj.every((a) => a.sourceSha256.length === 64)).toBe(true);
    expect(adj.every((a) => a.recommendedOwningAgent.length > 0)).toBe(true);
    // Distinguish source inconsistency vs compiler defect for builder basket
    const builder = adj.find((a) => a.defectId === "LCQG-GIB-XREF-BUILDER-MARKER-CONFLICT");
    expect(builder?.classification).toBe("SOURCE_INCONSISTENCY");
    const shared = adj.find((a) => a.defectId === "LCQG-GIB-FALSE-AFFIRM-SHARED-CAP");
    expect(shared?.classification).toBe("COMPILER_DEFECT");
    const restates = adj.find((a) => a.defectId === "LCQG-SUP-AMEND-RESTATES-MISSING");
    expect(restates?.classification).toBe("COMPILER_DEFECT");
  });

  it("routes actionable tickets without allowing evaluation-branch production fixes", () => {
    const tickets = buildDefectTickets(adjudicateCriticalFindings());
    expect(tickets.length).toBe(5);
    expect(tickets.every((t) => t.productionFixAllowedOnEvaluationBranch === false)).toBe(true);
    expect(tickets.every((t) => t.frozenOracleProtection.includes("phase1-freeze"))).toBe(true);
    const owners = new Set(tickets.map((t) => t.owningAgent));
    expect(owners.has("Amendment Intelligence") || owners.has("Dependency Atlas") || owners.has("Structural Compiler")).toBe(
      true,
    );
  });

  it("expands authentic corpus subject to availability and keeps Knife River unread", () => {
    const corpus = buildExpandedCorpus();
    expect(corpus.documents.length).toBeGreaterThan(4);
    expect(corpus.availability.additionalDistinctAvailable).toBeGreaterThan(0);
    expect(corpus.blindReservation.inspected).toBe(false);
    expect(corpus.blindReservation.status).toBe("BLIND_BODY_UNREAD");
    // No synthetic docs
    expect(corpus.documents.every((d) => d.chars > 0 && d.sha256.length === 64)).toBe(true);
    // Availability gap disclosed if < 25 additional
    if (corpus.availability.additionalDistinctAvailable < 25) {
      expect(corpus.availability.availabilityGap).toBeGreaterThan(0);
      expect(corpus.availability.note).toMatch(/Gap/);
    }
  });

  it("never labels missing ground truth as PASS in expansion legal-safety heuristics", () => {
    const corpus = buildExpandedCorpus();
    const { legalSafetyFindings } = measureExtractionAndSafety(corpus.documents);
    const expansionUnverified = legalSafetyFindings.filter(
      (f) => f.kind === "HEURISTIC_FLAG" && f.status === "UNVERIFIED",
    );
    expect(expansionUnverified.length).toBeGreaterThan(0);
    expect(legalSafetyFindings.some((f) => f.kind === "HEURISTIC_FLAG" && f.status === "PASS")).toBe(false);
  });
});
