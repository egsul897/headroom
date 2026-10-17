/**
 * Issuer-generalized capture rules (v2 learner).
 *
 * Why: the v1 learner turned one precedent item into one literal regex (its own opening words, section number,
 * party names and page furniture). With the scoreboard's self-credit guard on, those rules earn no credit outside
 * the document they were copied from. This learner instead:
 *   1. abstracts each seed opening over grammar slots (dollar amount, percentage, ratio, section/clause reference,
 *      capitalised defined term), drops enumerators and bare numbers, and keeps only the legal wording;
 *   2. clusters slot skeletons and accepts a skeleton only when items from at least `minIssuers` different issuers
 *      share it (the longest shared prefix wins, so a rule is as specific as its independent support allows);
 *   3. records every supporting document in `provenance.packageKeys`, so the scoreboard guard refuses credit in
 *      all of them (a rule can only score in documents it was not built from);
 *   4. leaves acceptance to issuer-held-out validation (`heldOutAcceptance`): a rule is kept only if, scored on
 *      issuers that did not support it, it credits at least one gap and adds no unsupported-semantics error.
 *
 * Deterministic: no model or API calls, no per-issuer branches, stable ids from the skeleton.
 */

import { createHash } from "node:crypto";
import type { LearnedRule, LearnedRuleSet } from "./types";
import { AUTHORITY_STATUS, LEARNED_RULES_SCHEMA } from "./types";

export const GENERALIZE_V2_NOTE = "issuer-generalized v2";

/** CIK → issuer name, and fixture slug → issuer name (e.g. from the DEV manifest's devIssuerCiks). */
export interface IssuerAliases {
  byCik: Record<string, string>;
  bySlug: Record<string, string>;
}

const normCikKey = (c: string | null | undefined) => (c ?? "").replace(/\D/g, "").replace(/^0+/, "");

/** Build aliases from manifest-style entries: a slug maps to an issuer when it equals the issuer name or starts a word of its evidence. */
export function issuerAliases(entries: ReadonlyArray<{ cik: string; issuer: string; evidence?: string }>, slugs: readonly string[]): IssuerAliases {
  const byCik: Record<string, string> = {};
  for (const e of entries) if (normCikKey(e.cik)) byCik[normCikKey(e.cik)] = e.issuer.toUpperCase();
  const bySlug: Record<string, string> = {};
  for (const slug of [...new Set(slugs.map((s) => s.toLowerCase()))].sort()) {
    const hit = entries.find(
      (e) => e.issuer.toLowerCase() === slug || (slug.length >= 3 && new RegExp(`(?:^|[^a-z])${slug}`, "i").test(e.evidence ?? "")),
    );
    if (hit) bySlug[slug] = hit.issuer.toUpperCase();
  }
  return { byCik, bySlug };
}

/** Fixture family slug of a source id ("fixture:conmed-2025-…" → "conmed", "fdp:CHWY-2026-CA" → "chwy"). */
export function fixtureSlug(sourceId: string): string | null {
  const m = /^(?:fixture|fdp):([A-Za-z]+)/.exec(sourceId);
  return m ? m[1]!.toLowerCase() : null;
}

/**
 * Independent-issuer key: the aliased issuer for the CIK, else the ticker, else the aliased fixture slug, else the
 * raw CIK / slug. Two rows of one company (ticker-less and ticker rows, a second CIK, a fixture) get one key.
 */
export function issuerKey(source: { sourceId: string; issuerCik?: string | null; ticker?: string | null }, aliases?: IssuerAliases): string {
  const cik = normCikKey(source.issuerCik);
  if (cik && aliases?.byCik[cik]) return `I:${aliases.byCik[cik]}`;
  const t = source.ticker ? source.ticker.toUpperCase().replace(/_(?:ALT|SEL)$/, "") : null;
  if (t) return `I:${t}`;
  const slug = fixtureSlug(source.sourceId);
  if (slug && aliases?.bySlug[slug]) return `I:${aliases.bySlug[slug]}`;
  if (cik) return `C:${cik}`;
  return slug ? `F:${slug.toUpperCase()}` : `S:${source.sourceId}`;
}

