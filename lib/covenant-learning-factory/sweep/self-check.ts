/**
 * Mechanical self-check: cross-validate computed results against Neon
 * kf_precedent signals (and engine consistency). This is NOT independent legal
 * adjudication — disagreements feed the learning ledger for mechanical replay.
 * Unresolved → NEEDS_INPUT. Never invents values.
 */

import { createHash } from "node:crypto";
import type { ComputationResult } from "../../contract-model/covenant-computation/types";
import type { LearningErrorRecord } from "../types";
import { AMBIGUOUS, type TreeLocator } from "./tree-locator";

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

/** self-check.ts omission path: zero baskets bound for a source that has precedent candidates. */
export const COVERAGE_GAP_OMISSION_PREFIX = "NEEDS_INPUT: omission ";
/** self-check.ts condition path: exception / proviso / carve-out excerpt not in any citation. */
export const COVERAGE_GAP_CONDITION_PREFIX = "NEEDS_INPUT: condition/exception ";

function eid(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 20);
}

export function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * A precedent excerpt is reflected in a citation when either opening sits in the
 * other text, or the citation's body after its heading, exception introducer, or
 * enumerated marker sits in the excerpt.
 *
 * Checking only the first 40 characters misses a limb the citation still contains
 * once extraction prepends "Section 6.01…" or "except:". The limb is the text the
 * precedent candidate stored.
 */
export function excerptReflectedInCitation(excerpt: string, cite: string): boolean {
  if (excerpt.length < 24 || cite.length < 24) return false;
  const needle = excerpt.slice(0, Math.min(40, excerpt.length));
  if (cite.includes(needle)) return true;
  for (const anchor of citationAnchors(cite)) {
    if (excerpt.includes(anchor)) return true;
  }
  return false;
}

function citationAnchors(cite: string, width = 40): string[] {
  const anchors: string[] = [];
  const push = (value: string) => {
    const anchor = value.slice(0, Math.min(width, value.length));
    if (anchor.length >= 24 && !anchors.includes(anchor)) anchors.push(anchor);
  };
  push(cite);
  const head = cite.slice(0, 240);
  const markerScan = cite.slice(0, 4000);
  let rest = head;
  const heading = /^(?:§\s*)?(?:section\s+)?\d{1,2}\.\d{1,2}\.?\s+[^.]{0,120}\.\s+/i.exec(rest);
  if (heading && heading.index === 0) {
    rest = rest.slice(heading[0].length);
    push(rest);
  }
  const intro = /^(?:provided\s*,\s*however\s*,\s*that|except\s*:|;?\s*provided that)\s*:?\s*/i.exec(rest);
  if (intro && intro.index === 0) {
    rest = rest.slice(intro[0].length);
    push(rest);
  }
  for (const match of markerScan.matchAll(/\([0-9a-z]{1,6}\)\s+/gi)) {
    if (match.index == null || match.index === 0) continue;
    push(cite.slice(match.index));
  }
  return anchors;
}

/**
 * Strict reflection (reviewer FAIL on #363 @ b966c306): a text fragment alone is not
 * evidence that a basket reflects a precedent candidate. Generic openers ("the borrower
 * will not, and will not permit any subsidiary to…") occur in every negative covenant,
 * so they matched 6.04 → 6.03, 2.09 → 2.28, 6.07 → 6.01.
 *
 * A match now requires BOTH
 *   1. a non-generic text anchor (≥ 3 distinctive tokens), and
 *   2. structural agreement: the same section number when both sides carry one;
 *      otherwise the same canonical covenant family (never OTHER/UNKNOWN).
 * Anything else fails closed (counts as not reflected).
 */
const GENERIC_TOKENS = new Set(
  ("the a an and or of to in on for by with any all each such other than this that which " +
    "borrower borrowers company issuer guarantor guarantors parent holdings loan party parties " +
    "subsidiary subsidiaries restricted will shall not may permit cause directly indirectly " +
    "create incur assume suffer exist existence remain outstanding following except provided however " +
    "section article agreement credit hereunder herein thereof respect its their be is are " +
    "indebtedness debt liens lien investments investment payment payments make made").split(/\s+/),
);

