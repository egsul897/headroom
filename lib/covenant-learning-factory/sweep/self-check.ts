/**
 * Cross-validate computed covenant results against independent Neon precedent
 * signals. Disagreements → error ledger entries. Unresolved → NEEDS_INPUT.
 * Never invents values.
 */

import { createHash } from "node:crypto";
import type { ComputationResult } from "../../contract-model/covenant-computation/types";
import type { LearningErrorRecord } from "../types";

export interface PrecedentCandidate {
  candidateId: string;
  sourceId: string;
  family?: string | null;
  sectionRef?: string | null;
  excerpt?: string | null;
  formulaHint?: string | null;
}

export interface PrecedentDefinition {
  definitionId: string;
  sourceId: string;
  term?: string | null;
  body?: string | null;
}

export interface PrecedentCondition {
  conditionId: string;
  sourceId: string;
  kind?: string | null;
  excerpt?: string | null;
}

export interface GrowerCheckInput {
  fixed?: string | null;
  percent?: string | null;
  base?: string | null;
  got?: string | null;
  evidence?: Record<string, unknown>;
}

function eid(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 20);
}

function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Grower consistency: max(fixed, pct·base). Returns mismatch message or null. */
export function checkGrowerConsistency(input: GrowerCheckInput): string | null {
  const { fixed, percent, base, got } = input;
  if (fixed == null || percent == null || base == null || got == null) return null;
  const f = Number(fixed);
  const p = Number(percent);
  const b = Number(base);
  const g = Number(got);
  if (![f, p, b, g].every((n) => Number.isFinite(n))) {
    return "NEEDS_INPUT: grower operands not numeric";
  }
  const expected = Math.max(f, (p / 100) * b);
  // Allow 0.5% relative tolerance for float noise
  const tol = Math.max(1, Math.abs(expected) * 0.005);
  if (Math.abs(g - expected) > tol) {
    return `grower mismatch: expected max(${f}, ${p}%·${b})=${expected}, got ${g}`;
  }
  return null;
}