export interface SkeletonToken {
  /** Signature id: "W:word", "SLOT:AMOUNT", ... */
  id: string;
  pattern: string;
  literal: boolean;
}

/** Function words: capitalised at a sentence start they are wording, not a defined term. */
const COMMON = new Set(
  (
    "a an and any as at be by each either every for from if in into is it its may neither no nor not notwithstanding of on or " +
    "other provided shall so subject such that the then there these this those to under unless upon where whether which " +
    "with without all except in no event none nothing such until after before during"
  ).split(" "),
);
const STOP = new Set(
  "a an and any as at be by for from in into is it its of on or such that the this to with all each".split(" "),
);

const ENUM = String.raw`\((?:[a-z]{1,3}|[ivxl]{1,6}|\d{1,2})\)`;
const SLOTS: ReadonlyArray<{ id: string; re: RegExp; pattern: string }> = [
  {
    id: "SECREF",
    re: /^(?:sections?|articles?|clauses?|subsections?)\s+(?:\d{1,2}(?:\.\d{1,3})*[a-z]?|[ivxl]{1,6}\b)(?:\s*\((?:[a-z]{1,3}|[ivxl]{1,6}|\d{1,2})\))*/i,
    pattern: String.raw`(?:[Ss]ections?|SECTIONS?|[Aa]rticles?|ARTICLES?|[Cc]lauses?|[Ss]ubsections?)\s+(?:\d{1,2}(?:\.\d{1,3})*[a-z]?|[IVXLivxl]{1,6}\b)(?:\s*${ENUM})*`,
  },
  {
    id: "AMOUNT",
    re: /^\$\s*\d[\d,]*(?:\.\d+)?(?:\s*(?:million|billion))?/i,
    pattern: String.raw`\$\s*\d[\d,]*(?:\.\d+)?(?:\s*(?:million|billion))?`,
  },
  {
    id: "PERCENT",
    re: /^\d{1,3}(?:\.\d+)?\s*(?:%|percent\b)/i,
    pattern: String.raw`\d{1,3}(?:\.\d+)?\s*(?:%|percent\b)`,
  },
  {
    id: "RATIO",
    re: /^\d{1,2}(?:\.\d{1,2})?\s*(?:to|:)\s*1(?:\.0{1,2})?\b/i,
    pattern: String.raw`\d{1,2}(?:\.\d{1,2})?\s*(?:to|:)\s*1(?:\.0{1,2})?\b`,
  },
];
const TERM_PATTERN = String.raw`[A-Z][A-Za-z0-9'’&-]*(?:\s+(?:of\s+|and\s+|to\s+)?[A-Z][A-Za-z0-9'’&-]*){0,5}`;
/** Between tokens: punctuation, enumerators and bare numbers (page furniture, list labels) are skipped. */
export const GAP = String.raw`(?:[^A-Za-z0-9$%]|${ENUM}|\d{1,4}(?:\.\d{1,3})*){1,12}?`;

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/** Literal word, first letter in either case (sentence starts), rest as written in lower case. */
function wordPattern(w: string): string {
  const lw = w.toLowerCase();
  const first = lw[0]!;
  const head = /[a-z]/.test(first) ? `[${first.toUpperCase()}${first}]` : esc(first);
  return head + esc(lw.slice(1));
}

/** Leading list labels and bare numbers are not wording. */
function stripLead(text: string): string {
  return text.replace(new RegExp(String.raw`^(?:\s|${ENUM}|\d{1,4}(?:\.\d{1,3})*\.?|[-–—•.;:,])+`), "");
}

