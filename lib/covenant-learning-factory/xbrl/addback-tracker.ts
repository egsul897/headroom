/**
 * Add-back tracker — strictly per agreement. Each flag comes from ONE borrower's own EBITDA definition (the optimizer
 * result for that agreement) and ONE issuer's filings, compared period over period (current TTM vs prior-year TTM).
 * No amounts are invented: a category with no exact filed figure is NEEDS_INPUT ("available, check with CFO").
 */
import type { IssuerFinancials } from "./companyfacts";
import { addBackInputKey, type AddBackCategory, type EbitdaOptimization } from "./ebitda-optimizer";

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
  /** The exact borrower-input key a CFO-confirmed, sourced figure would fill (ADDBACK:<clause> or CNI:<clause/category>). */
  inputKey: string;
  /**
   * Upper limit on what confirming this flag could still add. CAP_HEADROOM: the clause's remaining cap room (EBITDA)
   * and maxLeverage × that (debt). UNCAPPED_NEEDS_INPUT: no cap and no filed figure — unknown, never estimated.
   * CAP_UNKNOWN: under a cap whose amount cannot be determined (bounded, by an unknown amount).
   * COUNTED: the filed figure is already counted in full; nothing further to unlock.
   */
  potential: { basis: "CAP_HEADROOM" | "CAP_UNKNOWN" | "UNCAPPED_NEEDS_INPUT" | "COUNTED" | "SIGNED_NEEDS_INPUT" | "SHARED_CAP"; ebitda: string | null; debt: string | null };
  /**
   * One cap shared by several clauses: the room is shown once, on the group leader (first clause); the other members
   * carry basis SHARED_CAP (no separate amount) and point to the same group. Confirming several members can never add
   * more than the shared room in total.
   */
  capGroup: { id: string; labels: string[]; leader: string; room: string | null; positions: number[]; leaderPosition: number } | null;
  /** Index of the clause in this agreement's add-back schedule (labels can repeat across nesting levels). */
  position: number;
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
  for (const [position, l] of opt.addBacks.entries()) {
    // Base / tax / interest / D&A are the definition's core, not discretionary add-backs to track.
    if (l.category === "INTEREST" || l.category === "TAXES" || l.category === "D&A") continue;
    // A discretionary add-back is never sourced from a core concept (interest, income tax, D&A): such a match is a
    // mis-mapping, not evidence of the add-back.
    // A core concept is kept only when the clause itself names that item (a "non-cash charges, including depreciation and
    // amortization" line is evidenced by D&A; "equity interests" is not interest).
    const lineText = l.text.replace(/\b(?:equity|minority|non-?controlling|profits?|ownership|membership|partnership)\s+interests?\b|\binterests\b/gi, " ");
    // Total interest expense and income tax are never a discretionary add-back's own figure (a fees line "including any
    // interest expense" covers only part of it): dropped. D&A counts only when named outside parentheticals.
    const coreOk = (concept: string) =>
      /^Interest/.test(concept) ? false :
      /^IncomeTax/.test(concept) ? false :
      /^Depreciation/.test(concept) ? /depreciation|amortization|depletion/i.test(lineText.replace(/\([^)]*\)/g, " ")) : true;
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
      inputKey: addBackInputKey(opt.addBacks, position),
      potential: potentialOf(l.headroomToCap, detected && (l.coverage === "FULL" || l.status !== "NEEDS_INPUT"), lev, l.cap != null),
      position,
      capGroup: l.capGroup && l.capGroup.length > 1 ? { id: `CAP@${(l.capGroupAt ?? []).join("+")}:${l.capGroup.join("+")}`, labels: l.capGroup, leader: l.capGroup[0]!, room: l.headroomToCap, positions: l.capGroupAt ?? [], leaderPosition: (l.capGroupAt ?? [position])[0]! } : null,
      ...(opt.bindingTier ? { bindingTier: opt.bindingTier } : {}),
    });
  }
  // Shared caps: the room is counted once. The leader is the first clause in the group still open (else the first).
  const groups = new Map<string, AddBackFlag[]>();
  for (const f of flags) if (f.capGroup) groups.set(f.capGroup.id, [...(groups.get(f.capGroup.id) ?? []), f]);
  for (const members of groups.values()) {
    const leader = members.find((m) => m.potential.basis === "CAP_HEADROOM" && m.potential.ebitda !== "0") ?? members[0]!;
    const room = members.map((m) => m.potential).find((p) => p.basis === "CAP_HEADROOM") ?? leader.potential;
    for (const m of members) {
      m.capGroup = { ...m.capGroup!, leader: leader.clause.label, leaderPosition: leader.position, room: room.ebitda };
      if (m === leader) { m.potential = room; continue; }
      if (m.potential.basis === "CAP_HEADROOM") m.potential = { basis: "SHARED_CAP", ebitda: null, debt: null };
    }
  }
  // Net-income exclusions the definition needs but filings lack: the CFO can fill them by key (CNI:…). Such an item can
  // raise or lower EBITDA, so no direction or amount is assumed.
  for (const key of opt.needsBorrowerInput ?? []) {
    if (!/^CNI:/i.test(key) || flags.some((f) => f.inputKey.toUpperCase() === key.toUpperCase())) continue;
    flags.push({
      category: "OTHER", clause: { label: key.slice(4), text: "net-income exclusion required by the definition; not in filings" }, cap: null, sources: [], status: "NEEDS_INPUT",
      amount: null, movement: null, capHeadroom: null, ebitdaDelta: null, debtCapacityDelta: null, confidence: "LOW",
      note: "net-income exclusion — CFO input (signed: gains positive, losses negative)", inputKey: key,
      potential: { basis: "SIGNED_NEEDS_INPUT", ebitda: null, debt: null }, capGroup: null, position: -1,
      ...(opt.bindingTier ? { bindingTier: opt.bindingTier } : {}),
    });
  }
  return flags;
}

