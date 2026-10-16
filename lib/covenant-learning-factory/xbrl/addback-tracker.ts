/**
 * Add-back tracker — strictly per agreement. Each flag comes from ONE borrower's own EBITDA definition (the optimizer
 * result for that agreement) and ONE issuer's filings, compared period over period (current TTM vs prior-year TTM).
 * No amounts are invented: a category with no exact filed figure is NEEDS_INPUT ("available, check with CFO").
 */
import type { IssuerFinancials } from "./companyfacts";
import type { AddBackCategory, EbitdaOptimization } from "./ebitda-optimizer";

export interface AddBackFlag {
  category: AddBackCategory;
  /** Clause label + excerpt from this agreement's definition. */
  clause: { label: string; text: string };
  cap: { text: string; amount: string | null } | null;
  /** Filed facts backing the line: concept, current TTM value, prior TTM value (null if not filed), period ends. */
  sources: Array<{ concept: string; current: string; prior: string | null; currentPeriodEnd: string | null; priorPeriodEnd: string | null }>;
  status: "DETECTED" | "NEEDS_INPUT";
  /** Amount evidenced for the current TTM (null = NEEDS_INPUT). */
  amount: string | null;
  /** Current minus prior evidenced amount (null when either side is not filed). */
  movement: string | null;
  capHeadroom: string | null;
  /** Contribution to this agreement's EBITDA (amount actually counted after caps). */
  ebitdaDelta: string | null;
  /** maxLeverage × ebitdaDelta (debt capacity added by this line), only when exactly one leverage limit is known. */
  debtCapacityDelta: string | null;
  /** HIGH: exact filed figure fully covers the line. MEDIUM: partly evidenced. LOW: nothing filed — check with CFO. */
  confidence: "HIGH" | "MEDIUM" | "LOW";
  note: string;
  bindingTier?: "CONFIRMED" | "LOWER_CONFIDENCE";
}

const factOf = (fin: IssuerFinancials | null | undefined, concept: string) =>
  fin?.values.find((v) => v.metric === "item" && v.concept === concept) ?? null;

/** Strip optimizer annotations (" (signed, excluded)", " (losses only)") back to the us-gaap concept. */
const baseConcept = (c: string) => c.replace(/\s*\(.*\)\s*$/, "").trim();

function mulLimit(limit: string, v: bigint): bigint {
  const [i, f = ""] = limit.split(".");
  return (BigInt(i! + f) * v) / 10n ** BigInt(f.length);
}

export function trackAddBacks(opt: EbitdaOptimization, current: IssuerFinancials, prior: IssuerFinancials | null, maxLeverage: string | null = null): AddBackFlag[] {
  const lev = maxLeverage && /^\d+(?:\.\d+)?$/.test(maxLeverage) ? maxLeverage : null;
  const flags: AddBackFlag[] = [];
  for (const l of opt.addBacks) {
    // Base / tax / interest / D&A are the definition's core, not discretionary add-backs to track.
    if (l.category === "INTEREST" || l.category === "TAXES" || l.category === "D&A") continue;
    // A discretionary add-back is never sourced from a core concept (interest, income tax, D&A): such a match is a
    // mis-mapping, not evidence of the add-back.
    // A core concept is kept only when the clause itself names that item (a "non-cash charges, including depreciation and
    // amortization" line is evidenced by D&A; "equity interests" is not interest).
    const lineText = l.text.replace(/\b(?:equity|minority|non-?controlling|profits?|ownership|membership|partnership)\s+interests?\b|\binterests\b/gi, " ");
    const coreOk = (concept: string) =>
      /^Interest/.test(concept) ? /\binterest\b/i.test(lineText) :
      /^IncomeTax/.test(concept) ? /\btax(?:es)?\b/i.test(lineText) :
      /^Depreciation/.test(concept) ? /depreciation|amortization|depletion/i.test(lineText) : true;
    const sources = l.concepts.filter((c) => !c.concept.startsWith("borrower:") && coreOk(baseConcept(c.concept))).map((c) => {
      const concept = baseConcept(c.concept);
      const cur = factOf(current, concept), pri = factOf(prior, concept);
      return { concept, current: c.value, prior: pri ? pri.value : null, currentPeriodEnd: cur?.periodEnd ?? null, priorPeriodEnd: pri?.periodEnd ?? null };
    });
    const detected = l.coverage !== "NONE" && l.evidenced != null && sources.length > 0;
    const amount = detected ? l.evidenced : null;
    const priorSum = sources.every((s) => s.prior != null) && sources.length ? sources.reduce((a, s) => a + BigInt(s.prior!), 0n) : null;
    const curSum = sources.length ? sources.reduce((a, s) => a + BigInt(s.current), 0n) : null;
    const movement = detected && priorSum != null && curSum != null ? (curSum - priorSum).toString() : null;
    const ebitdaDelta = detected ? l.claimed : null;
    flags.push({
      category: l.category,
      clause: { label: l.label, text: l.text.slice(0, 200) },
      cap: l.cap ? { text: l.cap.text, amount: l.cap.amount } : null,
      sources,
      status: detected ? "DETECTED" : "NEEDS_INPUT",
      amount,
      movement,
      capHeadroom: l.headroomToCap,
      ebitdaDelta,
      debtCapacityDelta: lev && ebitdaDelta != null ? mulLimit(lev, BigInt(ebitdaDelta)).toString() : null,
      confidence: detected ? (l.coverage === "FULL" || l.status !== "NEEDS_INPUT" ? "HIGH" : "MEDIUM") : "LOW",
      note: detected ? (l.coverage === "FULL" || l.status !== "NEEDS_INPUT" ? (l.status === "CAPPED" ? "exact filed figure; cap applied" : "exact filed figure") : "partly evidenced; remainder needs input") : "permitted by the definition; no filed movement detected — available, check with CFO",
      ...(opt.bindingTier ? { bindingTier: opt.bindingTier } : {}),
    });
  }
  return flags;
}

/** Prior-year snapshot date: one year before the current anchor (filings filed on or before it). */
export function priorAsOf(anchor: string | null | undefined): string | null {
  if (!anchor || !/^\d{4}-\d{2}-\d{2}$/.test(anchor)) return null;
  // Prior-year period end plus a filing window (10-Q/10-K are filed within ~75 days), so that period's TTM is visible.
  const d = new Date(`${Number(anchor.slice(0, 4)) - 1}${anchor.slice(4)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 75);
  return d.toISOString().slice(0, 10);
}
