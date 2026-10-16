/**
 * Rule 14 — the document page's `curated=` source-text path must be
 * containment-checked. It joined a DB field straight into
 * path.join(process.cwd(), value) with no validation, so a notes
 * value of `curated=../../etc/passwd` (or an absolute path) would
 * read an arbitrary file off the server and render its extracted
 * text. Legit values are relative paths under the repo
 * (tests/fixtures/...), so the resolver rejects absolute paths and
 * any path escaping process.cwd().
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCuratedSourceTextPath } from "../../lib/product/customer-intelligence/source-text";

describe("curated source-text path containment", () => {
  it("rejects directory traversal out of the repo", () => {
    expect(resolveCuratedSourceTextPath("curated=../../etc/passwd")).toBeNull();
    expect(resolveCuratedSourceTextPath("curated=../../../etc/shadow")).toBeNull();
    expect(resolveCuratedSourceTextPath("curated=tests/../../etc/passwd")).toBeNull();
  });

  it("rejects absolute paths", () => {
    expect(resolveCuratedSourceTextPath("curated=/etc/passwd")).toBeNull();
    expect(resolveCuratedSourceTextPath("curated=/home/other/secret.txt")).toBeNull();
  });

  it("accepts a relative in-repo curated path", () => {
    const out = resolveCuratedSourceTextPath(
      "packageKey=x\ncurated=tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt",
    );
    expect(out).toBe(
      path.resolve(process.cwd(), "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt"),
    );
  });

  it("returns null when no curated line is present", () => {
    expect(resolveCuratedSourceTextPath("packageKey=x")).toBeNull();
    expect(resolveCuratedSourceTextPath(null)).toBeNull();
  });

  it("document page uses the containment-checked resolver, not raw path.join", () => {
    const source = readFileSync(
      path.join(process.cwd(), "app/[companyId]/documents/[documentId]/page.tsx"),
      "utf8",
    );
    expect(source).toContain("resolveCuratedSourceTextPath");
    expect(source).not.toContain("path.join(process.cwd(), curatedMatch");
  });
});
