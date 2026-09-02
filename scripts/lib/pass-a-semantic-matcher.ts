/**
 * PHASE 3 FINAL CLOSURE - zero-LLM, source-first Pass A semantic matcher
 * (mission §3/§4/§8). Decides whether two inventory items from two
 * independent Pass A runs over the SAME source text carry the same
 * proposition, using ONLY Pass A outputs: verified source spans (offsets
 * into byte-identical region text), semantic roles, deterministic
 * quantitative values and materiality. It never reads the IR, Pass B,
 * the verifier or ground truth.
 *
 * Design property (§8): stability is measured around semantic proposition
 * identity, not generated prose identity - two items over the same source
 * span with the same values are the same proposition however they are
 * worded, split, or labelled; but a CONDITION/EXCEPTION that only survives
 * FOLDED into a broader non-conditional span is never normalized away
 * (§11: "never normalize away a missing condition or exception").
 *
 * NOT production code: consumed by scripts/phase3-final-closure-forensics.ts
 * and the stability comparator, and exercised by tests.
 */
export type MatchMateriality = "CRITICAL" | "MATERIAL" | "INFORMATIONAL" | "REVIEW_UNCERTAIN";
export interface MatchValue { kind: string; rawText: string; normalizedValue: number | null }
export interface MatchItem {
  id: string;
  regionId: string;
  charStart: number;
  charEnd: number;
  role: string;
  materiality: MatchMateriality;
  values: MatchValue[];
}
export type VarianceClass = "TRUE_SEMANTIC_VARIANCE" | "GRANULARITY_VARIANCE" | "WORDING_VARIANCE" | "ROLE_VARIANCE" | "MATERIALITY_VARIANCE" | "SOURCE_SPAN_VARIANCE" | "VALUE_NORMALIZATION_VARIANCE" | "DUPLICATION_VARIANCE" | "IDENTITY_VARIANCE" | "GENUINE_OMISSION" | "UNKNOWN";

export const CONDITIONAL_ROLES = new Set(["CONDITION", "EXCEPTION", "SHARED_CAP", "CURE", "THRESHOLD", "TRIGGER"]);
export const PAIR_JACCARD_MIN = 0.5;
export const FRAGMENT_CONTAINMENT_MIN = 0.8;
export const DUPLICATE_JACCARD_MIN = 0.9;
export const OMISSION_COVERAGE_MAX = 0.2;
export const SEMANTIC_VARIANCE_COVERAGE_MIN = 0.5;

const len = (i: MatchItem) => i.charEnd - i.charStart;
export function inter(a: MatchItem, b: MatchItem): number {
  if (a.regionId !== b.regionId) return 0;
  return Math.max(0, Math.min(a.charEnd, b.charEnd) - Math.max(a.charStart, b.charStart));
}
export const jaccard = (a: MatchItem, b: MatchItem): number => { const i = inter(a, b); return i === 0 ? 0 : i / (Math.max(a.charEnd, b.charEnd) - Math.min(a.charStart, b.charStart)); };
export const containment = (inner: MatchItem, outer: MatchItem): number => (len(inner) === 0 ? 0 : inter(inner, outer) / len(inner));
const ws = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
export const valueKey = (v: MatchValue): string => `${v.kind}:${v.normalizedValue ?? ws(v.rawText)}`;
export function valuesRelation(a: MatchItem, b: MatchItem): "EQUAL" | "SUBSET" | "DIFFERENT" {
  const A = new Set(a.values.map(valueKey));
  const B = new Set(b.values.map(valueKey));
  if (A.size === B.size && [...A].every((k) => B.has(k))) return "EQUAL";
  if ([...A].every((k) => B.has(k)) || [...B].every((k) => A.has(k))) return "SUBSET";
  return "DIFFERENT";
}
/** Fraction of an item's span covered by the union of the other run's item spans (any role/materiality). */
export function coverageBy(item: MatchItem, others: MatchItem[]): number {
  const segs = others.filter((o) => inter(item, o) > 0).map((o) => [Math.max(item.charStart, o.charStart), Math.min(item.charEnd, o.charEnd)] as [number, number]).sort((x, y) => x[0] - y[0]);
  let covered = 0;
  let cur: [number, number] | null = null;
  for (const s of segs) {
    if (!cur || s[0] > cur[1]) { if (cur) covered += cur[1] - cur[0]; cur = [s[0], s[1]]; }
    else cur[1] = Math.max(cur[1], s[1]);
  }
  if (cur) covered += cur[1] - cur[0];
  return len(item) === 0 ? 0 : covered / len(item);
}

