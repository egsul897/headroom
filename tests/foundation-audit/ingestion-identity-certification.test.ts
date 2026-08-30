/**
 * Phase 3F.1.6 Final Foundation Certification - Section 12: Ingestion
 * Identity Certification.
 *
 * INDEPENDENT AUDITOR test suite. Deliberately does NOT reuse
 * tests/connectors/upload-connector.test.ts's own fixtures or company ids -
 * this file builds its own adversarial constructions against real Postgres
 * to independently verify the claims in
 * docs/phase-3f1-5-r-residual-foundation/10-onboarding-dedup-remediation.json
 * (P1-3 remediation + the TOCTOU race fix in lib/connectors/upload-connector.ts).
 *
 * The existing baseline suites
 * (tests/connectors/upload-connector.test.ts,
 * tests/onboarding/documents-actions-dedup.test.ts) are run separately by
 * this audit as a regression baseline - see the certification JSON artifact
 * for their pass/fail record. This file is the auditor's OWN, independently
 * constructed evidence.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { uploadDocumentThroughIngestion } from "../../lib/connectors/upload-connector";
import { getOrCreateUploadConnection } from "../../lib/connectors/registry";

const revalidatePath = () => {};
// Import the real server action directly (not mocked business logic) - only
// next/cache and next/navigation need stubbing, same discipline as the
// existing documents-actions-dedup.test.ts baseline, reproduced independently
// here rather than imported from that file.
import { vi } from "vitest";
vi.mock("next/cache", () => ({ revalidatePath: (..._args: unknown[]) => revalidatePath() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { uploadDocumentAction } = await import("../../app/[companyId]/onboarding/documents/actions");

const AUDIT_CO_1 = "audit-s12-ingestion-tenant-alpha";
const AUDIT_CO_2 = "audit-s12-ingestion-tenant-beta";

function formDataFor(filename: string, text: string, declaredType = "CREDIT_AGREEMENT"): FormData {
  const fd = new FormData();
  fd.set("file", new File([text], filename, { type: "text/plain" }));
  fd.set("declaredType", declaredType);
  return fd;
}

async function teardown() {
  for (const companyId of [AUDIT_CO_1, AUDIT_CO_2]) {
    await prisma.sourceArtifact.deleteMany({ where: { companyId } }).catch(() => {});
    await prisma.companySourceConnection.deleteMany({ where: { companyId } }).catch(() => {});
    await prisma.document.deleteMany({ where: { companyId } }).catch(() => {});
    await prisma.company.deleteMany({ where: { id: companyId } }).catch(() => {});
  }
}

describe("Section 12: Ingestion Identity Certification (independent auditor evidence)", () => {
  beforeAll(async () => {
    await teardown();
    await prisma.company.create({ data: { id: AUDIT_CO_1, name: "Audit S12 Tenant Alpha (certification, test-only)" } });
    await prisma.company.create({ data: { id: AUDIT_CO_2, name: "Audit S12 Tenant Beta (certification, test-only)" } });
    // Pre-warm each tenant's DOCUMENT_UPLOAD CompanySourceConnection row
    // before any dedup/identity test below fires concurrent uploads.
    // AUDITOR FINDING (see repro-connection-race.test.ts, reported
    // separately in Section 12's certification JSON as its own finding):
    // lib/connectors/registry.ts's getOrCreateUploadConnection has its OWN
    // unfixed TOCTOU race on (companyId, connectorType) - concurrent FIRST
    // calls for a brand-new company reliably throw unhandled P2002 (~80% of
    // racing calls in a 20-trial reproduction). That is a real, independently
    // confirmed defect in its own right, but it is a DIFFERENT code path
    // than the one this file's tests exist to certify (content-hash
    // identity/dedup semantics in uploadDocumentThroughIngestion/dedup.ts).
    // Pre-warming here isolates THOSE tests from that separate, already-
    // reported defect rather than letting it mask what this file is
    // actually measuring.
    await getOrCreateUploadConnection(AUDIT_CO_1);
    await getOrCreateUploadConnection(AUDIT_CO_2);
  });

  afterAll(async () => {
    await teardown();
  });

  it("AUDITOR TEST 1: 20-way genuinely concurrent upload race via Promise.all (not allSettled) - exactly one Document/SourceArtifact survives, zero unhandled rejections", async () => {
    const data = Buffer.from("AUDITOR CONCURRENCY FIXTURE. Section 12.01. Twenty simultaneous real Postgres calls race on this exact byte sequence.");
    const N = 20;

    // Promise.all (not allSettled): if ANY of the N calls throws, this whole
    // test throws - a stricter bar than the prior phase's own allSettled
    // test. Proves the wrapper's P2002 catch genuinely prevents ANY rejection
    // from reaching the caller, not merely that most callers succeed.
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        uploadDocumentThroughIngestion({ companyId: AUDIT_CO_1, filename: `s12-concurrent-${i}.txt`, data, declaredType: "CREDIT_AGREEMENT" })
      )
    );

    const winners = results.filter((r) => !r.duplicate);
    const losers = results.filter((r) => r.duplicate);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(N - 1);

    const artifactIds = new Set(results.map((r) => r.artifactId));
    expect(artifactIds.size).toBe(1);

    const documentRows = await prisma.document.findMany({ where: { companyId: AUDIT_CO_1, originalFilename: { startsWith: "s12-concurrent-" } } });
    expect(documentRows).toHaveLength(1);

    const artifactRows = await prisma.sourceArtifact.findMany({ where: { companyId: AUDIT_CO_1, contentHash: (await prisma.sourceArtifact.findFirstOrThrow({ where: { id: results[0]!.artifactId } })).contentHash } });
    expect(artifactRows).toHaveLength(1);

    // No orphaned Document rows left behind by any of the 19 losers.
    const allDocsForHash = await prisma.document.count({ where: { companyId: AUDIT_CO_1, originalFilename: { startsWith: "s12-concurrent-" } } });
    expect(allDocsForHash).toBe(1);
  });

  it("AUDITOR TEST 2: mixed-entry-point concurrency - some callers hit uploadDocumentThroughIngestion directly, others hit the real uploadDocumentAction server action, all racing on the SAME bytes at the SAME time", async () => {
    const data = Buffer.from("AUDITOR MIXED-ENTRY-POINT FIXTURE. Section 12.02. Some callers use the direct wrapper, others use the real server action.");

    const directCalls = Array.from({ length: 5 }, (_, i) =>
      uploadDocumentThroughIngestion({ companyId: AUDIT_CO_1, filename: `s12-mixed-direct-${i}.txt`, data, declaredType: "CREDIT_AGREEMENT" })
    );
    const actionCalls = Array.from({ length: 5 }, (_, i) => uploadDocumentAction(AUDIT_CO_1, formDataFor(`s12-mixed-action-${i}.txt`, data.toString("utf-8"))));

    // Fire all 10 at once, genuinely interleaved - not two sequential batches.
    await Promise.all([...directCalls, ...actionCalls]);

    const rows = await prisma.document.findMany({ where: { companyId: AUDIT_CO_1, originalFilename: { startsWith: "s12-mixed-" } } });
    expect(rows).toHaveLength(1); // one entry point's caller won; every other caller (both direct AND action-path) converged on it

    const artifacts = await prisma.sourceArtifact.findMany({ where: { companyId: AUDIT_CO_1, documentId: rows[0]!.id } });
    expect(artifacts).toHaveLength(1);
  });

  it("AUDITOR TEST 3: two real tenants uploading byte-IDENTICAL content simultaneously must NOT merge, even under concurrency pressure", async () => {
    const data = Buffer.from("AUDITOR CROSS-TENANT CONCURRENCY FIXTURE. Section 12.03. Identical bytes, two different companies, racing at once.");

    const batchAlpha = Promise.all(Array.from({ length: 5 }, (_, i) => uploadDocumentThroughIngestion({ companyId: AUDIT_CO_1, filename: `s12-xtenant-a-${i}.txt`, data, declaredType: "CREDIT_AGREEMENT" })));
    const batchBeta = Promise.all(Array.from({ length: 5 }, (_, i) => uploadDocumentThroughIngestion({ companyId: AUDIT_CO_2, filename: `s12-xtenant-b-${i}.txt`, data, declaredType: "CREDIT_AGREEMENT" })));
    const [resultAlpha, resultBeta] = await Promise.all([batchAlpha, batchBeta]);

    const winnersAlpha = resultAlpha.filter((r) => !r.duplicate);
    const winnersBeta = resultBeta.filter((r) => !r.duplicate);
    expect(winnersAlpha).toHaveLength(1);
    expect(winnersBeta).toHaveLength(1);
    expect(winnersAlpha[0]!.artifactId).not.toBe(winnersBeta[0]!.artifactId);

    const docsAlpha = await prisma.document.findMany({ where: { companyId: AUDIT_CO_1, originalFilename: { startsWith: "s12-xtenant-a-" } } });
    const docsBeta = await prisma.document.findMany({ where: { companyId: AUDIT_CO_2, originalFilename: { startsWith: "s12-xtenant-b-" } } });
    expect(docsAlpha).toHaveLength(1);
    expect(docsBeta).toHaveLength(1);
    expect(docsAlpha[0]!.id).not.toBe(docsBeta[0]!.id);

    // Same contentHash, but a genuinely separate SourceArtifact row per tenant.
    const hash = (await prisma.sourceArtifact.findFirstOrThrow({ where: { id: winnersAlpha[0]!.artifactId } })).contentHash;
    const hashBeta = (await prisma.sourceArtifact.findFirstOrThrow({ where: { id: winnersBeta[0]!.artifactId } })).contentHash;
    expect(hash).toBe(hashBeta);
    const artifactsAlpha = await prisma.sourceArtifact.findMany({ where: { companyId: AUDIT_CO_1, contentHash: hash } });
    const artifactsBeta = await prisma.sourceArtifact.findMany({ where: { companyId: AUDIT_CO_2, contentHash: hash } });
    expect(artifactsAlpha).toHaveLength(1);
    expect(artifactsBeta).toHaveLength(1);
  });

  it("AUDITOR TEST 4: legitimate amended version (different bytes, same governs) remains a distinct Document, and a real supersedesDocumentId chain of 3 versions survives concurrent re-uploads of the base", async () => {
    const v1 = "AUDITOR VERSION CHAIN. Section 12.04. Version 1 text.";
    const v2 = "AUDITOR VERSION CHAIN AMENDMENT NO. 1. Section 12.04 is hereby amended and restated.";
    const v3 = "AUDITOR VERSION CHAIN AMENDMENT NO. 2. Section 12.04 is hereby further amended and restated.";

    const r1 = await uploadDocumentThroughIngestion({ companyId: AUDIT_CO_1, filename: "s12-chain-v1.txt", data: Buffer.from(v1), declaredType: "CREDIT_AGREEMENT" });
    const r2 = await uploadDocumentThroughIngestion({ companyId: AUDIT_CO_1, filename: "s12-chain-v2.txt", data: Buffer.from(v2), declaredType: "AMENDMENT" });
    const r3 = await uploadDocumentThroughIngestion({ companyId: AUDIT_CO_1, filename: "s12-chain-v3.txt", data: Buffer.from(v3), declaredType: "AMENDMENT" });

    expect([r1, r2, r3].every((r) => !r.duplicate)).toBe(true);
    const ids = new Set([r1, r2, r3].map((r) => r.artifactId));
    expect(ids.size).toBe(3); // three genuinely distinct documents, none deduped against another

    await prisma.document.update({ where: { id: r2.document!.id }, data: { supersedesDocumentId: r1.document!.id } });
    await prisma.document.update({ where: { id: r3.document!.id }, data: { supersedesDocumentId: r2.document!.id } });

    // Now hammer the BASE document's exact v1 bytes with 5 concurrent
    // duplicate re-uploads and confirm the chain survives completely intact.
    await Promise.all(Array.from({ length: 5 }, (_, i) => uploadDocumentThroughIngestion({ companyId: AUDIT_CO_1, filename: `s12-chain-v1-reupload-${i}.txt`, data: Buffer.from(v1), declaredType: "CREDIT_AGREEMENT" })));

    const v1After = await prisma.document.findUniqueOrThrow({ where: { id: r1.document!.id } });
    const v2After = await prisma.document.findUniqueOrThrow({ where: { id: r2.document!.id } });
    const v3After = await prisma.document.findUniqueOrThrow({ where: { id: r3.document!.id } });
    expect(v2After.supersedesDocumentId).toBe(v1After.id);
    expect(v3After.supersedesDocumentId).toBe(v2After.id);

    const v1Rows = await prisma.document.count({ where: { companyId: AUDIT_CO_1, originalFilename: { startsWith: "s12-chain-v1" } } });
    expect(v1Rows).toBe(1); // still exactly one v1 row despite 5 concurrent duplicate re-uploads racing against the chain
  });

  it("AUDITOR TEST 5: metadata-only differences (renamed file, identical bytes, different declaredType hint) still dedup to the SAME document", async () => {
    const text = "AUDITOR METADATA-ONLY FIXTURE. Section 12.05. Same bytes, different filename and declared type on the second call.";
    const first = await uploadDocumentThroughIngestion({ companyId: AUDIT_CO_2, filename: "s12-meta-original.txt", data: Buffer.from(text), declaredType: "CREDIT_AGREEMENT" });
    const second = await uploadDocumentThroughIngestion({ companyId: AUDIT_CO_2, filename: "s12-meta-renamed-completely-different.txt", data: Buffer.from(text), declaredType: "OTHER" });

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.artifactId).toBe(first.artifactId);

    const rows = await prisma.document.findMany({ where: { companyId: AUDIT_CO_2, originalFilename: { in: ["s12-meta-original.txt", "s12-meta-renamed-completely-different.txt"] } } });
    expect(rows).toHaveLength(1);
  });
});
