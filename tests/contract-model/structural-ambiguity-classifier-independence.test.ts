/**
 * Phase 3F.1 Human Architecture Decision (Workstream OPEN-1) - mechanical
 * INDEPENDENCE enforcement for structural-ambiguity-classifier.ts, mirroring
 * tests/contract-model/condition-suspicion-classifier-independence.test.ts's
 * own established technique (a static regex-over-import-lines/source check,
 * not a runtime sandbox) plus a compile-time type-level assertion. The
 * governing spec requires this classifier know ONLY source text (candidate
 * text, preceding/following windows, the candidate's own regex-captured
 * number, and neighboring CONFIDENT heading TEXT) and never: the
 * deterministic parser's own accept/reject decision for this exact
 * candidate, any compiled/structural-node representation, the expected
 * answer, or that this is a benchmark/certification case.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { classifyStructuralAmbiguity, StructuralAmbiguityClassifierInput } from "../../lib/contract-model/compiler/structural-ambiguity-classifier";

const CLASSIFIER_FILE = path.join(__dirname, "../../lib/contract-model/compiler/structural-ambiguity-classifier.ts");
const RESOLUTION_FILE = path.join(__dirname, "../../lib/contract-model/compiler/structural-ambiguity-resolution.ts");

// ---------------------------------------------------------------------------
// 1. Type-level assertion: the classifier's own content-input type carries
//    EXACTLY the disclosed field set - no more, no less. If a future edit
//    ever widened it to include, say, a `nodeId`, a `parentNodeId`, a
//    `triageDecision`, or an `expectedAnswer` field, this fails to COMPILE
//    (an object type with extra/renamed keys is not mutually assignable with
//    this exact shape), not merely fails a test at runtime.
// ---------------------------------------------------------------------------
type ExpectedInputShape = {
  candidateType: "ARTICLE" | "SECTION";
  candidateNumber: string;
  candidateText: string;
  precedingWindow: string;
  followingWindow: string;
  nearestConfidentHeadingBefore: string | null;
  nearestConfidentHeadingAfter: string | null;
};
type ActualInputParam = Parameters<typeof classifyStructuralAmbiguity>[0];
// Mutual assignability both ways - fails to typecheck if the real shape ever
// drifts from the disclosed one (extra keys included).
const _typeLevelIndependenceCheckA: ActualInputParam = {} as ExpectedInputShape;
const _typeLevelIndependenceCheckB: ExpectedInputShape = {} as ActualInputParam;
const _typeLevelIndependenceCheckC: StructuralAmbiguityClassifierInput = {} as ExpectedInputShape;
void _typeLevelIndependenceCheckA;
void _typeLevelIndependenceCheckB;
void _typeLevelIndependenceCheckC;

describe("structural-ambiguity-classifier independence - type level", () => {
  it("classifyStructuralAmbiguity's input type carries exactly the disclosed source-only field set (compile-time only - this test body just confirms the file itself compiled)", () => {
    expect(true).toBe(true);
  });
});

describe("structural-ambiguity-classifier independence - static/source (mirrors condition-suspicion-classifier-independence.test.ts's own technique)", () => {
  const classifierSource = fs.readFileSync(CLASSIFIER_FILE, "utf-8");
  const resolutionSource = fs.readFileSync(RESOLUTION_FILE, "utf-8");

  it("structural-ambiguity-classifier.ts never imports from stage-structure.ts (the deterministic parser) or any structural-node/IR type - it has no type-level vocabulary for the parser's own decision or compiled output", () => {
    const importLines = classifierSource.split("\n").filter((l) => /^\s*import\b/.test(l));
    const forbidden = [/stage-structure["']/, /\.\.\/ir\//, /structural-index["']/, /semantic\/types["']/, /semantic\/compile["']/];
    for (const pattern of forbidden) {
      const offending = importLines.filter((l) => pattern.test(l));
      expect(offending, `structural-ambiguity-classifier.ts must never import a module matching ${pattern} (found: ${offending.join(" | ")})`).toHaveLength(0);
    }
  });

  // Unlike condition-suspicion-classifier.ts's own equivalent whole-source
  // substring check, this module's own doc comments legitimately NAME the
  // parser's own triage vocabulary (CONFIDENT_HEADING, nodeId, ...) when
  // explaining WHAT the classifier is deliberately never shown - a
  // whole-source substring scan would therefore fail on the prose that
  // documents the very independence guarantee it is trying to check. The
  // import-line check above and the object-literal call-site check below are
  // the real, structural (comment-proof) enforcement; the runtime-accurate
  // complement (the actual userContent string a call sends never contains
  // these labels) lives in structural-ambiguity-classifier.test.ts's own
  // "source-only independence" describe block.

  // The runtime-accurate complement to the source-level checks above (can a
  // doc comment merely NAME the parser's own triage labels vs. an actual
  // string sent to the model ever containing them) already lives in
  // structural-ambiguity-classifier.test.ts's own "source-only independence"
  // describe block, which captures the REAL userContent string a call sends
  // and asserts it never contains "CONFIDENT_HEADING"/"CONFIDENT_PROSE_REFERENCE".

  it("structural-ambiguity-resolution.ts (the classifier's own call site) never passes the triage decision itself, a nodeId, or any expected/ground-truth field into the classifier input object it builds", () => {
    const callSiteMatch = resolutionSource.match(/classifyStructuralAmbiguity\(\s*\{([^}]*)\}/s);
    expect(callSiteMatch, "structural-ambiguity-resolution.ts must call classifyStructuralAmbiguity with an inline input object").toBeTruthy();
    const objectBody = callSiteMatch![1]!;
    for (const forbidden of ["decision", "nodeId", "expectedAnswer", "groundTruth", "candidateKey"]) {
      expect(objectBody.includes(forbidden), `the classifier input object built at the call site must not reference "${forbidden}" (found in: ${objectBody})`).toBe(false);
    }
    // Positive check: it DOES pass the disclosed source-only fields.
    for (const required of ["candidateType", "candidateNumber", "candidateText", "precedingWindow", "followingWindow", "nearestConfidentHeadingBefore", "nearestConfidentHeadingAfter"]) {
      expect(objectBody.includes(required), `the classifier input object must include "${required}"`).toBe(true);
    }
  });
});
