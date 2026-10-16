/**
 * Rule 4 — staging must never clobber a prior analysis. The stage
 * upsert is keyed by sourceId = (companyId, documentId, contentHash),
 * so an update means IDENTICAL bytes — the prior analysis is for these
 * exact bytes and stays valid until the new analysis replaces it.
 * Before this rule, re-uploading (or retrying after a transient
 * failure) wiped covenantSummary / amendmentPackage / reviewer
 * decisions from metadata, and a failed re-analysis left the row with
 * no analysis at all.
 */
import { describe, expect, it, vi } from "vitest";

const upsertCalls = vi.hoisted(() => [] as Array<Record<string, unknown>>);
const priorMetadata = vi.hoisted(() => ({
  workspaceScope: "CUSTOMER",
  companyId: "co-1",
  documentId: "doc-1",
  processingStatus: "ANALYZED",
  covenantSummary: { schemaVersion: "product.covenant-summary.v2", items: [{ sectionRef: "6.01" }] },
  amendmentPackage: { operative: true },
  reviewerApprovals: [{ itemId: "x", decision: "ACCEPTED" }],
  analysisError: "previous transient failure",
}));

vi.mock("../../lib/prisma", () => {
  const base = {
    findFirst: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
    create: vi.fn(async () => ({})),
    update: vi.fn(async () => ({})),
    upsert: vi.fn(async (args: { create?: Record<string, unknown>; update?: Record<string, unknown> }) => {
      upsertCalls.push((args.update ?? args.create ?? {}) as Record<string, unknown>);
      return {};
    }),
  };
  const company = {
    ...base,
    findUnique: vi.fn(async () => ({ id: "co-1", name: "Test Co", ticker: "TST" })),
    findUniqueOrThrow: vi.fn(async () => ({ id: "co-1", name: "Test Co", ticker: "TST" })),
  };
  const knowledgeSource = { ...base, findUnique: vi.fn(async () => ({ metadata: priorMetadata })) };
  const documentByteObject = { ...base, findUnique: vi.fn(async () => null) };
  const document = { ...base, findUnique: vi.fn(async () => null) };
  return { prisma: { company, knowledgeSource, documentByteObject, document } };
});

import { stageCustomerDocument } from "../../lib/product/customer-intelligence/analyze-upload";

describe("stage preserves prior analysis", () => {
  it("merges prior analysis payload, flips status to staged, clears stale error", async () => {
    const staged = await stageCustomerDocument({
      companyId: "co-1",
      documentId: "doc-1",
      bytes: Buffer.from("hello", "utf8"),
      filename: "indenture.pdf",
    });
    expect(staged.sourceId).toContain("customer:co-1:doc-1:");
    expect(upsertCalls.length).toBeGreaterThan(0);
    const meta = upsertCalls.at(-1)?.metadata as Record<string, unknown>;
    expect(meta.processingStatus).toBe("STAGED_PENDING_ANALYSIS");
    expect(meta.covenantSummary).toEqual(priorMetadata.covenantSummary);
    expect(meta.amendmentPackage).toEqual(priorMetadata.amendmentPackage);
    expect(meta.reviewerApprovals).toEqual(priorMetadata.reviewerApprovals);
    expect(meta.analysisError).toBeUndefined();
  });
});
