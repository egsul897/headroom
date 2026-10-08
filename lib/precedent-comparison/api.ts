/**
 * Precedent Comparison API — public facade (Phase 2).
 */
import { loadDependencyAtlas } from "./adapters/dependency-atlas";
import { loadDefinitionEncyclopedia } from "./adapters/definition-encyclopedia";
import { loadEdgarAcquisitionQueue } from "./adapters/edgar-backfill";
import { loadKnowledgeFactoryCorpus } from "./adapters/knowledge-factory";
import { compareOriginalAndAmendment, listAmendmentPairs } from "./amendments";
import { compareProvisions, type CompareOptions } from "./compare";
import { getDefaultCorpus, PrecedentCorpus, type CorpusFile } from "./corpus";
import { retrieveCounterexamples } from "./counterexamples";
import { dependencyAwareView } from "./dependency-view";
import { profileProvision } from "./features";
import { commonPatterns, identifyDraftingPatterns, uncommonPatterns } from "./patterns";
import { retrieveComparableProvisions, searchExamples } from "./retrieve";
import type {
  ComparableCovenantFamily,
  CounterexampleQuery,
  DraftingFeature,
  PrecedentComparisonRecord,
  PrecedentProvision,
  RetrievalQuery,
} from "./types";
import { COMPARABLE_COVENANT_FAMILIES, COMPARISON_DISCLAIMER, PRECEDENT_COMPARISON_SCHEMA_VERSION } from "./types";
import type { CovenantFamily } from "@prisma/client";

export interface PrecedentComparisonApi {
  schemaVersion: typeof PRECEDENT_COMPARISON_SCHEMA_VERSION;
  disclaimer: typeof COMPARISON_DISCLAIMER;
  comparableFamilies: readonly ComparableCovenantFamily[];
  corpus: PrecedentCorpus;

  retrieve(query: RetrievalQuery): ReturnType<typeof retrieveComparableProvisions>;
  search(query: RetrievalQuery): ReturnType<typeof searchExamples>;
  patterns(family?: CovenantFamily | ComparableCovenantFamily): ReturnType<typeof identifyDraftingPatterns>;
  commonPatterns(family?: CovenantFamily | ComparableCovenantFamily): ReturnType<typeof commonPatterns>;
  uncommonPatterns(family?: CovenantFamily | ComparableCovenantFamily): ReturnType<typeof uncommonPatterns>;
  compare(leftProvisionId: string, rightProvisionId: string, options?: CompareOptions): PrecedentComparisonRecord;
  compareRecords(left: PrecedentProvision, right: PrecedentProvision, options?: CompareOptions): PrecedentComparisonRecord;
  dependencyView(comparison: PrecedentComparisonRecord): ReturnType<typeof dependencyAwareView>;
  counterexamples(query: CounterexampleQuery): ReturnType<typeof retrieveCounterexamples>;
  amendmentPairs(): ReturnType<typeof listAmendmentPairs>;
  compareAmendment(amendmentProvisionId: string): ReturnType<typeof compareOriginalAndAmendment>;
  profile(provisionId: string): ReturnType<typeof profileProvision>;
  statistics(): ReturnType<PrecedentCorpus["statistics"]>;
  peerStatus(): {
    dependencyAtlas: ReturnType<typeof loadDependencyAtlas>;
    definitionEncyclopedia: ReturnType<typeof loadDefinitionEncyclopedia>;
    edgarBackfill: ReturnType<typeof loadEdgarAcquisitionQueue>;
    knowledgeFactory: ReturnType<typeof loadKnowledgeFactoryCorpus>;
  };
}

export function createPrecedentComparisonApi(corpus?: PrecedentCorpus): PrecedentComparisonApi {
  const c = corpus ?? getDefaultCorpus();

  const requireProvision = (id: string): PrecedentProvision => {
    const p = c.get(id);
    if (!p) throw new Error(`PrecedentComparisonApi: unknown provisionId ${id}`);
    return p;
  };

  return {
    schemaVersion: PRECEDENT_COMPARISON_SCHEMA_VERSION,
    disclaimer: COMPARISON_DISCLAIMER,
    comparableFamilies: COMPARABLE_COVENANT_FAMILIES,
    corpus: c,

    retrieve: (query) => retrieveComparableProvisions(c, query),
    search: (query) => searchExamples(c, query),
    patterns: (family) => identifyDraftingPatterns(c, family),
    commonPatterns: (family) => commonPatterns(c, family),
    uncommonPatterns: (family) => uncommonPatterns(c, family),
    compare: (leftId, rightId, options) => compareProvisions(requireProvision(leftId), requireProvision(rightId), options),
    compareRecords: (left, right, options) => compareProvisions(left, right, options),
    dependencyView: (comparison) => dependencyAwareView(c, comparison),
    counterexamples: (query) => retrieveCounterexamples(c, query),
    amendmentPairs: () => listAmendmentPairs(c),
    compareAmendment: (id) => compareOriginalAndAmendment(c, id),
    profile: (id) => profileProvision(requireProvision(id)),
    statistics: () => c.statistics(),
    peerStatus: () => ({
      dependencyAtlas: loadDependencyAtlas(),
      definitionEncyclopedia: loadDefinitionEncyclopedia(),
      edgarBackfill: loadEdgarAcquisitionQueue(),
      knowledgeFactory: loadKnowledgeFactoryCorpus(),
    }),
  };
}

export function compareFamilyFeatureSlice(
  api: PrecedentComparisonApi,
  family: CovenantFamily | ComparableCovenantFamily,
  features: DraftingFeature[],
): PrecedentComparisonRecord[] {
  const hits = api.retrieve({ covenantFamily: family, anyFeatures: features, limit: 6 });
  const records: PrecedentComparisonRecord[] = [];
  for (let i = 0; i < hits.length; i++) {
    for (let j = i + 1; j < hits.length; j++) {
      records.push(api.compareRecords(hits[i]!.provision, hits[j]!.provision));
    }
  }
  return records;
}

export function loadCorpusFromJson(file: CorpusFile): PrecedentCorpus {
  return PrecedentCorpus.fromJson(file);
}
