/**
 * Discover authentic learning packages from committed repo sources.
 * Issuer-agnostic loaders only — no issuer-specific discovery regexes.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { assignCohort, normalizeCik } from "./cohorts";
import type { LearningPackageSpec } from "./types";

function sha256File(abs: string): string {
  return createHash("sha256").update(readFileSync(abs)).digest("hex");
}

function loadManifestPackages(repoRoot: string): LearningPackageSpec[] {
  const out: LearningPackageSpec[] = [];

  // Product proof 001 — MTN (TRAIN_DEV for factory; was originally unseen proof)
  const mtnManifest = path.join(repoRoot, "docs/product-proof/001/01-source-manifest.json");
  if (existsSync(mtnManifest)) {
    const man = JSON.parse(readFileSync(mtnManifest, "utf8"));
    const cik = normalizeCik(man.selection?.cik ?? "0000812011");
    const docs = (man.documents ?? [])
      .filter((d: { role?: string; localExtractedPath?: string }) =>
        d.role !== "FINANCIAL_STATEMENTS_PUBLIC" && d.localExtractedPath,
      )
      .map((d: {
        documentId: string;
        role?: string;
        localExtractedPath: string;
        url?: string;
        accessionNumber?: string;
        sha256?: string;
      }) => {
        const localPath = path.join("docs/product-proof/001", d.localExtractedPath);
        return {
          documentId: d.documentId,
          label: d.role ?? d.documentId,
          localPath,
          contentType: "text/plain" as const,
          sourceUrl: d.url,
          accessionNumber: d.accessionNumber,
          originalBytesHash: d.sha256,
          role: d.role,
        };
      })
      .filter((d: { localPath: string }) => existsSync(path.join(repoRoot, d.localPath)));

    if (docs.length > 0) {
      const cohort = assignCohort(cik);
      out.push({
        packageKey: String(man.packageId ?? "mtn-2026-tenth-ar-credit-agreement"),
        companyId: "clf-mtn",
        issuerCik: cik,
        issuerTicker: man.selection?.ticker ?? "MTN",
        issuerName: man.selection?.company ?? "Vail Resorts, Inc.",
        instrumentKey: "instrument:mtn-doc-a-tenth-ar-credit-agreement",
        cohort,
        documents: docs,
        provenance: "product-proof-001",
        usageRights: "PUBLIC_SEC_EDGAR",
        evaluationOnly: cohort === "HELD_OUT",
      });
    }
  }

  // Product proof 002 — MHK holdout
  const mhkManifest = path.join(repoRoot, "docs/product-proof/002/manifests/mhk-holdout.json");
  if (existsSync(mhkManifest)) {
    const man = JSON.parse(readFileSync(mhkManifest, "utf8"));
    const cik = "0000851968";
    const base = path.dirname(mhkManifest);
    const docs = (man.documents ?? [])
      .map((d: { documentId: string; label: string; textPath: string }) => {
        const abs = path.isAbsolute(d.textPath) ? d.textPath : path.join(base, d.textPath);
        const localPath = path.relative(repoRoot, abs);
        return {
          documentId: d.documentId,
          label: d.label,
          localPath,
          contentType: "text/plain" as const,
          role: "OPERATIVE_CREDIT_AGREEMENT",
        };
      })
      .filter((d: { localPath: string }) => existsSync(path.join(repoRoot, d.localPath)));

    if (docs.length > 0) {
      const cohort = assignCohort(cik);
      out.push({
        packageKey: String(man.packageKey ?? "mhk-2026-credit-agreement"),
        companyId: String(man.companyId ?? "clf-mhk"),
        issuerCik: cik,
        issuerTicker: "MHK",
        issuerName: "Mohawk Industries, Inc.",
        instrumentKey: man.instrumentKey,
        cohort,
        documents: docs,
        provenance: "product-proof-002-holdout",
        usageRights: "PUBLIC_SEC_EDGAR",
        evaluationOnly: true,
      });
    }
  }

  return out;
}

/**
 * Load selected unseen-package fixtures that have extracted text (fast path).
 * Raw HTML-only packages are registered but may be skipped when budget is tight.
 */
