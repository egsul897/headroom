/**
 * sourceContentVersion - the invalidation identity of a compiled unit: the exact operative text, its physical
 * structural anchor and the amendment effects applied to it. Populated on every rule/definition/shared capacity
 * the certified path emits (IRRule.sourceContentVersion was `null` on every unit before this layer).
 */
import crypto from "node:crypto";
import type { IdentityStrength } from "./types";

export const SOURCE_CONTENT_VERSION_PREFIX = "scv1";

export interface SourceContentVersionInput {
  documentId: string;
  structuralNodeId: string | null;
  operativeSourceText: string;
  provisionKey?: string | null;
  appliedEffectIds?: readonly string[];
}

export function computeSourceContentVersion(input: SourceContentVersionInput): { version: string; strength: IdentityStrength } {
  const textHash = crypto.createHash("sha256").update(input.operativeSourceText).digest("hex");
  const payload = JSON.stringify({ documentId: input.documentId, structuralNodeId: input.structuralNodeId, textSha256: textHash, provisionKey: input.provisionKey ?? null, appliedEffectIds: [...(input.appliedEffectIds ?? [])].sort() });
  const version = `${SOURCE_CONTENT_VERSION_PREFIX}:${crypto.createHash("sha256").update(payload).digest("hex")}`;
  const strength: IdentityStrength = input.structuralNodeId && input.operativeSourceText.trim().length > 0 ? "STRONG" : "WEAK";
  return { version, strength };
}

export function sha256Hex(s: string): string { return crypto.createHash("sha256").update(s).digest("hex"); }

/** Canonical JSON: keys sorted at every level, arrays kept in order, undefined dropped. */
export function canonicalJson(value: unknown): string {
  const norm = (v: unknown): unknown => {
    if (v === undefined) return null;
    if (v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map(norm);
    if (v instanceof Map) return norm(Object.fromEntries(v));
    if (v instanceof Set) return norm([...v]);
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) { const x = (v as Record<string, unknown>)[k]; if (x !== undefined) out[k] = norm(x); }
    return out;
  };
  return JSON.stringify(norm(value));
}
