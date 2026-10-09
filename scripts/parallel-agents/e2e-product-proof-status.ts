/**
 * WS-PAR read-only status probe for Track A product-proof gates.
 * Consumes published CKF contracts only; does not own KF storage.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { probeDurability } from "../../lib/knowledge-factory/preservation/durability";
import { retrievePrecedentInterpretations } from "../../lib/knowledge-factory/reuse/precedent";
import { DefinitionEncyclopediaImportStore } from "../../lib/knowledge-factory/consumers/definition-encyclopedia-import";
import type { CanonicalConsumerExport } from "../../lib/knowledge-factory/export/consumer-contract";
import type { CovenantCandidateRecord } from "../../lib/knowledge-factory/types";

const ROOT = process.cwd();
const EXPORT = join(ROOT, "docs/knowledge-factory/export/v1");
const OUT_DIR = join(ROOT, "docs/architecture/parallel-agents");

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(EXPORT, name), "utf8")) as T;
}

function main() {
  const durability = probeDurability();
  const contract = readJson<Record<string, unknown>>("consumer-contract.json");
  const sources = readJson<Array<Record<string, unknown>>>("sources.json");
  const candidates = readJson<CovenantCandidateRecord[]>("covenant-candidates.json");
  const definitions = readJson<CanonicalConsumerExport["definitions"]>("definitions.json");

  const exportDoc = {
    schemaVersion: "knowledge-factory.consumer-export.v1",
    ...(contract as object),
    sources,
    definitions,
    structuralNodes: [],
    covenantCandidates: candidates,
    dependencyEdges: [],
    conditionExceptionRecords: [],
    documentRelationships: [],
    unresolvedUncertainties: [],
  } as unknown as CanonicalConsumerExport;

  const store = new DefinitionEncyclopediaImportStore();
  const pass1 = store.importFromCanonical(exportDoc, 1);
  const pass2 = store.importFromCanonical(exportDoc, 2);

  const byId = new Map(sources.map((s) => [String(s.sourceId), s]));
  let a4: Record<string, unknown> | null = null;
  for (const query of candidates) {
    const qs = byId.get(query.sourceId);
    if (!qs?.issuerCik) continue;
    const library = candidates.filter((p) => {
      const ps = byId.get(p.sourceId);
      return Boolean(
        ps?.issuerCik && ps.issuerCik !== qs.issuerCik && p.candidateId !== query.candidateId,
      );
    });
    const hits = retrievePrecedentInterpretations(query, library, { minSimilarity: 0.75 });
    if (!hits.length) continue;
    const hit = hits[0]!;
    const prec = candidates.find((c) => c.candidateId === hit.precedentCandidateId);
    if (!prec) continue;
    const ps = byId.get(prec.sourceId)!;
    a4 = {
      ok: true,
      querySourceId: query.sourceId,
      queryIssuerCik: qs.issuerCik,
      queryCandidateId: query.candidateId,
      queryExcerptSha256: createHash("sha256").update(query.excerpt ?? "").digest("hex"),
      queryFamilies: query.families,
      representationLevel: query.representationLevel,
      precedentSourceId: prec.sourceId,
      precedentIssuerCik: ps.issuerCik,
      precedentCandidateId: prec.candidateId,
      precedentExcerptSha256: createHash("sha256").update(prec.excerpt ?? "").digest("hex"),
      mode: hit.mode,
      similarity: hit.similarity,
      replacesVerification: hit.replacesVerification,
      certified: false,
      note: hit.note,
    };
    break;
  }

  const gibPath =
    "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/raw-html/ef20064499_ex10-1.htm";
  const gibAbs = join(ROOT, gibPath);
  const gibPresent = existsSync(gibAbs);
  const gibHash = gibPresent
    ? createHash("sha256").update(readFileSync(gibAbs)).digest("hex")
    : null;
  const expected =
    "6dc23ab0e008b95b8bca4547cb485cef7f6269f698befbfbe02856098445f27a";

  const out = {
    artifact: "e2e-product-proof-execution-board",
    version: 1,
    probedAt: new Date().toISOString(),
    mainSha: process.env.MAIN_SHA ?? null,
    ckfMergeSha: "2a8b70cd7683c6522087f4535f7ee996a6012c3c",
    ckfHeadSha: "262dc0e9bcc2a9f0895431a3db79c0b3671364e9",
    gates: {
      A1_ckfMerged: {
        status: "PASS",
        owner: "WS-CKF",
        evidence: {
          pr: 154,
          headSha: "262dc0e9bcc2a9f0895431a3db79c0b3671364e9",
          mergeSha: "2a8b70cd7683c6522087f4535f7ee996a6012c3c",
          nonPromoting: true,
          durabilityDidNotBlockMerge: true,
        },
        nextAction: "Wire smallest durable storage via existing DocumentStorageProvider + Postgres",
        blocker: null,
      },
      A2_durableSourceRoundTrip: {
        status: durability.durable ? "PASS" : "BLOCKED",
        owner: "WS-CKF (storage via existing lib/document-storage)",
        evidence: { durability },
        nextAction:
          "Provision approved shared DATABASE_URL + BLOB_READ_WRITE_TOKEN; run recover-from-manifest + hash equality in fresh VM",
        blocker: durability.durable
          ? null
          : "FIRST_BROKEN_ARROW: no shared DATABASE_URL / blob token in this environment — cannot prove cross-VM byte rehydrate",
      },
      A3_canonicalExportRealConsumer: {
        status:
          pass1.ok && pass2.ok && pass2.idempotent && pass2.promotedToLegalTruth === 0
            ? "PASS"
            : "BLOCKED",
        owner: "WS-CKF consumer adapter → WS-DEF",
        evidence: {
          schemaVersion: contract.schemaVersion,
          durabilityClaim: contract.durabilityClaim,
          pass1: {
            ok: pass1.ok,
            sourcesUpserted: pass1.sourcesUpserted,
            definitionsUpserted: pass1.definitionsUpserted,
          },
          pass2: {
            ok: pass2.ok,
            idempotent: pass2.idempotent,
            sourcesSkipped: pass2.sourcesSkipped,
            definitionsSkipped: pass2.definitionsSkipped,
            promotedToLegalTruth: pass2.promotedToLegalTruth,
            capacityCalculationAllowed: pass2.capacityCalculationAllowed,
          },
          vitest: "tests/knowledge-factory/phase3-preservation.test.ts (two independent imports)",
        },
        nextAction: "Keep exports SOURCE_ONLY; DEF product store may consume same shards",
        blocker: null,
      },
      A4_issuerDisjointRetrieval: {
        status: a4 ? "PASS" : "BLOCKED",
        owner: "WS-CKF (reuse/precedent) + consumers",
        evidence: a4,
        nextAction: a4
          ? "Fold into independent replay script with frozen citation spans once durable Doc A identity exists"
          : "Lower-threshold investigation or regenerate export with richer excerpts",
        blocker: a4
          ? null
          : "No issuer-disjoint precedent hit at similarity>=0.75 in committed export",
      },
    },
    authenticDocAFixture: {
      path: gibPath,
      present: gibPresent,
      contentHash: gibHash,
      expectedHashFromReconcile: expected,
      hashMatchesReconcile: gibHash === expected,
    },
    trackB: {
      B1_parserIndependentAcceptance: {
        status: "BLOCKED",
        owner: "parser / clause-hierarchy (#163)",
        evidence: {
          pr: 163,
          headSha: "2a536040b7f814e13466ddbe677e982e152debcd",
          mergeable: "MERGEABLE",
          mergeStateStatus: "CLEAN",
          ci: "certified path + Vercel green on tip",
        },
        nextAction:
          "Complete independent acceptance/replay of Chewy §6.08(a)(3)(b) fix; merge only after acceptance evidence",
        blocker: "Independent acceptance not yet recorded as closed on this gate",
      },
      B2_governingLimitsE2E: {
        status: "BLOCKED",
        owner: "Legal Core (#136)",
        evidence: {
          pr: 136,
          draft: true,
          certifiedPath: "FAILURE — expected CERTIFIED received REVIEW_REQUIRED (xref-fixtures)",
        },
        nextAction: "Owner remediates certified-path failures without changing frozen cert expectations unauthorized",
        blocker: "certified path CI red; unsafe to merge",
      },
    },
    trackC: {
      C1_authenticFinancingPackageDemo: {
        status: "BLOCKED",
        owner: "WS-PAR coordination after Track A",
        evidence: null,
        nextAction: "Trace existing product path once A2–A4 pass",
        blocker: "Depends on Track A durable round-trip (A2) first broken arrow",
      },
    },
    milestoneVerdict: "END_TO_END_NOT_YET_PROVEN",
    firstBrokenArrow:
      "A2 durable source round-trip — missing shared DATABASE_URL and blob object-storage token for cross-VM rehydrate",
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, "15-e2e-product-proof-execution-board.json");
  writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ wrote: outPath, verdict: out.milestoneVerdict, firstBrokenArrow: out.firstBrokenArrow, A3: out.gates.A3_canonicalExportRealConsumer.status, A4: out.gates.A4_issuerDisjointRetrieval.status }, null, 2)}\n`);
}

main();