function potentialOf(headroom: string | null, counted: boolean, lev: string | null, capped = false): AddBackFlag["potential"] {
  if (headroom != null && /^-?\d+$/.test(headroom)) {
    const h = BigInt(headroom) > 0n ? BigInt(headroom) : 0n;
    return { basis: "CAP_HEADROOM", ebitda: h.toString(), debt: lev ? mulLimit(lev, h).toString() : null };
  }
  if (counted) return { basis: "COUNTED", ebitda: "0", debt: lev ? "0" : null };
  // Under a cap whose room cannot be determined: limited, but by an unknown amount (never treated as uncapped).
  if (capped) return { basis: "CAP_UNKNOWN", ebitda: null, debt: null };
  return { basis: "UNCAPPED_NEEDS_INPUT", ebitda: null, debt: null };
}

/**
 * Rank flags by potential capacity impact: known cap headroom first (largest debt, else EBITDA, room first); then
 * uncapped lines needing input and net-income exclusions (unknown, unranked among themselves — no invented amounts);
 * lines already fully counted last.
 */
export function rankFlags(flags: readonly AddBackFlag[]): Array<AddBackFlag & { rank: number }> {
  const leaderOf = (f: AddBackFlag) => (f.capGroup ? flags.find((x) => x.capGroup?.id === f.capGroup!.id && x.position === f.capGroup!.leaderPosition) ?? f : f);
  const eff = (f: AddBackFlag) => (f.potential.basis === "SHARED_CAP" ? leaderOf(f) : f);
  const tier = (f0: AddBackFlag) => { const f = eff(f0); return f.potential.basis === "CAP_HEADROOM" ? 0 : f.potential.basis === "UNCAPPED_NEEDS_INPUT" || f.potential.basis === "CAP_UNKNOWN" ? 1 : f.potential.basis === "SIGNED_NEEDS_INPUT" ? 2 : 3; };
  const mag = (f0: AddBackFlag) => { const f = eff(f0); return BigInt(f.potential.debt ?? f.potential.ebitda ?? "0"); };
  const grp = (f: AddBackFlag) => f.capGroup?.id ?? `#${flags.indexOf(f)}`;
  const isMember = (f: AddBackFlag) => (f.potential.basis === "SHARED_CAP" ? 1 : 0);
  return [...flags].map((f, i) => ({ f, i })).sort((a, b) => tier(a.f) - tier(b.f) || (mag(b.f) > mag(a.f) ? 1 : mag(b.f) < mag(a.f) ? -1 : 0) || (grp(a.f) < grp(b.f) ? -1 : grp(a.f) > grp(b.f) ? 1 : 0) || isMember(a.f) - isMember(b.f) || a.i - b.i).map(({ f }, i) => ({ ...f, rank: i + 1 }));
}

/** Prior-year snapshot date: one year before the current anchor (filings filed on or before it). */
export function priorAsOf(anchor: string | null | undefined): string | null {
  if (!anchor || !/^\d{4}-\d{2}-\d{2}$/.test(anchor)) return null;
  // Prior-year period end plus a filing window (10-Q/10-K are filed within ~75 days), so that period's TTM is visible.
  const d = new Date(`${Number(anchor.slice(0, 4)) - 1}${anchor.slice(4)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 75);
  return d.toISOString().slice(0, 10);
}
