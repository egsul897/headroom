/**
 * F-7B.1 - submit_compilation TRANSPORT normalization (representational only; zero semantic authority).
 *
 * Root cause it addresses (docs/phase-3-remediation-f7b1/00-root-cause-reproduction.json): on every one of the five
 * real F-7B Stage-1 shards the provider's `submit_compilation` tool_use input carried one or more TOP-LEVEL
 * array-valued fields as a JSON-encoded STRING (e.g. definitions: "[{...},{...}]") instead of an array, so
 * SubmitCompilationSchema rejected the whole submission as MODEL_SCHEMA_FAILURE before normalization, IR validation or
 * stitching could see it. The recorded monolithic submissions carried real arrays; this variance is a wire-shape
 * difference in what the model returns, not a content difference.
 *
 * What this step may do - and ONLY this:
 *   for each of the six known top-level array fields of the submit_compilation tool input
 *     if the runtime value is a string AND strict JSON.parse succeeds AND the parsed value is an array
 *       replace the string with that parsed array (the EXISTING Zod schema then judges every element as before)
 *   everything else - including an already-present array - is left exactly as received.
 *
 * What it never does: no prose-to-array conversion, no comma splitting, no bracket/quote/trailing-comma repair, no
 * recursive decoding of nested strings (operands, conditions, exceptions, dependsOn, memberRefs, entityScope,
 * inventoryItemIds, cases, sufficiencyReasons, ...), no coercion of numbers/strings/enums, no defaults before Zod, no
 * reordering, no dedupe, no package- or field-specific special case. A decoded array is the exact JSON.parse of the
 * original string; the audit records the string's hash so that equality can be proven after the fact.
 *
 * The caller keeps `rawSubmission` = the untouched provider input and exposes the audit additively.
 */
import { createHash } from "node:crypto";

export const SUBMIT_TRANSPORT_NORMALIZATION_VERSION = "submit-transport-normalization.v1";

/** The six top-level array-valued fields of SubmitCompilationSchema (wire-schema.ts) - the only fields ever touched. */
export const SUBMIT_TOP_LEVEL_ARRAY_FIELDS = ["rules", "definitions", "sharedCapacities", "irExtensionCandidates", "inventoryDispositions", "overallNotes"] as const;
export type SubmitTopLevelArrayField = (typeof SUBMIT_TOP_LEVEL_ARRAY_FIELDS)[number];

export interface TransportFieldAudit {
  field: SubmitTopLevelArrayField;
  /** Runtime type as received: "absent" | "array" | "string" | "object" | "null" | "number" | "boolean" | "undefined". */
  originalType: string;
  /** sha256 of the original string (only when originalType === "string"). */
  originalStringSha256: string | null;
  originalStringLength: number | null;
  parseAttempted: boolean;
  parseSuccess: boolean;
  /** Type of JSON.parse's result when parsing succeeded: "array" | "object" | "null" | "number" | "string" | "boolean". */
  decodedType: string | null;
  decodedArrayLength: number | null;
  /** True only when the string was replaced by its decoded array. */
  applied: boolean;
  reason: string;
}

export interface TransportNormalizationAudit {
  version: typeof SUBMIT_TRANSPORT_NORMALIZATION_VERSION;
  /** True when at least one field was replaced. False means the returned value IS the received value (same reference). */
  applied: boolean;
  fields: TransportFieldAudit[];
}

function jsonType(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

export function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/**
 * Returns the value to hand to SubmitCompilationSchema.safeParse plus an audit of what (if anything) was decoded.
 * Non-object input is returned untouched with an empty audit (the schema rejects it exactly as before).
 */
export function normalizeSubmitCompilationTransport(raw: unknown): { value: unknown; audit: TransportNormalizationAudit } {
  const audit: TransportNormalizationAudit = { version: SUBMIT_TRANSPORT_NORMALIZATION_VERSION, applied: false, fields: [] };
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return { value: raw, audit };
  const input = raw as Record<string, unknown>;
  let out: Record<string, unknown> | null = null;
  for (const field of SUBMIT_TOP_LEVEL_ARRAY_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) { audit.fields.push({ field, originalType: "absent", originalStringSha256: null, originalStringLength: null, parseAttempted: false, parseSuccess: false, decodedType: null, decodedArrayLength: null, applied: false, reason: "absent - left absent for the schema's own default/optional handling" }); continue; }
    const v = input[field];
    const t = jsonType(v);
    if (t !== "string") { audit.fields.push({ field, originalType: t, originalStringSha256: null, originalStringLength: null, parseAttempted: false, parseSuccess: false, decodedType: null, decodedArrayLength: null, applied: false, reason: t === "array" ? "already an array - untouched" : `not a string - untouched (schema decides)` }); continue; }
    const s = v as string;
    const entry: TransportFieldAudit = { field, originalType: "string", originalStringSha256: sha256Hex(s), originalStringLength: s.length, parseAttempted: true, parseSuccess: false, decodedType: null, decodedArrayLength: null, applied: false, reason: "" };
    let decoded: unknown;
    try { decoded = JSON.parse(s); } catch { entry.reason = "string is not strict JSON - untouched (schema rejects)"; audit.fields.push(entry); continue; }
    entry.parseSuccess = true;
    entry.decodedType = jsonType(decoded);
    if (!Array.isArray(decoded)) { entry.reason = `JSON parsed to ${entry.decodedType}, not an array - untouched (schema rejects)`; audit.fields.push(entry); continue; }
    entry.decodedArrayLength = decoded.length;
    entry.applied = true;
    entry.reason = "JSON-encoded array decoded; the schema now validates its elements exactly as it would a native array";
    audit.fields.push(entry);
    if (!out) out = { ...input };
    out[field] = decoded;
  }
  if (!out) return { value: raw, audit };
  audit.applied = true;
  return { value: out, audit };
}