/** Slot skeleton of an excerpt's opening (at most `maxTokens` tokens). */
export function skeleton(text: string, maxTokens = 16): SkeletonToken[] {
  const s = stripLead(text.replace(/\s+/g, " ").trim()).slice(0, 400);
  const out: SkeletonToken[] = [];
  let i = 0;
  while (i < s.length && out.length < maxTokens) {
    const rest = s.slice(i);
    const skip = new RegExp(String.raw`^(?:[^A-Za-z0-9$%]+|${ENUM}|\d{1,4}(?:\.\d{1,3})*(?![\d%]|\s*(?:%|percent|to\s+1|:\s*1)))`, "i").exec(rest);
    let slotHit = false;
    for (const slot of SLOTS) {
      const m = slot.re.exec(rest);
      if (m && m[0]) {
        out.push({ id: `SLOT:${slot.id}`, pattern: slot.pattern, literal: false });
        i += m[0].length;
        slotHit = true;
        break;
      }
    }
    if (slotHit) continue;
    if (skip && skip[0]) {
      i += skip[0].length;
      continue;
    }
    const w = /^[A-Za-z][A-Za-z'’-]*/.exec(rest);
    if (!w) {
      i += 1;
      continue;
    }
    const word = w[0];
    if (/^[A-Z]/.test(word) && !COMMON.has(word.toLowerCase())) {
      // Capitalised run → one defined-term slot.
      const run = /^[A-Z][A-Za-z0-9'’&-]*(?:\s+(?:of\s+|and\s+|to\s+)?[A-Z][A-Za-z0-9'’&-]*)*/.exec(rest)![0];
      out.push({ id: "SLOT:TERM", pattern: TERM_PATTERN, literal: false });
      i += run.length;
      continue;
    }
    out.push({ id: `W:${word.toLowerCase()}`, pattern: wordPattern(word), literal: true });
    i += word.length;
  }
  return out;
}

export function skeletonPattern(tokens: readonly SkeletonToken[]): string {
  return String.raw`(?<![A-Za-z])` + tokens.map((t) => t.pattern).join(GAP);
}

/** A skeleton is specific enough when it has ≥ minContent non-stopword literal words. */
export function contentWords(tokens: readonly SkeletonToken[]): number {
  return tokens.filter((t) => t.literal && !STOP.has(t.id.slice(2))).length;
}

export interface SeedUnit {
  sourceId: string;
  issuer: string;
  itemId: string;
  kind: "candidate" | "condition" | "definition";
  family: string | null;
  text: string;
}

export interface GeneralizeOptions {
  minIssuers: number;
  /** Minimum aligned tokens in a rule. */
  minTokens: number;
  /** Opening length (tokens) considered per seed. */
  maxTokens: number;
  minContentWords: number;
  /** Max words skipped between two aligned tokens (drafting variation, e.g. "shall not, nor permit any X to,"). */
  maxGapWords: number;
  /** The alignment must start within this many tokens of each seed's opening. */
  maxLeadTokens: number;
  /** Fixed timestamp so the ruleset hash is reproducible. */
  synthesizedAt: string;
}

export const DEFAULT_GENERALIZE_OPTIONS: GeneralizeOptions = {
  minIssuers: 2,
  minTokens: 5,
  maxTokens: 16,
  minContentWords: 3,
  maxGapWords: 3,
  maxLeadTokens: 2,
  synthesizedAt: "1970-01-01T00:00:00.000Z",
};

export interface GeneralizedCandidate {
  rule: LearnedRule;
  signature: string;
  issuers: string[];
  support: SeedUnit[];
}

const ruleIdOf = (signature: string) => `lg2:${createHash("sha256").update(signature).digest("hex").slice(0, 16)}`;

/** Rule step: a token plus whether a few words may be skipped before it. */
interface Step {
  tok: SkeletonToken;
  loose: boolean;
}

const LOOSE_GAP = (n: number) => String.raw`(?:${GAP}[A-Za-z][A-Za-z'’-]*){0,${n}}?${GAP}`;
/** A rule starts at a clause start: document start, after sentence/clause punctuation, a list label or a line break. */
const CLAUSE_START = String.raw`(?<=(?:^|[.;:!?\n]|\((?:[a-z]{1,3}|[ivxl]{1,6}|\d{1,2})\))[\s"“]{0,4})`;

