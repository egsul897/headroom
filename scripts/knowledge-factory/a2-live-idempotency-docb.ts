/**
 * Live A2 idempotency / conflict / Document B checks against real Neon.
 * Requires DATABASE_URL. Never logs credential values.
 */
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import type { KnowledgeSourceRecord } from "../../lib/knowledge-factory/types";
import {
  DurableContentConflictError,
  DurableRetrieveError,
  hashBytesSha256,
  loadDurableSourceBytes,
  persistDurableKnowledgeSource,
  retrieveDurableKnowledgeSource,
} from "../../lib/knowledge-factory/preservation/durable-store";

const GIB_ID = "edgar:0001140361-26-003087:ef20064499_ex10-1.htm";
const GIB_PATH =
  "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/raw-html/ef20064499_ex10-1.htm";
const CHEWY_ID = "edgar:0001193125-26-281042:doc-a-2026-06-23-credit-agreement.htm";
const CHEWY_PATH =
  "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/raw-html/doc-a-2026-06-23-credit-agreement.htm";
const EXPECTED_GIB = "6dc23ab0e008b95b8bca4547cb485cef7f6269f698befbfbe02856098445f27a";

function sourceRecord(partial: {
  sourceId: string;
  issuerCik: string;
  issuerTicker?: string;
  issuerName?: string;
  accessionNumber: string;
  exhibitFilename: string;
  sourceUrl: string;
  documentTitle: string;
  originalBytesHash: string;
  byteSize: number;
  provenance?: string;
}): KnowledgeSourceRecord {
  return {
    sourceId: partial.sourceId,
    issuerCik: partial.issuerCik,
    issuerTicker: partial.issuerTicker,
    issuerName: partial.issuerName,
    accessionNumber: partial.accessionNumber,
    exhibitFilename: partial.exhibitFilename,
    sourceUrl: partial.sourceUrl,
    filingDate: "2026-01-01",
    formType: "8-K",
    documentTitle: partial.documentTitle,
    documentClass: "CREDIT_AGREEMENT",
    originalBytesHash: partial.originalBytesHash,
    acquisitionTimestamp: new Date().toISOString(),
    parserVersion: "a2-live-proof/1",
    extractionStatus: "ACQUIRED",
    representationLevel: "DISCOVERED_CANDIDATE",
    provenance: partial.provenance ?? "sec-edgar-fixture",
    usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
    byteSize: partial.byteSize,
  };
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error("DATABASE_URL required");
    process.exit(2);
  }

  const prisma = new PrismaClient();
  const results: Record<string, unknown> = {};

  try {
    const pre = {
      companies: await prisma.company.count(),
      snaps: await prisma.financialSnapshot.count(),
      ks: await prisma.knowledgeSource.count(),
      dbo: await prisma.documentByteObject.count(),
    };
    results.preCounts = pre;

    const gibBytes = readFileSync(GIB_PATH);
    const chewyBytes = readFileSync(CHEWY_PATH);
    const gibHash = hashBytesSha256(gibBytes);
    const chewyHash = hashBytesSha256(chewyBytes);
    results.fixtureHashes = {
      gibraltar: gibHash,
      chewy: chewyHash,
      gibBytes: gibBytes.length,
      chewyBytes: chewyBytes.length,
    };

    const gibSource = sourceRecord({
      sourceId: GIB_ID,
      issuerCik: "0000912562",
      issuerTicker: "ROCK",
      issuerName: "Gibraltar Industries, Inc.",
      accessionNumber: "0001140361-26-003087",
      exhibitFilename: "ef20064499_ex10-1.htm",
      sourceUrl:
        "https://www.sec.gov/Archives/edgar/data/912562/000114036126003087/ef20064499_ex10-1.htm",
      documentTitle: "CREDIT AGREEMENT dated as of February 2, 2026",
      originalBytesHash: gibHash,
      byteSize: gibBytes.length,
    });

    const dboBefore = await prisma.documentByteObject.count();
    const r1 = await persistDurableKnowledgeSource({ source: gibSource, bytes: gibBytes });
    const dboAfterSame = await prisma.documentByteObject.count();
    results.sameSourceSameBytes = {
      reusedExisting: r1.reusedExisting,
      knowledgeSourceRowId: r1.knowledgeSourceRowId,
      storageRef: r1.storageRef,
      contentHash: r1.originalBytesHash,
      documentByteObjectDelta: dboAfterSame - dboBefore,
      pass:
        r1.reusedExisting === true &&
        dboAfterSame === dboBefore &&
        r1.originalBytesHash === EXPECTED_GIB,
    };

    let conflictOk = false;
    let conflictName = "";
    try {
      const badBytes = Buffer.from(
        "different-bytes-should-conflict-" + randomBytes(8).toString("hex"),
      );
      await persistDurableKnowledgeSource({
        source: {
          ...gibSource,
          originalBytesHash: hashBytesSha256(badBytes),
          byteSize: badBytes.length,
        },
        bytes: badBytes,
      });
    } catch (e) {
      conflictOk = e instanceof DurableContentConflictError;
      conflictName = e instanceof Error ? e.name : String(e);
    }
    results.sameSourceDifferentBytes = { pass: conflictOk, errorName: conflictName };

    // Hash mismatch on persist input (declared hash ≠ bytes)
    let hashMismatchOk = false;
    let hashMismatchMsg = "";
    try {
      await persistDurableKnowledgeSource({
        source: { ...gibSource, originalBytesHash: "0".repeat(64) },
        bytes: gibBytes,
      });
    } catch (e) {
      hashMismatchMsg = e instanceof Error ? e.message : String(e);
      hashMismatchOk = hashMismatchMsg.includes("content hash mismatch");
    }
    results.hashMismatchOnPersist = { pass: hashMismatchOk, message: hashMismatchMsg };

    const aliasId = `proof-alias:gibraltar-identical-bytes:${Date.now()}`;
    const dboBeforeAlias = await prisma.documentByteObject.count();
    const rAlias = await persistDurableKnowledgeSource({
      source: sourceRecord({
        sourceId: aliasId,
        issuerCik: "0000912562",
        issuerTicker: "ROCK",
        issuerName: "Gibraltar Industries, Inc.",
        accessionNumber: "0001140361-26-003087",
        exhibitFilename: "ef20064499_ex10-1.htm",
        sourceUrl:
          "https://www.sec.gov/Archives/edgar/data/912562/000114036126003087/ef20064499_ex10-1.htm",
        documentTitle: "Alias over Gibraltar bytes",
        originalBytesHash: gibHash,
        byteSize: gibBytes.length,
        provenance: "a2-live-proof-alias",
      }),
      bytes: gibBytes,
    });
    const dboAfterAlias = await prisma.documentByteObject.count();
    const gibRow = await prisma.knowledgeSource.findUnique({ where: { sourceId: GIB_ID } });
    results.diffSourceIdenticalBytes = {
      aliasSourceId: aliasId,
      aliasRowId: rAlias.knowledgeSourceRowId,
      aliasStorageRef: rAlias.storageRef,
      gibStorageRef: gibRow?.storageRef,
      sameStorageRef: rAlias.storageRef === gibRow?.storageRef,
      sameHash: rAlias.originalBytesHash === EXPECTED_GIB,
      documentByteObjectDelta: dboAfterAlias - dboBeforeAlias,
      pass: rAlias.storageRef === gibRow?.storageRef && dboAfterAlias === dboBeforeAlias,
    };

    let missingOk = false;
    let missingCode = "";
    try {
      await retrieveDurableKnowledgeSource({ sourceId: "edgar:does-not-exist:missing.htm" });
    } catch (e) {
      missingOk = e instanceof DurableRetrieveError && e.code === "SOURCE_NOT_FOUND";
      missingCode = e instanceof DurableRetrieveError ? e.code : e instanceof Error ? e.name : String(e);
    }
    results.missingRetrieve = { pass: missingOk, code: missingCode };

    const chewySource = sourceRecord({
      sourceId: CHEWY_ID,
      issuerCik: "0001766502",
      issuerTicker: "CHWY",
      issuerName: "Chewy, Inc.",
      accessionNumber: "0001193125-26-281042",
      exhibitFilename: "doc-a-2026-06-23-credit-agreement.htm",
      sourceUrl:
        "https://www.sec.gov/Archives/edgar/data/1766502/000119312526281042/doc-a-2026-06-23-credit-agreement.htm",
      documentTitle: "Credit Agreement — Chewy",
      originalBytesHash: chewyHash,
      byteSize: chewyBytes.length,
    });
    const chewyPersist = await persistDurableKnowledgeSource({
      source: chewySource,
      bytes: chewyBytes,
    });
    const chewyRetrieve = await retrieveDurableKnowledgeSource({ sourceId: CHEWY_ID });
    const { bytes: chewyLoaded } = await loadDurableSourceBytes({ sourceId: CHEWY_ID });
    results.chewyPersist = {
      knowledgeSourceRowId: chewyPersist.knowledgeSourceRowId,
      storageRef: chewyPersist.storageRef,
      contentHash: chewyRetrieve.originalBytesHash,
      retrievedBytes: chewyRetrieve.byteLength,
      retrievedHash: chewyRetrieve.retrievedBytesHash,
      loadHash: createHash("sha256").update(chewyLoaded).digest("hex"),
      distinctFromGibraltar:
        chewyPersist.knowledgeSourceRowId !== gibRow?.id &&
        chewyRetrieve.storageRef !== gibRow?.storageRef,
      pass:
        chewyRetrieve.hashEqual &&
        chewyRetrieve.byteLength === chewyBytes.length &&
        hashBytesSha256(chewyLoaded) === chewyHash &&
        chewyRetrieve.storageRef !== gibRow?.storageRef,
    };

    const a = await retrieveDurableKnowledgeSource({ sourceId: GIB_ID });
    const b = await retrieveDurableKnowledgeSource({ sourceId: CHEWY_ID });
    results.documentB = {
      gibraltarSourceId: a.sourceId,
      chewySourceId: b.sourceId,
      gibraltarDbId: a.knowledgeSourceRowId,
      chewyDbId: b.knowledgeSourceRowId,
      gibraltarBlobId: a.storageRef,
      chewyBlobId: b.storageRef,
      sourceIdentitiesSeparate:
        a.sourceId !== b.sourceId && a.knowledgeSourceRowId !== b.knowledgeSourceRowId,
      hashesSeparate: a.originalBytesHash !== b.originalBytesHash,
      storageRefsSeparate: a.storageRef !== b.storageRef,
      gibraltarHash: a.retrievedBytesHash,
      chewyHash: b.retrievedBytesHash,
      representationLevels: { a: a.representationLevel, b: b.representationLevel },
      citationsCorrect:
        a.sourceId === GIB_ID &&
        b.sourceId === CHEWY_ID &&
        !a.sourceId.includes("1193125") &&
        !b.sourceId.includes("1140361"),
      precedentNonAuthoritative:
        a.representationLevel === "DISCOVERED_CANDIDATE" &&
        b.representationLevel === "DISCOVERED_CANDIDATE",
      knowledgeDiscoveryDoesNotCertify:
        a.representationLevel !== "CERTIFIED" && b.representationLevel !== "CERTIFIED",
      gibraltarDoesNotOverrideChewyOperative:
        a.storageRef !== b.storageRef && a.retrievedBytesHash !== b.retrievedBytesHash,
      pass:
        a.sourceId !== b.sourceId &&
        a.originalBytesHash !== b.originalBytesHash &&
        a.storageRef !== b.storageRef &&
        a.representationLevel === "DISCOVERED_CANDIDATE" &&
        b.representationLevel === "DISCOVERED_CANDIDATE",
    };

    await prisma.knowledgeSource.delete({ where: { sourceId: aliasId } }).catch(() => null);

    const post = {
      companies: await prisma.company.count(),
      snaps: await prisma.financialSnapshot.count(),
      ks: await prisma.knowledgeSource.count(),
      dbo: await prisma.documentByteObject.count(),
    };
    results.postCounts = post;
    results.dataIntact = {
      companiesUnchangedOrGrew: post.companies >= pre.companies,
      snapsUnchangedOrGrew: post.snaps >= pre.snaps,
      pass: post.companies >= pre.companies && post.snaps >= pre.snaps,
    };

    const checks = [
      results.sameSourceSameBytes,
      results.sameSourceDifferentBytes,
      results.hashMismatchOnPersist,
      results.diffSourceIdenticalBytes,
      results.missingRetrieve,
      results.chewyPersist,
      results.documentB,
      results.dataIntact,
    ] as Array<{ pass?: boolean }>;
    const allPass = checks.every((x) => x.pass === true);
    results.verdict = allPass ? "LIVE_IDEMPOTENCY_AND_DOC_B_PASS" : "LIVE_IDEMPOTENCY_OR_DOC_B_FAIL";

    const outDir = "docs/knowledge-factory/durability";
    mkdirSync(outDir, { recursive: true });
    writeFileSync(
      path.join(outDir, "a2-live-idempotency-docb.json"),
      JSON.stringify(results, null, 2) + "\n",
    );
    console.log(JSON.stringify(results, null, 2));
    if (!allPass) process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
