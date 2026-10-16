/**
 * CFO loop — a CFO-confirmed, sourced figure for a tracker flag's input key is applied as a borrower input and the
 * agreement is recomputed: EBITDA, grower baskets, leverage and ratio capacity, before vs after. Nothing is estimated:
 * an input without a source, with a non-integer value, or for a key no flag names is refused.
 */
import type { BorrowerInput } from "../xbrl/companyfacts";
import { runAgreementPipeline } from "./agreement-pipeline";
import { rankFlags, type AddBackFlag } from "../xbrl/addback-tracker";

type Args = Parameters<typeof runAgreementPipeline>[0];
type Result = ReturnType<typeof runAgreementPipeline>;

export interface CapacitySnapshot {
  ebitda: string | null; ebitdaStatus: string | null;
  /** Grower / %-of-metric basket caps computed (stableKey → cap). */
  growerCaps: Record<string, string>;
  leverageCapacity: string | null;
  ratioCapacity: Record<string, string | null>;
}

export function capacitySnapshot(r: Result): CapacitySnapshot {
  const x = r.xbrl as (Result["xbrl"] & { ebitda?: { maximum: string | null; supported: string | null; status: string }; leverageCapacity?: { capacity?: string | null; status: string }; ratioCapacity?: Array<{ name: string; kind: string; capacity: string | null }> }) | null | undefined;
  const growerCaps: Record<string, string> = {};
  for (const b of r.computedBaskets) if (["GROWER_GREATER_OF", "PCT_OF_METRIC"].includes(b.category) && b.capStatus === "COMPUTED" && b.capCanonical != null && /^-?\d+(?:\.\d+)?$/.test(String(b.capCanonical))) growerCaps[b.stableKey] = String(b.capCanonical);
  const ratioCapacity: Record<string, string | null> = {};
  for (const c of x?.ratioCapacity ?? []) ratioCapacity[`${c.kind}:${c.name}`] = c.capacity;
  return {
    ebitda: x?.ebitda ? (x.ebitda.maximum ?? x.ebitda.supported) : null, ebitdaStatus: x?.ebitda?.status ?? null,
    growerCaps, leverageCapacity: x?.leverageCapacity?.status === "COMPUTED" ? (x.leverageCapacity.capacity ?? null) : null, ratioCapacity,
  };
}

const sub = (a: string | null, b: string | null) => {
  if (a == null || b == null) return null;
  const [ai, af = ""] = a.split("."), [bi, bf = ""] = b.split(".");
  if (af || bf) return (Number(a) - Number(b)).toString();
  return (BigInt(ai!) - BigInt(bi!)).toString();
};

export interface CfoGain {
  input: BorrowerInput; accepted: boolean; reason: string;
  before: CapacitySnapshot; after: CapacitySnapshot | null;
  gain: { ebitda: string | null; growerTotal: string | null; growerByBasket: Record<string, string | null>; leverageCapacity: string | null; ratioCapacity: Record<string, string | null> } | null;
}

function gainOf(before: CapacitySnapshot, after: CapacitySnapshot): NonNullable<CfoGain["gain"]> {
  const keys = new Set([...Object.keys(before.growerCaps), ...Object.keys(after.growerCaps)]);
  const growerByBasket: Record<string, string | null> = {};
  let total: bigint | null = 0n;
  for (const k of keys) {
    const g = sub(after.growerCaps[k] ?? null, before.growerCaps[k] ?? null);
    growerByBasket[k] = g;
    if (g == null || g.includes(".") || total == null) total = null; else total += BigInt(g);
  }
  const ratioCapacity: Record<string, string | null> = {};
  for (const k of new Set([...Object.keys(before.ratioCapacity), ...Object.keys(after.ratioCapacity)])) ratioCapacity[k] = sub(after.ratioCapacity[k] ?? null, before.ratioCapacity[k] ?? null);
  return { ebitda: sub(after.ebitda, before.ebitda), growerTotal: total == null ? null : total.toString(), growerByBasket, leverageCapacity: sub(after.leverageCapacity, before.leverageCapacity), ratioCapacity };
}

/** Apply each CFO input on its own (per-flag gain) and report before/after capacity; flags come back ranked. */
export function cfoRecompute(args: Args, inputs: readonly BorrowerInput[]): { flags: Array<AddBackFlag & { rank: number }>; results: CfoGain[]; combined: CfoGain | null } {
  const base = runAgreementPipeline(args);
  const before = capacitySnapshot(base);
  const keys = new Set(((base.xbrl as { addBackTracker?: Array<{ inputKey: string }> } | null)?.addBackTracker ?? []).map((f) => f.inputKey.toUpperCase()));
  const results: CfoGain[] = [];
  for (const input of inputs) {
    const refuse = (reason: string) => results.push({ input, accepted: false, reason, before, after: null, gain: null });
    if (!input.source?.trim()) { refuse("no source document named"); continue; }
    if (!/^-?\d+$/.test(input.value)) { refuse("value is not an integer amount"); continue; }
    if (!keys.has(input.key.toUpperCase())) { refuse(`no tracker flag names input key ${input.key}`); continue; }
    if (!args.financials) { refuse("no issuer financials"); continue; }
    const fin = { ...args.financials, borrowerInputs: [...(args.financials.borrowerInputs ?? []), input] };
    const after = capacitySnapshot(runAgreementPipeline({ ...args, financials: fin }));
    results.push({ input, accepted: true, reason: "recomputed with the CFO-confirmed figure", before, after, gain: gainOf(before, after) });
  }
  // All accepted inputs together: shared caps bind across clauses (the optimizer applies one limit per cap group), so the
  // combined gain is what the CFO's figures unlock in total — never the sum of per-flag gains when they share a cap.
  const ok = results.filter((r) => r.accepted).map((r) => r.input);
  let combined: CfoGain | null = null;
  if (ok.length && args.financials) {
    const after = capacitySnapshot(runAgreementPipeline({ ...args, financials: { ...args.financials, borrowerInputs: [...(args.financials.borrowerInputs ?? []), ...ok] } }));
    combined = { input: { key: ok.map((i) => i.key).join("+"), value: ok.reduce((a, i) => a + BigInt(i.value), 0n).toString(), source: ok.map((i) => i.source).join(" | ") }, accepted: true, reason: "all accepted CFO figures applied together (shared caps enforced across clauses)", before, after, gain: gainOf(before, after) };
  }
  return { combined, flags: rankFlags(((base.xbrl as { addBackTracker?: AddBackFlag[] } | null)?.addBackTracker) ?? []), results };
}
