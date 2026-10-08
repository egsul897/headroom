/**
 * LCQG independent replay for ADV-FP-01 / ADV-FP-02.
 * Evaluation-only probe — does not modify production code or freeze.
 *
 * Usage (from a production worktree checkout):
 *   npx tsx /workspace/scripts/live-corpus-quality-gate/_p0-shared-cap-independent-replay.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();

function sha(): string {
  return execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
}

async function main() {
  const {
    classifyAggregateOrSharedCapacitySignal,
    isSharedCapacityRelationshipLanguage,
  } = await import(path.join(ROOT, "lib/contract-model/compiler/shared-capacity-signals.ts")).catch(() => ({
    classifyAggregateOrSharedCapacitySignal: null as null | ((t: string) => string | null),
    isSharedCapacityRelationshipLanguage: null as null | ((t: string) => boolean),
  }));

  const { runPassADeterministicSignals } = await import(
    path.join(ROOT, "lib/contract-model/compiler/discovery/pass-a-signals.ts")
  );
  const { buildSourceCoverageInventory } = await import(
    path.join(ROOT, "lib/contract-model/compiler/coverage-audit/source-inventory.ts")
  );
  const { buildSourceInventory } = await import(
    path.join(ROOT, "lib/contract-model/compiler/semantic-verification/source-inventory.ts")
  );
  const { classifyFigures, figureRoleIssues } = await import(
    path.join(ROOT, "lib/contract-model/compiler/semantic-verification/figure-role.ts")
  );
  const { parseDocumentStructure } = await import(
    path.join(ROOT, "lib/contract-model/compiler/stage-structure.ts")
  );
  const { buildStructuralIndex } = await import(
    path.join(ROOT, "lib/contract-model/compiler/structural-index.ts")
  );

  // Sibling typing probe — read structural-context classify via text patterns mirrored in source
  const structuralCtxSrc = fs.readFileSync(
    path.join(ROOT, "lib/contract-model/compiler/context-retrieval/structural-context.ts"),
    "utf8",
  );
  const contextInvSrc = fs.readFileSync(
    path.join(ROOT, "lib/contract-model/compiler/coverage-audit/context-inventory.ts"),
    "utf8",
  );
  const passASrc = fs.readFileSync(
    path.join(ROOT, "lib/contract-model/compiler/discovery/pass-a-signals.ts"),
    "utf8",
  );
  const coverageSrc = fs.readFileSync(
    path.join(ROOT, "lib/contract-model/compiler/coverage-audit/source-inventory.ts"),
    "utf8",
  );

  const stimuli = {
    advFp01_aggregateNoAffirmativePermission:
      "Indebtedness in an aggregate amount not to exceed $25,000,000 incurred by the Borrower.",
    advFp02_aggregateLimitNotSharedBasket:
      "The Borrower may incur Indebtedness in an aggregate amount not to exceed $25,000,000.",
    genuine_togetherWithSection:
      "Restricted Payments in an aggregate amount, together with Investments made pursuant to Section 7.06, not to exceed $20,000,000.",
    genuine_multiClause:
      "The aggregate amount of Investments made in reliance on this clause (c) and clause (d) below shall not exceed $25,000,000.",
    genuine_sharedCapacityPhrase:
      "Indebtedness under this Section 7.03(a) and Section 7.03(b), when combined with Investments under Section 7.06(c), shall not exceed a shared capacity of $25,000,000.",
    affirmative_singleBasket:
      "The Borrower may incur Indebtedness in an aggregate principal amount not to exceed $10,000,000.",
    comparator_threshold:
      "so long as the Consolidated Leverage Ratio would not be greater than 4.50 to 1.00 after giving effect thereto",
    comparator_excessAsCapacityRisk:
      "any other transaction involving aggregate consideration in excess of $5,000,000, so long as approved",
    remote_proviso:
      "Indebtedness not to exceed $5,000,000 shall be permitted; provided that no Default shall have occurred and is continuing.",
    ambiguous_xref:
      "as set forth in Section 7.05 (see also Section 7.05 in the Table of Contents)",
  };

  function indexFor(body: string, section = "6.01") {
    const text = `CREDIT AGREEMENT\n\nARTICLE VI NEGATIVE COVENANTS\n\nSECTION ${section}. Indebtedness. ${body}\n`;
    const doc = { documentId: "d1", label: "CA", text };
    const nodes = parseDocumentStructure(doc);
    return {
      text,
      index: buildStructuralIndex(new Map([["d1", { text, nodes }]]), [], []),
    };
  }

  function probeText(label: string, body: string, section = "6.01") {
    const { index } = indexFor(body, section);
    const passA = runPassADeterministicSignals("d1", index);
    const regions = buildSourceCoverageInventory("d1", index, {
      companyId: "c",
      packageKey: "p",
      instrumentKey: null,
    });
    const region = regions.find((r: { sectionRef: string }) => r.sectionRef === section) ?? regions[0];
    const inv = buildSourceInventory(`probe:${label}`, body, "d1", `§${section}`, null);
    const figures = classifyFigures(body);
    const money = (amount: number) => ({
      exprId: "m",
      kind: "MONEY" as const,
      type: "MONEY" as const,
      amount,
      currency: "USD",
    });
    const rule = {
      ruleId: "rule-1",
      capacityExpression: money(5_000_000),
      conditions: [],
      exceptions: [],
    };
    const thresholdIssues =
      label.includes("comparator_excess") || label.includes("comparator_threshold")
        ? figureRoleIssues(body, [rule]).map((i: { kind: string; role: string }) => ({
            kind: i.kind,
            role: i.role,
          }))
        : [];

    const passAShared = passA.some((c: { signals: string[] }) => c.signals.includes("shared_cap"));
    const passAAgg = passA.some((c: { signals: string[] }) => c.signals.includes("aggregate_amount"));
    // Pre-fix: shared_cap may be the only aggregate-related signal name
    const passALegacySharedPattern = /shared_cap.*aggregate(?:d)? \(?:amount|basket\)|aggregate(?:d)? \(?:amount|basket\).*shared_cap/.test(
      passASrc.replace(/\s+/g, " "),
    );
    const passAHasLegacyAggregateInSharedCap = passASrc.includes("aggregate(?:d)? (?:amount|basket)");

    return {
      label,
      bodyPreview: body.slice(0, 120),
      helper: classifyAggregateOrSharedCapacitySignal
        ? {
            classify: classifyAggregateOrSharedCapacitySignal(body),
            isSharedRelationship: isSharedCapacityRelationshipLanguage?.(body) ?? null,
          }
        : { classify: "HELPER_MODULE_ABSENT", isSharedRelationship: null },
      passA: {
        shared_cap: passAShared,
        aggregate_amount: passAAgg,
        candidateCount: passA.length,
        signalSets: passA.slice(0, 5).map((c: { sectionRef: string; signals: string[] }) => ({
          ref: c.sectionRef,
          signals: c.signals,
        })),
      },
      coverageAudit: {
        detectedSignals: region?.detectedSignals ?? [],
        probableRole: region?.probableRole ?? null,
        sharedCapCandidate: region?.probableRole === "SHARED_CAP_CANDIDATE",
        hasSharedCapSignal: (region?.detectedSignals ?? []).includes("shared_cap"),
        hasAggregateAmountSignal: (region?.detectedSignals ?? []).includes("aggregate_amount"),
      },
      semanticInventory: {
        sharedCapMarker: inv.items.some((i: { kind: string }) => i.kind === "SHARED_CAP_MARKER"),
        markerCount: inv.items.filter((i: { kind: string }) => i.kind === "SHARED_CAP_MARKER").length,
      },
      figureRole: {
        figures: figures.map((f: { role: string; capacity: boolean; value: number }) => ({
          role: f.role,
          capacity: f.capacity,
          value: f.value,
        })),
        thresholdIssues,
      },
    };
  }

  const results: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(stimuli)) {
    const section = k.includes("multiClause") || k.includes("together") || k.includes("sharedCapacity") ? "6.06" : "6.01";
    results[k] = probeText(k, v, section);
  }

  // Downstream consumer static checks
  const downstream = {
    passA_legacyAggregateInsideSharedCapRegex: passASrc.includes("aggregate(?:d)? (?:amount|basket)"),
    coverageAudit_orsAggregateIntoSharedCapCandidate: /names\.has\("shared_cap"\)\s*\|\|\s*names\.has\("aggregate_amount"\)/.test(
      coverageSrc,
    ),
    structuralContext_bareAggregateInSharedCapSignals:
      /SHARED_CAP_SIGNALS[\s\S]{0,400}?\\bin the aggregate\\b/.test(structuralCtxSrc) &&
      !/SHARED_CAP_SIGNALS[\s\S]{0,800}?in\\s\+the\\s\+aggregate\\s\+\(\?:with\|under\)/.test(structuralCtxSrc),
    contextInventory_bareAggregateInSharedCapLike: /SHARED_CAP_LIKE[\s\S]{0,200}?aggregate\(\?:d\)\?\\s\+\(\?:amount\|cap\|limit\)/.test(
      contextInvSrc,
    ),
    helperModulePresent: fs.existsSync(path.join(ROOT, "lib/contract-model/compiler/shared-capacity-signals.ts")),
  };

  // Gibraltar probe if fixture present (read-only; do not mutate freeze)
  let gibraltar: Record<string, unknown> | null = null;
  const gibPath = path.join(
    ROOT,
    "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/extracted-text/credit-agreement.txt",
  );
  const gibFixture = path.join(
    ROOT,
    "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/structure/pass-a-shared-cap.json",
  );
  if (fs.existsSync(gibPath)) {
    const text = fs.readFileSync(gibPath, "utf8");
    const doc = { documentId: "gib", label: "CA", text };
    const nodes = parseDocumentStructure(doc);
    const index = buildStructuralIndex(new Map([["gib", { text, nodes }]]), [], []);
    const cands = runPassADeterministicSignals("gib", index);
    const shared = cands.filter((c: { signals: string[] }) => c.signals.includes("shared_cap"));
    const agg = cands.filter((c: { signals: string[] }) => c.signals.includes("aggregate_amount"));
    gibraltar = {
      passACandidates: cands.length,
      shared_cap: shared.length,
      aggregate_amount: agg.length,
      frozenFixtureSharedCapCount: fs.existsSync(gibFixture)
        ? (JSON.parse(fs.readFileSync(gibFixture, "utf8")) as unknown[]).length
        : null,
      note: "Frozen fixture count is historical evidence; live Pass A counts are independent replay probes.",
    };
  }

  // Verdict helpers for ADV-FP
  const fp01 = results.advFp01_aggregateNoAffirmativePermission as {
    passA: { shared_cap: boolean };
    coverageAudit: { sharedCapCandidate: boolean; hasSharedCapSignal: boolean };
    semanticInventory: { sharedCapMarker: boolean };
  };
  const fp02 = results.advFp02_aggregateLimitNotSharedBasket as typeof fp01;
  const genuine = [
    results.genuine_togetherWithSection,
    results.genuine_multiClause,
    results.genuine_sharedCapacityPhrase,
  ] as Array<typeof fp01>;

  const unsafePositive =
    fp01.passA.shared_cap ||
    fp01.coverageAudit.sharedCapCandidate ||
    fp01.coverageAudit.hasSharedCapSignal ||
    fp01.semanticInventory.sharedCapMarker ||
    fp02.passA.shared_cap ||
    fp02.coverageAudit.sharedCapCandidate ||
    fp02.coverageAudit.hasSharedCapSignal ||
    fp02.semanticInventory.sharedCapMarker;

  const genuineDetected = genuine.every(
    (g) =>
      g.passA.shared_cap ||
      g.coverageAudit.hasSharedCapSignal ||
      g.coverageAudit.sharedCapCandidate ||
      g.semanticInventory.sharedCapMarker,
  );

  const out = {
    headSha: sha(),
    root: ROOT,
    stimuliResults: results,
    downstreamStatic: downstream,
    gibraltar,
    adjudicationHints: {
      unsafePositiveSharedCapLabels: unsafePositive,
      genuineSharedCapacityStillDetected: genuineDetected,
      labelingLayerRepaired: !unsafePositive && genuineDetected,
      capacityCreationFromAggregateAlone: "NOT_CLAIMED_CLOSED — figure-role / IR shared-capacity grant path remains separately gated; this replay verifies labeling + consumer static paths",
    },
  };
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
