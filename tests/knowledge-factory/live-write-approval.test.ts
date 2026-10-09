import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APPROVALS_DIR, LIVE_WRITE_APPROVAL_REF_ENV, assertLiveWriteApproval } from "../../lib/knowledge-factory/live-write-approval";

function repo(record?: string): { root: string; ref: string } {
  const root = mkdtempSync(path.join(os.tmpdir(), "kf-approval-"));
  mkdirSync(path.join(root, APPROVALS_DIR), { recursive: true });
  const ref = `${APPROVALS_DIR}/2026-10-09-test.md`;
  if (record !== undefined) writeFileSync(path.join(root, ref), record);
  return { root, ref };
}
const VALID = ["approvedBy: owner-login", "approvedAt: 2026-10-09T12:00:00Z", "environment: neon odd-art-11335831 / br-dry-cell-aw391134 / neondb", "scope: 71 manifest locators into document_byte_objects + KnowledgeSource", "operations: mass-precedent-sec-batch, consolidation-import", "reference: https://github.com/egsul897/headroom/pull/0#issuecomment-0"].join("\n");

describe("live-write approval record", () => {
  it("refuses when no approval reference is set — the token alone is not approval", () => {
    const { root } = repo(VALID);
    expect(() => assertLiveWriteApproval({ operation: "mass-precedent-sec-batch", repoRoot: root, env: {} })).toThrow(/token alone is not approval/);
  });
  it("refuses a reference outside the approvals directory, a missing file, a malformed record and an uncovered operation", () => {
    const { root, ref } = repo(VALID);
    expect(() => assertLiveWriteApproval({ operation: "mass-precedent-sec-batch", repoRoot: root, env: { [LIVE_WRITE_APPROVAL_REF_ENV]: "docs/elsewhere.md" } })).toThrow(/not under/);
    expect(() => assertLiveWriteApproval({ operation: "mass-precedent-sec-batch", repoRoot: root, env: { [LIVE_WRITE_APPROVAL_REF_ENV]: `${APPROVALS_DIR}/nope.md` } })).toThrow(/does not exist/);
    expect(() => assertLiveWriteApproval({ operation: "derived-export-import", repoRoot: root, env: { [LIVE_WRITE_APPROVAL_REF_ENV]: ref } })).toThrow(/does not cover "derived-export-import"/);
    const bad = repo(VALID.replace("approvedBy: owner-login\n", ""));
    expect(() => assertLiveWriteApproval({ operation: "mass-precedent-sec-batch", repoRoot: bad.root, env: { [LIVE_WRITE_APPROVAL_REF_ENV]: bad.ref } })).toThrow(/lacks "approvedBy"/);
    const badDate = repo(VALID.replace("2026-10-09T12:00:00Z", "yesterday"));
    expect(() => assertLiveWriteApproval({ operation: "mass-precedent-sec-batch", repoRoot: badDate.root, env: { [LIVE_WRITE_APPROVAL_REF_ENV]: badDate.ref } })).toThrow(/non-ISO/);
  });
  it("returns the attributable record when it covers the operation", () => {
    const { root, ref } = repo(VALID);
    const rec = assertLiveWriteApproval({ operation: "consolidation-import", repoRoot: root, env: { [LIVE_WRITE_APPROVAL_REF_ENV]: ref } });
    expect(rec).toMatchObject({ ref, approvedBy: "owner-login", operations: ["mass-precedent-sec-batch", "consolidation-import"] });
  });
  it("the repository holds no approval record for the 2026-10-09 writes (nothing was fabricated)", () => {
    const { readdirSync } = require("node:fs") as typeof import("node:fs");
    expect(readdirSync(APPROVALS_DIR).filter((f) => f !== "README.md")).toEqual([]);
  });
});
