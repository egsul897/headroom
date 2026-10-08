/**
 * Dependency-aware comparison views — cross-references, defined terms,
 * amendment links, and shared drafting features across a corpus.
 */
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

export function buildDependencyLinks(provision: PrecedentProvision, corpus: PrecedentCorpus): DependencyLink[] {
  const links: DependencyLink[] = [];
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
    });
  }
  for (const term of definedTerms(provision.sourceText).slice(0, 8)) {
    const def = corpus.list().find((p) => p.locator.packageId === provision.locator.packageId && p.covenantFamily === "DEFINITIONS_CALCULATION_RULES" && p.sourceText.includes(term));
    links.push({
      kind: "DEFINED_TERM",
      fromProvisionId: provision.provisionId,
      toProvisionId: def?.provisionId ?? null,
      label: term,
      evidence: term,
    });
  }
  if (provision.amendsProvisionId) {
    links.push({
      kind: "AMENDS",
      fromProvisionId: provision.provisionId,
      toProvisionId: provision.amendsProvisionId,
      label: `amends ${provision.amendsProvisionId}`,
      evidence: provision.locator.sourceSectionRef,
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
    });
  }
  return links;
}

function linkKey(l: DependencyLink): string {
  return `${l.kind}|${l.label.toLowerCase()}`;
}

export function dependencyAwareView(
  corpus: PrecedentCorpus,
  comparison: PrecedentComparisonRecord,
): DependencyAwareComparisonView {
  const left = corpus.get(comparison.leftProvisionId);
  const right = corpus.get(comparison.rightProvisionId);
  if (!left || !right) {
    throw new Error("dependencyAwareView: comparison provision(s) missing from corpus");
  }
  const leftLinks = buildDependencyLinks(left, corpus);
  const rightLinks = buildDependencyLinks(right, corpus);
  const rightKeys = new Set(rightLinks.map(linkKey));
  const leftKeys = new Set(leftLinks.map(linkKey));
  const sharedDependencies = leftLinks.filter((l) => rightKeys.has(linkKey(l)));
  const leftOnly = leftLinks.filter((l) => !rightKeys.has(linkKey(l)));
  const rightOnly = rightLinks.filter((l) => !leftKeys.has(linkKey(l)));

  return {
    comparisonId: comparison.comparisonId,
    leftLinks,
    rightLinks,
    sharedDependencies,
    asymmetricDependencies: { leftOnly, rightOnly },
    note:
      "Dependency links are source-derived cross-references, defined-term mentions, amendment edges, and shared-capacity/reclassification markers. " +
      "A shared link label is structural similarity, not identical legal effect.",
  };
}
