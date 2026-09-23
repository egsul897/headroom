/**
 * ZERO-COST candidate-span census across the four discovery populations.
 *
 * Every discovery candidate whose Pass C "neighborhood guarantee" appended the containing
 * section node (EXCEPTION / BASKET / PROVISO / CONDITION roles) reaches the compiler with the
 * WHOLE parent section concatenated after its own text, because both the production compile
 * input (lib/contract-model/analysis/orchestrator.ts) and this pilot's operativeTextFor() join
 * DESCENDANTS text of every structuralNodeId. This script measures how large that appended
 * text is per dataset, deterministically, from fixtures alone - no model calls.
 */
import fs from "node:fs";
import path from "node:path";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { THRESHOLDS } from "./shard-threshold-sim";
import { prepare } from "./compile-run";
import { operativeTextFor } from "./pipeline";
import { dedupExact } from "./dedup";

const OUT = "docs/phase-3-shard-threshold-simulation";
const FIX = "tests/fixtures/unseen-packages";
const P = {
  dsgrNodes: `${FIX}/phase-3f-first-blind-run/stage1-all-nodes.json`,
  dsgrStage2: `${FIX}/phase-3f-first-blind-run/stage2-all-discovery-candidates.json`,
  conmedStage2: `${FIX}/phase-2f-freeze/phase-2f-stage2-discovery-candidates.json`,
  lsbDiscovery: `${FIX}/lsb-2023-abl-credit-agreement/discovery-runs/run-1787801821.json`,
  lsbText: `${FIX}/lsb-2023-abl-credit-agreement/article-6-negative-covenants.txt`,
  fwrgDiscovery: `${FIX}/fwrg-2021-credit-agreement/discovery-runs/run-1787801821.json`,
  fwrgText: `${FIX}/fwrg-2021-credit-agreement/article-6-negative-covenants.txt`,
};
const ARTICLES: Record<string, string[] | null> = { dsgr: ["1", "6", "10"], conmed: ["7"], lsb: null, fwrg: null };
const CONTROLS = [
  "doc-a::VI::6.01-chapeau", "doc-a::VI::6.04-chapeau", "doc-a::VI::6.04-unrestricted-sub-valuation", "doc-a::VI::6.05-chapeau",
  "doc-a::VI::6.05-ip-flush-prohibition", "doc-a::VI::6.08b-chapeau", "doc-a::VI::6.10-chapeau", "doc-b::VI::6-01-lead-in",
  "doc-b::VI::6-04-lead-in", "doc-b::VI::6-05-lead-in", "doc-d::VI::6-01-chapeau", "doc-d::VI::6-04-chapeau", "doc-d::VI::6-05-chapeau", "doc-d::VI::6-08-b-chapeau",
];

type Cand = { discoveryId: string; documentId: string; structuralNodeKeys: string[]; normalizedSourceRef: string; role: string; discoveryMethods?: string[] };
const readJson = (p: string) => JSON.parse(fs.readFileSync(p, "utf8"));
const articleOf = (ref: string) => (String(ref).match(/^(\d+)/)?.[1] ?? "");
const eligible = (cs: Cand[], key: string) => cs.filter((c) => c.role !== "REPRESENTATION" && (ARTICLES[key] === null || ARTICLES[key]!.includes(articleOf(c.normalizedSourceRef))));
const stats = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const q = (p: number) => s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]! : 0; return { n: s.length, min: s[0] ?? 0, mean: s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : 0, median: q(0.5), p90: q(0.9), max: s[s.length - 1] ?? 0 }; };

/** Largest-occurrence span per nodeKey (nodeKeys are not physically unique: TOC and cross-reference occurrences share them). */
function spansFromNodes(nodes: { nodeKey: string; charStart: number | string; charEnd: number | string }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const n of nodes) { const span = Number(n.charEnd) - Number(n.charStart); if (span > (m.get(n.nodeKey) ?? -1)) m.set(n.nodeKey, span); }
  return m;
}
function spansFromText(documentId: string, file: string): Map<string, number> {
  const text = fs.readFileSync(file, "utf8");
  const nodes = parseDocumentStructure({ documentId, label: documentId, text });
  return spansFromNodes(nodes.map((n) => ({ nodeKey: n.nodeKey, charStart: n.charStart, charEnd: n.charEnd })));
}

