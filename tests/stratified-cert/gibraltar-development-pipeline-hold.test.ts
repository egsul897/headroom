/**
 * Track D Gibraltar DEVELOPMENT pipeline HOLD at tip 62a40be.
 * Soft gate. DEVELOPMENT ≠ CERTIFIED. The bound FROZEN body is not in the tree,
 * so this record must stay unwired until that body is present.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const HOLD_JSON = "docs/p3-track-d-gibraltar-development-pipeline-hold-62a40be.json";
const HOLD_MD = "docs/p3-track-d-gibraltar-development-pipeline-hold-62a40be.md";
const PIN_MATRIX = "docs/phase-3-reliability-stratified-certification/01-pin-matrix.json";
const PROVENANCE = "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/provenance.json";
const FROZEN_SHA256 = "f782f2f98537c8b76a8a4506c92a51e74c40a0a8eafd203b7343eaa0a21aede3";

describe("Gibraltar DEVELOPMENT pipeline HOLD", () => {
  it("binds the FROZEN hash and stays unwired, unpinned, and not CERTIFIED", () => {
    const hold = JSON.parse(fs.readFileSync(HOLD_JSON, "utf8"));
    expect(hold.tip).toBe("62a40be22b9598d9732e9ce2574d86d2228d6270");
    expect(hold.scope).toBe("GIBRALTAR_DEVELOPMENT_PIPELINE");
    expect(hold.frozenSha256).toBe(FROZEN_SHA256);
    expect(hold.frozenBodyPresentInTree).toBe(false);
    expect(hold.matchRecomputedByThisChange).toBe(false);
    expect(hold.terminal).toBe("HOLD_FROZEN_BODY_ABSENT");
    expect(hold.pipelineWired).toBe(false);
    expect(hold.passBExecuted).toBe(false);
    expect(hold.passCExecuted).toBe(false);
    expect(hold.passDExecuted).toBe(false);
    expect(hold.discoveryIdsMinted).toBe(false);
    expect(hold.matrixCellSelected).toBe(false);
    expect(hold.pinWritten).toBe(false);
    expect(hold.readyToPinInvented).toBe(false);
    expect(hold.stage1MarkerInvented).toBe(false);
    expect(hold.phase3PercentRaised).toBe(false);
    expect(hold.designation).toBe("DEVELOPMENT");
    expect(hold.certified).toBe(false);
    expect(hold.reservedBlindIssuerOpened).toBe(false);

    const note = fs.readFileSync(HOLD_MD, "utf8");
    expect(note).toContain(FROZEN_SHA256);
    expect(note).toContain("DEVELOPMENT ≠ CERTIFIED");
    expect(note).toContain("HOLD_FROZEN_BODY_ABSENT");
    expect(note).not.toContain("READY_TO_PIN");

    const matrix = fs.readFileSync(PIN_MATRIX, "utf8");
    expect(matrix.toLowerCase()).not.toContain("gibraltar");

    const provenance = JSON.parse(fs.readFileSync(PROVENANCE, "utf8"));
    expect(provenance.designation).toBe("DEVELOPMENT");
    expect(provenance.designationIsNotCertified).toBe(true);

    const pinRoot = "docs/phase-3-reliability-stratified-certification/pins";
    const pinNames = fs.readdirSync(pinRoot);
    expect(pinNames.some((name) => name.toLowerCase().includes("gibraltar"))).toBe(false);
    expect(fs.existsSync(path.join(pinRoot, "gibraltar-2026-credit-agreement"))).toBe(false);
  });
});
