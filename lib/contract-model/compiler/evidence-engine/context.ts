/**
 * Smallest complete legal context. A required fragment is included whole
 * or the task is NEEDS_CONTEXT. Character truncation is not a context strategy.
 */
export type ContextRole = "OPERATIVE_CLAUSE" | "DEFINITION" | "EXCEPTION" | "CROSS_REFERENCE" | "AMENDMENT" | "SOURCE_IDENTITY";

export interface ContextFragment {
  role: ContextRole;
  id: string;
  text: string;
  contentHash: string;
  required: boolean;
  estimatedTokens: number;
}

export type ContextAssembly =
  | { status: "COMPLETE"; fragments: ContextFragment[]; estimatedTokens: number; text: string }
  | { status: "NEEDS_CONTEXT"; missing: string[]; reason: string };

export function assembleLegalContext(fragments: readonly ContextFragment[], tokenBudget: number): ContextAssembly {
  if (!fragments.some((fragment) => fragment.role === "OPERATIVE_CLAUSE" && fragment.required)) {
    return { status: "NEEDS_CONTEXT", missing: ["OPERATIVE_CLAUSE"], reason: "the operative clause is not in the assembled context" };
  }
  const required = fragments.filter((fragment) => fragment.required);
  const optional = fragments.filter((fragment) => !fragment.required);
  const included: ContextFragment[] = [];
  let tokens = 0;
  for (const fragment of [...required, ...optional]) {
    if (fragment.estimatedTokens > tokenBudget - tokens) {
      if (!fragment.required) continue;
      const missing = [...required.filter((item) => !included.includes(item)).map((item) => item.id)];
      return { status: "NEEDS_CONTEXT", missing, reason: `${fragment.id} does not fit in the token budget as a whole fragment` };
    }
    included.push(fragment);
    tokens += fragment.estimatedTokens;
  }
  const missingIdentity = required.filter((fragment) => fragment.role === "SOURCE_IDENTITY" && !fragment.contentHash);
  if (missingIdentity.length > 0) {
    return { status: "NEEDS_CONTEXT", missing: missingIdentity.map((fragment) => fragment.id), reason: "a required source identity has no hash" };
  }
  return {
    status: "COMPLETE",
    fragments: included,
    estimatedTokens: tokens,
    text: included.map((fragment) => fragment.text).join("\n"),
  };
}
