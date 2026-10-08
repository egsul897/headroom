/**
 * Reads retained attempt rows. committedUsd on the Gibraltar verification
 * record is a running total. Incremental cost is the delta. A later row
 * with zero tokens and a zero delta is a refusal, not a priced section
 * and not evidence that the section has no rules.
 */
export interface RetainedCostAttempt {
  ref: string;
  operativeChars: number;
  committedUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  rules: number | null;
  verifyStatus: string | null;
  verifyCostUsd: number | null;
}

export interface IncrementalCost {
  ref: string;
  operativeChars: number;
  incrementalUsd: number | null;
  billing: "EXACT" | "UNKNOWN" | "ZERO_TOKEN_REFUSAL";
  rules: number | null;
  verifyStatus: string | null;
}

export function incrementalCosts(attempts: readonly RetainedCostAttempt[]): IncrementalCost[] {
  let previous = 0;
  return attempts.map((attempt) => {
    if (attempt.committedUsd == null) {
      return { ref: attempt.ref, operativeChars: attempt.operativeChars, incrementalUsd: null, billing: "UNKNOWN", rules: attempt.rules, verifyStatus: attempt.verifyStatus };
    }
    const incrementalUsd = Number((attempt.committedUsd - previous).toFixed(6));
    previous = attempt.committedUsd;
    const tokensKnown = attempt.inputTokens != null && attempt.outputTokens != null;
    if (!tokensKnown) {
      return { ref: attempt.ref, operativeChars: attempt.operativeChars, incrementalUsd, billing: "UNKNOWN", rules: attempt.rules, verifyStatus: attempt.verifyStatus };
    }
    if (attempt.inputTokens === 0 && attempt.outputTokens === 0 && incrementalUsd === 0) {
      return { ref: attempt.ref, operativeChars: attempt.operativeChars, incrementalUsd: 0, billing: "ZERO_TOKEN_REFUSAL", rules: attempt.rules, verifyStatus: attempt.verifyStatus };
    }
    return { ref: attempt.ref, operativeChars: attempt.operativeChars, incrementalUsd, billing: "EXACT", rules: attempt.rules, verifyStatus: attempt.verifyStatus };
  });
}
