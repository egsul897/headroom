/**
 * Controlling-context assembly for qualified comparisons (Phase 4).
 *
 * Consumes peer adapters (Atlas, Encyclopedia, ACR, FDP) when exports are
 * present. Never invents a competing canonical knowledge schema.
 */
import { loadAmendmentChainResearch } from "./adapters/amendment-chain";
import { atlasEdgesForSection, loadDependencyAtlas } from "./adapters/dependency-atlas";
import { encyclopediaHitsForTerm, loadDefinitionEncyclopedia } from "./adapters/definition-encyclopedia";
import { loadFinancialDefinitionsPrecedent } from "./adapters/financial-definitions-precedent";
import type { PrecedentCorpus } from "./corpus";
import type { PrecedentProvision } from "./types";
import { stratifiedSample } from "./validation/corpus-audit";

export type MissingDependencyKind =
  | "DEFINED_TERM"
  | "PARENT_COVENANT_LANGUAGE"
  | "PROVISO"
  | "ENTITY_RESTRICTION"
  | "CROSS_REFERENCE"
  | "AMENDMENT_VERSION_AUTHORITY"
  | "OTHER_CONTROLLING_DOCUMENT"
  | "SHORT_BASKET_WITHOUT_PARENT";

export interface MissingDependency {
  kind: MissingDependencyKind;
  label: string;
  detail: string;
  resolvedByPeer: "NONE" | "WS-CDA" | "WS-DEF" | "WS-ACR" | "WS-FDP";
}

export interface AssembledContext {
  provisionId: string;
  complete: boolean;
  missing: MissingDependency[];
  assembledSnippets: Array<{ source: string; text: string }>;
  peerAvailability: Record<string, string>;
}

const DEFINED_TERM_NEEDLES = [
  "Consolidated EBITDA",
  "Consolidated Net Income",
  "Available Amount",
  "Available Equity Amount",
  "Indebtedness",
  "Permitted Lien",
  "Permitted Liens",
  "Restricted Subsidiary",
  "Unrestricted Subsidiary",
  "Total Net Leverage",
  "First Lien Net Leverage",
  "Fixed Charge Coverage",
  "Maximum Incremental Amount",
  "Free and Clear Amount",
  "Ratio Amount",
  "Net Proceeds",
];

function referencedTerms(text: string): string[] {
  return DEFINED_TERM_NEEDLES.filter((t) => text.includes(t));
}

