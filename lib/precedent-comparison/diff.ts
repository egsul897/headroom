/**
 * Exact textual differences — deterministic, no LLM.
 *
 * Algorithms:
 * - token-lcs.v1: full token LCS (O(n*m) memory) for small texts
 * - token-lcs-bounded.v1: prefix+suffix window when tokens exceed bound
 * - myers-line.v1: line-oriented Myers O(ND) for large authentic provisions
 *
 * Selection is automatic via exactTextDiff(); callers may force an algorithm.
 */
import { normalizeText, tokenizeSource, jaccard } from "./knowledge";
import type { DiffAlgorithm, ExactTextDiff, ExactTextDiffHunk } from "./types";

const DEFAULT_TOKEN_BOUND = 400;
const MYERS_LINE_THRESHOLD_TOKENS = 800;

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

function boundTokens(tokens: string[], max: number): { tokens: string[]; bounded: boolean } {
  if (tokens.length <= max) return { tokens, bounded: false };
  const half = Math.floor(max / 2);
  return { tokens: [...tokens.slice(0, half), "…", ...tokens.slice(-half)], bounded: true };
}

/** Bounded-memory Myers line diff (O(ND) time, O(N) frontier). */
export function myersLineDiff(leftLines: string[], rightLines: string[]): ExactTextDiffHunk[] {
  const a = leftLines;
  const b = rightLines;
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const offset = max;
  const v = new Array<number>(2 * max + 1).fill(0);
  const trace: number[][] = [];

  for (let d = 0; d <= max; d++) {
    const vSnap = v.slice();
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!)) x = v[offset + k + 1]!;
      else x = v[offset + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        trace.push(vSnap);
        return backtrackMyers(a, b, trace, d, offset);
      }
    }
    trace.push(vSnap);
  }
  return [{ kind: "EQUAL", text: a.join("\n") }];
}

function backtrackMyers(a: string[], b: string[], trace: number[][], dFinal: number, offset: number): ExactTextDiffHunk[] {
  const hunks: ExactTextDiffHunk[] = [];
  let x = a.length;
  let y = b.length;
  for (let d = dFinal; d >= 0; d--) {
    const v = trace[d]!;
    const k = x - y;
    const prevK = k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!) ? k + 1 : k - 1;
    const prevX = v[offset + prevK]!;
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      hunks.unshift({ kind: "EQUAL", text: a[x - 1]! });
      x--;
      y--;
    }
    if (d === 0) break;
    if (x === prevX) {
      hunks.unshift({ kind: "INSERT", text: b[prevY]! });
      y = prevY;
    } else {
      hunks.unshift({ kind: "DELETE", text: a[prevX]! });
      x = prevX;
    }
  }
  // merge adjacent
  const merged: ExactTextDiffHunk[] = [];
  for (const h of hunks) {
    const last = merged[merged.length - 1];
    if (last && last.kind === h.kind) last.text = `${last.text}\n${h.text}`;
    else merged.push({ ...h });
  }
  return merged;
}

export interface ExactTextDiffOptions {
  algorithm?: DiffAlgorithm | "auto";
  tokenBound?: number;
}

export function exactTextDiff(
  leftProvisionId: string,
  leftText: string,
  rightProvisionId: string,
  rightText: string,
  options: ExactTextDiffOptions = {},
): ExactTextDiff {
  const leftNormalized = normalizeText(leftText);
  const rightNormalized = normalizeText(rightText);
  const leftTokensFull = tokenizeSource(leftNormalized);
  const rightTokensFull = tokenizeSource(rightNormalized);
  const bound = options.tokenBound ?? DEFAULT_TOKEN_BOUND;
  let algorithm = options.algorithm ?? "auto";

  if (algorithm === "auto") {
    if (leftTokensFull.length * rightTokensFull.length > MYERS_LINE_THRESHOLD_TOKENS * MYERS_LINE_THRESHOLD_TOKENS) {
      algorithm = "myers-line.v1";
    } else if (leftTokensFull.length > bound || rightTokensFull.length > bound) {
      algorithm = "token-lcs-bounded.v1";
    } else {
      algorithm = "token-lcs.v1";
    }
  }

  if (algorithm === "myers-line.v1") {
    const leftLines = leftNormalized.split(/\n+/).filter(Boolean);
    const rightLines = rightNormalized.split(/\n+/).filter(Boolean);
    const hunks = myersLineDiff(leftLines, rightLines);
    return {
      leftProvisionId,
      rightProvisionId,
      algorithm,
      leftNormalized,
      rightNormalized,
      hunks,
      tokenJaccard: jaccard(leftTokensFull, rightTokensFull),
      identical: leftNormalized === rightNormalized,
      comparedTokenCount: { left: leftLines.length, right: rightLines.length },
      bounded: false,
    };
  }

  const leftBound = algorithm === "token-lcs-bounded.v1" ? boundTokens(leftTokensFull, bound) : { tokens: leftTokensFull, bounded: false };
  const rightBound = algorithm === "token-lcs-bounded.v1" ? boundTokens(rightTokensFull, bound) : { tokens: rightTokensFull, bounded: false };
  const dp = lcsTable(leftBound.tokens, rightBound.tokens);
  const hunks = backtrackHunks(leftBound.tokens, rightBound.tokens, dp);
  return {
    leftProvisionId,
    rightProvisionId,
    algorithm: leftBound.bounded || rightBound.bounded ? "token-lcs-bounded.v1" : "token-lcs.v1",
    leftNormalized,
    rightNormalized,
    hunks,
    tokenJaccard: jaccard(
      leftBound.tokens.filter((t) => t !== "…"),
      rightBound.tokens.filter((t) => t !== "…"),
    ),
    identical: leftNormalized === rightNormalized,
    comparedTokenCount: { left: leftBound.tokens.length, right: rightBound.tokens.length },
    bounded: leftBound.bounded || rightBound.bounded,
  };
}

/** Benchmark helper used by tests/scripts — deterministic, no I/O. */
export function benchmarkDiff(
  leftText: string,
  rightText: string,
  algorithms: DiffAlgorithm[] = ["token-lcs.v1", "token-lcs-bounded.v1", "myers-line.v1"],
): Array<{ algorithm: DiffAlgorithm; ms: number; hunkCount: number; bounded: boolean }> {
  const out: Array<{ algorithm: DiffAlgorithm; ms: number; hunkCount: number; bounded: boolean }> = [];
  for (const algorithm of algorithms) {
    const t0 = performance.now();
    const diff = exactTextDiff("bench-l", leftText, "bench-r", rightText, {
      algorithm,
      tokenBound: algorithm === "token-lcs.v1" ? Number.MAX_SAFE_INTEGER : DEFAULT_TOKEN_BOUND,
    });
    const t1 = performance.now();
    out.push({ algorithm, ms: t1 - t0, hunkCount: diff.hunks.length, bounded: diff.bounded });
  }
  return out;
}

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
