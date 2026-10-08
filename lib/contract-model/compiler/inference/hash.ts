import { createHash } from "node:crypto";

/** Canonical JSON: sorted keys, drop undefined, array holes -> null. Matches verified-units convention. */
export function canonicalJson(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map((x) => (x === undefined ? null : walk(x)));
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.keys(v as object)
          .sort()
          .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
          .map((k) => [k, walk((v as Record<string, unknown>)[k])])
      );
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function contentAddress(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

export function hashPrompt(systemPrompt: string | null | undefined, prompt: string): string {
  return contentAddress({ systemPrompt: systemPrompt ?? null, prompt });
}

export function hashSchema(schema: Record<string, unknown>): string {
  return contentAddress(schema);
}

/** Context hash for a compilation unit: operative text + dependency identities + compiler identity. */
export function hashCompilationContext(parts: {
  operativeSourceText: string;
  dependencyRefs: string[];
  compilerVersion: string;
  promptVersion: string;
  schemaVersion: string;
  governingScopeHash?: string | null;
  operativeVersionRef?: string | null;
}): string {
  return contentAddress({
    operativeSourceText: parts.operativeSourceText,
    dependencyRefs: [...parts.dependencyRefs].sort(),
    compilerVersion: parts.compilerVersion,
    promptVersion: parts.promptVersion,
    schemaVersion: parts.schemaVersion,
    governingScopeHash: parts.governingScopeHash ?? null,
    operativeVersionRef: parts.operativeVersionRef ?? null,
  });
}