export function classifyMissingDependencies(
  provision: PrecedentProvision,
  corpus: PrecedentCorpus,
): MissingDependency[] {
  const missing: MissingDependency[] = [];
  const text = provision.sourceText;
  const pkgDefs = corpus.list().filter(
    (d) =>
      d.locator.packageId === provision.locator.packageId &&
      d.covenantFamily === "DEFINITIONS_CALCULATION_RULES" &&
      d.sourceText.length > 40,
  );

  for (const term of referencedTerms(text)) {
    const local = pkgDefs.some((d) => d.sourceText.includes(term) || d.locator.sourceSectionRef.includes(term));
    if (!local) {
      missing.push({
        kind: "DEFINED_TERM",
        label: term,
        detail: `No same-package definition excerpt for "${term}"`,
        resolvedByPeer: "NONE",
      });
    }
  }

  if (provision.tags.includes("basket") && provision.sourceText.length < 400) {
    const parentRef = provision.locator.sourceSectionRef.replace(/\([a-z0-9]+\)$/i, "");
    const parent = corpus.list().find(
      (p) =>
        p.locator.packageId === provision.locator.packageId &&
        p.locator.sourceSectionRef === parentRef &&
        p.sourceText.length >= 400,
    );
    if (!parent) {
      missing.push({
        kind: "SHORT_BASKET_WITHOUT_PARENT",
        label: provision.locator.sourceSectionRef,
        detail: "Short basket extract without assembled parent covenant section",
        resolvedByPeer: "NONE",
      });
    } else if (!missing.some((m) => m.kind === "PARENT_COVENANT_LANGUAGE")) {
      // Parent exists — not missing; assembly can attach it.
    } else {
      missing.push({
        kind: "PARENT_COVENANT_LANGUAGE",
        label: parentRef,
        detail: "Parent covenant language not attached to basket comparison inputs",
        resolvedByPeer: "NONE",
      });
    }
    if (!parent) {
      /* already pushed SHORT_BASKET */
    }
  }

  if (/\bprovided(?:\s*,?\s*that|\s+further)\b/i.test(text) === false && /\bexcept\b/i.test(text)) {
    // Exception without local proviso — may depend on remote provisos in parent
    if (provision.tags.includes("basket")) {
      missing.push({
        kind: "PROVISO",
        label: "possible remote proviso",
        detail: "Basket carveout may be conditioned by parent-section provisos not in span",
        resolvedByPeer: "NONE",
      });
    }
  }

  if (/\b(?:Restricted Subsidiar|Guarantor|Loan Party|non[- ]Guarantor)\b/i.test(text) === false && /\bSubsidiary\b/i.test(text)) {
    missing.push({
      kind: "ENTITY_RESTRICTION",
      label: "Subsidiary",
      detail: "Generic Subsidiary reference without Restricted/Guarantor qualification in span",
      resolvedByPeer: "NONE",
    });
  }

  for (const m of text.matchAll(/\bSection\s+\d+\.\d+(?:\([a-z0-9]+\))?/gi)) {
    const ref = m[0]!.replace(/\s+/g, " ");
    const num = ref.replace(/^Section\s+/i, "");
    const hit = corpus.list().find(
      (p) => p.locator.packageId === provision.locator.packageId && p.locator.sourceSectionRef === num,
    );
    if (!hit) {
      missing.push({
        kind: "CROSS_REFERENCE",
        label: ref,
        detail: `Cross-reference ${ref} unresolved in corpus`,
        resolvedByPeer: "NONE",
      });
    }
  }

  if (provision.documentRole === "AMENDMENT" || provision.amendsProvisionId) {
    if (provision.amendsProvisionId && !corpus.get(provision.amendsProvisionId)) {
      missing.push({
        kind: "AMENDMENT_VERSION_AUTHORITY",
        label: provision.amendsProvisionId,
        detail: "Amendment target provision missing from corpus",
        resolvedByPeer: "NONE",
      });
    }
  }

  if (/\bIntercreditor Agreement\b|\bGuarantee and Collateral Agreement\b|\bCollateral Documents\b/i.test(text)) {
    missing.push({
      kind: "OTHER_CONTROLLING_DOCUMENT",
      label: "cross-document instrument",
      detail: "References Intercreditor / GCA / Collateral Documents not closed in PCI corpus",
      resolvedByPeer: "NONE",
    });
  }

  return missing;
}

/**
 * Attempt to resolve missing dependencies via peer published adapters.
 */
