/**
 * Rule 25 — a failed direct upload analysis must stamp FAILED_RETRYABLE.
 *
 * uploadDocumentAction's small-file path called analyzeCustomerDocument
 * and DISCARDED its return value, and its catch only logged thrown
 * errors. A failed analysis therefore left the source row
 * STAGED_PENDING_ANALYSIS, and the documents page told the user
 * "analysis is in progress or queued" forever — nothing would ever
 * pick it up (there is no background worker for staged rows).
 * The reanalyze path already stamps FAILED_RETRYABLE from
 * result.ok; the direct path must do the same, and a thrown error
 * must stamp FAILED too (best-effort, never masking the original).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("direct upload analysis failure stamping", () => {
  it("upload action stamps FAILED_RETRYABLE on !ok and on thrown analysis errors", () => {
    const source = readFileSync(
      path.join(process.cwd(), "app/[companyId]/onboarding/documents/actions.ts"),
      "utf8",
    );
    const fn = source.slice(source.indexOf("export async function uploadDocumentAction"));
    const uploadFn = fn.slice(0, fn.indexOf("export async function retryCustomerAnalysisAction"));
    expect(uploadFn).toContain("markCustomerProcessingStatus");
    expect(uploadFn).toContain('status: "FAILED_RETRYABLE"');
    // The stamp must use the staged sourceId, and must fire both for a
    // returned failure and for a thrown error (catch block).
    expect(uploadFn).toContain("stagedSourceId");
    expect(uploadFn).toContain("if (!result.ok)");
  });
});
