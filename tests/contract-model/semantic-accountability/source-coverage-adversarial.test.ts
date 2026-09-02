/**
 * SOURCE COVERAGE - generative red-team suite (repair mission §13).
 *
 * Builds synthetic provisions from structural templates, gives each one a
 * COMPLETE inventory (baseline: zero unaccounted source), then mutates the
 * inventory or the text the way a real Pass A run goes wrong:
 *
 *   delete an item / a condition / an exception / a value-bearing clause,
 *   truncate an item's span, move a value into an expanded definition,
 *   shorten a clause to 15-35 characters, strip operative vocabulary,
 *   rephrase "shall not" into another grammatical form, reorder children.
 *
 * Required outcome: EVERY omission is surfaced as UNACCOUNTED_SOURCE (or, for
 * a moved value, as an unaccounted value). A dangerous false negative is an
 * omission the detector did not surface; the gate is ZERO, over >= 2000 cases.
 *
 * The generator is seeded, so a failure is reproducible from its case index.
 * All text is wholly synthetic: invented parties, metrics, amounts, sections.
 */
import { describe, expect, it } from "vitest";
import { computeSourceCoverage, type AccountingSpanInput } from "../../../lib/contract-model/compiler/semantic-accountability/source-coverage";
import type { SourceContextRegion } from "../../../lib/contract-model/compiler/semantic-accountability/types";

// ---------------------------------------------------------------------------
// seeded generator
// ---------------------------------------------------------------------------

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
}
const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length) % xs.length]!;

const ACTORS = ["The Borrower", "Each Loan Party", "The Parent", "Holdings", "Each Restricted Subsidiary"] as const;
const MODALS = ["shall not", "will not", "may not", "is not permitted to", "agrees not to"] as const;
const VERBS = ["incur Indebtedness", "create Liens", "make Investments", "sell assets", "declare dividends", "prepay Junior Debt", "enter into Sale-Leasebacks"] as const;
const METRICS = ["Zeta Ratio", "Omega Coverage", "Quux Leverage", "Grault Margin"] as const;
const AMOUNTS = ["$4,250,000", "$18,000,000", "$125,500,000", "$900,000"] as const;
const PERCENTS = ["12.5%", "3.25%", "45 basis points"] as const;
const RATIOS = ["2.75 to 1.00", "4.00 to 1.00"] as const;
const DAYSV = ["30 days", "ninety (90) days", "5 business days"] as const;
const DATES = ["March 31, 2030", "December 15, 2028"] as const;
const PERIODS = ["6 months", "four consecutive quarters"] as const;
const MULTS = ["1.75 times", "2.50 times"] as const;
const CONDS = ["no Default has occurred and is continuing", `the ${"Zeta Ratio"} is below the applicable level`, "the Administrative Agent has received an officer certificate"] as const;
const EXCS = ["trade payables incurred in the ordinary course", "Liens for taxes not yet delinquent", "obligations under Hedge Agreements"] as const;

interface Clause { text: string; enumerated: boolean; }

/** Builds a provision as a list of clauses plus the full text; item spans are the clause bodies. */
function buildProvision(r: () => number): { text: string; clauses: { body: string; charStart: number; charEnd: number }[] } {
  const actor = pick(r, ACTORS);
  const modal = pick(r, MODALS);
  const verb = pick(r, VERBS);
  const shape = Math.floor(r() * 4);
  const clauses: Clause[] = [];
  if (shape === 0) {
    // chapeau + enumerated children
    clauses.push({ text: `${actor} ${modal} ${verb} except the following:`, enumerated: false });
    const n = 2 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) clauses.push({ text: `(${"ivxab"[i] ?? "z"}) ${pick(r, EXCS)} up to ${pick(r, AMOUNTS)};`, enumerated: true });
  } else if (shape === 1) {
    // sentence chain with provisos
    clauses.push({ text: `${actor} ${modal} ${verb} in an aggregate amount exceeding ${pick(r, AMOUNTS)}.`, enumerated: false });
    clauses.push({ text: `Such limit applies so long as ${pick(r, CONDS)}.`, enumerated: false });
    clauses.push({ text: `The cure period is ${pick(r, DAYSV)} after notice.`, enumerated: false });
  } else if (shape === 2) {
    // definition-style with formula components
    clauses.push({ text: `"${pick(r, METRICS)}" means Consolidated Net Income for such period.`, enumerated: false });
    clauses.push({ text: `The step-down is ${pick(r, PERCENTS)} per annum.`, enumerated: false });
    clauses.push({ text: `The threshold ratio is ${pick(r, RATIOS)}.`, enumerated: false });
  } else {
    // line-broken reporting block
    clauses.push({ text: `${actor} shall furnish each of the following:`, enumerated: false });
    clauses.push({ text: `Annual statements within ${pick(r, DAYSV)} after year end.`, enumerated: false });
    clauses.push({ text: `The availability period is ${pick(r, PERIODS)}.`, enumerated: false });
    clauses.push({ text: `All Loans mature on ${pick(r, DATES)}.`, enumerated: false });
    clauses.push({ text: `The incremental amount is ${pick(r, MULTS)} of the Metric.`, enumerated: false });
  }
  const sep = shape === 3 ? "\n" : " ";
  let text = "";
  const out: { body: string; charStart: number; charEnd: number }[] = [];
  for (const c of clauses) {
    if (text.length > 0) text += sep;
    const start = text.length;
    text += c.text;
    out.push({ body: c.text, charStart: start, charEnd: text.length });
  }
  return { text, clauses: out };
}

