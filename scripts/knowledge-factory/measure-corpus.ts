#!/usr/bin/env tsx
/**
 * Honest data-production measurement. Separates SEC vs fixture, debt vs false-positive.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { CorpusStore, defaultCorpusPaths } from "../../lib/knowledge-factory/store/corpus-store";
import { summarizeCosts } from "../../lib/knowledge-factory/cost/ledger";
import { auditCorpusQuality } from "../../lib/knowledge-factory/audit/corpus-quality";
import { allPatterns } from "../../lib/knowledge-factory/patterns/library";
import { detectPatternsInText } from "../../lib/knowledge-factory/patterns/library";

const NON_DEBT_TITLE =
  /\b(?:consent of independent|independent registered public accounting|pwc consent|ex-23|employment agreement|bylaws?|certificate of incorporation|stock incentive|equity incentive)\b/i;

async function main() {
  const store = new CorpusStore(defaultCorpusPaths());
  const sources = store.listSources();
  const sec = sources.filter((s) => s.provenance === "sec-edgar");
  const fixtures = sources.filter((s) => s.provenance.startsWith("fixture"));
  const secDebt = sec.filter((s) => !NON_DEBT_TITLE.test(`${s.documentTitle} ${s.exhibitFilename}`));
  const secFalsePositives = sec.filter((s) => NON_DEBT_TITLE.test(`${s.documentTitle} ${s.exhibitFilename}`));

  let structural = 0;
  let ambiguous = 0;
  let candidates = 0;
  let definitions = 0;
  let crossRefs = 0;
  const patterns = new Set<string>();
  const families = new Set<string>();

  for (const s of [...fixtures, ...secDebt]) {
    const nodes = store.loadStructuralNodes(s.sourceId);
    structural += nodes.length;
    ambiguous += nodes.filter((n) => n.ambiguous).length;
    const cs = store.loadCandidates(s.sourceId);
    candidates += cs.length;
    for (const c of cs) {
      for (const f of c.families) families.add(f);
      for (const sig of c.signals) if (sig.startsWith("pattern:")) patterns.add(sig.slice(8));
      for (const p of detectPatternsInText(c.excerpt)) patterns.add(p);
    }
    definitions += store.loadDefinitions(s.sourceId).length;
    crossRefs += store.loadCrossReferences(s.sourceId).length;
  }

  const unc = (store.readJson("uncertainty-queue.json") as unknown[] | null) ?? [];
  const rels = store.loadRelationships();
  const costs = summarizeCosts(store.readCostLedger());
  const audit = auditCorpusQuality(store);

  const report = {
    generatedAt: new Date().toISOString(),
    distinction: {
      note: "Fixture documents are recorded public excerpts already in-repo. SEC documents were acquired live from sec.gov in this session. False-positive SEC exhibits are listed separately and excluded from debt-document counts.",
    },
    realSecFilingsDiscoveredAccessions: new Set(sec.map((s) => s.accessionNumber)).size,
    realSecDebtDocumentsAcquired: secDebt.length,
    realSecFalsePositiveExhibitsAcquired: secFalsePositives.length,
    fixtureDocuments: fixtures.length,
    uniqueIssuers: {
      secDebt: new Set(secDebt.map((s) => s.issuerCik)).size,
      fixtures: new Set(fixtures.map((s) => s.issuerCik)).size,
      combinedDebtAndFixture: new Set([...fixtures, ...secDebt].map((s) => s.issuerCik)).size,
    },
    uniqueInstrumentsApprox: new Set(
      [...fixtures, ...secDebt].map((s) => s.instrumentIdentity || `${s.issuerCik}|${s.documentClass}|${s.documentTitle.slice(0, 60)}`),
    ).size,
    provisionsStructurallyIndexed: structural,
    ambiguousStructuralNodes: ambiguous,
    covenantCandidatesExtracted: candidates,
    sourceBackedDefinitions: definitions,
    dependencyEdgesCrossReferences: crossRefs,
    documentRelationships: rels.length,
    semanticHypothesesProduced: [...fixtures, ...secDebt].filter((s) => s.representationLevel === "SEMANTIC_HYPOTHESIS").length,
    independentlyVerifiedRepresentations: [...fixtures, ...secDebt].filter(
      (s) => s.representationLevel === "REVIEWER_VERIFIED" || s.representationLevel === "CERTIFIED",
    ).length,
    unresolvedOrAmbiguousLegalIssues: {
      uncertaintyQueueItems: unc.length,
      ambiguousStructuralNodes: ambiguous,
      unlinkedAmendments: audit.amendmentChainCompleteness.unlinkedAmendments,
      missingOperativeAuthorityDocs: audit.missingOperativeAuthority,
      note: "These are unresolved discovery/ambiguity items — not independently verified legal conclusions.",
    },
    draftingPatterns: {
      seedLibrarySize: allPatterns().length,
      observedInCorpus: [...patterns],
      newlyDiscoveredBeyondSeed: [...patterns].filter((p) => !allPatterns().some((s) => s.patternId === p)),
    },
    dangerousOmissionsOrFalsePermissionsDetected: {
      count: 0,
      note: "No semantic compilation / capacity-rule execution was run. False permissions cannot be asserted from discovery labels alone. Auditor-consent and employment/bylaw false-positive acquisitions were detected at the acquisition layer (listed below).",
      acquisitionFalsePositives: secFalsePositives.map((s) => ({
        sourceId: s.sourceId,
        title: s.documentTitle,
        url: s.sourceUrl,
      })),
    },
    processing: {
      measuredParsingMsFromLedger: costs.parsingMs,
      secRequests: costs.secRequests,
      downloadBytes: costs.downloadBytes,
      storageBytes: costs.storageBytes,
      actualPaidProviderUsd: costs.actualPaidUsd,
      estimatedModelCostUsdIfEnabled: costs.estimatedModelCostUsd,
      estimatedModelTokensIfEnabled: costs.estimatedModelTokens,
      note: "Actual paid AI spend is $0. Estimated model figures are NOT actual spend.",
    },
    secDebtDocuments: secDebt.map((s) => ({
      sourceId: s.sourceId,
      ticker: s.issuerTicker,
      class: s.documentClass,
      title: s.documentTitle,
      form: s.formType,
      filingDate: s.filingDate,
      bytes: s.byteSize,
      url: s.sourceUrl,
      representationLevel: s.representationLevel,
    })),
  };

  const outDir = path.resolve("docs/knowledge-factory/manifests");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "data-production-checkpoint.json"), JSON.stringify(report, null, 2));
  store.writeJson("data-production-checkpoint.json", report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
