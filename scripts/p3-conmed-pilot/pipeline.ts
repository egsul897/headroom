/**
 * The CONMED pilot's deterministic scaffold: everything up to compilation, at zero cost.
 *
 * §5 requires the PREVIOUSLY SEALED CONMED population, so discovery is NOT re-run — the
 * frozen phase-2f stage-2 candidates are loaded as-is. Everything else (structural index,
 * package graph, context bundles) is deterministic and rebuilt from the agreement's own
 * text, because the compiler's tool access needs live objects, not serialized JSON.
 *
 * Forensic tooling. Nothing in the production pipeline imports it.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { detectStructuralReferences } from "../../lib/contract-model/compiler/structural-references";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { buildPackageGraph } from "../../lib/contract-model/compiler/package-graph/pipeline";
import type { PackageDocumentInput } from "../../lib/contract-model/compiler/package-graph/types";
import { buildCovenantContextBundle } from "../../lib/contract-model/compiler/context-retrieval/pipeline";
import { isEligibleForSemanticCompilation } from "../../lib/contract-model/compiler/semantic/package-compile";
import type { DiscoveredCandidate } from "../../lib/contract-model/compiler/discovery/types";

const ROOT = process.cwd();
const PKG_DIR = path.join(ROOT, "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated");
export const SEALED_POPULATION_PATH = "tests/fixtures/unseen-packages/phase-2f-freeze/phase-2f-stage2-discovery-candidates.json";

export const COMPANY_ID = "conmed-pilot";
export const PACKAGE_KEY = "conmed-2025-credit-facility";
export const INSTRUMENT_KEY = "conmed-eighth-ar-credit-agreement";

/** Exactly the document set Phase 2F's own stage-1 harness used — unchanged. */
export const DOCS = [
  { documentId: "conmed-doc-a-eighth-ar-credit-agreement", label: "CONMED Eighth Amended and Restated Credit Agreement (2025-06-10)", files: ["base-credit-agreement-definitions-excerpt.txt", "base-credit-agreement-article-vii-negative-covenants.txt"] },
  { documentId: "conmed-doc-b-guarantee-collateral-agreement", label: "CONMED Amended and Restated Guarantee and Collateral Agreement (2025-06-10)", files: ["guarantee-and-collateral-agreement-full.txt"] },
  { documentId: "conmed-doc-c-second-amendment-2022", label: "CONMED Second Amendment to Seventh A&R Credit Agreement (2022-08-01)", files: ["second-amendment-2022-full.txt"] },
  { documentId: "conmed-doc-d-first-omnibus-amendment-2026", label: "CONMED First Omnibus Amendment and Increased Facility Activation Notice (2026-05-27)", files: ["first-omnibus-amendment-2026-curated.txt"] },
] as const;

export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export function buildDeterministicStages() {
  const nodesByDocument = new Map<string, { text: string; nodes: ReturnType<typeof parseDocumentStructure> }>();
  const allDefinitions = [];
  const allReferences = [];
  const documents: PackageDocumentInput[] = [];

  for (const doc of DOCS) {
    const text = doc.files.map((f) => fs.readFileSync(path.join(PKG_DIR, f), "utf-8")).join("\n\n");
    const nodes = parseDocumentStructure({ documentId: doc.documentId, label: doc.label, text });
    nodesByDocument.set(doc.documentId, { text, nodes });
    allReferences.push(...detectStructuralReferences(doc.documentId, text, nodes));
    allDefinitions.push(...detectStructuralDefinitions(doc.documentId, text, nodes));
    documents.push({ documentId: doc.documentId, label: doc.label, text });
  }

  const index = buildStructuralIndex(nodesByDocument, allDefinitions, allReferences);
  const packageGraph = buildPackageGraph(COMPANY_ID, PACKAGE_KEY, documents);

  const exactTermsByDocument = new Map<string, Map<string, string>>();
  for (const def of allDefinitions) {
    if (!exactTermsByDocument.has(def.documentId)) exactTermsByDocument.set(def.documentId, new Map());
    exactTermsByDocument.get(def.documentId)!.set(def.normalizedTerm, def.exactTerm);
  }

  return { index, packageGraph, documents, allDefinitions, allReferences, access: { index, packageGraph, exactTermsByDocument } };
}

/**
 * §5 — the sealed population, loaded not regenerated, then passed through PRODUCTION's
 * own eligibility predicate. No caseId, no benchmark address and no expected answer is
 * consulted; there is no cap and no slice.
 */
