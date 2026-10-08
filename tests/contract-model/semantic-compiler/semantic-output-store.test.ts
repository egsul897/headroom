/**
 * Semantic output durability. No provider call. Historical Gibraltar bytes stay put.
 */
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { classifySemanticEvidence, readSemanticOutput, writeSemanticOutputAtomic, type SemanticOutputRecord } from "../../../lib/contract-model/compiler/semantic/semantic-output-store";

const HISTORICAL = "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/development-pipeline/article-vii-compile.json";
const HISTORICAL_SHA256 = "c866c1c1bb31095a73687257f68a23f4e232b1f92f9dfe278f8ac0b02b8f4651";

function record(partial: Partial<SemanticOutputRecord> = {}): SemanticOutputRecord {
  return {
    schema: "semantic-output.v1",
    evidenceClass: "COMPLETE_SEMANTIC_OUTPUT",
    attemptId: "attempt-1",
    compilerAlgorithmVersion: "semantic-accountability-compiler.v12",
    model: "test-model",
    rules: [{ ruleId: "r1", sufficiency: "PARTIAL" }],
    definitions: [],
    sourceSha256: "abc",
    complete: true,
    ...partial,
  };
}

describe("semantic output store", () => {
  it("reads back the rules that were written", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "semantic-output-"));
    const file = path.join(dir, "out.json");
    const written = record();
    writeSemanticOutputAtomic(file, written);
    const read = readSemanticOutput(file);
    expect(read.complete).toBe(true);
    expect(read.hashMatches).toBe(true);
    expect(read.record?.rules).toEqual(written.rules);
  });

  it("does not call a partial or count-only record complete", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "semantic-output-"));
    const partial = path.join(dir, "partial.json");
    writeSemanticOutputAtomic(partial, record({ evidenceClass: "PARTIAL", complete: false, rules: [{ ruleId: "r1" }] }));
    expect(readSemanticOutput(partial).complete).toBe(false);
    expect(readSemanticOutput(partial).evidenceClass).toBe("PARTIAL");
    expect(classifySemanticEvidence({ rules: 82 })).toBe("SUMMARY_ONLY_DIAGNOSTIC_EVIDENCE");
    expect(classifySemanticEvidence(null)).toBe("MISSING");
  });

  it("does not treat an interrupted temporary file as a complete artifact", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "semantic-output-"));
    const file = path.join(dir, "out.json");
    writeFileSync(`${file}.tmp`, "{\"complete\":true}\n");
    const missing = readSemanticOutput(file);
    expect(missing.evidenceClass).toBe("MISSING");
    expect(missing.complete).toBe(false);
  });

  it("detects a hash mismatch", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "semantic-output-"));
    const file = path.join(dir, "out.json");
    const written = writeSemanticOutputAtomic(file, record());
    const parsed = JSON.parse(readFileSync(file, "utf8")) as SemanticOutputRecord;
    parsed.rules = [{ ruleId: "tampered" }];
    writeFileSync(file, `${JSON.stringify(parsed)}\n`);
    const read = readSemanticOutput(file);
    expect(read.hashMatches).toBe(false);
    expect(read.complete).toBe(false);
    expect(read.reason.startsWith("HASH_MISMATCH")).toBe(true);
    expect(read.record?.artifactSha256).toBe(written.sha256);
    expect(read.record?.rules).toEqual([{ ruleId: "tampered" }]);
  });

  it("leaves the historical Article VII record unchanged and summary-only", () => {
    const bytes = readFileSync(HISTORICAL);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(HISTORICAL_SHA256);
    const parsed = JSON.parse(bytes.toString("utf8")) as { attempts: { rules: unknown }[] };
    expect(parsed.attempts.every((attempt) => typeof attempt.rules === "number")).toBe(true);
    expect(bytes.toString("utf8")).not.toContain("\"ruleObjects\"");
    const limitation = JSON.parse(readFileSync("tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/development-pipeline/article-vii-compile.evidence-limitation.json", "utf8")) as { linkedSha256: string; evidenceClass: string; certified: boolean };
    expect(limitation.linkedSha256).toBe(HISTORICAL_SHA256);
    expect(limitation.evidenceClass).toBe("SUMMARY_ONLY_DIAGNOSTIC_EVIDENCE");
    expect(limitation.certified).toBe(false);
  });
});
