/**
 * Canonical peer-workstream integration for the Basket Formula Library.
 *
 * Consumes existing Knowledge Factory / peer exports via supported adapters.
 * Does not establish a competing source registry or fabricate successful
 * integrations when peers are unavailable or unverified.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadKnowledgeFactoryCorpus } from "../precedent-comparison/adapters/knowledge-factory";
import { loadDefinitionEncyclopedia } from "../precedent-comparison/adapters/definition-encyclopedia";
import { loadDependencyAtlas } from "../precedent-comparison/adapters/dependency-atlas";
import { loadNegativeCovenantExceptionDatabase } from "../precedent-comparison/adapters/negative-covenant-exceptions";
import { loadFinancialDefinitionsPrecedent } from "../precedent-comparison/adapters/financial-definitions-precedent";
import { loadAmendmentChainResearch } from "../precedent-comparison/adapters/amendment-chain";
import type { PeerLoadResult } from "../precedent-comparison/adapters/types";

export interface PeerIntegrationReport {
  knowledgeFactory: PeerLoadResult<unknown> & { legallyVerified: false; sufficientForExecutable: false };
  definitionEncyclopedia: PeerLoadResult<unknown> & { legallyVerified: false };
  dependencyAtlas: PeerLoadResult<unknown> & { legallyVerified: false };
  negativeCovenantExceptionDatabase: PeerLoadResult<unknown> & { legallyVerified: false };
  financialDefinitionsPrecedent: PeerLoadResult<unknown> & { legallyVerified: false };
  amendmentAuthority: PeerLoadResult<unknown> & { legallyVerified: false };
  legalCore: {
    peer: "LEGAL_CORE";
    availability: "UNAVAILABLE" | "INTERFACE_ONLY";
    legallyVerified: false;
    note: string;
  };
  /** Discoverable ≠ source-backed ≠ legally verified ≠ executable-sufficient. */
  epistemicNote: string;
  competingSourceRegistry: false;
  blockers: Array<{ peer: string; blocker: string; owner: string }>;
}

function ncedExtraPaths(baseDir: string): string[] {
  const candidates = [
    "docs/negative-covenant-exception-database/phase-4/knowledge-factory-export.json",
    "docs/negative-covenant-exception-database/phase-3/knowledge-factory-export.json",
    "docs/negative-covenant-exception-database/phase-2/knowledge-factory-export.json",
  ];
  return candidates.filter((p) => existsSync(join(baseDir, p)));
}

function demoteSampleFixture<T extends PeerLoadResult<unknown>>(result: T): T {
  const sample = result.pathTried.some((p) => p.includes("/adapters/fixtures/") || p.includes(".sample."));
  if (!sample || result.availability !== "AVAILABLE") return result;
  return {
    ...result,
    availability: "UNAVAILABLE",
    data: null,
    note: `${result.note} — sample fixture only; not a published peer export`,
  };
}

export function integratePeerWorkstreams(baseDir: string = process.cwd()): PeerIntegrationReport {
  const kf = demoteSampleFixture(loadKnowledgeFactoryCorpus(baseDir));
  const def = demoteSampleFixture(loadDefinitionEncyclopedia(baseDir));
  const atlas = demoteSampleFixture(
    loadDependencyAtlas(baseDir, [
      "tests/fixtures/covenant-dependency-atlas/export/knowledge-factory-dataset.portable.json",
      "docs/covenant-dependency-atlas/export/atlas-dataset.json",
    ]),
  );
  const nced = demoteSampleFixture(
    loadNegativeCovenantExceptionDatabase(baseDir, ncedExtraPaths(baseDir)),
  );
  const fdp = demoteSampleFixture(loadFinancialDefinitionsPrecedent(baseDir));
  const acr = demoteSampleFixture(loadAmendmentChainResearch(baseDir));

  const blockers: PeerIntegrationReport["blockers"] = [];
  const push = (peer: string, blocker: string, owner: string, available: boolean) => {
    if (!available) blockers.push({ peer, blocker, owner });
  };
  push(
    "WS-CKF",
    "KNOWLEDGE_FACTORY_CORPUS_EXPORT_UNAVAILABLE_OR_UNVERIFIED",
    "Covenant Knowledge Factory",
    kf.availability === "AVAILABLE",
  );
  push("WS-DEF", "DEFINITION_ENCYCLOPEDIA_EXPORT_UNAVAILABLE", "Definition Encyclopedia", def.availability === "AVAILABLE");
  push("WS-CDA", "DEPENDENCY_ATLAS_EXPORT_UNAVAILABLE", "Dependency Atlas", atlas.availability === "AVAILABLE");
  push(
    "WS-NCED",
    "NEGATIVE_COVENANT_EXCEPTION_DB_UNAVAILABLE",
    "Negative Covenant Exception Database",
    nced.availability === "AVAILABLE",
  );
  push("WS-FDP", "FINANCIAL_DEFINITIONS_PRECEDENT_UNAVAILABLE", "Financial Definitions Precedent", fdp.availability === "AVAILABLE");
  push("WS-ACR", "AMENDMENT_CHAIN_EXPORT_UNAVAILABLE", "Amendment Chain Research", acr.availability === "AVAILABLE");
  blockers.push({
    peer: "LEGAL_CORE",
    blocker: "LEGAL_CORE_NOT_BOUND_FOR_BASKET_FORMULA_PROMOTION",
    owner: "Architecture Remediation / Legal Core",
  });

  return {
    knowledgeFactory: { ...kf, legallyVerified: false, sufficientForExecutable: false },
    definitionEncyclopedia: { ...def, legallyVerified: false },
    dependencyAtlas: { ...atlas, legallyVerified: false },
    negativeCovenantExceptionDatabase: { ...nced, legallyVerified: false },
    financialDefinitionsPrecedent: { ...fdp, legallyVerified: false },
    amendmentAuthority: { ...acr, legallyVerified: false },
    legalCore: {
      peer: "LEGAL_CORE",
      availability: "INTERFACE_ONLY",
      legallyVerified: false,
      note: "Legal Core verifier is not modified and has not certified basket-formula candidates.",
    },
    epistemicNote:
      "Discoverable peer exports ≠ source-backed candidate bindings ≠ legally verified ≠ sufficient for executable capacity.",
    competingSourceRegistry: false,
    blockers,
  };
}

export function peerFlagsForGraph(report: PeerIntegrationReport): {
  definitionEncyclopediaAvailable: boolean;
  dependencyAtlasAvailable: boolean;
  ncedAvailable: boolean;
  financialDefinitionsAvailable: boolean;
  amendmentAuthorityAvailable: boolean;
  legalCoreVerified: false;
  knowledgeFactoryVerified: false;
} {
  return {
    definitionEncyclopediaAvailable: report.definitionEncyclopedia.availability === "AVAILABLE",
    dependencyAtlasAvailable: report.dependencyAtlas.availability === "AVAILABLE",
    ncedAvailable: report.negativeCovenantExceptionDatabase.availability === "AVAILABLE",
    financialDefinitionsAvailable: report.financialDefinitionsPrecedent.availability === "AVAILABLE",
    amendmentAuthorityAvailable: report.amendmentAuthority.availability === "AVAILABLE",
    legalCoreVerified: false,
    knowledgeFactoryVerified: false,
  };
}
