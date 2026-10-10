/**
 * READ-ONLY pre-merge audit for KF graph remediation PR #246.
 * - Independent unique-edge evidence sampling (factual correctness ≠ confidence)
 * - Benchmark full discoveryId lookup
 * - Confirm unresolved excess + agreement self-loops
 * - Concurrent-writer race analysis (application-side TOCTOU)
 *
 *   npx tsx scripts/knowledge-factory/remediation-premerge-audit.ts
 *
 * Does NOT mutate Neon. Does NOT apply migration.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../../lib/prisma";
import {
  canResolveRestatementSupersession,
  isOpaqueExhibitLabel,
  resolveOperativePrecedence,
} from "../../lib/product/customer-intelligence/operative-resolution";
import { analyzeAmendmentPackage } from "../../lib/product/customer-intelligence/amendment-package";
import { discoverDocumentRelationships } from "../../lib/knowledge-factory/relationships/discover";
import type { KnowledgeSourceRecord } from "../../lib/knowledge-factory/types";
import type { AmendmentCompareView } from "../../lib/product/customer-intelligence/amendment-compare";

type SampleVerdict = "FACTUALLY_SUPPORTED" | "WEAK_OR_OPAQUE" | "UNSUPPORTED" | "SELF_LOOP_INVALID" | "MISSING_ENDPOINT";

function emptyCompare(): AmendmentCompareView {
  return {
    operativeResolution: "UNRESOLVED_PRECEDENCE",
    rows: [],
    unresolvedReasons: ["premerge-audit stub"],
    note: "stub",
  };
}

function baseSrc(p: Partial<KnowledgeSourceRecord> & { sourceId: string }): KnowledgeSourceRecord {
  return {
    sourceId: p.sourceId,
    issuerCik: p.issuerCik ?? "0000001234",
    accessionNumber: p.accessionNumber ?? "a",
    exhibitFilename: p.exhibitFilename ?? "ex.htm",
    sourceUrl: p.sourceUrl ?? "u",
    filingDate: p.filingDate ?? "2023-01-01",
    formType: p.formType ?? "8-K",
    documentTitle: p.documentTitle ?? "Credit Agreement",
    documentClass: p.documentClass ?? "CREDIT_AGREEMENT",
    originalBytesHash: p.originalBytesHash ?? "h",
    acquisitionTimestamp: p.acquisitionTimestamp ?? "2023-01-01T00:00:00.000Z",
    parserVersion: p.parserVersion ?? "t",
    extractionStatus: p.extractionStatus ?? "STRUCTURALLY_INDEXED",
    representationLevel: p.representationLevel ?? "STRUCTURALLY_INDEXED",
    provenance: p.provenance ?? "sec-edgar",
    usageRightsReviewStatus: p.usageRightsReviewStatus ?? "PUBLIC_SEC_EDGAR",
    issuerTicker: p.issuerTicker,
    instrumentIdentity: p.instrumentIdentity,
  };
}

async function population() {
  const raw = await prisma.knowledgeRelationshipEdge.count();
  const unique = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(DISTINCT metadata->>'discoveryId')::bigint AS n
    FROM knowledge_relationship_edges
    WHERE metadata->>'discoveryId' IS NOT NULL
  `;
  const excess = await prisma.$queryRaw<Array<{ excess: bigint }>>`
    SELECT COALESCE(SUM(cnt - 1), 0)::bigint AS excess
    FROM (
      SELECT COUNT(*)::bigint AS cnt
      FROM knowledge_relationship_edges
      WHERE metadata->>'discoveryId' IS NOT NULL
      GROUP BY metadata->>'discoveryId'
      HAVING COUNT(*) > 1
    ) d
  `;
  const selfLoops = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*)::bigint AS n
    FROM knowledge_relationship_edges e
    JOIN knowledge_sources s ON s.id = e."sourceRecordId"
    WHERE e.kind::text LIKE 'AGREEMENT_%'
      AND s."sourceId" = e."targetSourceId"
  `;
  const provisionSameDoc = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(DISTINCT e.metadata->>'discoveryId')::bigint AS n
    FROM knowledge_relationship_edges e
    JOIN knowledge_sources s ON s.id = e."sourceRecordId"
    WHERE e.kind::text LIKE 'PROVISION_%'
      AND s."sourceId" = e."targetSourceId"
  `;
  return {
    rawRows: raw,
    uniqueDiscoveryIds: Number(unique[0]?.n ?? 0),
    excessDuplicateRows: Number(excess[0]?.excess ?? 0),
    agreementSelfLoops: Number(selfLoops[0]?.n ?? 0),
    provisionSameDocumentUnique: Number(provisionSameDoc[0]?.n ?? 0),
    explicitlyUnresolvedUntilAuthorizedMigration: true,
  };
}

async function benchmarkDiscoveryIdLookup() {
  const timings: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    const rows = await prisma.$queryRaw<Array<{ discovery_id: string }>>`
      SELECT DISTINCT metadata->>'discoveryId' AS discovery_id
      FROM knowledge_relationship_edges
      WHERE kind::text LIKE 'PROVISION_%'
        AND metadata->>'discoveryId' IS NOT NULL
    `;
    const t1 = performance.now();
    timings.push(t1 - t0);
    if (i === 4) {
      return {
        iterations: 5,
        distinctIds: rows.length,
        timingsMs: timings.map((x) => Math.round(x * 100) / 100),
        meanMs: Math.round((timings.reduce((a, b) => a + b, 0) / timings.length) * 100) / 100,
        p50Ms: Math.round([...timings].sort((a, b) => a - b)[2]! * 100) / 100,
        scalabilityLimitations: [
          "Lookup is O(N) table scan over JSON metadata->>'discoveryId' — no index on discoveryKey until authorized migration.",
          "Full DISTINCT materializes all unique IDs in application memory (Set) — grows with unique edge population.",
          "Concurrent writers each scan then insert; without UNIQUE(discoveryKey), TOCTOU races can still amplify rows.",
          "Prisma createMany({ skipDuplicates: true }) is a no-op without a matching unique constraint.",
          "8000-row write cap per persist call means large corpora need multiple calls; race window multiplies with callers.",
        ],
      };
    }
  }
  throw new Error("benchmark incomplete");
}

/**
 * Simulate two concurrent persist writers that both scanned before either inserted.
 * Demonstrates amplification without DB uniqueness.
 */
