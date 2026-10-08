/**
 * Dependency-aware comparison views (Phase 2).
 *
 * Integrates Dependency Atlas + Definition Encyclopedia via published adapters
 * when available. Regex heuristics are labeled REGEX_HEURISTIC and never claim
 * complete dependency closure.
 */
import { atlasEdgesForSection, loadDependencyAtlas } from "./adapters/dependency-atlas";
import { encyclopediaHitsForTerm, loadDefinitionEncyclopedia } from "./adapters/definition-encyclopedia";
import type { PrecedentCorpus } from "./corpus";
import { profileProvision } from "./features";
import type { DependencyAwareComparisonView, DependencyLink, PrecedentComparisonRecord, PrecedentProvision } from "./types";

function crossRefs(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\bSection\s+\d+\.\d+(?:\([a-z0-9]+\))?/gi)) {
    out.push(m[0].replace(/\s+/g, " "));
  }
  return [...new Set(out)];
}

function definedTerms(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\b(?:Consolidated|Permitted|Restricted|Parent|Total|Senior|Secured)[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,4}\b/g)) {
    if (m[0].length >= 8 && m[0].length <= 60) out.push(m[0]);
  }
  return [...new Set(out)].slice(0, 20);
}

export function buildDependencyLinks(
  provision: PrecedentProvision,
  corpus: PrecedentCorpus,
  opts: { baseDir?: string } = {},
): { links: DependencyLink[]; missing: Array<{ provisionId: string; reason: string }> } {
  const links: DependencyLink[] = [];
  const missing: Array<{ provisionId: string; reason: string }> = [];
  const baseDir = opts.baseDir ?? process.cwd();

  for (const ref of crossRefs(provision.sourceText)) {
    const target = corpus.list().find(
      (p) =>
        p.locator.packageId === provision.locator.packageId &&
        (p.locator.sourceSectionRef === ref.replace(/^Section\s+/i, "") || ref.endsWith(p.locator.sourceSectionRef)),
    );
    links.push({
      kind: "CROSS_REFERENCE",
      fromProvisionId: provision.provisionId,
      toProvisionId: target?.provisionId ?? null,
      label: ref,
      evidence: ref,
      resolution: target ? "RESOLVED" : "UNRESOLVED",
      source: "LOCAL_HEURISTIC",
    });
    if (!target) missing.push({ provisionId: provision.provisionId, reason: `cross-reference ${ref} unresolved in corpus` });
  }

  const encycl = loadDefinitionEncyclopedia(baseDir);
  for (const term of definedTerms(provision.sourceText).slice(0, 8)) {
    const def = corpus.list().find(
      (p) => p.locator.packageId === provision.locator.packageId && p.covenantFamily === "DEFINITIONS_CALCULATION_RULES" && p.sourceText.includes(term),
    );
    if (def) {
      links.push({
        kind: "DEFINED_TERM",
        fromProvisionId: provision.provisionId,
        toProvisionId: def.provisionId,
        label: term,
        evidence: term,
        resolution: "RESOLVED",
        source: "LOCAL_HEURISTIC",
      });
    } else if (encycl.availability === "AVAILABLE" && encycl.data) {
      const hits = encyclopediaHitsForTerm(encycl.data, term);
      if (hits.length === 1) {
        links.push({
          kind: "ENCYCLOPEDIA_TERM",
          fromProvisionId: provision.provisionId,
          toProvisionId: null,
          label: term,
          evidence: hits[0]!.exactText.slice(0, 160),
          resolution: hits[0]!.provenanceValidated ? "RESOLVED" : "AMBIGUOUS",
          source: "DEFINITION_ENCYCLOPEDIA",
        });
      } else if (hits.length > 1) {
        links.push({
          kind: "ENCYCLOPEDIA_TERM",
          fromProvisionId: provision.provisionId,
          toProvisionId: null,
          label: term,
          evidence: `${hits.length} encyclopedia hits`,
          resolution: "AMBIGUOUS",
          source: "DEFINITION_ENCYCLOPEDIA",
        });
        missing.push({ provisionId: provision.provisionId, reason: `definition ${term} ambiguous (${hits.length} encyclopedia hits)` });
      } else {
        links.push({
          kind: "UNRESOLVED_CONTEXT",
          fromProvisionId: provision.provisionId,
          toProvisionId: null,
          label: term,
          evidence: term,
          resolution: "UNRESOLVED",
          source: "LOCAL_HEURISTIC",
        });
        missing.push({ provisionId: provision.provisionId, reason: `defined term ${term} not resolved` });
      }
    } else {
      links.push({
        kind: "DEFINED_TERM",
        fromProvisionId: provision.provisionId,
        toProvisionId: null,
        label: term,
        evidence: term,
        resolution: "REGEX_HEURISTIC",
        source: "LOCAL_HEURISTIC",
      });
      missing.push({
        provisionId: provision.provisionId,
        reason: `defined term ${term} unresolved; encyclopedia ${encycl.availability}`,
      });
    }
  }

  if (provision.amendsProvisionId) {
    links.push({
      kind: "AMENDS",
      fromProvisionId: provision.provisionId,
      toProvisionId: provision.amendsProvisionId,
      label: `amends ${provision.amendsProvisionId}`,
      evidence: provision.locator.sourceSectionRef,
      resolution: corpus.get(provision.amendsProvisionId) ? "RESOLVED" : "UNRESOLVED",
      source: "LOCAL_HEURISTIC",
    });
  }

  const profile = profileProvision(provision);
  for (const f of profile.features.filter((x) => x === "SHARED_CAPACITY" || x === "RECLASSIFICATION_RIGHT")) {
    links.push({
      kind: "SHARED_FEATURE",
      fromProvisionId: provision.provisionId,
      toProvisionId: null,
      label: f,
      evidence: profile.featureEvidence[f] ?? f,
      resolution: "REGEX_HEURISTIC",
      source: "LOCAL_HEURISTIC",
    });
  }

  const atlas = loadDependencyAtlas(baseDir);
  if (atlas.availability === "AVAILABLE" && atlas.data) {
    const edges = atlasEdgesForSection(atlas.data, provision.locator.sourceSectionRef).slice(0, 12);
    for (const e of edges) {
      links.push({
        kind: "ATLAS_EDGE",
        fromProvisionId: provision.provisionId,
        toProvisionId: null,
        label: `${e.kind}:${e.toNodeId}`,
        evidence: e.rationale,
        resolution: e.resolution === "RESOLVED" || e.resolution === "UNRESOLVED" || e.resolution === "AMBIGUOUS" ? e.resolution : "AMBIGUOUS",
        source: "DEPENDENCY_ATLAS",
      });
      if (e.resolution !== "RESOLVED") {
        missing.push({ provisionId: provision.provisionId, reason: `atlas edge ${e.edgeId} ${e.resolution}: ${e.unresolvedReason ?? e.rationale}` });
      }
    }
  } else {
    missing.push({
      provisionId: provision.provisionId,
      reason: `Dependency Atlas ${atlas.availability} — closure incomplete (${atlas.note})`,
    });
  }

  return { links, missing };
}

