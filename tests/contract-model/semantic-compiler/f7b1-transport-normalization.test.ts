/**
 * F-7B.1 - submit_compilation transport normalization: synthetic safety matrix (mission §15 A-N) + caller-level
 * behavior. The normalizer may decode ONLY a top-level array field that arrived as a JSON-encoded string whose strict
 * JSON.parse yields an array; everything else is untouched and the existing wire schema stays the judge.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { RealSemanticCaller, type MinimalAnthropicClient } from "../../../lib/contract-model/compiler/semantic/caller";
import { SubmitCompilationSchema } from "../../../lib/contract-model/compiler/semantic/wire-schema";
import { SUBMIT_TOP_LEVEL_ARRAY_FIELDS, normalizeSubmitCompilationTransport } from "../../../lib/contract-model/compiler/semantic/transport-normalization";
import { testCompilerInput } from "./test-helpers";

const validDefinition = { localRef: "d1", termName: "Consolidated EBITDA", covenantFamily: "DEFINITIONS_CALCULATION_RULES", citation: "§1.01", excerpt: "\"Consolidated EBITDA\" means ...", dependsOnTerms: [], calculationExpression: null, sufficiency: "COMPLETE", sufficiencyReasons: [] };
const validRule = { localRef: "r1", sourceSectionRef: "6.04(a)", covenantFamily: "INVESTMENTS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "MAKE_INVESTMENT", citation: "§6.04(a)", excerpt: "Investments in an aggregate amount not to exceed $1,000,000", capacityExpression: { kind: "MONEY", amount: 1_000_000, currency: "USD" }, conditions: [], exceptions: [], dependsOn: [], sufficiency: "COMPLETE", sufficiencyReasons: [] };
const canonical = (v: unknown): string => createHash("sha256").update(JSON.stringify(v)).digest("hex");

describe("F-7B.1 §15 synthetic safety matrix - normalizeSubmitCompilationTransport", () => {
  it("A. all six top-level fields are real arrays => value returned is the SAME reference, nothing applied", () => {
    const raw = { rules: [validRule], definitions: [validDefinition], sharedCapacities: [], irExtensionCandidates: [], inventoryDispositions: [], overallNotes: ["n"] };
    const { value, audit } = normalizeSubmitCompilationTransport(raw);
    expect(value).toBe(raw);
    expect(audit.applied).toBe(false);
    expect(audit.fields.every((f) => f.originalType === "array" && !f.applied && !f.parseAttempted)).toBe(true);
    expect(SubmitCompilationSchema.safeParse(value).success).toBe(true);
  });
  it("B. definitions is a valid JSON-array string => decoded, then normal schema validation", () => {
    const raw = { definitions: JSON.stringify([validDefinition]) };
    const { value, audit } = normalizeSubmitCompilationTransport(raw);
    expect(audit.applied).toBe(true);
    const f = audit.fields.find((x) => x.field === "definitions")!;
    expect(f).toMatchObject({ originalType: "string", parseAttempted: true, parseSuccess: true, decodedType: "array", decodedArrayLength: 1, applied: true });
    expect(f.originalStringSha256).toBe(createHash("sha256").update(raw.definitions).digest("hex"));
    const parsed = SubmitCompilationSchema.safeParse(value);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.definitions[0]!.termName).toBe("Consolidated EBITDA");
    expect((raw as { definitions: unknown }).definitions).toBe(raw.definitions); // original object untouched
  });
  it("C. rules and definitions both stringified => both decoded", () => {
    const { value, audit } = normalizeSubmitCompilationTransport({ rules: JSON.stringify([validRule]), definitions: JSON.stringify([validDefinition]) });
    expect(audit.fields.filter((f) => f.applied).map((f) => f.field)).toEqual(["rules", "definitions"]);
    const parsed = SubmitCompilationSchema.safeParse(value);
    expect(parsed.success).toBe(true);
    expect(parsed.success && [parsed.data.rules.length, parsed.data.definitions.length]).toEqual([1, 1]);
  });
  it("D. overallNotes = '[\"note one\",\"note two\"]' => decoded", () => {
    const { value } = normalizeSubmitCompilationTransport({ overallNotes: '["note one","note two"]' });
    const parsed = SubmitCompilationSchema.safeParse(value);
    expect(parsed.success && parsed.data.overallNotes).toEqual(["note one", "note two"]);
  });
  it("E. inventoryDispositions stringified with valid objects => decoded", () => {
    const { value } = normalizeSubmitCompilationTransport({ inventoryDispositions: JSON.stringify([{ inventoryItemId: "inv-item:abc", disposition: "UNSUPPORTED", note: "textual" }]) });
    const parsed = SubmitCompilationSchema.safeParse(value);
    expect(parsed.success && parsed.data.inventoryDispositions).toEqual([{ inventoryItemId: "inv-item:abc", disposition: "UNSUPPORTED", note: "textual" }]);
  });
  it("F. malformed JSON string => untouched, schema failure", () => {
    const raw = { definitions: "[broken json" };
    const { value, audit } = normalizeSubmitCompilationTransport(raw);
    expect(value).toBe(raw);
    expect(audit.applied).toBe(false);
    expect(audit.fields.find((x) => x.field === "definitions")).toMatchObject({ parseAttempted: true, parseSuccess: false, applied: false });
    expect(SubmitCompilationSchema.safeParse(value).success).toBe(false);
  });
  it("G. valid JSON object string instead of array => untouched, schema failure", () => {
    const raw = { definitions: JSON.stringify(validDefinition) };
    const { value, audit } = normalizeSubmitCompilationTransport(raw);
    expect(value).toBe(raw);
    expect(audit.fields.find((x) => x.field === "definitions")).toMatchObject({ parseSuccess: true, decodedType: "object", applied: false });
    expect(SubmitCompilationSchema.safeParse(value).success).toBe(false);
  });
  it("H. JSON null / number strings => untouched, schema failure", () => {
    for (const s of ["null", "123", "\"text\"", "true"]) {
      const raw = { rules: s };
      const { value, audit } = normalizeSubmitCompilationTransport(raw);
      expect(value).toBe(raw);
      expect(audit.fields.find((x) => x.field === "rules")!.applied).toBe(false);
      expect(SubmitCompilationSchema.safeParse(value).success).toBe(false);
    }
  });
  it("I. stringified array containing an invalid WireDefinition => decoded, then the EXISTING schema rejects", () => {
    const { value, audit } = normalizeSubmitCompilationTransport({ definitions: JSON.stringify([{ termName: 42 }]) });
    expect(audit.applied).toBe(true);
    expect(SubmitCompilationSchema.safeParse(value).success).toBe(false);
  });
  it("J. nested operands is itself a JSON string => NOT recursively decoded; the schema rejects", () => {
    const rule = { ...validRule, capacityExpression: { kind: "MAX_OF", operands: JSON.stringify([{ kind: "MONEY", amount: 1, currency: "USD" }]) } };
    const raw = { rules: [rule] };
    const { value, audit } = normalizeSubmitCompilationTransport(raw);
    expect(value).toBe(raw);
    expect(audit.applied).toBe(false);
    expect(SubmitCompilationSchema.safeParse(value).success).toBe(false);
    // the same nested string inside a stringified top-level array: only the top level is decoded
    const { value: v2 } = normalizeSubmitCompilationTransport({ rules: JSON.stringify([rule]) });
    expect(typeof ((v2 as { rules: { capacityExpression: { operands: unknown } }[] }).rules[0]!.capacityExpression.operands)).toBe("string");
    expect(SubmitCompilationSchema.safeParse(v2).success).toBe(false);
  });
  it("K. plain prose string => untouched, schema failure", () => {
    const raw = { definitions: "definition one; definition two" };
    const { value } = normalizeSubmitCompilationTransport(raw);
    expect(value).toBe(raw);
    expect(SubmitCompilationSchema.safeParse(value).success).toBe(false);
  });
  it("L. already-valid recorded monolithic Chewy 6.08 input => byte-identical parsed SubmitCompilationInput", () => {
    const unit = JSON.parse(readFileSync("tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run/unit-6.08.json", "utf-8")) as { compile: { rawModelOutput: unknown } };
    const raw = unit.compile.rawModelOutput;
    const before = SubmitCompilationSchema.safeParse(raw);
    const { value, audit } = normalizeSubmitCompilationTransport(raw);
    const after = SubmitCompilationSchema.safeParse(value);
    expect(value).toBe(raw);
    expect(audit.applied).toBe(false);
    expect(before.success && after.success).toBe(true);
    expect(JSON.stringify(after.success && after.data)).toBe(JSON.stringify(before.success && before.data));
  });
  it("M. transport normalization cannot change ordering: decoded content equals JSON.parse(original) exactly (canonical hash), and field order of the object is preserved", () => {
    const defs = [validDefinition, { ...validDefinition, localRef: "d2", termName: "Test Period" }, { ...validDefinition, localRef: "d3", termName: "Applicable Rate" }];
    const raw = { overallNotes: '["b","a","a"]', definitions: JSON.stringify(defs), rules: [] };
    const { value } = normalizeSubmitCompilationTransport(raw);
    const v = value as Record<string, unknown>;
    expect(canonical(v.definitions)).toBe(canonical(JSON.parse(raw.definitions)));
    expect(v.overallNotes).toEqual(["b", "a", "a"]); // no dedupe, no sort
    expect(Object.keys(v)).toEqual(Object.keys(raw));
  });
  it("N. transport normalization cannot create defaults before Zod: absent fields stay absent; only Zod fills them", () => {
    const raw = { definitions: JSON.stringify([validDefinition]) };
    const { value, audit } = normalizeSubmitCompilationTransport(raw);
    expect(Object.keys(value as object)).toEqual(["definitions"]);
    expect(audit.fields.filter((f) => f.originalType === "absent").map((f) => f.field)).toEqual(["rules", "sharedCapacities", "irExtensionCandidates", "inventoryDispositions", "overallNotes"]);
    const parsed = SubmitCompilationSchema.safeParse(value);
    expect(parsed.success && parsed.data.rules).toEqual([]);
  });
  it("non-object input is returned untouched with an empty audit", () => {
    for (const raw of [null, undefined, "x", 3, [1]]) {
      const { value, audit } = normalizeSubmitCompilationTransport(raw);
      expect(value).toBe(raw);
      expect(audit.fields).toEqual([]);
    }
  });
  it("the permitted field list is exactly the six top-level array fields of SubmitCompilationSchema", () => {
    expect([...SUBMIT_TOP_LEVEL_ARRAY_FIELDS]).toEqual(["rules", "definitions", "sharedCapacities", "irExtensionCandidates", "inventoryDispositions", "overallNotes"]);
    const { value } = normalizeSubmitCompilationTransport({ somethingElse: "[1,2]", definitions: [] });
    expect((value as { somethingElse: unknown }).somethingElse).toBe("[1,2]");
  });
});

function submitClient(input: unknown, stopReason: Anthropic.StopReason = "tool_use"): MinimalAnthropicClient {
  return { messages: { stream: (params) => ({ finalMessage: async () => ({ id: "m", type: "message", role: "assistant", model: params.model, stop_reason: stopReason, stop_sequence: null, content: [{ type: "tool_use", id: "t1", name: "submit_compilation", input }], usage: { input_tokens: 10, output_tokens: 10 } }) as unknown as Anthropic.Message }) } };
}

describe("F-7B.1 caller behavior with the transport boundary", () => {
  it("a stringified top-level definitions array is accepted; rawSubmission keeps the string; the audit is exposed", async () => {
    const raw = { definitions: JSON.stringify([validDefinition]), rules: [], sharedCapacities: [], irExtensionCandidates: [], overallNotes: [] };
    const r = await new RealSemanticCaller("test", "m", submitClient(raw)).compile(testCompilerInput());
    expect(r.failureReason).toBeNull();
    expect(r.submission?.definitions.map((d) => d.termName)).toEqual(["Consolidated EBITDA"]);
    expect(typeof (r.rawSubmission as { definitions: unknown }).definitions).toBe("string");
    expect(r.transportNormalization?.applied).toBe(true);
    expect(r.transportNormalization?.fields.find((f) => f.field === "definitions")?.applied).toBe(true);
  });
  it("malformed JSON in a top-level field is still MODEL_SCHEMA_FAILURE (no partial recovery without max_tokens)", async () => {
    const r = await new RealSemanticCaller("test", "m", submitClient({ definitions: "[broken", rules: [] })).compile(testCompilerInput());
    expect(r.failureReason).toBe("MODEL_SCHEMA_FAILURE");
    expect(r.submission).toBeNull();
    expect(r.transportNormalization?.applied).toBe(false);
  });
  it("a decoded array whose elements fail the schema is still MODEL_SCHEMA_FAILURE", async () => {
    const r = await new RealSemanticCaller("test", "m", submitClient({ definitions: JSON.stringify([{ termName: 42 }]), rules: [] })).compile(testCompilerInput());
    expect(r.failureReason).toBe("MODEL_SCHEMA_FAILURE");
    expect(r.transportNormalization?.applied).toBe(true);
  });
  it("a nested stringified operands array is still MODEL_SCHEMA_FAILURE (no recursive decoding)", async () => {
    const rule = { ...validRule, capacityExpression: { kind: "MAX_OF", operands: JSON.stringify([{ kind: "MONEY", amount: 1, currency: "USD" }]) } };
    const r = await new RealSemanticCaller("test", "m", submitClient({ rules: [rule], definitions: [] })).compile(testCompilerInput());
    expect(r.failureReason).toBe("MODEL_SCHEMA_FAILURE");
  });
  it("an already-valid submission is unchanged: audit not applied, same submission as before", async () => {
    const raw = { rules: [validRule], definitions: [validDefinition], sharedCapacities: [], irExtensionCandidates: [], overallNotes: [] };
    const r = await new RealSemanticCaller("test", "m", submitClient(raw)).compile(testCompilerInput());
    expect(r.failureReason).toBeNull();
    expect(r.transportNormalization?.applied).toBe(false);
    expect(r.rawSubmission).toBe(raw);
  });
});