export function distinctiveTokenCount(fragment: string): number {
  const toks = fragment.toLowerCase().match(/[a-z][a-z'-]{2,}|\$?[0-9][0-9,.%]*/g) ?? [];
  // last token may be cut mid-word; ignore it
  return new Set(toks.filter((t) => !GENERIC_TOKENS.has(t))).size;
}

export function isGenericAnchor(fragment: string): boolean {
  return distinctiveTokenCount(fragment) < 3;
}

const SECTION_NUM = /(?:^|§\s*|section\s+)(\d{1,2}\.\d{1,3})\b/i;

/** Section number ("6.04") from a sectionRef, else from the text's leading heading. */
export function sectionNumberOf(sectionRef: string | null | undefined, text: string): string | null {
  const fromRef = sectionRef ? SECTION_NUM.exec(sectionRef.trim()) : null;
  if (fromRef) return normalizeSectionNumber(fromRef[1]!);
  const lead = /^\s*(?:§\s*)?(?:section\s+)?(\d{1,2}\.\d{1,3})\b/i.exec(text);
  return lead ? normalizeSectionNumber(lead[1]!) : null;
}

function normalizeSectionNumber(n: string): string {
  const [a, b] = n.split(".");
  return `${Number(a)}.${Number(b)}`;
}

/** Canonical covenant family across precedent-candidate and extractor vocabularies. */
export function canonicalFamily(f: string | null | undefined): string | null {
  const t = (f ?? "").toUpperCase();
  if (!t) return null;
  if (/LIEN/.test(t)) return "LIENS";
  if (/INVEST/.test(t)) return "INVESTMENTS";
  if (/RESTRICTED_PAYMENT|DIVIDEND/.test(t)) return "RESTRICTED_PAYMENTS";
  if (/ASSET_SALE|DISPOSITION/.test(t)) return "ASSET_SALES";
  if (/JUNIOR|PREPAY/.test(t)) return "PREPAYMENTS";
  if (/INDEBTEDNESS|DEBT/.test(t)) return "DEBT";
  if (/FINANCIAL|RATIO/.test(t)) return "FINANCIAL_COVENANTS";
  if (/FUNDAMENTAL|MERGER/.test(t)) return "FUNDAMENTAL_CHANGES";
  if (/AFFILIATE/.test(t)) return "AFFILIATES";
  return null;
}

/** Share of the candidate text the citation covers: 1 when the citation contains it, else the
 *  fraction for a contained fragment, else 0 (anchor-only overlap is never full coverage). */
export function citeCoverage(excerpt: string, cite: string): number {
  if (cite.includes(excerpt)) return 1;
  if (excerpt.includes(cite)) return cite.length / Math.max(1, excerpt.length);
  return 0;
}

function strictTextReflected(excerpt: string, cite: string): boolean {
  if (excerpt.length < 24 || cite.length < 24) return false;
  // Whole-text containment is not a fragment match: a short limb that appears in full is reflected.
  if (cite.includes(excerpt) || excerpt.includes(cite)) return true;
  // Fragment anchors: judge distinctiveness on the full shared run, not a fixed 40-char window.
  const excerptStart = cite.indexOf(excerpt.slice(0, 24));
  if (excerptStart >= 0 && sharedRunDistinctive(excerpt, 0, cite, excerptStart)) return true;
  for (const anchor of citationAnchors(cite, 24)) {
    const at = excerpt.indexOf(anchor);
    if (at < 0) continue;
    const citeAt = cite.indexOf(anchor);
    if (sharedRunDistinctive(excerpt, at, cite, citeAt)) return true;
  }
  return false;
}

function sharedRunDistinctive(a: string, ai: number, b: string, bi: number): boolean {
  let k = 0;
  while (ai + k < a.length && bi + k < b.length && a[ai + k] === b[bi + k]) k++;
  const run = a.slice(ai, ai + k);
  // The run covers the whole remainder of one side: full-limb containment.
  if (run.length >= 24 && (ai + k === a.length || bi + k === b.length) && ai === 0) return true;
  return run.length >= 40 && !isGenericAnchor(run);
}

export function treeMode(): "agree" | "override" {
  return process.env.CLF_SCOREBOARD_TREE_MODE === "override" ? "override" : "agree";
}

export function strictCandidateMatch(
  cand: { excerpt: string; sectionRef: string | null; family: string | null; treeSection?: string | null },
  basket: { cite: string; sectionRef: string | null | undefined; family: string | null | undefined; treeSection?: string | null },
): boolean {
  if (!strictTextReflected(cand.excerpt, basket.cite)) return false;
  // Ambiguous tree location (duplicated clause) on EITHER side: reject. Falling back to the other
  // side's location or to the declared section would credit an unproven location.
  if (cand.treeSection === AMBIGUOUS || basket.treeSection === AMBIGUOUS) return false;
  // A basket with no family evidence (OTHER) that captures only a fragment of the candidate is a
  // partial capture, not a match: require it to cover >= 80% of the candidate text.
  if (canonicalFamily(basket.family) == null && citeCoverage(cand.excerpt, basket.cite) < 0.8) return false;
  // Tree location (where the text sits in the parsed document) and the declared section
  // must agree. A basket whose label (e.g. "§7.03 Transactions with Affiliates") disagrees with
  // where its citation actually sits is mislabeled: fail closed rather than let the tree
  // silently relabel it (that relabelling was measured as metric gaming, see
  // docs/clf-scoreboard/section-tree-findings.md).
  const cDecl = sectionNumberOf(cand.sectionRef, cand.excerpt);
  const bDecl = sectionNumberOf(basket.sectionRef, basket.cite);
  // CLF_SCOREBOARD_TREE_MODE=override reproduces the rejected variant (tree relabels; -11 HELDOUT,
  // 0/11 flips genuine — docs/clf-scoreboard/tree-override-flips.jsonl). Default: agree (fail closed).
  if (treeMode() !== "override") {
    if (cand.treeSection && cDecl && cand.treeSection !== cDecl) return false;
    if (basket.treeSection && bDecl && basket.treeSection !== bDecl) return false;
  }
  const cs = cand.treeSection ?? cDecl;
  const bs = basket.treeSection ?? bDecl;
  if (cs && bs) return cs === bs;
  const cf = canonicalFamily(cand.family);
  return cf != null && cf === canonicalFamily(basket.family);
}

/** Prefix-only reflection used before citation anchors. Tests compare the sweep metric against it. */
export function excerptReflectedByPrefixOnly(excerpt: string, cite: string): boolean {
  if (excerpt.length < 24 || cite.length < 24) return false;
  const needle = excerpt.slice(0, Math.min(40, excerpt.length));
  return cite.includes(needle) || excerpt.includes(cite.slice(0, Math.min(40, cite.length)));
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

const basketSectionCache = new WeakMap<object, Map<string, string | null>>();
export function basketTreeSection(loc: TreeLocator, cite: string): string | null {
  let m = basketSectionCache.get(loc);
  if (!m) basketSectionCache.set(loc, (m = new Map()));
  if (!m.has(cite)) m.set(cite, loc.citationSection(cite));
  return m.get(cite)!;
}

/**
 * Diagnostic only (CLF_DIAG=1; never changes counts): why a candidate was not matched.
 *  NOT_IN_TREE       candidate text not locatable in the parsed document
 *  SECTION_EMPTY     located, but no basket cites anything in that tree section
 *  LIMB_MISSING      section has baskets, none shares text with the candidate
 *  BOUNDARY          a basket in the section shares a 24-char run but strict reflection fails
 *  REJECTED_<why>    text reflected by some basket but rejected (AMBIGUOUS / OTHER_PARTIAL / LOCATION / FAMILY)
 */
export function discoveryGapCause(cand: PrecedentCandidate, excerpt: string, candTree: string | null, baskets: ComputationResult["baskets"], loc: TreeLocator | null): string {
  const reflected = baskets.filter((b) => strictTextReflected(excerpt, norm(b.citationExcerpt)));
  if (reflected.length) {
    const b = reflected[0]!;
    const bt = loc ? basketTreeSection(loc, b.citationExcerpt) : null;
    if (candTree === AMBIGUOUS || bt === AMBIGUOUS) return "REJECTED_AMBIGUOUS";
    if (canonicalFamily(b.covenantFamily) == null && citeCoverage(excerpt, norm(b.citationExcerpt)) < 0.8) return "REJECTED_OTHER_PARTIAL";
    const cs = candTree ?? sectionNumberOf(cand.sectionRef ?? null, excerpt), bs = bt ?? sectionNumberOf(b.sectionRef, norm(b.citationExcerpt));
    if (cs && bs) return `REJECTED_LOCATION cand=${cs} basket=${bs} decl=${sectionNumberOf(cand.sectionRef ?? null, excerpt)}/${sectionNumberOf(b.sectionRef, norm(b.citationExcerpt))} bfam=${b.covenantFamily}`;
    return "REJECTED_FAMILY";
  }
  if (!loc || candTree == null) return "NOT_IN_TREE";
  const inSec = baskets.filter((b) => basketTreeSection(loc, b.citationExcerpt) === candTree);
  if (!inSec.length) return `SECTION_EMPTY sec=${candTree}`;
  const grams = new Set<string>();
  for (let i = 0; i + 24 <= excerpt.length; i += 8) grams.add(excerpt.slice(i, i + 24));
  const ov = inSec.find((b) => { const c = norm(b.citationExcerpt); for (const g of grams) if (c.includes(g)) return true; return false; });
  if (ov) return `BOUNDARY sec=${candTree} bfam=${ov.covenantFamily} clen=${excerpt.length} blen=${norm(ov.citationExcerpt).length} cite=${JSON.stringify(norm(ov.citationExcerpt).slice(0, 200))}`;
  if (inSec.length) return `LIMB_MISSING sec=${candTree} n=${inSec.length}`;
  return "LIMB_MISSING";
}

/**
 * PROPOSAL (opt-in, CLF_SCOPE_COVENANT=1; default OFF so the benchmark is unchanged until approved):
 * a DISCOVERY_GAP candidate or condition COVERAGE_GAP is dropped only when the tree locates it in a
 * section that the tree + family classifier positively classify as non-covenant. Unlocated or ambiguous
 * text, or text with no tree, is still counted (fail closed).
 */
/**
 * Is a condition/exception bound by a basket citation?
 * Legacy: the citation contains the condition's first 30 characters. That falsely matches boilerplate
 * openings shared by unrelated clauses ("Except as otherwise provided in ..."), so a condition counted as
 * bound by an unrelated basket.
 * PROPOSAL (CLF_STRICT_CONDITION_MATCH=1, default OFF): use the same distinctive-text reflection the
 * candidate check uses (strictTextReflected: shared run of >= 40 non-generic chars, or a whole limb).
 */
export function conditionBound(condExcerpt: string, cite: string): boolean {
  const c = norm(condExcerpt), b = norm(cite);
  if (process.env.CLF_STRICT_CONDITION_MATCH === "1") return strictTextReflected(c, b);
  return b.includes(c.slice(0, 30));
}

/**
 * Tree binding: a condition/exception is bound when a basket citation overlaps the tree node that
 * holds the condition (the clause the proviso qualifies). Returns null when the tree cannot locate the
 * condition uniquely, so the caller falls back to text matching.
 */
export function conditionBoundByTree(loc: TreeLocator | null | undefined, condExcerpt: string, baskets: ComputationResult["baskets"]): boolean | null {
  if (process.env.CLF_TREE_PROVISO === "0" || !loc?.nodeSpanOf || !loc.textSpanOf) return null;
  const node = loc.nodeSpanOf(condExcerpt);
  if (!node) return null;
  return baskets.some((b) => {
    const sp = loc.textSpanOf!(b.citationExcerpt);
    return !!sp && sp.start < node.end && node.start < sp.end;
  });
}

export function outOfCovenantScope(loc: TreeLocator | null | undefined, section: string | null): boolean {
  if (process.env.CLF_SCOPE_COVENANT !== "1" || !loc?.isCovenantSection) return false;
  return loc.isCovenantSection(section) === false;
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
  /** Section-tree locator (optional). When present, structural agreement uses tree sections. */
  locator?: TreeLocator;
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
      stage: "MECHANICAL_SELF_CHECK",
      evidence: { sourceId: args.sourceId, ...evidence, adjudicationClass: "MECHANICAL_SELF_CHECK" },
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
      `${COVERAGE_GAP_OMISSION_PREFIX}${om.stableKey}`,
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
    const candTree = args.locator ? args.locator.candidateSection(cand) : null;
    const hit = baskets.some((b) =>
      strictCandidateMatch(
        { excerpt, sectionRef: cand.sectionRef ?? null, family: cand.family ?? null, treeSection: candTree },
        {
          cite: norm(b.citationExcerpt),
          sectionRef: b.sectionRef,
          family: b.covenantFamily,
          treeSection: args.locator ? basketTreeSection(args.locator, b.citationExcerpt) : null,
        },
      ),
    );
    if (!hit && outOfCovenantScope(args.locator, candTree)) continue;
    if (!hit) {
      const cause = process.env.CLF_DIAG === "1" ? ` [cause=${discoveryGapCause(cand, excerpt, candTree, baskets, args.locator ?? null)}]` : "";
      push(
        "DISCOVERY_GAP",
        `precedent candidate ${cand.candidateId} family=${cand.family ?? "UNKNOWN"} not reflected in computed baskets${cause}`,
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
      const hit = conditionBoundByTree(args.locator, cond.excerpt, baskets) ?? baskets.some((b) => conditionBound(cond.excerpt!, b.citationExcerpt));
      if (!hit && outOfCovenantScope(args.locator, args.locator ? args.locator.citationSection(cond.excerpt) : null)) continue;
      if (!hit) {
        // Skip mass noise: only record if we already have other errors for this source
        // (caller can filter). Record as LOW COVERAGE_GAP with NEEDS_INPUT framing.
        push(
          "COVERAGE_GAP",
          `${COVERAGE_GAP_CONDITION_PREFIX}${cond.conditionId} not bound`,
          { conditionId: cond.conditionId, citationExcerpt: cond.excerpt.slice(0, 120) },
          "LOW",
        );
      }
    }
  }

  return errors;
}
