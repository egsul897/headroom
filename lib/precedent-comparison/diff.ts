/**
 * Exact textual differences — deterministic token LCS, no LLM.
 */
import { normalizeText, tokenizeSource, jaccard } from "./knowledge";
import type { ExactTextDiff, ExactTextDiffHunk } from "./types";

function lcsTable(a: string[], b: string[]): number[][] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i]![j] = a[i - 1] === b[j - 1] ? (dp[i - 1]![j - 1]! + 1) : Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
    }
  }
  return dp;
}

function backtrackHunks(a: string[], b: string[], dp: number[][]): ExactTextDiffHunk[] {
  const hunks: ExactTextDiffHunk[] = [];
  let i = a.length;
  let j = b.length;
  const push = (kind: ExactTextDiffHunk["kind"], text: string) => {
    const last = hunks[0];
    if (last && last.kind === kind) last.text = `${text} ${last.text}`.replace(/\s+/g, " ").trim();
    else hunks.unshift({ kind, text });
  };
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      push("EQUAL", a[i - 1]!);
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
      push("INSERT", b[j - 1]!);
      j--;
    } else {
      push("DELETE", a[i - 1]!);
      i--;
    }
  }
  return hunks;
}

/**
 * For very long excerpts, compare on a bounded prefix+suffix to keep LCS
 * quadratic cost safe. Full text is still stored on the record for citation.
 */
function boundTokens(tokens: string[], max = 400): string[] {
  if (tokens.length <= max) return tokens;
  const half = Math.floor(max / 2);
  return [...tokens.slice(0, half), "…", ...tokens.slice(-half)];
}

export function exactTextDiff(leftProvisionId: string, leftText: string, rightProvisionId: string, rightText: string): ExactTextDiff {
  const leftNormalized = normalizeText(leftText);
  const rightNormalized = normalizeText(rightText);
  const leftTokens = boundTokens(tokenizeSource(leftNormalized));
  const rightTokens = boundTokens(tokenizeSource(rightNormalized));
  const dp = lcsTable(leftTokens, rightTokens);
  const hunks = backtrackHunks(leftTokens, rightTokens, dp);
  const tokenJaccard = jaccard(leftTokens.filter((t) => t !== "…"), rightTokens.filter((t) => t !== "…"));
  return {
    leftProvisionId,
    rightProvisionId,
    algorithm: "token-lcs.v1",
    leftNormalized,
    rightNormalized,
    hunks,
    tokenJaccard,
    identical: leftNormalized === rightNormalized,
  };
}

/** Conditions / provisos present in one text but not the other (source-supported). */
export function asymmetricPhraseDiff(leftText: string, rightText: string): {
  onlyLeft: string[];
  onlyRight: string[];
} {
  const phrases = [
    /\bprovided(?:\s*,?\s*that|\s+further)[^.;;]{0,160}/gi,
    /\bnotwithstanding[^.;;]{0,120}/gi,
    /\bso long as[^.;;]{0,120}/gi,
    /\bsubject to[^.;;]{0,120}/gi,
    /\bexcept\s+(?:for|that|as)[^.;;]{0,120}/gi,
  ];
  const collect = (text: string): string[] => {
    const out: string[] = [];
    for (const re of phrases) {
      for (const m of text.matchAll(re)) {
        const s = normalizeText(m[0]);
        if (s.length >= 12) out.push(s);
      }
    }
    return out;
  };
  const left = collect(leftText);
  const right = collect(rightText);
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ");
  const rightSet = new Set(right.map(norm));
  const leftSet = new Set(left.map(norm));
  return {
    onlyLeft: left.filter((s) => ![...rightSet].some((r) => r.includes(norm(s).slice(0, 40)) || norm(s).includes(r.slice(0, 40)))),
    onlyRight: right.filter((s) => ![...leftSet].some((l) => l.includes(norm(s).slice(0, 40)) || norm(s).includes(l.slice(0, 40)))),
  };
}