export function stepsPattern(steps: readonly Step[], maxGapWords: number): string {
  return CLAUSE_START + steps.map((st, i) => (i === 0 ? "" : st.loose ? LOOSE_GAP(maxGapWords) : GAP) + st.tok.pattern).join("");
}
export const stepsSignature = (steps: readonly Step[]) => steps.map((st, i) => (i > 0 && st.loose ? "~" : "") + st.tok.id).join(">");

/** Longest common subsequence of two token-id lists under the lead / gap limits; returns aligned steps. */
export function alignSkeletons(a: readonly SkeletonToken[], b: readonly SkeletonToken[], opts: Pick<GeneralizeOptions, "maxGapWords" | "maxLeadTokens">): Step[] {
  const n = a.length;
  const m = b.length;
  // dp[i][j] = best chain length ending at (i, j) with a[i] == b[j], honouring the gap limit; prev for traceback.
  const dp: number[][] = Array.from({ length: n }, () => new Array<number>(m).fill(0));
  const prev: Array<Array<[number, number] | null>> = Array.from({ length: n }, () => new Array<[number, number] | null>(m).fill(null));
  let best = 0;
  let end: [number, number] | null = null;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      if (a[i]!.id !== b[j]!.id) continue;
      let len = i <= opts.maxLeadTokens && j <= opts.maxLeadTokens ? 1 : 0;
      let pv: [number, number] | null = null;
      for (let pi = Math.max(0, i - 1 - opts.maxGapWords); pi < i; pi++) {
        for (let pj = Math.max(0, j - 1 - opts.maxGapWords); pj < j; pj++) {
          if (dp[pi]![pj]! > 0 && dp[pi]![pj]! + 1 > len) {
            len = dp[pi]![pj]! + 1;
            pv = [pi, pj];
          }
        }
      }
      dp[i]![j] = len;
      prev[i]![j] = pv;
      if (len > best) {
        best = len;
        end = [i, j];
      }
    }
  }
  const out: Step[] = [];
  let cur = end;
  while (cur) {
    const [i, j] = cur;
    const p = prev[i]![j];
    out.unshift({ tok: a[i]!, loose: p ? i - p[0] > 1 || j - p[1] > 1 : false });
    cur = p;
  }
  return out;
}

/**
 * Pairwise-align the openings of seeds from different issuers; every alignment that is long and specific enough
 * becomes a candidate skeleton. A candidate's support is every seed whose own opening it matches; it is kept when
 * that support spans ≥ `minIssuers` issuers. Candidates with identical support keep the most specific skeleton.
 */
