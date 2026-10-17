import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readSessionHandle, sessionAuthorizationHeaders } from "@/lib/capacity/identity/browser-session";
import {
  createConfirmKeys,
  ebitdaCallError,
  isPreparingMiss,
  lastUpdatedLabel,
  scheduledEbitdaDocumentIds,
} from "@/lib/home/ebitda-confirm";

const root = path.resolve(__dirname, "../..");

describe("EBITDA confirm wiring", () => {
  it("maps 401, 404, 409, and 422 to quiet panel copy", () => {
    expect(ebitdaCallError(401, "authentication required")).toEqual({
      status: 401,
      text: "Sign in to confirm",
      refetch: false,
      signIn: true,
    });
    expect(ebitdaCallError(404, "document not found for this company").text).toMatch(/not found/i);
    expect(ebitdaCallError(409, "idempotency key reused with a different payload")).toMatchObject({
      refetch: true,
      text: "idempotency key reused with a different payload",
    });
    expect(ebitdaCallError(422, "value exceeds the cap").text).toBe("value exceeds the cap");
    expect(ebitdaCallError(422, "NEEDS_BASE: base EBITDA is missing", "NEEDS_BASE").text).toBe("Needs base EBITDA first");
    expect(ebitdaCallError(422, "value exceeds the plausible maximum (10x the reported base EBITDA)", "OUT_OF_RANGE").text).toBe(
      "Allowed up to 10x the reported base EBITDA.",
    );
    expect(ebitdaCallError(409, "idempotencyKey was already used for a different confirmation", "IDEMPOTENCY_CONFLICT")).toMatchObject({
      refetch: true,
      text: "idempotencyKey was already used for a different confirmation",
    });
    expect(isPreparingMiss(404, "no EBITDA box yet for this document")).toBe(true);
    expect(isPreparingMiss(404, "document not found for this company")).toBe(false);
    expect(ebitdaCallError(503, "SEC data unavailable: companyfacts", "SEC_UNAVAILABLE")).toMatchObject({
      text: "SEC data temporarily unavailable, try again",
      refetch: false,
      signIn: false,
    });
    expect(lastUpdatedLabel("2026-10-16T18:00:00.000Z")).toBe("Last updated Oct 16, 2026");
    expect(lastUpdatedLabel(null)).toBeNull();
  });

  it("reuses one idempotency key until a 2xx retires it", () => {
    const keys = createConfirmKeys();
    const first = keys.forClick("ADDBACK:(f)", "LENDER_APPROVAL");
    expect(keys.forClick("ADDBACK:(f)", "LENDER_APPROVAL")).toBe(first);
    expect(keys.forClick("ADDBACK:(f)", "AMOUNT")).not.toBe(first);
    keys.finish("ADDBACK:(f)", "LENDER_APPROVAL");
    expect(keys.forClick("ADDBACK:(f)", "LENDER_APPROVAL")).not.toBe(first);
  });

  it("reads SCHEDULED boxes off upload metadata", () => {
    expect(
      scheduledEbitdaDocumentIds([
        { documentId: "doc-1", metadata: { agreementPipeline: { ebitdaBox: { status: "SCHEDULED" } } } },
        { documentId: "doc-2", metadata: { agreementPipeline: { ebitdaBox: { status: "READY" } } } },
        { documentId: null, metadata: { agreementPipeline: { ebitdaBox: { status: "SCHEDULED" } } } },
        { documentId: "doc-3", metadata: null },
      ]),
    ).toEqual(["doc-1"]);
  });

  it("sends a bearer only from the host session meta, and never confirmedBy", () => {
    expect(readSessionHandle()).toBeNull();
    expect(sessionAuthorizationHeaders()).toEqual({});
    const tile = readFileSync(path.join(root, "components/home/EbitdaTile.tsx"), "utf8") + readFileSync(path.join(root, "components/home/EbitdaGrid.tsx"), "utf8");
    expect(tile).toContain("sessionAuthorizationHeaders()");
    expect(tile).toContain('"LENDER_APPROVAL"');
    expect(tile).toContain("idempotencyKey");
    expect(tile).not.toContain("confirmedBy");
    expect(tile).toContain("keys.finish");
    expect(tile).toContain("Preparing EBITDA…");
    expect(tile).toContain("Sign in to confirm");
    expect(tile).toContain("LockIcon");
    expect(tile).toContain("?refresh=1");
    expect(tile).not.toContain("body.gain");
    const session = readFileSync(path.join(root, "lib/capacity/identity/browser-session.ts"), "utf8");
    expect(session).toContain('meta[name="headroom-session-handle"]');
    expect(session).not.toMatch(/Bearer [A-Za-z0-9._-]{8,}/);
  });
});