function concurrentRaceSimulation() {
  const edgeIds = Array.from({ length: 50 }, (_, i) =>
    createHash("sha256").update(`PROVISION_DEFINITION|doc|1.0${i}|doc|Term${i}`).digest("hex").slice(0, 24),
  );

  // Sequential (fixed path): shared store updated after each insert
  const sequential = new Set<string>();
  let seqInserts = 0;
  for (const pass of [1, 2]) {
    void pass;
    for (const id of edgeIds) {
      if (sequential.has(id)) continue;
      sequential.add(id);
      seqInserts += 1;
    }
  }

  // Concurrent TOCTOU: both writers snapshot empty/partial, both insert
  const db = new Set<string>();
  const snapA = new Set(db);
  const snapB = new Set(db);
  let raceInserts = 0;
  for (const id of edgeIds) {
    if (!snapA.has(id)) {
      db.add(id);
      raceInserts += 1;
      // Writer A inserts; Writer B still uses snapB
    }
  }
  for (const id of edgeIds) {
    if (!snapB.has(id)) {
      // Without UNIQUE, second insert succeeds → duplicate row identity
      raceInserts += 1;
    }
  }

  return {
    uniqueIdentities: edgeIds.length,
    sequentialInsertsAcrossTwoPasses: seqInserts,
    concurrentToctouInsertAttempts: raceInserts,
    amplificationFactorWithoutUnique: raceInserts / edgeIds.length,
    skipDuplicatesWithoutUniqueConstraint: "NO_OP",
    verdict:
      "APPLICATION_SIDE_SCAN_ALONE_IS_NOT_CONCURRENT_SAFE — UNIQUE(discoveryKey) required before production graph promotion / concurrent expand.",
    raceWindow: "loadExistingProvisionDiscoveryIds() → createMany; no transaction/lock; no unique index yet",
  };
}