export function sealedPopulation(): { all: DiscoveredCandidate[]; eligible: DiscoveredCandidate[]; ineligible: { discoveryId: string; reason: string }[] } {
  const all = JSON.parse(fs.readFileSync(path.join(ROOT, SEALED_POPULATION_PATH), "utf8")) as DiscoveredCandidate[];
  const eligible: DiscoveredCandidate[] = [];
  const ineligible: { discoveryId: string; reason: string }[] = [];
  for (const c of all) {
    const check = isEligibleForSemanticCompilation(c);
    if (check.eligible) eligible.push(c);
    else ineligible.push({ discoveryId: c.discoveryId, reason: check.reason! });
  }
  return { all, eligible, ineligible };
}

/**
 * The sealed candidates predate the Phase 3F.1.2 identity migration: they carry
 * `structuralNodeKeys` ("documentId::sectionRef") but no `structuralNodeIds`, which is
 * what every current code path uses for identity. Rehydration resolves each key against
 * the REBUILT index using production's own `resolveUniqueNodeByRef`.
 *
 * This is a translation, never an invention. A key that does not resolve uniquely is
 * reported, not quietly dropped and not guessed at — a silently discarded candidate here
 * would reproduce, in a new place, exactly the truncation this whole line of work exists
 * to expose.
 */
export interface Rehydration {
  rehydrated: DiscoveredCandidate[];
  unresolved: { discoveryId: string; nodeKey: string; outcome: string }[];
}

export function rehydrateNodeIds(candidates: DiscoveredCandidate[], index: ReturnType<typeof buildStructuralIndex>): Rehydration {
  const rehydrated: DiscoveredCandidate[] = [];
  const unresolved: { discoveryId: string; nodeKey: string; outcome: string }[] = [];

  for (const c of candidates) {
    if (Array.isArray(c.structuralNodeIds) && c.structuralNodeIds.length > 0) {
      rehydrated.push(c);
      continue;
    }
    const ids: string[] = [];
    for (const key of c.structuralNodeKeys ?? []) {
      const sep = key.indexOf("::");
      const documentId = sep >= 0 ? key.slice(0, sep) : c.documentId;
      const sectionRef = sep >= 0 ? key.slice(sep + 2) : key;
      const res = index.resolveUniqueNodeByRef(documentId, sectionRef);
      if (res.status === "UNIQUE") ids.push(res.node.nodeId);
      else unresolved.push({ discoveryId: c.discoveryId, nodeKey: key, outcome: res.status });
    }
    rehydrated.push({ ...c, structuralNodeIds: ids });
  }

  return { rehydrated, unresolved };
}

export function contextBundlesFor(candidates: DiscoveredCandidate[], access: ReturnType<typeof buildDeterministicStages>["access"]) {
  const byId = new Map<string, ReturnType<typeof buildCovenantContextBundle>>();
  for (const candidate of candidates) {
    byId.set(candidate.discoveryId, buildCovenantContextBundle({ candidate, packageKey: PACKAGE_KEY, companyId: COMPANY_ID, instrumentKey: INSTRUMENT_KEY }, access));
  }
  return byId;
}

/** The exact operative text production would compile for a candidate. */
export function operativeTextFor(candidate: DiscoveredCandidate, index: ReturnType<typeof buildStructuralIndex>): string {
  return candidate.structuralNodeIds.map((id) => index.getNodeText(id, "DESCENDANTS")).join("\n\n");
}

if (process.argv[1]?.endsWith("pipeline.ts")) {
  const stages = buildDeterministicStages();
  const pop = sealedPopulation();
  const { rehydrated, unresolved } = rehydrateNodeIds(pop.eligible, stages.index);
  const bundles = contextBundlesFor(rehydrated, stages.access);
  const texts = rehydrated.map((c) => operativeTextFor(c, stages.index));
  const empty = texts.filter((t) => t.trim().length === 0).length;

  console.log(
    JSON.stringify(
      {
        sealedPopulation: pop.all.length,
        eligible: pop.eligible.length,
        ineligible: pop.ineligible.length,
        uniqueDiscoveryIds: new Set(pop.all.map((c) => c.discoveryId)).size,
        articles: [...new Set(pop.all.map((c) => String(c.normalizedSourceRef).split(".")[0]))],
        documents: [...new Set(pop.all.map((c) => c.documentId))],
        rehydratedCandidates: rehydrated.length,
        candidatesWithZeroResolvedNodes: rehydrated.filter((c) => c.structuralNodeIds.length === 0).length,
        unresolvedNodeKeys: unresolved.length,
        unresolvedSample: unresolved.slice(0, 5),
        contextBundlesBuilt: bundles.size,
        operativeTextEmpty: empty,
        operativeTextChars: { total: texts.reduce((n, t) => n + t.length, 0), mean: Math.round(texts.reduce((n, t) => n + t.length, 0) / texts.length), max: Math.max(...texts.map((t) => t.length)) },
        bundleSufficiency: [...bundles.values()].reduce((a: Record<string, number>, b) => { a[b.sufficiencyState] = (a[b.sufficiencyState] ?? 0) + 1; return a; }, {}),
      },
      null,
      2,
    ),
  );
}