export function synthesizeIssuerGeneralized(units: readonly SeedUnit[], opts: GeneralizeOptions = DEFAULT_GENERALIZE_OPTIONS): GeneralizedCandidate[] {
  const order = [...units.keys()].sort((x, y) => {
    const a = units[x]!;
    const b = units[y]!;
    return a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0;
  });
  const us = order.map((k) => units[k]!);
  const sk = us.map((u) => skeleton(u.text, opts.maxTokens));
  const openings = us.map((u) => stripLead(u.text.replace(/\s+/g, " ").trim()).slice(0, 300));
  const proposals = new Map<string, Step[]>();
  for (let x = 0; x < us.length; x++) {
    for (let y = x + 1; y < us.length; y++) {
      if (us[x]!.issuer === us[y]!.issuer) continue;
      const steps = alignSkeletons(sk[x]!, sk[y]!, opts);
      if (steps.length < opts.minTokens || contentWords(steps.map((st) => st.tok)) < opts.minContentWords) continue;
      const sig = stepsSignature(steps);
      if (!proposals.has(sig)) proposals.set(sig, steps);
    }
  }
  const bySupport = new Map<string, { sig: string; steps: Step[]; idx: number[] }>();
  for (const [sig, steps] of [...proposals.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const re = new RegExp(stepsPattern(steps, opts.maxGapWords));
    const idx: number[] = [];
    openings.forEach((o, k) => {
      const m = re.exec(o);
      if (m && m.index <= 40) idx.push(k);
    });
    if (new Set(idx.map((k) => us[k]!.issuer)).size < opts.minIssuers) continue;
    const key = idx.join(",");
    const cur = bySupport.get(key);
    if (!cur || steps.length > cur.steps.length || (steps.length === cur.steps.length && sig < cur.sig)) bySupport.set(key, { sig, steps, idx });
  }
  const out: GeneralizedCandidate[] = [];
  for (const { sig, steps, idx } of [...bySupport.values()].sort((a, b) => (a.sig < b.sig ? -1 : 1))) {
    const support = idx.map((k) => us[k]!);
    const issuers = [...new Set(support.map((u) => u.issuer))].sort();
    const fams = new Map<string, number>();
    for (const u of support) if (u.family) fams.set(u.family, (fams.get(u.family) ?? 0) + 1);
    const family = [...fams.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? "GENERAL_CONDITIONS_AND_EXCEPTIONS";
    const sources = [...new Set(support.map((u) => u.sourceId))].sort();
    out.push({
      signature: sig,
      issuers,
      support,
      rule: {
        ruleId: ruleIdOf(sig),
        version: 1,
        kind: "PHRASE_PATTERN",
        pattern: stepsPattern(steps, opts.maxGapWords),
        effect: { family },
        state: "PROPOSED",
        provenance: {
          ledgerErrorIds: [],
          synthesizedAt: opts.synthesizedAt,
          epoch: 0,
          note: `${GENERALIZE_V2_NOTE}; issuers=${issuers.length}; support=${support.length}`,
          packageKeys: sources.map((s) => `clf-sweep:${s}`),
          sourcesSpanned: sources.length,
          generalized: true,
          normalizedSignature: sig,
        },
      },
    });
  }
  return out;
}

export interface HeldOutRuleStats {
  /** Gaps credited only by this rule, on issuers that did not support it. */
  credited: number;
  /** Unsupported-semantics errors raised by this rule's baskets on those issuers. */
  unsupported: number;
  /** Baskets this rule created on those issuers (fires that became a basket). */
  baskets: number;
  /** Baskets that credited nothing (report-only noise). */
  idle: number;
  heldOutIssuers: number;
}

export interface AcceptancePolicy {
  minCredited: number;
  maxUnsupported: number;
  /** Max share of held-out baskets that credit nothing. */
  maxIdleShare: number;
}

export const DEFAULT_ACCEPTANCE: AcceptancePolicy = { minCredited: 1, maxUnsupported: 0, maxIdleShare: 0.5 };

/** Accept a rule only on issuer-held-out evidence. Never looks at the evaluation split. */
export function heldOutAcceptance(stats: HeldOutRuleStats | undefined, policy: AcceptancePolicy = DEFAULT_ACCEPTANCE): { accepted: boolean; reason: string } {
  if (!stats || stats.heldOutIssuers === 0) return { accepted: false, reason: "no held-out issuer to validate on" };
  if (stats.unsupported > policy.maxUnsupported) return { accepted: false, reason: `adds ${stats.unsupported} unsupported-semantics error(s) on held-out issuers` };
  if (stats.credited < policy.minCredited) return { accepted: false, reason: `credits ${stats.credited} held-out gap(s) (< ${policy.minCredited})` };
  if (stats.baskets > 0 && stats.idle / stats.baskets > policy.maxIdleShare) return { accepted: false, reason: `${stats.idle}/${stats.baskets} held-out baskets credit nothing` };
  return { accepted: true, reason: `credits ${stats.credited} held-out gap(s) on ${stats.heldOutIssuers} issuer(s), 0 unsupported` };
}

export function rulesetOf(rules: LearnedRule[], version: number, updatedAt = "1970-01-01T00:00:00.000Z"): LearnedRuleSet {
  return {
    schemaVersion: LEARNED_RULES_SCHEMA,
    rulesetVersion: version,
    authorityStatus: AUTHORITY_STATUS,
    rules: [...rules].sort((a, b) => (a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0)),
    updatedAt,
  };
}