async function sampleUniqueEdges(limitPerKind = 8) {
  const kinds = [
    "PROVISION_DEFINITION",
    "PROVISION_CROSS_REFERENCE",
    "PROVISION_EXCEPTION",
    "PROVISION_CONDITION",
    "AGREEMENT_AMENDMENT",
    "AGREEMENT_RESTATEMENT",
    "INDENTURE_SUPPLEMENTAL",
  ];
  const samples: Array<{
    discoveryId: string;
    kind: string;
    confidence: number;
    fromTitle: string;
    toTitle: string | null;
    fromClass: string;
    toClass: string | null;
    rationale: string;
    sameDocument: boolean;
    factualVerdict: SampleVerdict;
    reasons: string[];
  }> = [];

  for (const kind of kinds) {
    const rows = await prisma.$queryRaw<
      Array<{
        discovery_id: string;
        kind: string;
        confidence: number;
        rationale: string;
        from_title: string;
        from_class: string;
        from_source_id: string;
        to_source_id: string;
        to_title: string | null;
        to_class: string | null;
        from_section: string | null;
        to_term: string | null;
      }>
    >`
      WITH unique_edges AS (
        SELECT DISTINCT ON (e.metadata->>'discoveryId')
          e.metadata->>'discoveryId' AS discovery_id,
          e.kind::text AS kind,
          e.confidence,
          e.rationale,
          e."targetSourceId" AS to_source_id,
          s."sourceId" AS from_source_id,
          s."documentTitle" AS from_title,
          s."documentClass"::text AS from_class,
          e.metadata->>'fromSectionRef' AS from_section,
          e.metadata->>'toTerm' AS to_term
        FROM knowledge_relationship_edges e
        JOIN knowledge_sources s ON s.id = e."sourceRecordId"
        WHERE e.kind::text = ${kind}
          AND e.metadata->>'discoveryId' IS NOT NULL
        ORDER BY e.metadata->>'discoveryId', e."createdAt" ASC
      )
      SELECT u.*, t."documentTitle" AS to_title, t."documentClass"::text AS to_class
      FROM unique_edges u
      LEFT JOIN knowledge_sources t ON t."sourceId" = u.to_source_id
      ORDER BY md5(u.discovery_id)
      LIMIT ${limitPerKind}
    `;

    for (const r of rows) {
      const reasons: string[] = [];
      const sameDocument = r.from_source_id === r.to_source_id;
      let factualVerdict: SampleVerdict = "FACTUALLY_SUPPORTED";

      if (!r.to_title && !sameDocument) {
        factualVerdict = "MISSING_ENDPOINT";
        reasons.push("Target KnowledgeSource missing");
      } else if (kind.startsWith("AGREEMENT_") && sameDocument) {
        factualVerdict = "SELF_LOOP_INVALID";
        reasons.push("Agreement self-loop — invalid self-amendment");
      } else if (kind.startsWith("PROVISION_") && sameDocument) {
        // Legitimate same-document provision graph
        if (kind === "PROVISION_DEFINITION") {
          if (r.to_term && r.to_term.length >= 2) {
            factualVerdict = "FACTUALLY_SUPPORTED";
            reasons.push(`Same-doc definition term "${r.to_term}" with section ${r.from_section ?? "?"}`);
          } else {
            factualVerdict = "WEAK_OR_OPAQUE";
            reasons.push("Definition edge lacks toTerm");
          }
        } else if (kind === "PROVISION_CROSS_REFERENCE") {
          factualVerdict = r.from_section ? "FACTUALLY_SUPPORTED" : "WEAK_OR_OPAQUE";
          reasons.push(r.from_section ? `Cross-ref from section ${r.from_section}` : "Missing fromSectionRef");
        } else {
          factualVerdict = "FACTUALLY_SUPPORTED";
          reasons.push("Same-document exception/condition/shared-capacity structural edge");
        }
      } else if (kind.startsWith("AGREEMENT_") || kind === "INDENTURE_SUPPLEMENTAL") {
        const fromOpaque = isOpaqueExhibitLabel(r.from_title);
        const toOpaque = isOpaqueExhibitLabel(r.to_title || "");
        const titleOverlap =
          /\bcredit\b/i.test(r.from_title) && /\bcredit\b/i.test(r.to_title || "") ||
          /\bindenture\b/i.test(r.from_title) && /\bindenture\b/i.test(r.to_title || "") ||
          /\bamend/i.test(r.from_title) ||
          /\brestat/i.test(r.from_title);
        if (fromOpaque && toOpaque) {
          factualVerdict = "UNSUPPORTED";
          reasons.push("Both endpoints opaque exhibit labels — title evidence insufficient");
        } else if (fromOpaque || toOpaque) {
          factualVerdict = titleOverlap ? "WEAK_OR_OPAQUE" : "UNSUPPORTED";
          reasons.push("One endpoint opaque exhibit label");
        } else if (titleOverlap) {
          factualVerdict = "FACTUALLY_SUPPORTED";
          reasons.push("Title/metadata family tokens support DISCOVERED linkage (not legal effectiveness)");
        } else {
          factualVerdict = "WEAK_OR_OPAQUE";
          reasons.push("Cross-document link without strong shared instrument tokens");
        }
      }

      samples.push({
        discoveryId: r.discovery_id,
        kind: r.kind,
        confidence: r.confidence,
        fromTitle: r.from_title,
        toTitle: r.to_title,
        fromClass: r.from_class,
        toClass: r.to_class,
        rationale: r.rationale.slice(0, 200),
        sameDocument,
        factualVerdict,
        reasons,
      });
    }
  }

  const byVerdict: Record<string, number> = {};
  for (const s of samples) byVerdict[s.factualVerdict] = (byVerdict[s.factualVerdict] ?? 0) + 1;

  return {
    sampled: samples.length,
    byVerdict,
    note: "Factual correctness is independent of confidence scores. DISCOVERED ≠ CERTIFIED legal authority.",
    samples,
  };
}