function loadUnseenExtractedPackages(repoRoot: string): LearningPackageSpec[] {
  const out: LearningPackageSpec[] = [];
  const root = path.join(repoRoot, "tests/fixtures/unseen-packages");
  if (!existsSync(root)) return out;

  const preferred = [
    {
      dir: "gibraltar-2026-credit-agreement",
      cik: "0000912562",
      ticker: "ROCK",
      name: "Gibraltar Industries, Inc.",
      packageKey: "gibraltar-2026-credit-agreement",
    },
    {
      dir: "chwy-2026-credit-agreement",
      cik: "0001766502",
      ticker: "CHWY",
      name: "Chewy, Inc.",
      packageKey: "chwy-2026-credit-agreement",
    },
    {
      dir: "wor-2023-2026-credit-facility",
      cik: "0000105418",
      ticker: "WOR",
      name: "Worthington Enterprises, Inc.",
      packageKey: "wor-2023-2026-credit-facility",
    },
  ];

  for (const p of preferred) {
    const pkgDir = path.join(root, p.dir);
    if (!existsSync(pkgDir)) continue;
    const textDir = path.join(pkgDir, "extracted-text");
    const htmlDir = path.join(pkgDir, "raw-html");
    const docs: LearningPackageSpec["documents"] = [];

    if (existsSync(textDir)) {
      for (const name of readdirSync(textDir).filter((f) => f.endsWith(".txt"))) {
        const localPath = path.relative(repoRoot, path.join(textDir, name));
        docs.push({
          documentId: `${p.packageKey}:${name}`,
          label: name,
          localPath,
          contentType: "text/plain",
        });
      }
    } else if (existsSync(htmlDir)) {
      for (const name of readdirSync(htmlDir).filter((f) => /\.html?$/i.test(f))) {
        const abs = path.join(htmlDir, name);
        // Skip multi-MB HTML when no extracted text — register single primary only
        if (statSync(abs).size > 3_000_000) continue;
        docs.push({
          documentId: `${p.packageKey}:${name}`,
          label: name,
          localPath: path.relative(repoRoot, abs),
          contentType: "text/html",
          originalBytesHash: sha256File(abs),
        });
      }
    }

    if (docs.length === 0) continue;
    const cohort = assignCohort(p.cik);
    out.push({
      packageKey: p.packageKey,
      companyId: `clf-${p.ticker.toLowerCase()}`,
      issuerCik: normalizeCik(p.cik),
      issuerTicker: p.ticker,
      issuerName: p.name,
      cohort,
      documents: docs.slice(0, 4),
      provenance: "tests/fixtures/unseen-packages",
      usageRights: "PUBLIC_SEC_EDGAR",
      evaluationOnly: cohort === "HELD_OUT",
    });
  }

  return out;
}

export function listLearningPackages(repoRoot = process.cwd()): LearningPackageSpec[] {
  const byKey = new Map<string, LearningPackageSpec>();
  for (const pkg of [...loadManifestPackages(repoRoot), ...loadUnseenExtractedPackages(repoRoot)]) {
    byKey.set(pkg.packageKey, pkg);
  }
  return [...byKey.values()].sort((a, b) => a.packageKey.localeCompare(b.packageKey));
}

export function getLearningPackage(
  packageKey: string,
  repoRoot = process.cwd(),
): LearningPackageSpec | null {
  return listLearningPackages(repoRoot).find((p) => p.packageKey === packageKey) ?? null;
}

export function loadPackageDocuments(
  spec: LearningPackageSpec,
  repoRoot = process.cwd(),
): { documentId: string; label: string; text: string }[] {
  return spec.documents.map((d) => {
    const abs = path.join(repoRoot, d.localPath);
    let text = readFileSync(abs, "utf8");
    // Cheap HTML strip for structure path when only HTML is available
    if (d.contentType === "text/html" && /<html|<body|<div/i.test(text.slice(0, 2000))) {
      text = text
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ");
    }
    return { documentId: d.documentId, label: d.label, text };
  });
}