const regionOf = (regionId: string, text: string, kind: SourceContextRegion["kind"] = "OPERATIVE"): SourceContextRegion => ({
  regionId, kind, documentId: "d", sourceNodeId: null, sectionRef: null, charStart: 0, charEnd: text.length, text, expandedFor: null, truncatedAtBudget: false, unitExtension: null,
});

const MUTATIONS = ["DELETE_CLAUSE", "DELETE_CONDITION", "DELETE_EXCEPTION", "TRUNCATE_SPAN", "SHORTEN_CLAUSE", "STRIP_VOCABULARY", "REPHRASE_MODAL", "REORDER_CHILDREN", "MOVE_VALUE_TO_EXPANSION", "DELETE_VALUE_CLAUSE"] as const;
type Mutation = (typeof MUTATIONS)[number];

interface Case {
  index: number;
  mutation: Mutation;
  regions: SourceContextRegion[];
  spans: AccountingSpanInput[];
  /** The source the mutation removed from the inventory's reach. */
  omitted: { regionId: string; text: string };
  /** True when the omission is a value that moved into another region. */
  valueOnly: boolean;
}

function buildCase(index: number): Case {
  const r = rng(index * 2654435761 + 12345);
  const mutation = MUTATIONS[index % MUTATIONS.length]!;
  let { text, clauses } = buildProvision(r);

  // Text-level mutations first - the detector must not care how the sentence is worded.
  if (mutation === "STRIP_VOCABULARY") {
    text = text.replace(/shall not|will not|may not|is not permitted to|agrees not to/g, "refrains from any").replace(/shall /g, "does ");
    clauses = relocate(text, clauses);
  } else if (mutation === "REPHRASE_MODAL") {
    text = text.replace(/shall not|will not|may not/g, "is prohibited from any act to");
    clauses = relocate(text, clauses);
  } else if (mutation === "SHORTEN_CLAUSE") {
    const i = 1 + Math.floor(r() * Math.max(1, clauses.length - 1));
    const target = clauses[Math.min(i, clauses.length - 1)]!;
    const short = "No Liens are allowed.";
    text = text.slice(0, target.charStart) + short + text.slice(target.charEnd);
    clauses = relocate(text, clauses.map((c, k) => (k === Math.min(i, clauses.length - 1) ? { ...c, body: short } : c)));
  } else if (mutation === "REORDER_CHILDREN") {
    const enumerated = clauses.filter((c) => /^\(/.test(c.body));
    if (enumerated.length >= 2) {
      const bodies = enumerated.map((c) => c.body).reverse();
      let rebuilt = text.slice(0, enumerated[0]!.charStart);
      enumerated.forEach((c, k) => { rebuilt += bodies[k]! + (k < enumerated.length - 1 ? " " : ""); });
      rebuilt += text.slice(enumerated[enumerated.length - 1]!.charEnd);
      text = rebuilt;
      clauses = relocate(text, clauses.map((c, k) => { const e = enumerated.indexOf(c); return e >= 0 ? { ...c, body: bodies[e]! } : c; }));
    }
  }

  const regions: SourceContextRegion[] = [regionOf("operative", text)];
  const anchored = clauses.map((c) => ({ ...c }));

  // Inventory-level mutations.
  let omittedIndex = -1;
  let valueOnly = false;
  if (mutation === "MOVE_VALUE_TO_EXPANSION") {
    const xref = `Permitted Amount means an amount not to exceed ${pick(r, AMOUNTS)} in the aggregate.`;
    regions.push(regionOf("xref-0", xref, "CROSS_REFERENCE_EXPANSION"));
    valueOnly = true;
    return { index, mutation, regions, spans: spansFor(text, anchored), omitted: { regionId: "xref-0", text: xref }, valueOnly };
  }
  if (mutation === "DELETE_CONDITION") omittedIndex = anchored.findIndex((c) => /so long as|no Default|officer certificate/.test(c.body));
  else if (mutation === "DELETE_EXCEPTION") omittedIndex = anchored.findIndex((c) => /^\(/.test(c.body));
  else if (mutation === "DELETE_VALUE_CLAUSE") omittedIndex = anchored.findIndex((c) => /\$|%|to 1\.00|days|months|quarters|times|20\d\d/.test(c.body));
  if (omittedIndex < 0) omittedIndex = anchored.length - 1;

  if (mutation === "TRUNCATE_SPAN") {
    const target = anchored[omittedIndex]!;
    const keep = Math.max(1, Math.floor(target.body.length * 0.4));
    const dropped = target.body.slice(keep);
    const spans = spansFor(text, anchored.map((c, k) => (k === omittedIndex ? { ...c, body: c.body.slice(0, keep) } : c)));
    return { index, mutation, regions, spans, omitted: { regionId: "operative", text: dropped }, valueOnly: false };
  }
  const omitted = anchored[omittedIndex]!;
  const spans = spansFor(text, anchored.filter((_, k) => k !== omittedIndex));
  return { index, mutation, regions, spans, omitted: { regionId: "operative", text: omitted.body }, valueOnly: false };
}

/** Re-locates clause bodies in a rewritten text (bodies that no longer appear are dropped). */
function relocate(text: string, clauses: { body: string; charStart: number; charEnd: number }[]) {
  const out: { body: string; charStart: number; charEnd: number }[] = [];
  let cursor = 0;
  for (const c of clauses) {
    const i = text.indexOf(c.body, cursor);
    if (i < 0) continue;
    out.push({ body: c.body, charStart: i, charEnd: i + c.body.length });
    cursor = i + c.body.length;
  }
  return out;
}

function spansFor(text: string, clauses: { body: string }[]): AccountingSpanInput[] {
  const out: AccountingSpanInput[] = [];
  let cursor = 0;
  for (const c of clauses) {
    const i = text.indexOf(c.body, cursor);
    if (i < 0) continue;
    out.push({ regionId: "operative", charStart: i, charEnd: i + c.body.length, materiality: "CRITICAL" });
    cursor = i + c.body.length;
  }
  return out;
}

/** Did the detector surface this omission? Text omissions must appear in unaccounted source; a moved value must appear as an unaccounted value. */
function surfaced(c: Case, cov: ReturnType<typeof computeSourceCoverage>): boolean {
  if (c.valueOnly) return cov.unaccountedValues.some((v) => v.regionId === c.omitted.regionId) || cov.unaccounted.some((s) => s.regionId === c.omitted.regionId);
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const target = norm(c.omitted.text).replace(/^[^A-Za-z0-9]+/, "");
  const words = target.split(" ").filter((w) => /[A-Za-z]{4,}/.test(w));
  if (words.length === 0) return true; // nothing but structure was removed
  const blob = norm(cov.unaccounted.map((s) => s.excerpt).join(" ⋮ "));
  // Every content word of the omitted clause must be somewhere in the surfaced text.
  return words.every((w) => blob.includes(w));
}

const CASE_COUNT = 2400;

describe("source coverage - generative red team (mission §13)", () => {
  it(`surfaces every injected omission across ${CASE_COUNT} generated cases: zero dangerous false negatives`, () => {
    const misses: { index: number; mutation: Mutation; omitted: string; surfacedText: string }[] = [];
    const byMutation = new Map<Mutation, { n: number; missed: number }>();
    for (let i = 0; i < CASE_COUNT; i++) {
      const c = buildCase(i);
      const cov = computeSourceCoverage({ regions: c.regions, spans: c.spans });
      const stat = byMutation.get(c.mutation) ?? { n: 0, missed: 0 };
      stat.n++;
      if (!surfaced(c, cov)) {
        stat.missed++;
        if (misses.length < 8) misses.push({ index: i, mutation: c.mutation, omitted: c.omitted.text.slice(0, 120), surfacedText: cov.unaccounted.map((s) => s.excerpt).join(" ⋮ ").slice(0, 200) });
      }
      byMutation.set(c.mutation, stat);
    }
    // Every mutation family is actually exercised - a gate that never ran is not a gate.
    for (const m of MUTATIONS) expect(byMutation.get(m)?.n ?? 0, `mutation ${m} was never generated`).toBeGreaterThan(100);
    expect(misses, `dangerous false negatives: ${JSON.stringify(misses, null, 1)}`).toEqual([]);
  });

  it("the unmutated baseline is fully accounted: the generator does not manufacture its own gaps", () => {
    let dirty = 0;
    const examples: string[] = [];
    for (let i = 0; i < 600; i++) {
      const r = rng(i * 2654435761 + 12345);
      const { text, clauses } = buildProvision(r);
      const cov = computeSourceCoverage({ regions: [regionOf("operative", text)], spans: spansFor(text, clauses) });
      if (cov.unaccounted.length > 0 || cov.unaccountedValues.length > 0) {
        dirty++;
        if (examples.length < 5) examples.push(`#${i}: ${cov.unaccounted.map((s) => s.excerpt).join(" ⋮ ")} | values ${cov.unaccountedValues.map((v) => v.rawText).join(",")}`);
      }
    }
    expect(dirty, `false gaps on unmutated provisions: ${examples.join("\n")}`).toBe(0);
  });

  it("is deterministic: the same case index produces the same verdict on every run", () => {
    for (const i of [7, 101, 999, 1777]) {
      const a = buildCase(i);
      const b = buildCase(i);
      expect(JSON.stringify(computeSourceCoverage({ regions: a.regions, spans: a.spans }))).toBe(JSON.stringify(computeSourceCoverage({ regions: b.regions, spans: b.spans })));
    }
  });
});