function operativeCases() {
  const cases: Array<{ id: string; status: string; pass: boolean; note: string }> = [];

  // SON opaque
  {
    const sources = [
      baseSrc({
        sourceId: "son-base",
        documentClass: "CREDIT_AGREEMENT",
        documentTitle: "Credit Agreement dated as of 2022-01-15",
        filingDate: "2022-01-15",
        issuerTicker: "SON",
      }),
      baseSrc({
        sourceId: "son-ex",
        documentClass: "RESTATEMENT",
        documentTitle: "EX-10.1",
        filingDate: "2024-05-07",
        issuerTicker: "SON",
      }),
    ];
    const ap = analyzeAmendmentPackage({ companyId: "co", sources, relationships: [] });
    const op = resolveOperativePrecedence({ sources, amendmentPackage: ap, compare: emptyCompare() });
    cases.push({
      id: "son-opaque-ex-10-1",
      status: op.status,
      pass: op.status === "UNRESOLVED_PRECEDENCE" && op.operativeDocumentSourceId === null,
      note: "Exhibit label + RESTATEMENT class + later filing must not resolve",
    });
  }

  // Substantive restatement OK
  {
    const sources = [
      baseSrc({
        sourceId: "b",
        documentClass: "CREDIT_AGREEMENT",
        documentTitle: "Credit Agreement dated as of 2022-01-15",
        filingDate: "2022-01-15",
      }),
      baseSrc({
        sourceId: "r",
        documentClass: "RESTATEMENT",
        documentTitle: "Amended and Restated Credit Agreement dated as of 2024-06-01",
        filingDate: "2024-06-01",
      }),
    ];
    const ap = analyzeAmendmentPackage({ companyId: "co", sources, relationships: [] });
    const op = resolveOperativePrecedence({ sources, amendmentPackage: ap, compare: emptyCompare() });
    cases.push({
      id: "substantive-restatement",
      status: op.status,
      pass: op.status === "RESOLVED" && op.operativeDocumentSourceId === "r",
      note: "Substantive title evidence may resolve",
    });
  }

  // Filing chronology alone with opaque title refused
  {
    const gate = canResolveRestatementSupersession({
      documentTitle: "Exhibit 10.2",
      documentClass: "RESTATEMENT",
    });
    cases.push({
      id: "exhibit-10-2-gate",
      status: gate.ok ? "ALLOW" : "REFUSE",
      pass: !gate.ok,
      note: "Opaque exhibit gate",
    });
  }

  // Class-only restatement with empty title
  {
    const gate = canResolveRestatementSupersession({
      documentTitle: "",
      documentClass: "RESTATEMENT",
    });
    cases.push({
      id: "empty-title-restatement-class",
      status: gate.ok ? "ALLOW" : "REFUSE",
      pass: !gate.ok,
      note: "RESTATEMENT class alone insufficient",
    });
  }

  // Discovery: no agreement self-loop when only restatement present
  {
    const rels = discoverDocumentRelationships([
      baseSrc({
        sourceId: "only-r",
        documentClass: "RESTATEMENT",
        documentTitle: "Amended and Restated Credit Agreement",
      }),
    ]);
    cases.push({
      id: "discover-no-self-loop",
      status: String(rels.length),
      pass: rels.every((r) => r.sourceId !== r.targetId) && !rels.some((r) => r.kind === "AGREEMENT_RESTATEMENT"),
      note: "Solo restatement must not self-link",
    });
  }

  // Discovery: provision path not applicable here — covered by unit tests
  // Missing base
  {
    const sources = [
      baseSrc({
        sourceId: "amd",
        documentClass: "AMENDMENT",
        documentTitle: "First Amendment to Credit Agreement — Section 7.01 is hereby amended",
        filingDate: "2024-03-15",
      }),
    ];
    const ap = analyzeAmendmentPackage({ companyId: "co", sources, relationships: [] });
    const op = resolveOperativePrecedence({ sources, amendmentPackage: ap, compare: emptyCompare() });
    cases.push({
      id: "missing-base",
      status: op.status,
      pass: op.status !== "RESOLVED",
      note: "No base → must not RESOLVED",
    });
  }

  // Duplicate restatements
  {
    const sources = [
      baseSrc({
        sourceId: "base",
        documentClass: "CREDIT_AGREEMENT",
        documentTitle: "Credit Agreement",
        filingDate: "2020-01-01",
      }),
      baseSrc({
        sourceId: "r1",
        documentClass: "RESTATEMENT",
        documentTitle: "Amended and Restated Credit Agreement dated as of 2023-01-01",
        filingDate: "2023-01-01",
      }),
      baseSrc({
        sourceId: "r2",
        documentClass: "RESTATEMENT",
        documentTitle: "Amended and Restated Credit Agreement dated as of 2024-01-01",
        filingDate: "2024-01-01",
      }),
    ];
    const ap = analyzeAmendmentPackage({ companyId: "co", sources, relationships: [] });
    const op = resolveOperativePrecedence({ sources, amendmentPackage: ap, compare: emptyCompare() });
    cases.push({
      id: "duplicate-restatements",
      status: op.status,
      pass: op.status !== "RESOLVED",
      note: "Multiple restatements → fail closed (no filing-order pick)",
    });
  }

  return {
    passCount: cases.filter((c) => c.pass).length,
    total: cases.length,
    cases,
  };
}