interface Row { discoveryId: string; documentId: string; ref: string; role: string; keys: string[]; dual: boolean; ownChars: number | null; parentChars: number | null; operativeChars: number | null; parentRef: string | null }

function census(key: string, cands: Cand[], spanOf: (c: Cand, k: string) => number | null): { rows: Row[]; unresolvedKeys: number } {
  let unresolvedKeys = 0;
  const rows = cands.map((c) => {
    const keys = c.structuralNodeKeys ?? [];
    const spans = keys.map((k) => spanOf(c, k));
    unresolvedKeys += spans.filter((s) => s === null).length;
    const ok = spans.every((s) => s !== null);
    const total = ok ? (spans as number[]).reduce((a, b) => a + b, 0) + 2 * Math.max(0, keys.length - 1) : null;
    return { discoveryId: c.discoveryId, documentId: c.documentId, ref: String(c.normalizedSourceRef), role: c.role, keys, dual: keys.length > 1, ownChars: spans[0] ?? null, parentChars: keys.length > 1 ? spans[1] ?? null : null, operativeChars: total, parentRef: keys.length > 1 ? keys[1]!.split("::").slice(1).join("::") : null };
  });
  return { rows, unresolvedKeys };
}

function summarize(key: string, rows: Row[], unresolvedKeys: number, method: string) {
  const dual = rows.filter((r) => r.dual);
  const withLen = rows.filter((r) => r.operativeChars !== null);
  const roles: Record<string, number> = {}; for (const r of dual) roles[r.role] = (roles[r.role] ?? 0) + 1;
  const parents: Record<string, number> = {}; for (const r of dual) parents[r.parentRef!] = (parents[r.parentRef!] ?? 0) + 1;
  const perThreshold = THRESHOLDS.map((t) => ({
    threshold: t,
    maxPrimaryChars: 2 * t,
    candidatesOverTarget: withLen.filter((r) => r.operativeChars! > t).length,
    dualSplitOwnFromParent: dual.filter((r) => r.operativeChars !== null && r.operativeChars > t).length,
    appendedParentOversizedAtomic: dual.filter((r) => r.parentChars !== null && r.parentChars > 2 * t).length,
    singleKeyOversizedAtomic: rows.filter((r) => !r.dual && r.ownChars !== null && r.ownChars > 2 * t).length,
  }));
  return {
    dataset: key, method, candidates: rows.length, dual: dual.length, dualPct: rows.length ? Math.round((1000 * dual.length) / rows.length) / 10 : 0,
    allDualAreNeighborhoodExpansion: dual.every((r) => r.keys[0]!.startsWith(r.keys[1]!) && r.keys[0] !== r.keys[1]),
    dualRoles: roles, topAppendedParents: Object.entries(parents).sort((a, b) => b[1] - a[1]).slice(0, 10),
    unresolvedKeys,
    // PROPOSED candidate-span contract: operative text = anchor node only (ownChars); linked parents become typed context.
    proposedOperativeChars: { all: stats(rows.filter((r) => r.ownChars !== null).map((r) => r.ownChars!)), dual: stats(dual.filter((r) => r.ownChars !== null).map((r) => r.ownChars!)) },
    proposedReduction: (() => { const cur = withLen.reduce((a, r) => a + r.operativeChars!, 0); const pro = rows.filter((r) => r.ownChars !== null).reduce((a, r) => a + r.ownChars!, 0); return { currentTotalChars: cur, proposedTotalChars: pro, removedChars: cur - pro, reductionPct: cur ? Math.round((10000 * (cur - pro)) / cur) / 100 : 0 }; })(),
    proposedOverThresholds: { currentOver4k: withLen.filter((r) => r.operativeChars! > 4000).length, over4k: rows.filter((r) => (r.ownChars ?? 0) > 4000).length, currentOver6k: withLen.filter((r) => r.operativeChars! > 6000).length, over6k: rows.filter((r) => (r.ownChars ?? 0) > 6000).length, currentOver8k: withLen.filter((r) => r.operativeChars! > 8000).length, over8k: rows.filter((r) => (r.ownChars ?? 0) > 8000).length },
    // COVERAGE SAFETY: is every appended parent section itself the ANCHOR of some candidate? If so, moving it
    // out of the child's operative text cannot make its proposition disappear - the parent compiles it itself.
    appendedParentsIndependentlyAnchored: (() => { const anchors = new Set(rows.map((r) => r.keys[0])); const parents = [...new Set(dual.map((r) => r.keys[1]!))]; const covered = parents.filter((p) => anchors.has(p)); return { distinctAppendedParents: parents.length, alsoAnchorOfSomeCandidate: covered.length, notAnchored: parents.filter((p) => !anchors.has(p)) }; })(),
    operativeChars: { all: stats(withLen.map((r) => r.operativeChars!)), dual: stats(dual.filter((r) => r.operativeChars !== null).map((r) => r.operativeChars!)), single: stats(rows.filter((r) => !r.dual && r.operativeChars !== null).map((r) => r.operativeChars!)) },
    ownCharsOfDual: stats(dual.filter((r) => r.ownChars !== null).map((r) => r.ownChars!)),
    appendedParentChars: stats(dual.filter((r) => r.parentChars !== null).map((r) => r.parentChars!)),
    appendedCharsTotal: dual.reduce((a, r) => a + (r.parentChars ?? 0), 0),
    perThreshold,
  };
}