export interface Classified {
  run: 1 | 2;
  id: string;
  class: VarianceClass;
  subclass: string;
  counterpartIds: string[];
  /** The difference is one of span boundary / split-merge / role label / value signature / duplicate - the same proposition received a different id. */
  identityAttributable: boolean;
  /** A CONDITION/EXCEPTION/SHARED_CAP/CURE/THRESHOLD/TRIGGER item that only survives in the other run inside a broader NON-conditional span. Never normalized away. */
  conditionalRoleFolded: boolean;
  jaccard: number | null;
}
export interface Cluster {
  clusterId: string;
  members: { run: 1 | 2; id: string }[];
  material: boolean;
  inRun1: number;
  inRun2: number;
  roles: string[];
  lenientStable: boolean;
  conservativeStable: boolean;
  foldedConditionalRole: boolean;
}
export interface MatchResult {
  idStable: { id: string }[];
  classified: Classified[];
  clusters: Cluster[];
}

class UnionFind {
  private p = new Map<string, string>();
  find(x: string): string { const p = this.p.get(x) ?? x; if (p === x) return x; const r = this.find(p); this.p.set(x, r); return r; }
  union(a: string, b: string): void { this.p.set(this.find(a), this.find(b)); }
}
const MATERIAL = (m: MatchMateriality) => m === "CRITICAL" || m === "MATERIAL";

