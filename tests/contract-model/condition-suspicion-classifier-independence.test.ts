/**
 * Phase 3F.1-terminal Architecture Decision, Part A - mechanical
 * INDEPENDENCE enforcement for condition-suspicion-classifier.ts, mirroring
 * semantic-verification-independence.test.ts's own established technique
 * (a static regex-over-import-lines check, not a runtime sandbox) plus a
 * compile-time type-level assertion. This is the classifier's own
 * "audits the compiler, so it cannot see the compiler's own output"
 * requirement (docs/phase-3f1-terminal-architecture-decision/
 * 02-architecture-decision.json's `independenceRule`), checked two ways
 * neither of which depends on trusting this module's own doc comments:
 *
 *  1. TYPE-LEVEL: classifyConditionSuspicion's content parameter is exactly
 *     `string`. This is checked at `tsc --noEmit` time, not at vitest
 *     runtime - if a future edit ever widened that parameter to something
 *     structurally compatible with an IR-shaped object (a `Record<string,
 *     unknown>`, an `unknown`, or a bespoke type that happens to overlap
 *     with SemanticCompilationResult), this file fails to COMPILE, not
 *     merely fails a test - the assertion below cannot silently pass for
 *     any type wider than `string`.
 *  2. STATIC/CALL-SITE: condition-suspicion-classifier.ts's own imports
 *     never reach into lib/contract-model/ir/* or ../semantic/types|compile
 *     (it has no type-level vocabulary for compiled IR at all), and
 *     verify.ts's own call site passes ONLY
 *     `compilerInput.operativeSourceText` - never `compilationResult` or
 *     any of its fields - as the classifier's first argument.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { classifyConditionSuspicion } from "../../lib/contract-model/compiler/semantic-verification/condition-suspicion-classifier";

const CLASSIFIER_FILE = path.join(__dirname, "../../lib/contract-model/compiler/semantic-verification/condition-suspicion-classifier.ts");
const VERIFY_FILE = path.join(__dirname, "../../lib/contract-model/compiler/semantic-verification/verify.ts");

// ---------------------------------------------------------------------------
// 1. Type-level assertion (fails `tsc --noEmit`, not just this test, if the
//    classifier's source-text parameter is ever widened beyond `string`).
// ---------------------------------------------------------------------------
type SourceTextParam = Parameters<typeof classifyConditionSuspicion>[0];
// If SourceTextParam is not exactly assignable both ways with `string`, this
// line fails to typecheck (an object type is not assignable to `string`).
const _typeLevelIndependenceCheck: SourceTextParam = "" as string;
const _typeLevelIndependenceCheckReverse: string = "" as SourceTextParam;
void _typeLevelIndependenceCheck;
void _typeLevelIndependenceCheckReverse;

describe("condition-suspicion-classifier independence - type level", () => {
  it("classifyConditionSuspicion's first parameter is exactly `string` (compile-time only - this test body just confirms the file itself compiled)", () => {
    expect(true).toBe(true);
  });
});

describe("condition-suspicion-classifier independence - static/call-site (mirrors semantic-verification-independence.test.ts's technique)", () => {
  const classifierSource = fs.readFileSync(CLASSIFIER_FILE, "utf-8");
  const verifySource = fs.readFileSync(VERIFY_FILE, "utf-8");

  it("condition-suspicion-classifier.ts imports nothing from lib/contract-model/ir/*, ../semantic/types, or ../semantic/compile - it has no type-level vocabulary for compiled IR at all", () => {
    const importLines = classifierSource.split("\n").filter((l) => /^\s*import\b/.test(l));
    const forbidden = [/\.\.\/\.\.\/ir\//, /semantic\/types["']/, /semantic\/compile["']/, /semantic\/caller["']/];
    for (const pattern of forbidden) {
      const offending = importLines.filter((l) => pattern.test(l));
      expect(offending, `condition-suspicion-classifier.ts must never import a module matching ${pattern} (found: ${offending.join(" | ")})`).toHaveLength(0);
    }
  });

  it("condition-suspicion-classifier.ts's own source never references `compilationResult`, `IRRule`, or `SemanticCompilationResult` anywhere (defense in depth beyond the import check)", () => {
    expect(/compilationResult/.test(classifierSource)).toBe(false);
    expect(/IRRule\b/.test(classifierSource)).toBe(false);
    expect(/SemanticCompilationResult/.test(classifierSource)).toBe(false);
  });

  it("verify.ts's call site passes classifyConditionSuspicion ONLY input-derived content as its first argument - never compilationResult or any of its fields", () => {
    const callMatch = verifySource.match(/classifyConditionSuspicion\(([^;]*?)\);/s);
    expect(callMatch, "verify.ts must call classifyConditionSuspicion somewhere").toBeTruthy();
    const callArgs = callMatch![1]!;
    // The first argument is the content window. Under the candidate-span contract it is built by
    // buildConditionSuspicionInput (Gate 2 must still see a condition drafted in the parent
    // chapeau once operative text is anchor-only); before that it was the raw operative text.
    // Either shape is admissible here - what must never be admissible is compiled IR.
    const firstArg = callArgs.split(",")[0]!.trim();
    expect(["compilerInput.operativeSourceText", "buildConditionSuspicionInput(compilerInput)"]).toContain(firstArg);
    // Defense in depth: nothing in the ENTIRE call expression references
    // compilationResult at all.
    expect(callArgs.includes("compilationResult")).toBe(false);
  });

  it("buildConditionSuspicionInput - Gate 2's content window - is built from the compiler INPUT alone, never from compiled IR", () => {
    const fn = verifySource.match(/export function buildConditionSuspicionInput\(compilerInput: SemanticCompilerInput\): string \{(.*?)\n\}/s);
    expect(fn, "verify.ts must define buildConditionSuspicionInput").toBeTruthy();
    const body = fn![1]!;
    for (const forbidden of ["compilationResult", "IRRule", "SemanticCompilationResult", "irInventory", "reconciliation"]) {
      expect(body.includes(forbidden), `Gate 2's window must never read ${forbidden}`).toBe(false);
    }
    // and it may widen only to the enclosing scope - never to sibling, child or definition material
    expect(body).toContain('item.type === "PARENT_SCOPE"');
    for (const otherType of ["SIBLING_CONTEXT", "CHILD_RULE", "DEFINITION", "CROSS_REFERENCE", "OPERATIVE_SOURCE"]) {
      expect(body.includes(`"${otherType}"`), `Gate 2's window must not admit ${otherType}`).toBe(false);
    }
  });

  it("verify.ts never passes compilationResult (or any IRRule/IRDefinition field) to any function whose name contains 'ConditionSuspicion'", () => {
    const conditionSuspicionCallLines = verifySource.split("\n").filter((l) => /ConditionSuspicion/.test(l) && /\(/.test(l));
    for (const line of conditionSuspicionCallLines) {
      expect(line.includes("compilationResult"), `line referencing ConditionSuspicion must not also reference compilationResult: ${line}`).toBe(false);
    }
  });
});