export function selfCheckComputation(args: {
  packageKey: string;
  runId: string;
  sourceId: string;
  result: ComputationResult;
  candidates: PrecedentCandidate[];
  definitions: PrecedentDefinition[];
  conditions: PrecedentCondition[];
  now?: string;
}): LearningErrorRecord[] {
  const now = args.now ?? new Date().toISOString();
  const errors: LearningErrorRecord[] = [];
  const push = (
    cls: LearningErrorRecord["class"],
    message: string,
    evidence: Record<string, unknown>,
    severity: LearningErrorRecord["severity"] = "MEDIUM",
  ) => {
    errors.push({
      errorId: eid([args.runId, cls, message.slice(0, 80), String(evidence.stableKey ?? "")]),
      packageKey: args.packageKey,
      runId: args.runId,
      class: cls,
      severity,
      message,
      stage: "INDEPENDENT_EVAL",
      evidence: { sourceId: args.sourceId, ...evidence },
      createdAt: now,
      correctiveHistory: [],
    });
  };

  // Engine mistakes → CALCULATION_MISMATCH
  for (const m of args.result.mistakes) {
    push("CALCULATION_MISMATCH", m.message, { stableKey: m.stableKey, ...m.evidence }, "HIGH");
  }

  // Omissions stay NEEDS_INPUT (not invented)
  for (const om of args.result.omissions) {
    push(
      "COVERAGE_GAP",
      `NEEDS_INPUT: omission ${om.stableKey}`,
      { stableKey: om.stableKey, reason: om.reason },
      "MEDIUM",
    );
  }

  // Missed precedent candidates: excerpt not reflected in any computed basket citation.
  // This is the dominant learning signal — rules must capture the missed text.
  const baskets = args.result.baskets;
  for (const cand of args.candidates) {
    if (!cand.excerpt || cand.excerpt.length < 24) continue;
    const excerpt = norm(cand.excerpt);
    const needle = excerpt.slice(0, Math.min(40, excerpt.length));
    const hit = baskets.some((b) => {
      const cite = norm(b.citationExcerpt);
      return cite.includes(needle) || excerpt.includes(cite.slice(0, 40));
    });
    if (!hit) {
      push(
        "DISCOVERY_GAP",
        `precedent candidate ${cand.candidateId} family=${cand.family ?? "UNKNOWN"} not reflected in computed baskets`,
        {
          candidateId: cand.candidateId,
          expectedFamily: cand.family,
          citationExcerpt: cand.excerpt.slice(0, 160),
          sectionRef: cand.sectionRef,
          sectionTitle: cand.sectionRef,
        },
        "MEDIUM",
      );
    }
  }

  // Unit / sign sanity on computed baskets
  for (const b of baskets) {
    if (b.capStatus === "COMPUTED" && b.capCanonical != null) {
      const n = Number(b.capCanonical);
      if (!Number.isFinite(n)) {
        push("CALCULATION_MISMATCH", `non-numeric capCanonical for ${b.stableKey}`, { stableKey: b.stableKey, got: b.capCanonical }, "HIGH");
      } else if (n < 0) {
        push("CALCULATION_MISMATCH", `negative cap for ${b.stableKey}`, { stableKey: b.stableKey, got: b.capCanonical }, "HIGH");
      }
    }
    if (b.category === "GROWER_GREATER_OF" && b.capCanonical != null && b.capFormula) {
      // Parse "greater of X and Y%" style formula when present; else skip (no invention)
      const fixedMatch = b.capFormula.match(/\$?\s*([\d,]+(?:\.\d+)?)/);
      const pctMatch = b.capFormula.match(/([\d.]+)\s*%/);
      if (fixedMatch && pctMatch) {
        // Base metric required — without it, NEEDS_INPUT already on missingInputs
        const baseHint = b.missingInputs.find((m) => /asset|ebitda|metric/i.test(m));
        if (!baseHint) {
          // Cannot verify without base; do not invent
        }
      }
    }
    if (b.category === "UNKNOWN" && /\$\s*[\d,]|\d+(?:\.\d+)?\s*%/.test(b.citationExcerpt)) {
      push(
        "UNSUPPORTED_SEMANTICS",
        `numeric clause classified UNKNOWN: ${b.stableKey}`,
        { stableKey: b.stableKey, citationExcerpt: b.citationExcerpt.slice(0, 160), gotPhrase: b.citationExcerpt.slice(0, 80) },
        "MEDIUM",
      );
    }
  }

  // Ratio direction sanity
  for (const r of args.result.ratios) {
    for (const th of r.thresholds ?? []) {
      if (th.direction === "MAX" && th.headroomCanonical != null && Number(th.headroomCanonical) < 0 && r.canonical != null) {
        // Headroom negative under MAX means breach — not an error by itself
      }
      if (th.direction !== "MAX" && th.direction !== "MIN") {
        push("CALCULATION_MISMATCH", `invalid ratio direction for ${r.ratioKey}`, { ratioKey: r.ratioKey, got: th.direction }, "HIGH");
      }
    }
  }

  // Definition term presence (soft): if definition exists but no basket/ratio cites the term
  for (const def of args.definitions) {
    if (!def.term || def.term.length < 4) continue;
    const term = norm(def.term);
    const cited =
      baskets.some((b) => norm(b.citationExcerpt).includes(term)) ||
      args.result.ratios.some((r) => norm(r.definitionExcerpt ?? "").includes(term));
    if (!cited && /permitted|leverage|coverage|ebitda|fixed charge/i.test(def.term)) {
      push(
        "DISCOVERY_GAP",
        `definition "${def.term}" not cited in computation`,
        {
          definitionId: def.definitionId,
          expectedPhrase: def.term,
          citationExcerpt: (def.body ?? "").slice(0, 160),
        },
        "LOW",
      );
    }
  }

  // Conditions without matching basket mention → coverage note
  for (const cond of args.conditions.slice(0, 50)) {
    if (!cond.excerpt || cond.excerpt.length < 40) continue;
    // Keep light — do not flood ledger; only when kind suggests covenant gate
    if (cond.kind && /exception|proviso|carve.?out/i.test(cond.kind)) {
      const snippet = norm(cond.excerpt).slice(0, 30);
      const hit = baskets.some((b) => norm(b.citationExcerpt).includes(snippet));
      if (!hit) {
        // Skip mass noise: only record if we already have other errors for this source
        // (caller can filter). Record as LOW COVERAGE_GAP with NEEDS_INPUT framing.
        push(
          "COVERAGE_GAP",
          `NEEDS_INPUT: condition/exception ${cond.conditionId} not bound`,
          { conditionId: cond.conditionId, citationExcerpt: cond.excerpt.slice(0, 120) },
          "LOW",
        );
      }
    }
  }

  return errors;
}