function linkKey(l: DependencyLink): string {
  return `${l.kind}|${l.label.toLowerCase()}|${l.source}`;
}

export function dependencyAwareView(
  corpus: PrecedentCorpus,
  comparison: PrecedentComparisonRecord,
  opts: { baseDir?: string } = {},
): DependencyAwareComparisonView {
  const left = corpus.get(comparison.leftProvisionId);
  const right = corpus.get(comparison.rightProvisionId);
  if (!left || !right) {
    throw new Error("dependencyAwareView: comparison provision(s) missing from corpus");
  }
  const leftBuilt = buildDependencyLinks(left, corpus, opts);
  const rightBuilt = buildDependencyLinks(right, corpus, opts);
  const leftLinks = leftBuilt.links;
  const rightLinks = rightBuilt.links;
  const rightKeys = new Set(rightLinks.map(linkKey));
  const leftKeys = new Set(leftLinks.map(linkKey));
  const sharedDependencies = leftLinks.filter((l) => rightKeys.has(linkKey(l)));
  const missingOrAmbiguousContext = [...leftBuilt.missing, ...rightBuilt.missing];
  const closureComplete = missingOrAmbiguousContext.length === 0 && leftLinks.every((l) => l.resolution === "RESOLVED") && rightLinks.every((l) => l.resolution === "RESOLVED");

  return {
    comparisonId: comparison.comparisonId,
    leftLinks,
    rightLinks,
    sharedDependencies,
    asymmetricDependencies: {
      leftOnly: leftLinks.filter((l) => !rightKeys.has(linkKey(l))),
      rightOnly: rightLinks.filter((l) => !leftKeys.has(linkKey(l))),
    },
    missingOrAmbiguousContext,
    closureComplete,
    note:
      "Dependency links combine local heuristics with Dependency Atlas / Definition Encyclopedia adapters when exports are present. " +
      "REGEX_HEURISTIC and UNRESOLVED links do not claim complete dependency closure. " +
      "A shared link label is structural similarity, not identical legal effect.",
  };
}