export function assembleControllingContext(
  provision: PrecedentProvision,
  corpus: PrecedentCorpus,
  baseDir: string = process.cwd(),
): AssembledContext {
  const missing = classifyMissingDependencies(provision, corpus);
  const assembledSnippets: Array<{ source: string; text: string }> = [];
  const atlas = loadDependencyAtlas(baseDir);
  const encycl = loadDefinitionEncyclopedia(baseDir);
  const acr = loadAmendmentChainResearch(baseDir);
  const fdp = loadFinancialDefinitionsPrecedent(baseDir);

  // Attach parent covenant when basket is short
  if (provision.tags.includes("basket") && provision.sourceText.length < 400) {
    const parentRef = provision.locator.sourceSectionRef.replace(/\([a-z0-9]+\)$/i, "");
    const parent = corpus.list().find(
      (p) =>
        p.locator.packageId === provision.locator.packageId &&
        p.locator.sourceSectionRef === parentRef &&
        p.provisionId !== provision.provisionId,
    );
    if (parent) {
      assembledSnippets.push({ source: `corpus:${parent.provisionId}`, text: parent.sourceText.slice(0, 800) });
      for (let i = missing.length - 1; i >= 0; i--) {
        if (missing[i]!.kind === "SHORT_BASKET_WITHOUT_PARENT" || missing[i]!.kind === "PARENT_COVENANT_LANGUAGE") {
          missing.splice(i, 1);
        }
      }
    }
  }

  if (encycl.availability === "AVAILABLE" && encycl.data) {
    for (const dep of missing) {
      if (dep.kind !== "DEFINED_TERM") continue;
      const hits = encyclopediaHitsForTerm(encycl.data, dep.label);
      if (hits.length === 1) {
        assembledSnippets.push({ source: `WS-DEF:${hits[0]!.exampleId}`, text: hits[0]!.exactText.slice(0, 400) });
        dep.resolvedByPeer = "WS-DEF";
      }
    }
  }

  if (atlas.availability === "AVAILABLE" && atlas.data) {
    const edges = atlasEdgesForSection(atlas.data, provision.locator.sourceSectionRef);
    for (const e of edges.slice(0, 8)) {
      assembledSnippets.push({
        source: `WS-CDA:${e.edgeId}`,
        text: `${e.kind} ${e.resolution}: ${e.rationale}`.slice(0, 300),
      });
      if (e.resolution === "RESOLVED") {
        for (const dep of missing) {
          if (dep.kind === "CROSS_REFERENCE" || dep.kind === "DEFINED_TERM") {
            if (e.rationale.toLowerCase().includes(dep.label.toLowerCase().slice(0, 12))) {
              dep.resolvedByPeer = "WS-CDA";
            }
          }
        }
      }
    }
  }

  if (acr.availability === "AVAILABLE" && acr.data) {
    for (const dep of missing) {
      if (dep.kind === "AMENDMENT_VERSION_AUTHORITY") {
        dep.resolvedByPeer = "WS-ACR";
        assembledSnippets.push({
          source: "WS-ACR",
          text: `ACR export present (${acr.data.chainCount} chains) — use for amendment authority when matching accession/exhibit`,
        });
      }
    }
  }

  if (fdp.availability === "AVAILABLE" && fdp.data) {
    for (const dep of missing) {
      if (dep.kind === "DEFINED_TERM" && /EBITDA|Leverage|Coverage|Available/i.test(dep.label)) {
        dep.resolvedByPeer = dep.resolvedByPeer === "NONE" ? "WS-FDP" : dep.resolvedByPeer;
        assembledSnippets.push({
          source: "WS-FDP",
          text: `FDP export present (${fdp.data.recordCount} records) — financial definition precedent available for ${dep.label}`,
        });
      }
    }
  }

  const unresolved = missing.filter((m) => m.resolvedByPeer === "NONE");
  return {
    provisionId: provision.provisionId,
    complete: unresolved.length === 0,
    missing,
    assembledSnippets,
    peerAvailability: {
      atlas: atlas.availability,
      encyclopedia: encycl.availability,
      amendmentChain: acr.availability,
      financialDefinitionsPrecedent: fdp.availability,
    },
  };
}

export function auditContextIncompleteness(
  corpus: PrecedentCorpus,
  sampleSize = 100,
  baseDir: string = process.cwd(),
): {
  sampleSize: number;
  incompleteBeforeAssembly: number;
  incompleteAfterAssembly: number;
  byKind: Record<MissingDependencyKind, number>;
  resolvedByPeer: Record<string, number>;
  examples: AssembledContext[];
} {
  const sample = stratifiedSample(corpus.list(), sampleSize);
  const byKind: Record<MissingDependencyKind, number> = {
    DEFINED_TERM: 0,
    PARENT_COVENANT_LANGUAGE: 0,
    PROVISO: 0,
    ENTITY_RESTRICTION: 0,
    CROSS_REFERENCE: 0,
    AMENDMENT_VERSION_AUTHORITY: 0,
    OTHER_CONTROLLING_DOCUMENT: 0,
    SHORT_BASKET_WITHOUT_PARENT: 0,
  };
  const resolvedByPeer: Record<string, number> = {};
  let incompleteBefore = 0;
  let incompleteAfter = 0;
  const examples: AssembledContext[] = [];

  for (const p of sample) {
    const before = classifyMissingDependencies(p, corpus);
    if (before.length > 0) incompleteBefore += 1;
    const assembled = assembleControllingContext(p, corpus, baseDir);
    if (!assembled.complete) incompleteAfter += 1;
    for (const m of before) byKind[m.kind] = (byKind[m.kind] ?? 0) + 1;
    for (const m of assembled.missing) {
      if (m.resolvedByPeer !== "NONE") {
        resolvedByPeer[m.resolvedByPeer] = (resolvedByPeer[m.resolvedByPeer] ?? 0) + 1;
      }
    }
    if (before.length > 0 && examples.length < 12) examples.push(assembled);
  }

  return {
    sampleSize: sample.length,
    incompleteBeforeAssembly: incompleteBefore,
    incompleteAfterAssembly: incompleteAfter,
    byKind,
    resolvedByPeer,
    examples,
  };
}