/** Matches two independent inventories of the same source region text. `regionPrefix` only namespaces cluster ids. */
export function matchInventories(run1: MatchItem[], run2: MatchItem[], regionPrefix = "r"): MatchResult {
  const uf = new UnionFind();
  const key = (run: 1 | 2, i: MatchItem) => `${run}:${i.id}`;
  const matched = new Set<string>();
  const idStable: { id: string }[] = [];
  const byId2 = new Map(run2.map((i) => [i.id, i]));
  for (const a of run1) {
    const b = byId2.get(a.id);
    if (!b) continue;
    matched.add(key(1, a)); matched.add(key(2, b)); uf.union(key(1, a), key(2, b));
    idStable.push({ id: a.id });
  }
  for (const [run, R] of [[1, run1], [2, run2]] as [1 | 2, MatchItem[]][]) {
    const items = R.filter((i) => !matched.has(key(run, i)));
    for (let x = 0; x < items.length; x++) for (let y = x + 1; y < items.length; y++) {
      const p = items[x]!, q = items[y]!;
      if (p.role === q.role && jaccard(p, q) >= DUPLICATE_JACCARD_MIN) uf.union(key(run, p), key(run, q));
    }
  }
  const pairs: { a: MatchItem; b: MatchItem; j: number }[] = [];
  for (const a of run1) if (!matched.has(key(1, a))) for (const b of run2) if (!matched.has(key(2, b))) { const j = jaccard(a, b); if (j >= PAIR_JACCARD_MIN) pairs.push({ a, b, j }); }
  pairs.sort((x, y) => y.j - x.j);
  const paired = new Map<string, { other: MatchItem; otherRun: 1 | 2; j: number }>();
  for (const { a, b, j } of pairs) {
    if (paired.has(key(1, a)) || paired.has(key(2, b))) continue;
    paired.set(key(1, a), { other: b, otherRun: 2, j }); paired.set(key(2, b), { other: a, otherRun: 1, j });
    uf.union(key(1, a), key(2, b));
  }
  const fragmentOf = new Map<string, MatchItem[]>();
  for (const [run, R, O, otherRun] of [[1, run1, run2, 2], [2, run2, run1, 1]] as [1 | 2, MatchItem[], MatchItem[], 1 | 2][]) {
    for (const it of R) {
      if (matched.has(key(run, it)) || paired.has(key(run, it))) continue;
      const containers = O.filter((o) => containment(it, o) >= FRAGMENT_CONTAINMENT_MIN && len(o) > len(it));
      const fragments = O.filter((o) => containment(o, it) >= FRAGMENT_CONTAINMENT_MIN && len(it) > len(o));
      const links = containers.length > 0 ? containers : fragments;
      if (links.length > 0) { fragmentOf.set(key(run, it), links); for (const l of links) uf.union(key(run, it), key(otherRun, l)); }
    }
  }
  const classified: Classified[] = [];
  const classify = (run: 1 | 2, it: MatchItem, R: MatchItem[], O: MatchItem[]): Classified => {
    const dup = R.find((o) => o !== it && o.role === it.role && jaccard(it, o) >= DUPLICATE_JACCARD_MIN);
    const p = paired.get(key(run, it));
    if (p) {
      const o = p.other;
      const rel = valuesRelation(it, o);
      const sameSpan = it.charStart === o.charStart && it.charEnd === o.charEnd;
      let cls: VarianceClass; let sub: string;
      if (sameSpan && it.role !== o.role) { cls = "ROLE_VARIANCE"; sub = `same span, ${it.role} vs ${o.role}`; }
      else if (sameSpan) { cls = "VALUE_NORMALIZATION_VARIANCE"; sub = `same span+role, value signature ${rel}`; }
      else if (it.role === o.role && rel !== "DIFFERENT") { cls = "SOURCE_SPAN_VARIANCE"; sub = `same role, jaccard ${p.j.toFixed(2)}, values ${rel}`; }
      else if (it.role === o.role) { cls = "VALUE_NORMALIZATION_VARIANCE"; sub = `same role, span shifted so value signature DIFFERENT (jaccard ${p.j.toFixed(2)})`; }
      else if (p.j >= 0.8) { cls = "ROLE_VARIANCE"; sub = `near-same span (jaccard ${p.j.toFixed(2)}), ${it.role} vs ${o.role}`; }
      else { cls = "GRANULARITY_VARIANCE"; sub = `partial overlap (jaccard ${p.j.toFixed(2)}) with different role ${it.role} vs ${o.role}`; }
      return { run, id: it.id, class: cls, subclass: sub, counterpartIds: [o.id], identityAttributable: true, conditionalRoleFolded: CONDITIONAL_ROLES.has(it.role) && !CONDITIONAL_ROLES.has(o.role), jaccard: Number(p.j.toFixed(3)) };
    }
    if (dup) return { run, id: it.id, class: "DUPLICATION_VARIANCE", subclass: `near-duplicate of ${dup.id} in the same run`, counterpartIds: [dup.id], identityAttributable: true, conditionalRoleFolded: false, jaccard: Number(jaccard(it, dup).toFixed(3)) };
    const links = fragmentOf.get(key(run, it));
    if (links && links.length > 0) {
      const isFragment = links.some((l) => len(l) > len(it));
      return { run, id: it.id, class: "GRANULARITY_VARIANCE", subclass: isFragment ? `fragment of larger other-run item(s)` : `merge of ${links.length} smaller other-run item(s)`, counterpartIds: links.map((l) => l.id), identityAttributable: true, conditionalRoleFolded: isFragment && CONDITIONAL_ROLES.has(it.role) && !links.some((l) => CONDITIONAL_ROLES.has(l.role)), jaccard: null };
    }
    const cov = coverageBy(it, O);
    const overlapping = O.filter((o) => inter(it, o) > 0).map((o) => o.id);
    if (cov >= SEMANTIC_VARIANCE_COVERAGE_MIN) return { run, id: it.id, class: "TRUE_SEMANTIC_VARIANCE", subclass: `text ${(cov * 100).toFixed(0)}% covered by other-run spans but no clean counterpart`, counterpartIds: overlapping, identityAttributable: false, conditionalRoleFolded: false, jaccard: null };
    if (cov < OMISSION_COVERAGE_MAX) return { run, id: it.id, class: "GENUINE_OMISSION", subclass: `only ${(cov * 100).toFixed(0)}% of this span is touched by ANY other-run item`, counterpartIds: [], identityAttributable: false, conditionalRoleFolded: false, jaccard: null };
    return { run, id: it.id, class: "UNKNOWN", subclass: `partial coverage ${(cov * 100).toFixed(0)}%`, counterpartIds: overlapping, identityAttributable: false, conditionalRoleFolded: false, jaccard: null };
  };
  for (const it of run1) if (!matched.has(key(1, it))) classified.push(classify(1, it, run1, run2));
  for (const it of run2) if (!matched.has(key(2, it))) classified.push(classify(2, it, run2, run1));

  const members = new Map<string, { run: 1 | 2; item: MatchItem }[]>();
  for (const [run, R] of [[1, run1], [2, run2]] as [1 | 2, MatchItem[]][]) for (const it of R) { const r = uf.find(key(run, it)); if (!members.has(r)) members.set(r, []); members.get(r)!.push({ run, item: it }); }
  const clsByKey = new Map(classified.map((c) => [`${c.run}:${c.id}`, c]));
  const clusters: Cluster[] = [];
  let idx = 0;
  for (const [, ms] of members) {
    const r1 = ms.filter((m) => m.run === 1), r2 = ms.filter((m) => m.run === 2);
    const material = ms.some((m) => MATERIAL(m.item.materiality));
    const folded = ms.some((m) => clsByKey.get(`${m.run}:${m.item.id}`)?.conditionalRoleFolded && MATERIAL(m.item.materiality));
    const lenient = r1.length > 0 && r2.length > 0;
    clusters.push({ clusterId: `${regionPrefix}#${idx++}`, members: ms.map((m) => ({ run: m.run, id: m.item.id })), material, inRun1: r1.length, inRun2: r2.length, roles: [...new Set(ms.map((m) => m.item.role))], lenientStable: lenient, conservativeStable: lenient && !folded, foldedConditionalRole: folded });
  }
  return { idStable, classified, clusters };
}

/** Semantic inventory stability over material clusters: lenient (present in both runs) and conservative (folded conditional roles count as unstable). */
export function semanticStability(clusters: Cluster[]): { materialClusters: number; lenientInBoth: number; lenient: number; conservativeInBoth: number; conservative: number } {
  const mat = clusters.filter((c) => c.material);
  const l = mat.filter((c) => c.lenientStable).length;
  const cons = mat.filter((c) => c.conservativeStable).length;
  return { materialClusters: mat.length, lenientInBoth: l, lenient: mat.length === 0 ? 1 : l / mat.length, conservativeInBoth: cons, conservative: mat.length === 0 ? 1 : cons / mat.length };
}
