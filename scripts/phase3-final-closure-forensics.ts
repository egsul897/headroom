/**
 * PHASE 3 FINAL CLOSURE - zero-LLM Pass A variance forensics (mission §2-§6).
 *
 *   npx tsx scripts/phase3-final-closure-forensics.ts --out docs/phase3-final-closure
 *
 * Compares the two preserved post-RVD-1 holdout runs' FROZEN Pass A
 * inventories (source-only artifacts) and classifies every material
 * inventory difference into the mission's A-K taxonomy using ONLY:
 * verified source spans (offsets into byte-identical region text), semantic
 * roles, materiality, deterministic quantitative values, referenced
 * terms/sections and content digests. It never reads the final IR, Pass B
 * output, verifier conclusions or ground truth to decide Pass A equivalence
 * (§3). Dispositions are read AFTER clustering, only to recompute the
 * stability metric two ways (§4), and verifier findings are consulted only
 * to answer "was this omission later surfaced" (§5) - never to cluster.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { specFor } from "./lib/semantic-accountability-regions";
import { coverageBy, inter, matchInventories, valuesRelation, type MatchItem } from "./lib/pass-a-semantic-matcher";

const len = (i: { charStart: number; charEnd: number }) => i.charEnd - i.charStart;

type Materiality = "CRITICAL" | "MATERIAL" | "INFORMATIONAL" | "REVIEW_UNCERTAIN";
type Disposition = "REPRESENTED" | "INTENTIONALLY_NON_COMPUTATIONAL" | "UNSUPPORTED" | "AMBIGUOUS" | "MISSING_FROM_COMPOSITION";

interface Value { kind: string; rawText: string; normalizedValue: number | null; unit: string | null }
interface Item {
  run: 1 | 2;
  id: string;
  regionId: string;
  charStart: number;
  charEnd: number;
  excerpt: string;
  role: string;
  materiality: Materiality;
  proposition: string;
  values: Value[];
  referencedTerms: string[];
  referencedSections: string[];
  disposition: Disposition | null;
  parentItemId: string | null;
}
interface RegionRun {
  items: Item[];
  regionTexts: Map<string, { text: string; kind: string; truncatedAtBudget: boolean }>;
  sourceContextState: string;
  inventoryStatus: string;
  rejectedUnverifiable: number;
  rejectedDuplicates: number;
  uninventoried: number;
  verifierEvidence: string[];
  compileStatus: string;
  verifyStatus: string | null;
}

const MATERIAL = (m: Materiality) => m === "CRITICAL" || m === "MATERIAL";
const ws = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

function loadRun(dir: string, run: 1 | 2): Map<string, RegionRun> {
  const out = new Map<string, RegionRun>();
  for (const f of readdirSync(dir).filter((f) => f.startsWith("region-") && f.endsWith(".json"))) {
    const j = JSON.parse(readFileSync(`${dir}/${f}`, "utf-8"));
    if (j.error || !j.compile?.frozenInventory) continue;
    const c = j.compile;
    const dispositionById = new Map<string, Disposition>((c.accountability?.items ?? []).map((r: { inventoryItemId: string; disposition: Disposition }) => [r.inventoryItemId, r.disposition]));
    const regionTexts = new Map<string, { text: string; kind: string; truncatedAtBudget: boolean }>();
    for (const r of c.sourceContext.regions) regionTexts.set(r.regionId, { text: r.text, kind: r.kind, truncatedAtBudget: !!r.truncatedAtBudget });
    const items: Item[] = c.frozenInventory.items.map((it: Record<string, unknown> & { sourceSpan: Record<string, unknown> }) => ({
      run,
      id: it.inventoryItemId as string,
      regionId: it.sourceSpan.regionId as string,
      charStart: it.sourceSpan.charStart as number,
      charEnd: it.sourceSpan.charEnd as number,
      excerpt: it.sourceSpan.excerpt as string,
      role: it.semanticRole as string,
      materiality: it.materiality as Materiality,
      proposition: it.proposition as string,
      values: (it.quantitativeValues as Value[]).map((v) => ({ kind: v.kind, rawText: v.rawText, normalizedValue: v.normalizedValue, unit: v.unit })),
      referencedTerms: it.referencedTerms as string[],
      referencedSections: it.referencedSections as string[],
      disposition: dispositionById.get(it.inventoryItemId as string) ?? null,
      parentItemId: (it.parentItemId as string | null) ?? null,
    }));
    out.set(j.region.id, {
      items,
      regionTexts,
      sourceContextState: c.sourceContext.state,
      inventoryStatus: c.frozenInventory.inventoryStatus,
      rejectedUnverifiable: c.frozenInventory.rejectedUnverifiableItems,
      rejectedDuplicates: c.frozenInventory.rejectedDuplicateItems,
      uninventoried: c.frozenInventory.uninventoriedValues.length,
      verifierEvidence: (j.verify?.findings ?? []).filter((x: { severity: string }) => x.severity === "MATERIAL").map((x: { sourceEvidence?: string }) => ws(x.sourceEvidence ?? "")).filter(Boolean),
      compileStatus: c.status,
      verifyStatus: j.verify?.status ?? null,
    });
  }
  return out;
}

interface Classified {
  region: string;
  run: 1 | 2;
  id: string;
  role: string;
  materiality: Materiality;
  span: string;
  excerpt: string;
  class: import("./lib/pass-a-semantic-matcher").VarianceClass;
  subclass: string;
  counterpart: { run: 1 | 2; id: string; role: string; span: string; jaccard: number; valuesRelation: string } | null;
  counterparts: string[];
  identityAttributable: boolean;
  conditionalRoleFolded: boolean;
  disposition: Disposition | null;
  counterpartDisposition: Disposition | null;
  proposition: string;
}

function main() {
  const outDir = arg("--out", "docs/phase3-final-closure");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const spec = specFor("holdout");
  const run1 = loadRun(`${spec.outDirBase}/run-1`, 1);
  const run2 = loadRun(`${spec.outDirBase}/run-2`, 2);

  const classified: Classified[] = [];
  const idStable: { region: string; id: string; role: string; wordingDiffers: boolean; materialityDiffers: boolean; materiality1: Materiality; materiality2: Materiality; disposition1: Disposition | null; disposition2: Disposition | null }[] = [];
  const clusterRows: { region: string; clusterId: string; material: boolean; inRun1: number; inRun2: number; roles: string[]; conservativeStable: boolean; lenientStable: boolean; captured1: boolean | null; captured2: boolean | null; dispositions1: string[]; dispositions2: string[]; foldedConditionalRole: boolean; memberKeys: string[] }[] = [];
  const perRegion: Record<string, unknown>[] = [];

  for (const regionId of [...run1.keys()].filter((k) => run2.has(k)).sort()) {
    const A = run1.get(regionId)!;
    const B = run2.get(regionId)!;
    const regionsIdentical = [...A.regionTexts.keys()].every((k) => B.regionTexts.get(k)?.text === A.regionTexts.get(k)!.text) && A.regionTexts.size === B.regionTexts.size;
    if (!regionsIdentical) throw new Error(`source context differs across runs for ${regionId} - forensics assume byte-identical source`);
    // Shared, tested matcher (scripts/lib/pass-a-semantic-matcher.ts) - the same code the §11 adversarial tests exercise.
    const toMatch = (i: Item): MatchItem => ({ id: i.id, regionId: i.regionId, charStart: i.charStart, charEnd: i.charEnd, role: i.role, materiality: i.materiality, values: i.values.map((v) => ({ kind: v.kind, rawText: v.rawText, normalizedValue: v.normalizedValue })) });
    const byRunId = new Map<string, Item>();
    for (const it of [...A.items, ...B.items]) byRunId.set(`${it.run}:${it.id}`, it);
    const m = matchInventories(A.items.map(toMatch), B.items.map(toMatch), regionId);
    const byId2 = new Map(B.items.map((i) => [i.id, i]));
    for (const { id } of m.idStable) {
      const a = A.items.find((i) => i.id === id)!;
      const b = byId2.get(id)!;
      idStable.push({ region: regionId, id, role: a.role, wordingDiffers: ws(a.proposition) !== ws(b.proposition), materialityDiffers: a.materiality !== b.materiality, materiality1: a.materiality, materiality2: b.materiality, disposition1: a.disposition, disposition2: b.disposition });
    }
    for (const c of m.classified) {
      const it = byRunId.get(`${c.run}:${c.id}`)!;
      const otherRun = c.run === 1 ? 2 : 1;
      const counterpartItems = c.counterpartIds.map((cid) => byRunId.get(`${otherRun}:${cid}`) ?? byRunId.get(`${c.run}:${cid}`)).filter((x): x is Item => !!x);
      const one = c.jaccard !== null && c.class !== "DUPLICATION_VARIANCE" && counterpartItems.length === 1 ? counterpartItems[0]! : null;
      classified.push({
        region: regionId, run: c.run, id: c.id, role: it.role, materiality: it.materiality, span: `${it.regionId}:${it.charStart}-${it.charEnd}`, excerpt: it.excerpt.slice(0, 160), disposition: it.disposition, proposition: it.proposition.slice(0, 200),
        class: c.class, subclass: c.subclass,
        counterpart: one ? { run: one.run, id: one.id, role: one.role, span: `${one.charStart}-${one.charEnd}`, jaccard: c.jaccard!, valuesRelation: valuesRelation(toMatch(it), toMatch(one)) } : null,
        counterparts: c.counterpartIds, identityAttributable: c.identityAttributable, conditionalRoleFolded: c.conditionalRoleFolded,
        counterpartDisposition: counterpartItems.find((x) => x.run === otherRun)?.disposition ?? null,
      });
    }
    for (const cl of m.clusters) {
      const ms = cl.members.map((mm) => byRunId.get(`${mm.run}:${mm.id}`)!);
      const r1 = ms.filter((x) => x.run === 1), r2 = ms.filter((x) => x.run === 2);
      const captured = (xs: Item[]) => xs.length === 0 ? null : xs.some((x) => x.disposition !== null && x.disposition !== "MISSING_FROM_COMPOSITION");
      clusterRows.push({ region: regionId, clusterId: cl.clusterId, material: cl.material, inRun1: cl.inRun1, inRun2: cl.inRun2, roles: cl.roles, lenientStable: cl.lenientStable, conservativeStable: cl.conservativeStable, captured1: captured(r1), captured2: captured(r2), dispositions1: [...new Set(r1.map((x) => x.disposition ?? "NONE"))], dispositions2: [...new Set(r2.map((x) => x.disposition ?? "NONE"))], foldedConditionalRole: cl.foldedConditionalRole, memberKeys: ms.map((x) => `${x.run}:${regionId}:${x.id}`) });
    }

    const regionCls = classified.filter((c) => c.region === regionId && MATERIAL(c.materiality));
    const counts: Record<string, number> = {};
    for (const c of regionCls) counts[c.class] = (counts[c.class] ?? 0) + 1;
    const op = [...A.regionTexts.values()].find((r) => r.kind === "OPERATIVE")!;
    perRegion.push({
      id: regionId,
      sourceContextState: A.sourceContextState,
      operativeChars: op.text.length,
      enumeratedClauses: (op.text.match(/\((?:[a-z]|[ivx]+|\d+)\)/g) ?? []).length,
      expansionRegions: A.regionTexts.size - 1,
      anyRegionTruncatedAtBudget: [...A.regionTexts.values()].some((r) => r.truncatedAtBudget),
      items: { run1: A.items.length, run2: B.items.length, material1: A.items.filter((i) => MATERIAL(i.materiality)).length, material2: B.items.filter((i) => MATERIAL(i.materiality)).length, idStable: idStable.filter((s) => s.region === regionId).length },
      inventoryStatus: { run1: A.inventoryStatus, run2: B.inventoryStatus },
      rejected: { unverifiable: [A.rejectedUnverifiable, B.rejectedUnverifiable], duplicates: [A.rejectedDuplicates, B.rejectedDuplicates], uninventoriedValues: [A.uninventoried, B.uninventoried] },
      materialVarianceByClass: counts,
      materialClusters: clusterRows.filter((c) => c.region === regionId && c.material).length,
      materialClustersInBoth: clusterRows.filter((c) => c.region === regionId && c.material && c.lenientStable).length,
      materialClustersInBothConservative: clusterRows.filter((c) => c.region === regionId && c.material && c.conservativeStable).length,
    });
  }

  // ---- 01: variance forensics ------------------------------------------------
  const materialVariance = classified.filter((c) => MATERIAL(c.materiality));
  const byClass: Record<string, number> = {};
  for (const c of materialVariance) byClass[c.class] = (byClass[c.class] ?? 0) + 1;
  const wording = idStable.filter((s) => s.wordingDiffers).length;
  const materialityVar = idStable.filter((s) => s.materialityDiffers);
  const forensics = {
    schemaVersion: 1,
    artifactId: "01-pass-a-variance-forensics",
    method: "Zero-LLM. Source context is byte-identical across both runs (asserted). Items are matched across runs by (1) identical content-derived inventoryItemId, then (2) greedy one-to-one span pairing (jaccard>=0.5 on verified char offsets within the same region), then (3) fragment/merge containment (>=80% of the smaller span inside the larger), then within-run near-duplicates (same role, jaccard>=0.9). Each non-id-stable MATERIAL item is classified by the mechanism that broke identity. Text coverage by the union of other-run spans decides TRUE_SEMANTIC_VARIANCE (>=50%) vs GENUINE_OMISSION (<20%) vs UNKNOWN. Nothing here reads the IR, Pass B output, verifier or GT.",
    identityMechanism: "inventoryItemId = sha256(candidateRef, role, regionId, charStart, charEnd, valueSignature, algorithmVersion). Any difference in role, exact span boundary, or attached value set yields a different id even when the proposition is the same; proposition wording is NOT part of the id.",
    totals: {
      materialItemsRun1: [...run1.values()].reduce((n, r) => n + r.items.filter((i) => MATERIAL(i.materiality)).length, 0),
      materialItemsRun2: [...run2.values()].reduce((n, r) => n + r.items.filter((i) => MATERIAL(i.materiality)).length, 0),
      idStablePairs: idStable.length,
      idStableMaterialPairs: idStable.filter((s) => MATERIAL(s.materiality1) || MATERIAL(s.materiality2)).length,
      nonIdStableMaterialItems: materialVariance.length,
      byClass,
      identityAttributable: materialVariance.filter((c) => c.identityAttributable).length,
      conditionalRoleFoldedIntoBroaderSpan: materialVariance.filter((c) => c.conditionalRoleFolded).length,
      wordingVarianceAmongIdStable: wording,
      materialityVarianceAmongIdStable: materialityVar.length,
    },
    materialityVarianceAmongIdStable: materialityVar.map((m) => ({ region: m.region, id: m.id, role: m.role, run1: m.materiality1, run2: m.materiality2 })),
    perRegion,
    items: materialVariance,
  };
  writeFileSync(`${outDir}/01-pass-a-variance-forensics.json`, JSON.stringify(forensics, null, 2) + "\n");

  // ---- 02: semantic equivalence + stability two ways --------------------------
  const materialClusters = clusterRows.filter((c) => c.material);
  const inBothLenient = materialClusters.filter((c) => c.lenientStable);
  const inBothConservative = materialClusters.filter((c) => c.conservativeStable);
  const capturedAgree = (xs: typeof clusterRows) => xs.filter((c) => c.captured1 === c.captured2).length;
  const labelAgree = (xs: typeof clusterRows) => xs.filter((c) => c.dispositions1.length === 1 && c.dispositions2.length === 1 && c.dispositions1[0] === c.dispositions2[0]).length;
  // Adjudicated view of folded conditional roles: a folded CONDITION/EXCEPTION whose content words (>=40%) survive
  // in the container item's own Pass A proposition retained its semantics (Pass A output only - still no IR/verifier).
  const STOP = new Set("the and any all such that with from into upon under other than each case shall will been have this those these which their there where when only also being".split(" "));
  const toks = (s: string) => new Set([...s.toLowerCase().matchAll(/[a-z]{4,}/g)].map((m) => m[0]).filter((w) => !STOP.has(w)));
  const allItems = new Map<string, Item>();
  for (const [rid, R] of [...run1.entries(), ...run2.entries()]) for (const it of R.items) allItems.set(`${it.run}:${rid}:${it.id}`, it);
  const foldedRetained = new Set<string>();
  for (const c of classified) {
    if (!c.conditionalRoleFolded || !MATERIAL(c.materiality)) continue;
    const me = allItems.get(`${c.run}:${c.region}:${c.id}`)!;
    const T = toks(me.excerpt);
    const other = c.run === 1 ? 2 : 1;
    const best = Math.max(0, ...c.counterparts.map((cid) => { const cp = allItems.get(`${other}:${c.region}:${cid}`); if (!cp) return 0; const P = toks(cp.proposition); return [...T].filter((w) => P.has(w)).length / Math.max(1, T.size); }));
    if (best >= 0.4) foldedRetained.add(`${c.run}:${c.region}:${c.id}`);
  }
  // Coverage-weighted stability: material-inventoried characters present in both runs / in either run (regions in both runs only).
  let covUnion = 0, covBoth = 0;
  for (const regionId of [...run1.keys()].filter((k) => run2.has(k))) {
    const A = run1.get(regionId)!, B = run2.get(regionId)!;
    for (const [regId, r] of A.regionTexts) {
      const c1 = new Uint8Array(r.text.length), c2 = new Uint8Array(r.text.length);
      for (const it of A.items) if (MATERIAL(it.materiality) && it.regionId === regId) c1.fill(1, it.charStart, it.charEnd);
      for (const it of B.items) if (MATERIAL(it.materiality) && it.regionId === regId) c2.fill(1, it.charStart, it.charEnd);
      for (let k = 0; k < r.text.length; k++) { if (c1[k] || c2[k]) covUnion++; if (c1[k] && c2[k]) covBoth++; }
    }
  }
  const idShared = idStable.filter((s) => MATERIAL(s.materiality1) || MATERIAL(s.materiality2));
  const idSharedCapturedBoth = idShared.filter((s) => s.disposition1 && s.disposition2);
  const strictSame = idSharedCapturedBoth.filter((s) => s.disposition1 === s.disposition2).length;
  const prior = JSON.parse(readFileSync("docs/semantic-accountability/14-holdout-stability.json", "utf-8"));
  const equivalence = {
    schemaVersion: 1,
    artifactId: "02-semantic-equivalence-analysis",
    priorArtifact: { file: "docs/semantic-accountability/14-holdout-stability.json", dispositionStability: prior.totals.dispositionStability, inBoth: prior.totals.inBoth, sameDisposition: prior.totals.sameDisposition, inventoryVariance: prior.totals.inventoryVariance, compositionVariance: prior.totals.compositionVariance, materialUnion: prior.totals.materialUnion, stableCapturedRate: prior.totals.stableCapturedRate },
    whatThePriorMetricMeasured: "dispositionStability = sameDisposition / inBoth over items sharing an EXACT content-derived id. Its denominator (91) excludes every item whose id differed (the 372 'inventoryVariance' items); its numerator differences are Pass B/C disposition LABEL changes on id-stable items, not Pass A differences.",
    strictIdStability: {
      materialItemsSharingExactId: idShared.length,
      ofWhichDispositionedInBothRuns: idSharedCapturedBoth.length,
      sameDispositionLabel: strictSame,
      dispositionStability: idSharedCapturedBoth.length === 0 ? null : Number((strictSame / idSharedCapturedBoth.length).toFixed(4)),
      materialUnionByExactId: prior.totals.materialUnion,
      exactIdInventoryStability: Number((idShared.length / prior.totals.materialUnion).toFixed(4)),
      differingLabels: idSharedCapturedBoth.filter((s) => s.disposition1 !== s.disposition2).map((s) => ({ region: s.region, id: s.id, role: s.role, run1: s.disposition1, run2: s.disposition2 })),
    },
    semanticInventoryStability: {
      method: "Union-find clusters over id-identity, 1:1 span pairing, fragment/merge containment and within-run near-duplicates. A material cluster is STABLE when it has members in both runs. CONSERVATIVE additionally treats a CONDITION/EXCEPTION/SHARED_CAP/CURE/THRESHOLD/TRIGGER item that only survives in the other run FOLDED into a broader non-conditional span as NOT stable (a folded condition is a potential condition loss, never normalized away - mission §8/§11).",
      materialClusters: materialClusters.length,
      lenient: { inBoth: inBothLenient.length, stability: Number((inBothLenient.length / materialClusters.length).toFixed(4)) },
      conservative: { inBoth: inBothConservative.length, stability: Number((inBothConservative.length / materialClusters.length).toFixed(4)), gate: 0.95, pass: inBothConservative.length / materialClusters.length >= 0.95 },
      adjudicatedFolded: (() => {
        // A folded cluster is retained only when EVERY material folded member's semantics survive in a container proposition.
        const adjudicated = materialClusters.filter((c) => c.conservativeStable || (c.lenientStable && c.foldedConditionalRole && c.memberKeys.filter((k) => { const x = classified.find((y) => `${y.run}:${y.region}:${y.id}` === k); return x?.conditionalRoleFolded && MATERIAL(x.materiality); }).every((k) => foldedRetained.has(k))));
        return { method: "conservative, except a folded conditional-role item whose content words survive (>=40%) in the container's own Pass A proposition counts as retained", inBoth: adjudicated.length, stability: Number((adjudicated.length / materialClusters.length).toFixed(4)), foldedItemsMaterial: classified.filter((x) => x.conditionalRoleFolded && MATERIAL(x.materiality)).length, foldedItemsRetainedInContainerProposition: foldedRetained.size };
      })(),
      coverageWeighted: { method: "material-inventoried source characters present in both runs / present in either run (supplementary; not the gate metric)", charsInEither: covUnion, charsInBoth: covBoth, stability: Number((covBoth / covUnion).toFixed(4)) },
      clustersOnlyInOneRun: materialClusters.filter((c) => !c.lenientStable).map((c) => ({ clusterId: c.clusterId, region: c.region, roles: c.roles, inRun1: c.inRun1, inRun2: c.inRun2 })),
      foldedConditionalClusters: materialClusters.filter((c) => c.lenientStable && !c.conservativeStable).map((c) => ({ clusterId: c.clusterId, region: c.region, roles: c.roles })),
    },
    semanticDispositionStability: {
      method: "Over conservative-stable material clusters: captured-status agreement (captured = any member dispositioned non-MISSING) and exact disposition-label agreement (both runs' members carry one and the same label).",
      clusters: inBothConservative.length,
      capturedStatusAgree: capturedAgree(inBothConservative),
      capturedStability: Number((capturedAgree(inBothConservative) / inBothConservative.length).toFixed(4)),
      labelAgree: labelAgree(inBothConservative),
      labelStability: Number((labelAgree(inBothConservative) / inBothConservative.length).toFixed(4)),
      gate: 0.95,
      capturedPass: capturedAgree(inBothConservative) / inBothConservative.length >= 0.95,
      labelPass: labelAgree(inBothConservative) / inBothConservative.length >= 0.95,
      labelDisagreements: inBothConservative.filter((c) => !(c.dispositions1.length === 1 && c.dispositions2.length === 1 && c.dispositions1[0] === c.dispositions2[0])).map((c) => ({ clusterId: c.clusterId, region: c.region, roles: c.roles, run1: c.dispositions1, run2: c.dispositions2 })),
    },
    clusters: clusterRows.filter((c) => c.material),
  };
  writeFileSync(`${outDir}/02-semantic-equivalence-analysis.json`, JSON.stringify(equivalence, null, 2) + "\n");

  // ---- 03: genuine omissions ---------------------------------------------------
  const omissions = classified.filter((c) => c.class === "GENUINE_OMISSION" || c.class === "UNKNOWN" || c.class === "TRUE_SEMANTIC_VARIANCE");
  const omissionRows = omissions.map((c) => {
    const R = (c.run === 1 ? run1 : run2).get(c.region)!;
    const O = (c.run === 1 ? run2 : run1).get(c.region)!;
    const it = R.items.find((i) => i.id === c.id)!;
    const op = R.regionTexts.get(it.regionId)!;
    const excerptWs = ws(it.excerpt);
    const surfacedByVerifier = [...R.verifierEvidence, ...O.verifierEvidence].some((e) => e.includes(excerptWs) || excerptWs.includes(e));
    const provisos = (it.excerpt.match(/\bprovided\b/gi) ?? []).length;
    return {
      region: c.region,
      presentInRun: c.run,
      absentFromRun: c.run === 1 ? 2 : 1,
      id: c.id,
      class: c.class,
      role: it.role,
      materiality: it.materiality,
      critical: it.materiality === "CRITICAL",
      regionKind: op.kind,
      regionTruncatedAtBudget: op.truncatedAtBudget,
      span: `${it.regionId}:${it.charStart}-${it.charEnd}`,
      spanChars: len(it),
      positionInRegion: Number((it.charStart / Math.max(1, op.text.length)).toFixed(3)),
      quantitativeValues: it.values.map((v) => v.rawText),
      referencedTerms: it.referencedTerms,
      referencedSections: it.referencedSections,
      nestedProvisos: provisos,
      proposition: it.proposition,
      excerpt: it.excerpt,
      dispositionInPresentRun: it.disposition,
      surfacedByVerifier,
      coverageByOtherRun: Number(coverageBy(it, O.items).toFixed(3)),
      overlappingOtherRunItems: O.items.filter((o) => inter(it, o) > 0).map((o) => ({ id: o.id, role: o.role, span: `${o.charStart}-${o.charEnd}`, materiality: o.materiality })),
    };
  });
  const genuine = omissionRows.filter((r) => r.class === "GENUINE_OMISSION");
  const corr = (label: string, f: (r: (typeof omissionRows)[number]) => boolean) => ({ factor: label, genuineOmissionsWithFactor: genuine.filter(f).length, genuineOmissionsWithoutFactor: genuine.filter((r) => !f(r)).length });
  const omissionArtifact = {
    schemaVersion: 1,
    artifactId: "03-genuine-omission-analysis",
    definition: "GENUINE_OMISSION = a material item whose verified source span is touched by <20% by any item (any role, any materiality) of the other run. TRUE_SEMANTIC_VARIANCE (>=50% covered, no clean counterpart) and UNKNOWN (20-50%) are listed too for adjudication - they are NOT counted as omissions.",
    counts: { genuineOmissions: genuine.length, genuineCriticalOmissions: genuine.filter((r) => r.critical).length, trueSemanticVariance: omissionRows.filter((r) => r.class === "TRUE_SEMANTIC_VARIANCE").length, unknown: omissionRows.filter((r) => r.class === "UNKNOWN").length, surfacedByVerifier: genuine.filter((r) => r.surfacedByVerifier).length, byRegion: Object.fromEntries([...run1.keys()].filter((k) => run2.has(k)).map((k) => [k, genuine.filter((r) => r.region === k).length])), byRole: genuine.reduce<Record<string, number>>((m, r) => { m[r.role] = (m[r.role] ?? 0) + 1; return m; }, {}), byAbsentRun: { run1: genuine.filter((r) => r.absentFromRun === 1).length, run2: genuine.filter((r) => r.absentFromRun === 2).length } },
    measuredCorrelations: [
      corr("item sits in a source region truncated at budget", (r) => r.regionTruncatedAtBudget),
      corr("item sits in a CROSS_REFERENCE/ENCLOSING expansion region (not the operative region)", (r) => r.regionKind !== "OPERATIVE"),
      corr("item is in the last 20% of its region text (output-length pressure signature)", (r) => r.positionInRegion >= 0.8),
      corr("item carries a quantitative value", (r) => r.quantitativeValues.length > 0),
      corr("item contains a nested proviso ('provided')", (r) => r.nestedProvisos > 0),
      corr("item span < 60 chars (short connective/fragment)", (r) => r.spanChars < 60),
      corr("region has >= 4 expansion regions (dependency-expansion heavy)", (r) => (perRegion.find((p) => p.id === r.region) as { expansionRegions: number }).expansionRegions >= 4),
      corr("region operative text >= 8000 chars (long source region)", (r) => (perRegion.find((p) => p.id === r.region) as { operativeChars: number }).operativeChars >= 8000),
    ],
    passAStructuralFailureSignals: { inventoryStatusAllOk: [...run1.values(), ...run2.values()].every((r) => r.inventoryStatus === "INVENTORY_OK"), rejectedUnverifiableTotal: [...run1.values(), ...run2.values()].reduce((n, r) => n + r.rejectedUnverifiable, 0), rejectedDuplicatesTotal: [...run1.values(), ...run2.values()].reduce((n, r) => n + r.rejectedDuplicates, 0) },
    items: omissionRows,
  };
  writeFileSync(`${outDir}/03-genuine-omission-analysis.json`, JSON.stringify(omissionArtifact, null, 2) + "\n");
  console.log(JSON.stringify({ totals: forensics.totals, strict: equivalence.strictIdStability.dispositionStability, exactIdInventoryStability: equivalence.strictIdStability.exactIdInventoryStability, semanticLenient: equivalence.semanticInventoryStability.lenient, semanticConservative: equivalence.semanticInventoryStability.conservative, semanticDisposition: { captured: equivalence.semanticDispositionStability.capturedStability, label: equivalence.semanticDispositionStability.labelStability }, omissions: omissionArtifact.counts }, null, 2));
}

main();