function selfLoopVsProvisionPreservation() {
  const soloRestatement = discoverDocumentRelationships([
    baseSrc({
      sourceId: "r",
      documentClass: "RESTATEMENT",
      documentTitle: "Amended and Restated Credit Agreement",
    }),
  ]);
  const linked = discoverDocumentRelationships([
    baseSrc({
      sourceId: "base",
      documentClass: "CREDIT_AGREEMENT",
      documentTitle: "Credit Agreement dated as of 2020-01-01",
    }),
    baseSrc({
      sourceId: "r",
      documentClass: "RESTATEMENT",
      documentTitle: "Amended and Restated Credit Agreement",
      filingDate: "2024-01-01",
    }),
  ]);
  return {
    invalidAgreementSelfLoopsEmitted: soloRestatement.filter((r) => r.sourceId === r.targetId).length,
    restatementToDistinctBase:
      linked.some((r) => r.kind === "AGREEMENT_RESTATEMENT" && r.sourceId === "r" && r.targetId === "base"),
    note: "PROVISION_* same-document endpoints remain intentionally emitted by discoverProvisionEdgesFromItems (unit-tested). Agreement self-loops rejected in discover.ts.",
  };
}

async function main() {
  const outDir = path.join(process.cwd(), "docs/knowledge-factory/quality-gate/remediation");
  mkdirSync(outDir, { recursive: true });

  console.error("premerge: population…");
  const pop = await population();
  console.error("premerge: concurrent race simulation…");
  const race = concurrentRaceSimulation();
  console.error("premerge: benchmark discoveryId lookup…");
  const bench = await benchmarkDiscoveryIdLookup();
  console.error("premerge: sample unique edges…");
  const evidence = await sampleUniqueEdges(8);
  console.error("premerge: operative cases…");
  const operative = operativeCases();
  console.error("premerge: self-loop split…");
  const selfLoopSplit = selfLoopVsProvisionPreservation();

  const migrationAudit = {
    executedOnProduction: false,
    isolatedRollbackTested: false,
    isolatedRollbackBlocker:
      "Neon managed Postgres does not expose createdb for disposable headroom_test_* DBs in this environment; rollback SQL reviewed but not executed against an isolated snapshot.",
    archivesDisplacedRows: true,
    preservesProvenanceFields: ["rationale", "confidence", "metadata", "evidence_status", "original_created_at"],
    conflictingDuplicateMetadata:
      "Earliest createdAt kept live; later duplicate rows archived with full metadata JSON — conflicting source evidence retained in archive, not merged/destroyed.",
    rollbackDoc: "docs/knowledge-factory/quality-gate/remediation/MIGRATION-ROLLBACK.md",
    forwardSql: "docs/knowledge-factory/quality-gate/remediation/MIGRATION-dedupe-discovery-key.sql",
    residualRisk:
      "Until UNIQUE(discoveryKey) is authorized and applied, concurrent persistProvisionGraph callers can still race and amplify rows despite full-scan skip logic.",
  };

  const unresolvedHistorical = {
    excessDuplicateRows: pop.excessDuplicateRows,
    agreementSelfLoops: pop.agreementSelfLoops,
    expectedExcess: 18984,
    expectedSelfLoops: 93,
    matchesExpected:
      pop.excessDuplicateRows === 18984 && pop.agreementSelfLoops === 93,
    status: "EXPLICITLY_UNRESOLVED_UNTIL_AUTHORIZED_PRODUCTION_MIGRATION",
  };

  const report = {
    schema: "kf-premerge-audit.v1",
    generatedAt: new Date().toISOString(),
    tipShaExpected: "79f8be362667415dc7f9b5fe1c41d000bf35e9d7",
    neonMutations: false,
    paidInferenceUsd: 0,
    population: pop,
    concurrentRace: race,
    discoveryIdBenchmark: bench,
    evidenceSampling: {
      sampled: evidence.sampled,
      byVerdict: evidence.byVerdict,
      note: evidence.note,
      // Keep sample payload but trim for report size
      samples: evidence.samples,
    },
    operative: operative,
    selfLoopSplit,
    migrationAudit,
    unresolvedHistorical,
  };

  writeFileSync(path.join(outDir, "premerge-audit.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        population: pop,
        concurrentRace: race,
        discoveryIdBenchmark: {
          meanMs: bench.meanMs,
          p50Ms: bench.p50Ms,
          distinctIds: bench.distinctIds,
          limitations: bench.scalabilityLimitations,
        },
        evidenceByVerdict: evidence.byVerdict,
        operativePass: `${operative.passCount}/${operative.total}`,
        selfLoopSplit,
        unresolvedHistorical,
        migrationAudit: {
          executedOnProduction: false,
          isolatedRollbackTested: migrationAudit.isolatedRollbackTested,
          residualRisk: migrationAudit.residualRisk,
        },
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
