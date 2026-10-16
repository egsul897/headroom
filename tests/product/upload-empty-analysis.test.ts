/**
 * Rule 3 — silent-empty-success (live upload path). Before this rule,
 * `analyzeCustomerDocument` returned ok:true for a document that
 * extracted to nothing (0 covenant items, 0 structural nodes, 0
 * definitions), because the pipeline unconditionally sets
 * extractionStatus CANDIDATES_DISCOVERED after extraction. The customer
 * saw an empty covenant list presented as success — "no covenants"
 * when the truth was "we could not read the document."
 *
 * Prisma is stubbed (no DB); the agreement pipeline is disabled via
 * env so the test exercises the upload analysis itself.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const upsertCalls = vi.hoisted(() => [] as Array<Record<string, unknown>>);

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
  const company = { ...base, findUnique: vi.fn(async () => ({ id: "co-1", name: "Test Co", ticker: "TST" })) };
  const knowledgeSource = { ...base, findUnique: vi.fn(async () => null) };
  const documentByteObject = { ...base, findUnique: vi.fn(async () => null) };
  const document = { ...base, findUnique: vi.fn(async () => null) };
  return { prisma: { company, knowledgeSource, documentByteObject, document } };
});

process.env.CLF_AGREEMENT_PIPELINE = "0";

import { analyzeCustomerDocument, emptyAnalysisReason, isEmptyAnalysis } from "../../lib/product/customer-intelligence/analyze-upload";

const EMPTY_DOC = "This is a cover letter. Please find enclosed our annual report. Thank you for your time.";

const RICH_DOC = [
  "Section 6.01 Limitation on Indebtedness. The Issuer shall not incur Indebtedness except: (a) Indebtedness under the Credit Facilities in an aggregate principal amount not to exceed U.S.$150.0 million.",
  "",
  "Section 6.02 Limitation on Restricted Payments. The Issuer shall not make any Restricted Payment except as permitted by this Section 6.02.",
  "",
  "Section 6.03 Limitation on Liens. Neither the Issuer nor any Restricted Subsidiary shall create any Lien upon any of its assets except Permitted Liens.",
  "",
  "Section 8.01 Events of Default. (j) Cross-Default: the Issuer defaults under any Indebtedness in an aggregate principal amount exceeding $25,000,000.",
].join("\n");

describe("upload empty-analysis rule", () => {
  beforeEach(() => {
    upsertCalls.length = 0;
  });

  it("fails (never silent success) when analysis finds nothing at all", async () => {
    const result = await analyzeCustomerDocument({
      companyId: "co-1",
      documentId: "doc-empty",
      bytes: Buffer.from(EMPTY_DOC, "utf8"),
      filename: "letter.txt",
    });
    expect(result.ok).toBe(false);
    expect(result.covenantItemCount).toBe(0);
    expect(result.error).toMatch(/no covenant structure/i);
    const meta = upsertCalls.at(-1)?.metadata as Record<string, unknown> | undefined;
    expect(meta?.processingStatus).toBe("FAILED_RETRYABLE");
    expect(meta?.analysisError).toMatch(/no covenant structure/i);
  });

  it("still succeeds for a covenant-rich document", async () => {
    const result = await analyzeCustomerDocument({
      companyId: "co-1",
      documentId: "doc-rich",
      bytes: Buffer.from(RICH_DOC, "utf8"),
      filename: "indenture.txt",
    });
    expect(result.ok).toBe(true);
    expect(result.covenantItemCount).toBeGreaterThan(0);
  });
});

describe("rule 156: structured but covenantless is a discovery failure", () => {
  it("isEmptyAnalysis fires on substantial structure with zero covenant items", () => {
    expect(isEmptyAnalysis({ covenantItemCount: 0, structuralNodeCount: 25, definitionCount: 0 })).toBe(true);
    expect(emptyAnalysisReason({ covenantItemCount: 0, structuralNodeCount: 25, definitionCount: 0 })).toMatch(
      /no covenant items despite parsing 25 structural nodes/i,
    );
  });

  it("isEmptyAnalysis fires when candidates all got dropped by summarization", () => {
    expect(
      isEmptyAnalysis({ covenantItemCount: 0, structuralNodeCount: 5, definitionCount: 0, covenantCandidateCount: 3 }),
    ).toBe(true);
  });

  it("isEmptyAnalysis still passes a short waiver with a small section tree", () => {
    expect(isEmptyAnalysis({ covenantItemCount: 0, structuralNodeCount: 5, definitionCount: 0 })).toBe(false);
  });

  it("isEmptyAnalysis still passes when at least one covenant item exists", () => {
    expect(isEmptyAnalysis({ covenantItemCount: 1, structuralNodeCount: 25, definitionCount: 0 })).toBe(false);
  });

  it("fails a large administrative document with many sections but no covenants", async () => {
    // 30 administrative sections: plenty of parsed structure, zero
    // covenant items. Before rule 156 this succeeded with an empty
    // covenant list — "ANALYZED · 0 summaries" — indistinguishable
    // from "this document has no covenants."
    const headings = [
      "Notices", "Governing Law", "Counterparts", "Severability", "Miscellaneous",
      "Trustee", "Paying Agent", "Registrar", "Authenticating Agent", "Waiver of Jury Trial",
    ];
    const sections: string[] = [];
    for (let i = 0; i < 30; i++) {
      const num = `1.${String(i + 1).padStart(2, "0")}`;
      sections.push(
        `Section ${num} ${headings[i % headings.length]}. All communications under this instrument shall be delivered in writing to the address set forth in the notice provisions. Any party may change its address by written notice to the other parties. Delivery shall be deemed effective upon receipt during normal business hours.`,
      );
    }
    const result = await analyzeCustomerDocument({
      companyId: "co-1",
      documentId: "doc-admin",
      bytes: Buffer.from(sections.join("\n\n"), "utf8"),
      filename: "administrative-provisions.txt",
    });
    expect(result.structuralNodeCount).toBeGreaterThanOrEqual(20);
    expect(result.covenantItemCount).toBe(0);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no covenant items despite parsing/i);
    const meta = upsertCalls.at(-1)?.metadata as Record<string, unknown> | undefined;
    expect(meta?.processingStatus).toBe("FAILED_RETRYABLE");
  });
});