async function main() {
  // DSGR: spans from the frozen stage-1 node table (largest physical occurrence per nodeKey).
  const dsgrSpans = spansFromNodes(readJson(P.dsgrNodes));
  const dsgr = eligible(readJson(P.dsgrStage2), "dsgr").filter((c) => ["doc-a", "doc-b", "doc-d"].includes(c.documentId));
  const dsgrC = census("dsgr", dsgr, (_c, k) => dsgrSpans.get(k) ?? null);
  // LSB / FWRG: spans by re-parsing the preserved Article VI text with the repo's own parser.
  const lsbSpans = spansFromText("lsb", P.lsbText);
  const lsbC = census("lsb", eligible(readJson(P.lsbDiscovery).candidates, "lsb"), (_c, k) => lsbSpans.get(k) ?? null);
  const fwrgSpans = spansFromText("fwrg", P.fwrgText);
  const fwrgC = census("fwrg", eligible(readJson(P.fwrgDiscovery).candidates, "fwrg"), (_c, k) => fwrgSpans.get(k) ?? null);
  // CONMED: the sealed 137 (post-dedup), exact text lengths from the real index the pilot compiles against.
  const { stages, rehydrated } = await prepare();
  const { keep } = dedupExact(rehydrated, (c) => operativeTextFor(c, stages.index));
  const conmedC = census("conmed", keep as unknown as Cand[], (c, k) => { const i = (c as any).structuralNodeIds?.[(c.structuralNodeKeys ?? []).indexOf(k)]; return i ? stages.index.getNodeText(i, "DESCENDANTS").length : null; });

  const datasets = [
    summarize("dsgr", dsgrC.rows, dsgrC.unresolvedKeys, "STAGE1_NODE_SPANS_LARGEST_OCCURRENCE"),
    summarize("conmed", conmedC.rows, conmedC.unresolvedKeys, "EXACT_INDEX_DESCENDANTS_TEXT"),
    summarize("lsb", lsbC.rows, lsbC.unresolvedKeys, "REPARSED_ARTICLE_TEXT_SPANS"),
    summarize("fwrg", fwrgC.rows, fwrgC.unresolvedKeys, "REPARSED_ARTICLE_TEXT_SPANS"),
  ];
  const all = [...dsgrC.rows, ...conmedC.rows, ...lsbC.rows, ...fwrgC.rows];
  const universe = { candidates: all.length, dual: all.filter((r) => r.dual).length, dualPct: Math.round((1000 * all.filter((r) => r.dual).length) / all.length) / 10 };

  // The 14 false-credit controls are DSGR chapeaus / lead-ins: how often is each one's section appended as a parent?
  const controls = CONTROLS.map((id) => {
    const [doc, , tail] = id.split("::");
    const base = tail!.replace(/^(\d)-(\d\d)(?:-b)?.*$/, (_m, a, b) => `${a}.${b}`).replace(/^(\d\.\d\d)b.*$/, "$1").replace(/^(\d\.\d\d)-.*$/, "$1");
    const sub = /6-08-b|6\.08b/.test(tail!) ? "6.08(b)" : null;
    const parentKey = `${doc}::${sub ?? base}`;
    const appendedBy = dsgrC.rows.filter((r) => r.dual && r.documentId === doc && r.keys[1] === parentKey);
    const anchoredAt = dsgrC.rows.filter((r) => r.documentId === doc && r.keys[0] === parentKey);
    return { controlId: id, sectionKey: parentKey, sectionSpanChars: dsgrSpans.get(parentKey) ?? null, appendedAsParentBy: appendedBy.length, appendedByRoles: appendedBy.reduce<Record<string, number>>((a, r) => ((a[r.role] = (a[r.role] ?? 0) + 1), a), {}), candidatesAnchoredAtSection: anchoredAt.map((r) => ({ ref: r.ref, role: r.role, dual: r.dual })) };
  });

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "05-cross-dataset-span-census.json"), JSON.stringify({ generatedBy: "scripts/p3-conmed-pilot/span-census.ts", modelCalls: 0, universe, datasets, note: "operativeChars = sum of DESCENDANTS spans of every structuralNodeKey + 2 chars per join, i.e. exactly what orchestrator.ts:418 / operativeTextFor() hand the compiler. DSGR spans use the largest physical occurrence per nodeKey (nodeKeys are not unique) and are an upper bound; CONMED spans are exact." }, null, 2));
  fs.writeFileSync(path.join(OUT, "06-false-credit-controls-structural.json"), JSON.stringify({ generatedBy: "scripts/p3-conmed-pilot/span-census.ts", modelCalls: 0, controls, totals: { controls: controls.length, sectionsAppendedAtLeastOnce: controls.filter((c) => c.appendedAsParentBy > 0).length, appendedCandidateTotal: controls.reduce((a, c) => a + c.appendedAsParentBy, 0) } }, null, 2));
  fs.writeFileSync(path.join(OUT, "07-dual-key-rows.json"), JSON.stringify(all.filter((r) => r.dual), null, 2));

  for (const d of datasets) console.log(`PROPOSED ${d.dataset.padEnd(7)} ${d.proposedReduction.currentTotalChars} -> ${d.proposedReduction.proposedTotalChars} ch (-${d.proposedReduction.reductionPct}%) | p50 ${d.operativeChars.all.median}->${d.proposedOperativeChars.all.median} p90 ${d.operativeChars.all.p90}->${d.proposedOperativeChars.all.p90} max ${d.operativeChars.all.max}->${d.proposedOperativeChars.all.max} | >4k ${d.proposedOverThresholds.currentOver4k}->${d.proposedOverThresholds.over4k} >8k ${d.proposedOverThresholds.currentOver8k}->${d.proposedOverThresholds.over8k} | appendedParentsAlsoAnchored ${d.appendedParentsIndependentlyAnchored.alsoAnchorOfSomeCandidate}/${d.appendedParentsIndependentlyAnchored.distinctAppendedParents}`);
  for (const d of datasets) console.log(`${d.dataset.padEnd(7)} n=${d.candidates} dual=${d.dual} (${d.dualPct}%) unresolvedKeys=${d.unresolvedKeys} operative mean/med/p90/max=${d.operativeChars.all.mean}/${d.operativeChars.all.median}/${d.operativeChars.all.p90}/${d.operativeChars.all.max} own(dual) med=${d.ownCharsOfDual.median} parent med/max=${d.appendedParentChars.median}/${d.appendedParentChars.max} appendedTotal=${d.appendedCharsTotal}`);
  console.log("universe", universe);
  for (const c of controls) console.log(`  ${c.controlId.padEnd(44)} ${c.sectionKey.padEnd(14)} span=${c.sectionSpanChars} appendedBy=${c.appendedAsParentBy} anchored=${c.candidatesAnchoredAtSection.length}`);
}
if (process.argv[1]?.endsWith("span-census.ts")) void main();
