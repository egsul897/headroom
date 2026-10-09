/**
 * Static asset-family inventory for consolidation planning.
 * Reflects verified on-disk presence in this workspace — not aspirational paths.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  CONSOLIDATION_INVENTORY_SCHEMA,
  type AssetFamilyInventory,
} from "./types";
import { scanOriginalByteCandidates, verifyGibraltarFixture } from "./scan-original-bytes";

function dirStats(repoRoot: string, rel: string): { exists: boolean; files: number; bytes: number } {
  const abs = path.join(repoRoot, rel);
  if (!existsSync(abs)) return { exists: false, files: 0, bytes: 0 };
  let files = 0;
  let bytes = 0;
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = path.join(d, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else {
        files += 1;
        bytes += st.size;
      }
    }
  };
  if (statSync(abs).isDirectory()) walk(abs);
  else {
    files = 1;
    bytes = statSync(abs).size;
  }
  return { exists: true, files, bytes };
}

function fmtVol(s: { files: number; bytes: number }): string {
  const mb = (s.bytes / (1024 * 1024)).toFixed(2);
  return `${s.files} files / ${mb} MiB`;
}

export function buildAssetInventory(repoRoot = process.cwd()): {
  schemaVersion: typeof CONSOLIDATION_INVENTORY_SCHEMA;
  generatedAt: string;
  families: AssetFamilyInventory[];
  originalByteSummary: {
    availableFiles: number;
    totalBytes: number;
    gibraltarOk: boolean;
  };
  unavailable: string[];
} {
  const localCorpus = dirStats(repoRoot, ".local-knowledge-corpus");
  const dataDir = dirStats(repoRoot, "data");
  const kfExport = dirStats(repoRoot, "docs/knowledge-factory/export/v1");
  const defEnc = dirStats(repoRoot, "docs/definition-encyclopedia");
  const atlas = dirStats(repoRoot, "docs/covenant-dependency-atlas");
  const cbcfl = dirStats(repoRoot, "docs/covenant-basket-capacity-formula-library");
  const amend = dirStats(repoRoot, "docs/amendment-chain-research");
  const prec = dirStats(repoRoot, "docs/precedent-comparison");
  const rare = dirStats(repoRoot, "docs/rare-covenant-drafting-discovery");
  const ehb = dirStats(repoRoot, "docs/edgar-historical-backfill");
  const golden = dirStats(repoRoot, "docs/phase-3f1-6-final-foundation-certification");
  const bytes = scanOriginalByteCandidates(repoRoot);
  const gib = verifyGibraltarFixture(repoRoot);

  const families: AssetFamilyInventory[] = [
    {
      family: "Canonical Knowledge Factory (code + export)",
      authoritativePaths: [
        "lib/knowledge-factory/**",
        "docs/knowledge-factory/export/v1/**",
        "docs/knowledge-factory/preservation/**",
      ],
      format: "TypeScript + consumer-export.v1 JSON",
      sourceIdentity: "sourceId edgar:{accession}:{filename} | fixture:*",
      provenance: "sec-edgar / FIXTURE_INTERNAL",
      verificationStatus: "DISCOVERED_CANDIDATE / STRUCTURALLY_INDEXED; durabilityClaim NONE",
      approximateVolume: fmtVol(kfExport),
      originalBytesPresent: false,
      availability: "METADATA_ONLY",
      notes: "125 sources in export; local corpus bytes absent",
    },
    {
      family: "Local KF corpus bytes",
      authoritativePaths: [".local-knowledge-corpus/**"],
      format: "content-addressed files",
      sourceIdentity: "sha256 path layout",
      provenance: "session-local",
      verificationStatus: "n/a",
      approximateVolume: fmtVol(localCorpus),
      originalBytesPresent: localCorpus.files > 0,
      availability: localCorpus.files > 0 ? "READY" : "UNAVAILABLE",
      notes: "gitignored; empty in this workspace",
    },
    {
      family: "Committed authentic original HTML",
      authoritativePaths: [
        "tests/fixtures/unseen-packages/**/raw-html|raw-source|raw",
        "docs/covenant-basket-capacity-formula-library/phase-2/edgar-acquisitions/**/source.html",
      ],
      format: "HTML",
      sourceIdentity: "edgar:… or research:cbcfl:… or fixture:…",
      provenance: "SEC EDGAR fixtures / research acquisitions",
      verificationStatus: "SOURCE_ONLY (fixture/research labels)",
      approximateVolume: `${bytes.length} files / ${(bytes.reduce((a, b) => a + b.byteSize, 0) / (1024 * 1024)).toFixed(2)} MiB`,
      originalBytesPresent: bytes.length > 0,
      availability: "READY",
      notes: "Primary live-backfill candidates after approval",
    },
    {
      family: "Definition Encyclopedia",
      authoritativePaths: ["docs/definition-encyclopedia/**"],
      format: "JSON/JSONL",
      sourceIdentity: "mixed edgar: + fixture slugs",
      provenance: "SOURCE_ONLY",
      verificationStatus: "SOURCE_ONLY / TEXT_OBSERVATION_ONLY",
      approximateVolume: fmtVol(defEnc),
      originalBytesPresent: false,
      availability: "READY",
      notes: "KF consumer adapter present; do not promote to CERTIFIED",
    },
    {
      family: "Covenant Dependency Atlas",
      authoritativePaths: ["docs/covenant-dependency-atlas/**", ".local-dependency-atlas/**"],
      format: "JSON graphs",
      sourceIdentity: "package keys + edgar: via CKF import",
      provenance: "offline / CKF demo",
      verificationStatus: "legalSemanticVerification NOT_PERFORMED",
      approximateVolume: fmtVol(atlas),
      originalBytesPresent: false,
      availability: "ADAPTER_NEEDED",
      notes: ".local-dependency-atlas absent; docs phase packs RESEARCH_ONLY at scale",
    },
    {
      family: "Basket Formula Library",
      authoritativePaths: ["docs/covenant-basket-capacity-formula-library/**"],
      format: "JSON/JSONL + HTML acquisitions",
      sourceIdentity: "instrument package slugs + EDGAR docIds",
      provenance: "SOURCE_SUPPORTED_HYPOTHESIS",
      verificationStatus: "executable=0 verified=0",
      approximateVolume: fmtVol(cbcfl),
      originalBytesPresent: true,
      availability: "ADAPTER_NEEDED",
      notes: "HTML acquisitions importable as SOURCE_ONLY bytes; formulas stay non-executable",
    },
    {
      family: "Amendment-chain research",
      authoritativePaths: ["docs/amendment-chain-research/**"],
      format: "JSON",
      sourceIdentity: "chain IDs / package paths",
      provenance: "PENDING_INDEPENDENT_REVIEW",
      verificationStatus: "PENDING_INDEPENDENT_REVIEW",
      approximateVolume: fmtVol(amend),
      originalBytesPresent: false,
      availability: "ADAPTER_NEEDED",
      notes: "Almost no original HTML committed",
    },
    {
      family: "Precedent comparison",
      authoritativePaths: ["docs/precedent-comparison/**", "lib/precedent-comparison/**"],
      format: "JSON + TS adapters",
      sourceIdentity: "public provision excerpts",
      provenance: "SOURCE_ONLY",
      verificationStatus: "epistemic standings; APPROVED_PRECEDENT gated",
      approximateVolume: fmtVol(prec),
      originalBytesPresent: false,
      availability: "RESEARCH_ONLY",
      notes: "Explicitly zero Prisma migrations by design",
    },
    {
      family: "Rare / novel drafting",
      authoritativePaths: ["docs/rare-covenant-drafting-discovery/**"],
      format: "JSON",
      sourceIdentity: "edgar: handoff + fixture spans",
      provenance: "novelty-import.v1",
      verificationStatus: "never CERTIFIED via automation",
      approximateVolume: fmtVol(rare),
      originalBytesPresent: false,
      availability: "ADAPTER_NEEDED",
      notes: "",
    },
    {
      family: "EDGAR historical backfill",
      authoritativePaths: ["docs/edgar-historical-backfill/**", "data/edgar-historical-backfill/**"],
      format: "JSON reports + ephemeral queue",
      sourceIdentity: "ehb:… / accession+filename",
      provenance: "fleet SEC contract",
      verificationStatus: "summary handoff only",
      approximateVolume: fmtVol(ehb),
      originalBytesPresent: false,
      availability: dataDir.exists ? "METADATA_ONLY" : "UNAVAILABLE",
      notes: "data/ absent (gitignored)",
    },
    {
      family: "Golden tests / certification packs",
      authoritativePaths: [
        "golden_tests_v1_export.csv",
        "prisma/seed.ts",
        "docs/phase-3f1-6-final-foundation-certification/**",
      ],
      format: "CSV + Prisma GoldenTest + JSON packs",
      sourceIdentity: "coherent:qNN (not KF sourceId)",
      provenance: "company-scoped",
      verificationStatus: "export UNVERIFIED; foundation cert FAILED",
      approximateVolume: fmtVol(golden),
      originalBytesPresent: false,
      availability: "READY",
      notes: "Do not weaken frozen certification evidence",
    },
    {
      family: "Compiler IR / evidence dumps",
      authoritativePaths: [
        "tests/fixtures/ir-examples/**",
        "docs/phase-3-live-validation/**",
        "docs/phase-3-conmed-population-verified/**",
      ],
      format: "JSON/MD evidence trees",
      sourceIdentity: "package/document fixtures",
      provenance: "pipeline runs",
      verificationStatus: "run evidence ≠ KnowledgeRepresentationLevel CERTIFIED",
      approximateVolume: "large evidence trees under docs/",
      originalBytesPresent: false,
      availability: "RESEARCH_ONLY",
      notes: "Not KF consumer-export families",
    },
  ];

  const unavailable = families
    .filter((f) => f.availability === "UNAVAILABLE")
    .map((f) => `${f.family}: ${f.notes || "absent"}`);

  return {
    schemaVersion: CONSOLIDATION_INVENTORY_SCHEMA,
    generatedAt: new Date().toISOString(),
    families,
    originalByteSummary: {
      availableFiles: bytes.length,
      totalBytes: bytes.reduce((a, b) => a + b.byteSize, 0),
      gibraltarOk: gib.ok,
    },
    unavailable,
  };
}
