/**
 * Discover committed original-byte candidates on disk.
 * Never invents bytes; never treats gitignored empty trees as present.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { OriginalByteCandidate } from "./types";

function sha256File(filePath: string): string {
  const h = createHash("sha256");
  h.update(readFileSync(filePath));
  return h.digest("hex");
}

function makeEdgarSourceId(accession: string, filename: string): string {
  return `edgar:${accession}:${filename}`;
}

export function scanOriginalByteCandidates(repoRoot = process.cwd()): OriginalByteCandidate[] {
  const out: OriginalByteCandidate[] = [];
  const seenPaths = new Set<string>();

  const push = (c: OriginalByteCandidate) => {
    if (seenPaths.has(c.localPath)) return;
    seenPaths.add(c.localPath);
    out.push(c);
  };

  // --- Gibraltar (canonical A2 proof identity) ---
  const gibraltarRel =
    "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/raw-html/ef20064499_ex10-1.htm";
  const gibraltarAbs = path.join(repoRoot, gibraltarRel);
  if (existsSync(gibraltarAbs)) {
    const hash = sha256File(gibraltarAbs);
    const provPath = path.join(
      repoRoot,
      "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/provenance.json",
    );
    const prov = existsSync(provPath) ? JSON.parse(readFileSync(provPath, "utf8")) : {};
    push({
      family: "gibraltar-fixture",
      localPath: gibraltarRel,
      sourceId: makeEdgarSourceId("0001140361-26-003087", "ef20064499_ex10-1.htm"),
      aliasSourceIds: ["fixture:gibraltar"],
      originalBytesHash: hash,
      byteSize: statSync(gibraltarAbs).size,
      contentType: "text/html",
      label: "FIXTURE_AUTHENTIC_SEC",
      issuerCik: String(prov.cik ?? "0000912562"),
      issuerTicker: prov.ticker ?? "ROCK",
      issuerName: prov.issuer ?? "GIBRALTAR INDUSTRIES, INC.",
      accessionNumber: "0001140361-26-003087",
      exhibitFilename: "ef20064499_ex10-1.htm",
      sourceUrl:
        prov.sourceUrl ??
        "https://www.sec.gov/Archives/edgar/data/912562/000114036126003087/ef20064499_ex10-1.htm",
      filingDate: String(prov.filingDate ?? "2026-02-02"),
      formType: String(prov.form ?? "8-K"),
      documentTitle: "CREDIT AGREEMENT",
      documentClass: "CREDIT_AGREEMENT",
      provenance: "sec-edgar-fixture",
      usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
      representationLevel: "SOURCE_ONLY",
    });
  }

  // --- Chewy (issuer-disjoint Document B) ---
  const chewyRel =
    "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/raw-html/doc-a-2026-06-23-credit-agreement.htm";
  const chewyAbs = path.join(repoRoot, chewyRel);
  if (existsSync(chewyAbs)) {
    const hash = sha256File(chewyAbs);
    const manPath = path.join(
      repoRoot,
      "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extraction-manifest.json",
    );
    const man = existsSync(manPath) ? JSON.parse(readFileSync(manPath, "utf8")) : {};
    const doc = man.documents?.[0] ?? {};
    const accession = String(doc.accessionNumber ?? "0001193125-26-281042");
    // Local fixture filename (bytes hash-pinned in extraction-manifest). Do NOT bind these
    // bytes to SEC filename d43042dex101.htm until byte-identity with that object is proven
    // (CBCFL research copy of d43042dex101.htm has a different SHA-256).
    const fixtureFilename = "doc-a-2026-06-23-credit-agreement.htm";
    push({
      family: "chewy-fixture",
      localPath: chewyRel,
      sourceId: makeEdgarSourceId(accession, fixtureFilename),
      aliasSourceIds: ["fixture:chwy"],
      originalBytesHash: hash,
      byteSize: statSync(chewyAbs).size,
      contentType: "text/html",
      label: "FIXTURE_AUTHENTIC_SEC",
      issuerCik: String(doc.cik ?? "0001766502"),
      issuerTicker: "CHWY",
      issuerName: String(doc.issuer ?? "Chewy, Inc."),
      accessionNumber: accession,
      exhibitFilename: fixtureFilename,
      sourceUrl: String(
        doc.sourceUrl ??
          "https://www.sec.gov/Archives/edgar/data/1766502/000119312526281042/",
      ),
      filingDate: String(doc.filedDate ?? "2026-06-24"),
      formType: String(doc.form ?? "8-K"),
      documentTitle: String(doc.title ?? "CREDIT AGREEMENT"),
      documentClass: "CREDIT_AGREEMENT",
      provenance: "sec-edgar-fixture",
      usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
      representationLevel: "SOURCE_ONLY",
    });
  }

  // --- Other unseen-package raw HTML (label as fixture; skip Gibraltar/Chewy duplicates) ---
  const unseenRoot = path.join(repoRoot, "tests/fixtures/unseen-packages");
  if (existsSync(unseenRoot)) {
    for (const pkg of readdirSync(unseenRoot)) {
      if (pkg.includes("gibraltar") || pkg.includes("chwy")) continue;
      const pkgDir = path.join(unseenRoot, pkg);
      if (!statSync(pkgDir).isDirectory()) continue;
      for (const sub of ["raw-html", "raw-source", "raw"]) {
        const subDir = path.join(pkgDir, sub);
        if (!existsSync(subDir)) continue;
        for (const name of readdirSync(subDir)) {
          if (!/\.(htm|html)$/i.test(name)) continue;
          const abs = path.join(subDir, name);
          const rel = path.relative(repoRoot, abs);
          const hash = sha256File(abs);
          push({
            family: "unseen-package",
            localPath: rel,
            sourceId: `fixture:${pkg}:${name}`,
            aliasSourceIds: [],
            originalBytesHash: hash,
            byteSize: statSync(abs).size,
            contentType: "text/html",
            label: "FIXTURE_AUTHENTIC_SEC",
            issuerCik: "0000000000",
            accessionNumber: "fixture",
            exhibitFilename: name,
            sourceUrl: `fixture://${pkg}/${name}`,
            filingDate: "1970-01-01",
            formType: "FIXTURE",
            documentTitle: pkg,
            documentClass: "UNKNOWN",
            provenance: "fixture-internal",
            usageRightsReviewStatus: "FIXTURE_INTERNAL",
            representationLevel: "SOURCE_ONLY",
          });
        }
      }
    }
  }

  // --- CBCFL phase-2 EDGAR research acquisitions ---
  const cbcflRoot = path.join(
    repoRoot,
    "docs/covenant-basket-capacity-formula-library/phase-2/edgar-acquisitions",
  );
  const cbcflManifest = path.join(cbcflRoot, "acquisition-manifest.json");
  if (existsSync(cbcflManifest)) {
    const man = JSON.parse(readFileSync(cbcflManifest, "utf8"));
    for (const doc of man.documents ?? []) {
      const relDir = String(doc.relativeDir ?? "");
      const htmlRel = path.join(relDir, "source.html");
      const abs = path.join(repoRoot, htmlRel);
      if (!existsSync(abs)) continue;
      const hash = sha256File(abs);
      const accession = String(doc.accession ?? "unknown");
      const filename = String(doc.filename ?? "source.html");
      const sourceId =
        accession !== "unknown" && !accession.includes("unknown")
          ? makeEdgarSourceId(accession, filename)
          : `research:cbcfl:${doc.docId}`;
      push({
        family: "cbcfl-edgar",
        localPath: htmlRel,
        sourceId,
        aliasSourceIds: doc.docId ? [`cbcfl:${doc.docId}`] : [],
        originalBytesHash: hash,
        byteSize: statSync(abs).size,
        contentType: "text/html",
        label: "RESEARCH_ACQUISITION",
        issuerCik: String(doc.cik ?? "0000000000"),
        issuerTicker: doc.ticker,
        issuerName: doc.issuer,
        accessionNumber: accession,
        exhibitFilename: filename,
        sourceUrl: String(doc.sourceUrl ?? ""),
        filingDate: String(doc.filingDate ?? "1970-01-01"),
        formType: String(doc.form ?? "8-K"),
        documentTitle: String(doc.issuer ?? doc.docId ?? "CBCFL acquisition"),
        documentClass: "CREDIT_AGREEMENT",
        provenance: "cbcfl-phase2-edgar-acquisition",
        usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
        representationLevel: "SOURCE_ONLY",
      });
    }
  }

  return out.sort((a, b) => a.sourceId.localeCompare(b.sourceId));
}

export function verifyGibraltarFixture(repoRoot = process.cwd()): {
  ok: boolean;
  byteSize: number;
  sha256: string;
  expectedByteSize: number;
  expectedSha256: string;
} {
  const rel =
    "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/raw-html/ef20064499_ex10-1.htm";
  const abs = path.join(repoRoot, rel);
  const expectedByteSize = 2_266_666;
  const expectedSha256 =
    "6dc23ab0e008b95b8bca4547cb485cef7f6269f698befbfbe02856098445f27a";
  if (!existsSync(abs)) {
    return { ok: false, byteSize: 0, sha256: "", expectedByteSize, expectedSha256 };
  }
  const byteSize = statSync(abs).size;
  const sha256 = sha256File(abs);
  return {
    ok: byteSize === expectedByteSize && sha256 === expectedSha256,
    byteSize,
    sha256,
    expectedByteSize,
    expectedSha256,
  };
}
