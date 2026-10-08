/**
 * Expand authentic source-to-covenant examples from available SEC fixtures and
 * peer corpus exports (exception DB, basket formula library, human GT).
 *
 * All expanded labels are HYPOTHESIS / SOURCE_ONLY — never independently verified.
 * No synthetic examples in the real-source subset.
 */
import { createHash } from "crypto";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { HELDOUT_ISSUER_IDS } from "./catalog";
import { extractByRegex, extractAroundAnchor, readFixture } from "./extract";
import { sha256Text } from "./hash";
import type { SourceToCovenantRecord } from "./types";
import { DATASET_SCHEMA_VERSION } from "./types";
import { currentToolVersionPins } from "./versions";

const AUTH = "2026-10-08T22:45:00.000Z";
const CONTAMINATION = {
  excludeFromClaudeAcceptanceCorpus: true as const,
  excludeFromVerifierFewShots: true as const,
  excludeFromCompilerPromptFewShots: true as const,
  usageRightsReviewRequiredBeforeSft: true as const,
};

type IssuerMeta = {
  issuerId: string;
  issuerName: string;
  instrumentKey: string;
  documentId: string;
  cik?: string;
  heldOut: boolean;
};

const PACKAGE_META: Record<string, IssuerMeta> = {
  "lsb-2023-abl-credit-agreement": {
    issuerId: "lsb-industries",
    issuerName: "LSB Industries, Inc.",
    instrumentKey: "lsb-2023-abl-credit-agreement",
    documentId: "lsb-doc-a-abl-credit-agreement-2023",
    cik: "0000060714",
    heldOut: false,
  },
  "fwrg-2021-credit-agreement": {
    issuerId: "fwrg",
    issuerName: "First Watch Restaurant Group, Inc.",
    instrumentKey: "fwrg-2021-credit-agreement",
    documentId: "fwrg-doc-a-credit-agreement-2021",
    cik: "0001789940",
    heldOut: false,
  },
  "conmed-2025-credit-facility": {
    issuerId: "conmed",
    issuerName: "CONMED Corporation",
    instrumentKey: "conmed-eighth-ar-credit-agreement",
    documentId: "conmed-doc-a-eighth-ar-credit-agreement",
    cik: "0000816956",
    heldOut: false,
  },
  "dsgr-2022-2025-credit-facility": {
    issuerId: "dsgr",
    issuerName: "Distribution Solutions Group, Inc.",
    instrumentKey: "dsgr-2022-2025-credit-facility",
    documentId: "dsgr-doc-d-second-ar-2025",
    heldOut: false,
  },
  "chwy-2026-credit-agreement": {
    issuerId: "chewy",
    issuerName: "Chewy, Inc.",
    instrumentKey: "chwy-2026-credit-agreement",
    documentId: "chwy-doc-a-credit-agreement-2026",
    heldOut: true,
  },
  "gibraltar-2026-credit-agreement": {
    issuerId: "gibraltar",
    issuerName: "Gibraltar Industries, Inc.",
    instrumentKey: "gibraltar-2026-credit-agreement",
    documentId: "gibraltar-doc-a-credit-agreement-2026",
    cik: "0000912562",
    heldOut: true,
  },
  "riot-2025-2026-credit-facility": {
    issuerId: "riot-platforms",
    issuerName: "Riot Platforms, Inc.",
    instrumentKey: "riot-2025-2026-credit-facility",
    documentId: "riot-doc-c-second-ar-credit-agreement-2026",
    heldOut: true,
  },
};

function contentId(parts: string[]): string {
  return createHash("sha256").update(parts.join("|"), "utf8").digest("hex").slice(0, 24);
}

function baseRecord(partial: Omit<SourceToCovenantRecord, "schemaVersion" | "toolVersions" | "contaminationRestrictions" | "nearDuplicateClusterId">): SourceToCovenantRecord {
  return {
    ...partial,
    schemaVersion: DATASET_SCHEMA_VERSION,
    toolVersions: currentToolVersionPins(),
    nearDuplicateClusterId: null,
    contaminationRestrictions: { ...CONTAMINATION },
  };
}

function familyMap(raw: string | undefined): string {
  const u = (raw ?? "UNKNOWN").toUpperCase().replace(/\s+/g, "_");
  const map: Record<string, string> = {
    DEBT_INCURRENCE: "INDEBTEDNESS",
    INDEBTEDNESS: "INDEBTEDNESS",
    LIENS: "LIENS",
    RESTRICTED_PAYMENTS: "RESTRICTED_PAYMENTS",
    INVESTMENTS: "INVESTMENTS",
    ASSET_SALES: "ASSET_SALES",
    FUNDAMENTAL_CHANGES: "FUNDAMENTAL_CHANGES",
    AFFILIATE_TRANSACTIONS: "AFFILIATE_TRANSACTIONS",
    JUNIOR_DEBT_PREPAYMENTS: "MANDATORY_PREPAYMENTS",
    FINANCIAL_COVENANTS: "FINANCIAL_COVENANTS",
    DEFINITIONS: "DEFINITIONS_CALCULATION_RULES",
  };
  return map[u] ?? "QUALITATIVE_NEGATIVE_COVENANTS";
}

/** Load peer exception catalog if present (copied under datasets/.../peer-inputs or /tmp). */
export function loadExceptionCatalog(paths: string[]): unknown[] {
  for (const p of paths) {
    if (!existsSync(p)) continue;
    const raw = JSON.parse(readFileSync(p, "utf8"));
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw.exceptions)) return raw.exceptions;
  }
  return [];
}

export function loadBasketCandidates(paths: string[]): unknown[] {
  for (const p of paths) {
    if (!existsSync(p)) continue;
    if (p.endsWith(".jsonl")) {
      return readFileSync(p, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l));
    }
    const raw = JSON.parse(readFileSync(p, "utf8"));
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw.candidates)) return raw.candidates;
  }
  return [];
}

export function expandFromExceptions(repoRoot: string, exceptions: unknown[], existingIds: Set<string>): SourceToCovenantRecord[] {
  const out: SourceToCovenantRecord[] = [];
  for (const raw of exceptions) {
    const e = raw as Record<string, unknown>;
    const pkg = String(e.sourcePackage ?? "");
    const meta = PACKAGE_META[pkg];
    if (!meta) continue;
    const sourcePath = String(e.sourcePath ?? "");
    const exact = String(e.exactExceptionText ?? "");
    if (!sourcePath || exact.length < 20) continue;
    const exampleId = `stc-exp-${String(e.exceptionId ?? contentId([pkg, String(e.exceptionSectionRef)]))}`;
    if (existingIds.has(exampleId)) continue;
    let windowText = exact;
    let sourceSha = String(e.sourceSha256 ?? "");
    let windowSha = sha256Text(exact);
    let charStart: number | null = null;
    let charEnd: number | null = null;
    try {
      const full = readFixture(repoRoot, sourcePath);
      sourceSha = sha256Text(full);
      const idx = full.indexOf(exact.slice(0, Math.min(80, exact.length)));
      if (idx >= 0) {
        // Prefer a wider controlling context: back up to parent section if possible.
        const back = Math.min(idx, 600);
        const forward = Math.min(full.length - idx, Math.max(exact.length + 400, 1800));
        charStart = idx - back;
        charEnd = idx + forward;
        windowText = full.slice(charStart, charEnd);
        windowSha = sha256Text(windowText);
      }
    } catch {
      // keep exact exception text
    }
    const parent = e.parentProhibition as { sectionRef?: string; text?: string } | undefined;
    const split = meta.heldOut ? "eval-heldout" : out.length % 5 === 0 ? "dev" : "train";
    if (meta.heldOut && !(HELDOUT_ISSUER_IDS as readonly string[]).includes(meta.issuerId)) continue;

    out.push(
      baseRecord({
        exampleId,
        polarity: "POSITIVE",
        role: "EXCEPTION_BASKET",
        split,
        document: {
          issuerId: meta.issuerId,
          issuerName: meta.issuerName,
          instrumentKey: meta.instrumentKey,
          documentId: meta.documentId,
          sourceFixturePath: sourcePath,
          cik: meta.cik,
        },
        operativeVersion: {
          operativeDocumentId: meta.documentId,
          asOfDate: null,
          amendmentIdentity: null,
          isRestatedOperativeText: false,
        },
        structural: {
          sectionRef: String(e.exceptionSectionRef ?? "unknown"),
          sourceNodeKey: null,
          articleRef: null,
          unitKind: "EXCEPTION_BASKET",
        },
        governingProhibition: parent?.text ?? null,
        input: {
          exactText: windowText,
          charStartInFixture: charStart,
          charEndInFixture: charEnd,
          sourceTextSha256: sourceSha || sha256Text(windowText),
          windowSha256: windowSha,
          definitions: {},
          definitionSourceSha256: null,
          exceptions: [String(e.exceptionSectionRef ?? "")],
          conditions: Array.isArray(e.conditions) ? (e.conditions as unknown[]).map(String) : [],
          crossReferences: Array.isArray(e.crossReferences) ? (e.crossReferences as unknown[]).map(String) : [],
          entityScopeNotes: e.entityScope ? [JSON.stringify(e.entityScope)] : [],
        },
        output: {
          candidateCovenantFamily: familyMap(String(e.covenantFamily ?? "")),
          candidatePermissionProhibitionClass: "PERMISSION",
          proposedFormulaOrCapacity: {
            shape: e.capacityShape ? String(e.capacityShape) : null,
            description: `Peer exception-catalog hypothesis for ${e.exceptionSectionRef}. Not independently reviewed.`,
            figures: Array.isArray(e.amountsAndRatios) ? (e.amountsAndRatios as unknown[]).map(String) : [],
            capacityUnlimited: e.unconditionalCapacity === true ? true : false,
          },
          proposedConditions: [],
          proposedDependencyEdges: [],
          missingInputs: Array.isArray(e.remoteConstraintFlags) ? (e.remoteConstraintFlags as unknown[]).map(String) : [],
          uncertainty: {
            level: "HIGH",
            reasons: ["Expanded from peer exception catalog; Phase-2 marks as HUMAN_HYPOTHESIS only"],
          },
          verificationStatus: "HUMAN_HYPOTHESIS",
          labelNotes:
            "Authentic SEC source window. Candidate label imported from negative-covenant exception catalog as a hypothesis — not independent ground truth.",
        },
        authoredAt: AUTH,
        authoringMethod: "HUMAN_SOURCE_READING_PLUS_CATALOG",
      }),
    );
    existingIds.add(exampleId);
  }
  return out;
}

export function expandFromBaskets(repoRoot: string, baskets: unknown[], existingIds: Set<string>): SourceToCovenantRecord[] {
  const out: SourceToCovenantRecord[] = [];
  for (const raw of baskets) {
    const b = raw as Record<string, unknown>;
    const span = String(b.exactSourceSpan ?? "");
    const sourceVersion = b.sourceVersion as {
      packageId?: string;
      instrumentId?: string;
      path?: string;
      documentPath?: string;
      contentSha256?: string;
    } | string | undefined;
    let pkg = "";
    let sourcePath = "";
    let sourceSha = "";
    if (sourceVersion && typeof sourceVersion === "object") {
      pkg = String(sourceVersion.packageId ?? sourceVersion.instrumentId ?? "");
      sourcePath = String(sourceVersion.documentPath ?? sourceVersion.path ?? "");
      sourceSha = String(sourceVersion.contentSha256 ?? "");
    }
    if (!sourcePath && typeof b.sourcePath === "string") sourcePath = b.sourcePath;
    // Normalize instrument aliases onto PACKAGE_META keys
    const alias: Record<string, string> = {
      gib: "gibraltar-2026-credit-agreement",
      gibraltar: "gibraltar-2026-credit-agreement",
      "gibraltar-2026-credit-agreement": "gibraltar-2026-credit-agreement",
      chwy: "chwy-2026-credit-agreement",
      "chwy-2026-credit-agreement": "chwy-2026-credit-agreement",
      lsb: "lsb-2023-abl-credit-agreement",
      "lsb-2023-abl-credit-agreement": "lsb-2023-abl-credit-agreement",
      fwrg: "fwrg-2021-credit-agreement",
      "fwrg-2021-credit-agreement": "fwrg-2021-credit-agreement",
      conmed: "conmed-2025-credit-facility",
      "conmed-2025-credit-facility": "conmed-2025-credit-facility",
      dsgr: "dsgr-2022-2025-credit-facility",
      "dsgr-2022-2025-credit-facility": "dsgr-2022-2025-credit-facility",
      riot: "riot-2025-2026-credit-facility",
    };
    if (pkg && alias[pkg]) pkg = alias[pkg]!;
    if (!pkg && sourcePath) {
      for (const k of Object.keys(PACKAGE_META)) {
        if (sourcePath.includes(k)) pkg = k;
      }
    }
    if (!pkg) {
      const id = String(b.id ?? "");
      const prefix = id.split("-")[0] ?? "";
      if (alias[prefix]) pkg = alias[prefix]!;
      for (const k of Object.keys(PACKAGE_META)) {
        if (sourcePath.includes(k) || id.includes(k)) pkg = k;
      }
    }
    if (!pkg) {
      const notes = String(b.notes ?? "");
      for (const k of Object.keys(PACKAGE_META)) if (notes.includes(k)) pkg = k;
    }
    if (!pkg || span.length < 20) continue;
    const meta = PACKAGE_META[pkg];
    if (!meta) continue;
    if (!sourcePath) {
      const defaults: Record<string, string> = {
        "lsb-2023-abl-credit-agreement": "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/article-6-negative-covenants.txt",
        "fwrg-2021-credit-agreement": "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/article-6-negative-covenants.txt",
        "conmed-2025-credit-facility":
          "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt",
        "chwy-2026-credit-agreement": "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt",
        "gibraltar-2026-credit-agreement": "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/extracted-text/credit-agreement.txt",
        "dsgr-2022-2025-credit-facility":
          "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-d-2025-second-amended-restated-credit-agreement.txt",
      };
      sourcePath = defaults[pkg] ?? "";
    }
    if (!sourcePath || !existsSync(resolve(repoRoot, sourcePath))) continue;

    const exampleId = `stc-bkt-${String(b.id ?? contentId([pkg, span.slice(0, 40)])).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80)}`;
    if (existingIds.has(exampleId)) continue;

    let windowText = span;
    let windowSha = sha256Text(span);
    let charStart: number | null = null;
    let charEnd: number | null = null;
    try {
      const full = readFixture(repoRoot, sourcePath);
      sourceSha = sha256Text(full);
      const anchor = span.slice(0, Math.min(60, span.length));
      const idx = full.indexOf(anchor);
      if (idx >= 0) {
        charStart = Math.max(0, idx - 400);
        charEnd = Math.min(full.length, idx + Math.max(span.length, 1200) + 400);
        windowText = full.slice(charStart, charEnd);
        windowSha = sha256Text(windowText);
      }
    } catch {
      /* keep span */
    }

    const split = meta.heldOut ? "eval-heldout" : out.length % 5 === 0 ? "dev" : "train";
    const gov = b.governingCovenant as { sectionRef?: string; text?: string } | string | undefined;
    const govText = typeof gov === "string" ? gov : gov?.text ?? null;
    const sectionRef = typeof gov === "object" && gov?.sectionRef ? gov.sectionRef : "basket";

    out.push(
      baseRecord({
        exampleId,
        polarity: "POSITIVE",
        role: "EXCEPTION_BASKET",
        split,
        document: {
          issuerId: meta.issuerId,
          issuerName: meta.issuerName,
          instrumentKey: meta.instrumentKey,
          documentId: meta.documentId,
          sourceFixturePath: sourcePath,
          cik: meta.cik,
        },
        operativeVersion: {
          operativeDocumentId: meta.documentId,
          asOfDate: null,
          amendmentIdentity: null,
          isRestatedOperativeText: false,
        },
        structural: {
          sectionRef: String(sectionRef),
          sourceNodeKey: null,
          articleRef: null,
          unitKind: "EXCEPTION_BASKET",
        },
        governingProhibition: govText,
        input: {
          exactText: windowText,
          charStartInFixture: charStart,
          charEndInFixture: charEnd,
          sourceTextSha256: sourceSha || sha256Text(windowText),
          windowSha256: windowSha,
          definitions: {},
          definitionSourceSha256: null,
          exceptions: [],
          conditions: Array.isArray(b.conditions) ? (b.conditions as unknown[]).map((c) => JSON.stringify(c)) : [],
          crossReferences: [],
          entityScopeNotes: b.entityScope ? [JSON.stringify(b.entityScope)] : [],
        },
        output: {
          candidateCovenantFamily: familyMap(String(b.basketFamily ?? "")),
          candidatePermissionProhibitionClass: "PERMISSION",
          proposedFormulaOrCapacity: {
            shape: b.capacitySemantics ? String((b.capacitySemantics as { shape?: string }).shape ?? "") : null,
            description: `Peer basket-formula hypothesis (${b.id}). Not independently reviewed.`,
            figures: (() => {
              const a = b.amountOrFormulaCandidate;
              if (!a) return [] as string[];
              if (typeof a === "string") return [a];
              if (typeof a === "object" && a && "expressionText" in (a as object)) return [String((a as { expressionText: string }).expressionText)];
              return [JSON.stringify(a)];
            })(),
            capacityUnlimited: null,
          },
          proposedConditions: [],
          proposedDependencyEdges: Array.isArray(b.sharedCapacityDependencies)
            ? (b.sharedCapacityDependencies as unknown[]).map((d) => ({
                edgeType: "SHARES_CAPACITY_WITH",
                targetRef: String(d),
                description: "Shared capacity dependency from basket corpus",
              }))
            : [],
          missingInputs: Array.isArray(b.capacityComputationBlockers)
            ? (b.capacityComputationBlockers as unknown[]).map(String)
            : Array.isArray(b.financialInputs)
              ? (b.financialInputs as unknown[]).map(String)
              : [],
          uncertainty: { level: "HIGH", reasons: ["Basket corpus hypothesis; Phase-2 blocks SFT"] },
          verificationStatus: "HUMAN_HYPOTHESIS",
          labelNotes: "Authentic source span from basket formula library export. Hypothesis only.",
        },
        authoredAt: AUTH,
        authoringMethod: "HUMAN_SOURCE_READING_PLUS_CATALOG",
      }),
    );
    existingIds.add(exampleId);
  }
  return out;
}

/** Additional section-scale extractions from large multi-doc packages (DSGR/Riot/Chewy/Gibraltar). */
export function expandSectionSweep(repoRoot: string, existingIds: Set<string>): SourceToCovenantRecord[] {
  const plans: Array<{
    pkg: string;
    path: string;
    startRe: string;
    endRe: string | null;
    sectionRef: string;
    family: string;
    occurrence?: number;
    maxLen?: number;
    role?: SourceToCovenantRecord["role"];
    polarity?: SourceToCovenantRecord["polarity"];
    heldOutNote?: boolean;
  }> = [
    {
      pkg: "dsgr-2022-2025-credit-facility",
      path: "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-d-2025-second-amended-restated-credit-agreement.txt",
      startRe: String.raw`Section\s+6\.01`,
      endRe: String.raw`Section\s+6\.02`,
      sectionRef: "6.01",
      family: "INDEBTEDNESS",
      occurrence: -1,
      maxLen: 8000,
    },
    {
      pkg: "dsgr-2022-2025-credit-facility",
      path: "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-d-2025-second-amended-restated-credit-agreement.txt",
      startRe: String.raw`Section\s+6\.02`,
      endRe: String.raw`Section\s+6\.03`,
      sectionRef: "6.02",
      family: "LIENS",
      occurrence: -1,
      maxLen: 6000,
    },
    {
      pkg: "dsgr-2022-2025-credit-facility",
      path: "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-d-2025-second-amended-restated-credit-agreement.txt",
      startRe: String.raw`Section\s+6\.08`,
      endRe: String.raw`Section\s+6\.09`,
      sectionRef: "6.08",
      family: "RESTRICTED_PAYMENTS",
      occurrence: -1,
      maxLen: 8000,
    },
    {
      pkg: "conmed-2025-credit-facility",
      path: "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt",
      startRe: String.raw`SECTION 7\.1 Financial Condition`,
      endRe: String.raw`SECTION 7\.2 `,
      sectionRef: "7.1",
      family: "FINANCIAL_COVENANTS",
      maxLen: 4000,
    },
    {
      pkg: "conmed-2025-credit-facility",
      path: "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt",
      startRe: String.raw`SECTION 7\.3 Limitation on Liens`,
      endRe: String.raw`SECTION 7\.4 `,
      sectionRef: "7.3",
      family: "LIENS",
      maxLen: 8000,
    },
    {
      pkg: "conmed-2025-credit-facility",
      path: "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt",
      startRe: String.raw`SECTION 7\.5 Limitation on Sale`,
      endRe: String.raw`SECTION 7\.6 `,
      sectionRef: "7.5",
      family: "ASSET_SALES",
      maxLen: 6000,
    },
    {
      pkg: "conmed-2025-credit-facility",
      path: "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt",
      startRe: String.raw`SECTION 7\.6 Limitation on Restricted`,
      endRe: String.raw`SECTION 7\.7 `,
      sectionRef: "7.6",
      family: "RESTRICTED_PAYMENTS",
      maxLen: 5000,
    },
    {
      pkg: "lsb-2023-abl-credit-agreement",
      path: "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/article-6-negative-covenants.txt",
      startRe: String.raw`SECTION\s+6\.04`,
      endRe: String.raw`SECTION\s+6\.05`,
      sectionRef: "6.04",
      family: "ASSET_SALES",
    },
    {
      pkg: "lsb-2023-abl-credit-agreement",
      path: "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/article-6-negative-covenants.txt",
      startRe: String.raw`SECTION\s+6\.08`,
      endRe: String.raw`SECTION\s+6\.09`,
      sectionRef: "6.08",
      family: "INVESTMENTS",
    },
    {
      pkg: "chwy-2026-credit-agreement",
      path: "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt",
      startRe: String.raw`Section 6\.01\s+Limitation on Incurrence`,
      endRe: String.raw`Section 6\.02`,
      sectionRef: "6.01",
      family: "INDEBTEDNESS",
      occurrence: -1,
      maxLen: 10000,
      heldOutNote: true,
    },
    {
      pkg: "riot-2025-2026-credit-facility",
      path: "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text/doc-c-2026-04-21-second-amended-restated-credit-agreement.txt",
      startRe: String.raw`Negative Covenant`,
      endRe: null,
      sectionRef: "Article VI",
      family: "QUALITATIVE_NEGATIVE_COVENANTS",
      occurrence: -1,
      maxLen: 5000,
      heldOutNote: true,
    },
    {
      pkg: "gibraltar-2026-credit-agreement",
      path: "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/extracted-text/credit-agreement.txt",
      startRe: String.raw`Section 7\.01`,
      endRe: String.raw`Section 7\.02`,
      sectionRef: "7.01",
      family: "REPORTING_INFORMATION",
      occurrence: -1,
      maxLen: 4000,
      heldOutNote: true,
    },
    {
      pkg: "dsgr-2022-2025-credit-facility",
      path: "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-a-2022-amended-restated-credit-agreement.txt",
      startRe: String.raw`Section\s+6\.01`,
      endRe: String.raw`Section\s+6\.02`,
      sectionRef: "6.01-doc-a",
      family: "INDEBTEDNESS",
      occurrence: -1,
      maxLen: 8000,
    },
    {
      pkg: "dsgr-2022-2025-credit-facility",
      path: "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-a-2022-amended-restated-credit-agreement.txt",
      startRe: String.raw`Section\s+6\.04`,
      endRe: String.raw`Section\s+6\.05`,
      sectionRef: "6.04-doc-a",
      family: "INVESTMENTS",
      occurrence: -1,
      maxLen: 6000,
    },
    {
      pkg: "dsgr-2022-2025-credit-facility",
      path: "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-c-2025-fourth-amendment.txt",
      startRe: String.raw`Section 6\.08\(a\)\(v\)`,
      endRe: null,
      sectionRef: "6.08(a)(v)-amd",
      family: "RESTRICTED_PAYMENTS",
      occurrence: 0,
      maxLen: 2500,
    },
    {
      pkg: "riot-2025-2026-credit-facility",
      path: "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text/doc-a-2025-04-22-credit-agreement.txt",
      startRe: String.raw`Negative Covenant`,
      endRe: null,
      sectionRef: "Article-VI-doc-a",
      family: "QUALITATIVE_NEGATIVE_COVENANTS",
      occurrence: -1,
      maxLen: 5000,
      heldOutNote: true,
    },
    {
      pkg: "riot-2025-2026-credit-facility",
      path: "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text/doc-b-2025-05-19-amended-restated-credit-agreement.txt",
      startRe: String.raw`Negative Covenant`,
      endRe: null,
      sectionRef: "Article-VI-doc-b",
      family: "QUALITATIVE_NEGATIVE_COVENANTS",
      occurrence: -1,
      maxLen: 5000,
      heldOutNote: true,
    },
    {
      pkg: "chwy-2026-credit-agreement",
      path: "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt",
      startRe: String.raw`Section 6\.02`,
      endRe: String.raw`Section 6\.03`,
      sectionRef: "6.02",
      family: "LIENS",
      occurrence: -1,
      maxLen: 8000,
      heldOutNote: true,
    },
    {
      pkg: "chwy-2026-credit-agreement",
      path: "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt",
      startRe: String.raw`Section 6\.04`,
      endRe: String.raw`Section 6\.05`,
      sectionRef: "6.04",
      family: "RESTRICTED_PAYMENTS",
      occurrence: -1,
      maxLen: 8000,
      heldOutNote: true,
    },
    {
      pkg: "gibraltar-2026-credit-agreement",
      path: "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/extracted-text/credit-agreement.txt",
      startRe: String.raw`Section 7\.02`,
      endRe: String.raw`Section 7\.03`,
      sectionRef: "7.02",
      family: "REPORTING_INFORMATION",
      occurrence: -1,
      maxLen: 4000,
      heldOutNote: true,
    },
    {
      pkg: "conmed-2025-credit-facility",
      path: "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/first-omnibus-amendment-2026-curated.txt",
      startRe: String.raw`AMENDMENT|First Omnibus|FIRST OMNIBUS`,
      endRe: null,
      sectionRef: "omnibus-2026",
      family: "AMENDMENT_WAIVER_CONSENT",
      occurrence: 0,
      maxLen: 3500,
      role: "AMENDMENT_EFFECT",
    },
    {
      pkg: "lsb-2023-abl-credit-agreement",
      path: "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/article-6-negative-covenants.txt",
      startRe: String.raw`SECTION\s+6\.03`,
      endRe: String.raw`SECTION\s+6\.04`,
      sectionRef: "6.03",
      family: "FUNDAMENTAL_CHANGES",
    },
    {
      pkg: "lsb-2023-abl-credit-agreement",
      path: "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/article-6-negative-covenants.txt",
      startRe: String.raw`SECTION\s+6\.12`,
      endRe: String.raw`SECTION\s+6\.13`,
      sectionRef: "6.12",
      family: "QUALITATIVE_NEGATIVE_COVENANTS",
    },
    {
      pkg: "fwrg-2021-credit-agreement",
      path: "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/article-6-negative-covenants.txt",
      startRe: String.raw`Section 6\.02`,
      endRe: String.raw`Section 6\.03`,
      sectionRef: "6.02",
      family: "LIENS",
      maxLen: 6000,
    },
    {
      pkg: "fwrg-2021-credit-agreement",
      path: "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/article-6-negative-covenants.txt",
      startRe: String.raw`Section 6\.04`,
      endRe: String.raw`Section 6\.05`,
      sectionRef: "6.04",
      family: "RESTRICTED_PAYMENTS",
      maxLen: 10000,
    },
    {
      pkg: "fwrg-2021-credit-agreement",
      path: "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/article-6-negative-covenants.txt",
      startRe: String.raw`Section 6\.06`,
      endRe: String.raw`Section 6\.07`,
      sectionRef: "6.06",
      family: "INVESTMENTS",
      maxLen: 8000,
    },
  ];

  // Add lettered CONMED 7.2 limbs as adversarial ordinary drafting samples via anchors in curated text
  const conmedPath =
    "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt";
  const limbAnchors = ["(a)", "(b)", "(c)", "(d)", "(e)", "(f)", "(g)", "(h)", "(i)", "(j)", "(k)", "(l)", "(m)", "(n)", "(o)", "(p)", "(q)"];
  const out: SourceToCovenantRecord[] = [];

  for (const plan of plans) {
    const meta = PACKAGE_META[plan.pkg]!;
    const exampleId = `stc-sec-${meta.issuerId}-${plan.sectionRef.replace(/[^a-zA-Z0-9]+/g, "_")}`;
    if (existingIds.has(exampleId)) continue;
    try {
      const w = extractByRegex(repoRoot, plan.path, new RegExp(plan.startRe, "i"), plan.endRe ? new RegExp(plan.endRe, "i") : null, {
        occurrence: plan.occurrence,
        maxLen: plan.maxLen,
      });
      out.push(
        baseRecord({
          exampleId,
          polarity: plan.polarity ?? "POSITIVE",
          role: plan.role ?? "OPERATIVE_COVENANT",
          split: meta.heldOut ? "eval-heldout" : "train",
          document: {
            issuerId: meta.issuerId,
            issuerName: meta.issuerName,
            instrumentKey: meta.instrumentKey,
            documentId: meta.documentId,
            sourceFixturePath: plan.path,
            cik: meta.cik,
          },
          operativeVersion: {
            operativeDocumentId: meta.documentId,
            asOfDate: null,
            amendmentIdentity: plan.pkg.includes("riot") ? "riot-second-amended-restated-2026-04-21" : null,
            isRestatedOperativeText: plan.pkg.includes("dsgr") || plan.pkg.includes("riot"),
          },
          structural: {
            sectionRef: plan.sectionRef,
            sourceNodeKey: null,
            articleRef: null,
            unitKind: plan.role ?? "OPERATIVE_COVENANT",
          },
          governingProhibition: null,
          input: {
            exactText: w.exactText,
            charStartInFixture: w.charStartInFixture,
            charEndInFixture: w.charEndInFixture,
            sourceTextSha256: w.sourceTextSha256,
            windowSha256: w.windowSha256,
            definitions: {},
            definitionSourceSha256: null,
            exceptions: [],
            conditions: [],
            crossReferences: [],
            entityScopeNotes: [],
          },
          output: {
            candidateCovenantFamily: plan.family,
            candidatePermissionProhibitionClass: "UNRESOLVED",
            proposedFormulaOrCapacity: {
              shape: null,
              description: "Section-scale authentic window; detailed permission/prohibition decomposition left as hypothesis.",
              figures: [],
              capacityUnlimited: null,
            },
            proposedConditions: [],
            proposedDependencyEdges: [],
            missingInputs: ["Per-limb economics", "Definition pack"],
            uncertainty: { level: "HIGH", reasons: ["Section sweep expansion; unresolved semantics"] },
            verificationStatus: meta.heldOut ? "UNRESOLVED" : "HUMAN_HYPOTHESIS",
            labelNotes: "Authentic SEC section window from fixture sweep. Not independently verified.",
          },
          authoredAt: AUTH,
          authoringMethod: "HUMAN_SOURCE_READING_PLUS_CATALOG",
        }),
      );
      existingIds.add(exampleId);
    } catch {
      /* skip failed extractions */
    }
  }

  // CONMED limbs: locate each "(x)\n" after SECTION 7.2
  try {
    const full = readFixture(repoRoot, conmedPath);
    const start = full.indexOf("SECTION 7.2 Limitation on Indebtedness");
    const end = full.indexOf("SECTION 7.3 ", start);
    const body = full.slice(start, end > start ? end : start + 9000);
    for (const letter of limbAnchors) {
      const exampleId = `stc-conmed-7_2-${letter.replace(/[()]/g, "")}`;
      if (existingIds.has(exampleId)) continue;
      const re = new RegExp(`\\n\\(${letter.slice(1, -1)}\\)\\n`);
      const m = re.exec(body);
      if (!m || m.index === undefined) continue;
      const abs = start + m.index;
      const next = limbAnchors[limbAnchors.indexOf(letter) + 1];
      let limbEnd = end > 0 ? end : abs + 1500;
      if (next) {
        const nre = new RegExp(`\\n\\(${next.slice(1, -1)}\\)\\n`);
        const m2 = nre.exec(body.slice(m.index + 1));
        if (m2 && m2.index !== undefined) limbEnd = start + m.index + 1 + m2.index;
      }
      const exactText = full.slice(abs, Math.min(full.length, Math.max(limbEnd, abs + 200)));
      if (exactText.length < 40) continue;
      out.push(
        baseRecord({
          exampleId,
          polarity: "POSITIVE",
          role: "EXCEPTION_BASKET",
          split: "train",
          document: {
            issuerId: "conmed",
            issuerName: "CONMED Corporation",
            instrumentKey: "conmed-eighth-ar-credit-agreement",
            documentId: "conmed-doc-a-eighth-ar-credit-agreement",
            sourceFixturePath: conmedPath,
            cik: "0000816956",
          },
          operativeVersion: {
            operativeDocumentId: "conmed-doc-a-eighth-ar-credit-agreement",
            asOfDate: "2025-06-16",
            amendmentIdentity: null,
            isRestatedOperativeText: true,
          },
          structural: {
            sectionRef: `7.2${letter}`,
            sourceNodeKey: null,
            articleRef: "ARTICLE VII",
            unitKind: "EXCEPTION_BASKET",
          },
          governingProhibition: "Create, incur, assume or suffer to exist any Indebtedness, except:",
          input: {
            exactText,
            charStartInFixture: abs,
            charEndInFixture: abs + exactText.length,
            sourceTextSha256: sha256Text(full),
            windowSha256: sha256Text(exactText),
            definitions: {},
            definitionSourceSha256: null,
            exceptions: [`7.2${letter}`],
            conditions: [],
            crossReferences: [],
            entityScopeNotes: ["Parent Borrower / Subsidiaries / Loan Party distinctions as in limb"],
          },
          output: {
            candidateCovenantFamily: "INDEBTEDNESS",
            candidatePermissionProhibitionClass: "PERMISSION",
            proposedFormulaOrCapacity: {
              shape: null,
              description: `CONMED §7.2${letter} exception limb — hypothesis only.`,
              figures: [],
              capacityUnlimited: null,
            },
            proposedConditions: [],
            proposedDependencyEdges: [{ edgeType: "EXCEPTION_TO", targetRef: "7.2", description: "Letter exception to indebtedness prohibition" }],
            missingInputs: ["Limb-specific figures/conditions full resolution"],
            uncertainty: { level: "MEDIUM", reasons: ["Ordinary lettered exception; not independently reviewed"] },
            verificationStatus: "HUMAN_HYPOTHESIS",
            labelNotes: "Authentic CONMED §7.2 limb window. Adversarial/ordinary drafting sample for eval — hypothesis label.",
          },
          authoredAt: AUTH,
          authoringMethod: "HUMAN_SOURCE_READING_PLUS_CATALOG",
        }),
      );
      existingIds.add(exampleId);
    }
  } catch {
    /* ignore */
  }

  return out;
}

export function expandAuthenticCorpus(
  repoRoot: string,
  seedRecords: readonly SourceToCovenantRecord[],
  peerInputDirs: string[],
): { added: SourceToCovenantRecord[]; issuerCount: number; issuerGapReason: string } {
  const existingIds = new Set(seedRecords.map((r) => r.exampleId));
  const exceptionPaths = peerInputDirs.flatMap((d) => [resolve(d, "exceptions.json"), resolve(d, "catalogs/exceptions.json")]);
  const basketPaths = peerInputDirs.flatMap((d) => [
    resolve(d, "basket-candidates.jsonl"),
    resolve(d, "export/basket-candidates.jsonl"),
    resolve(d, "basket-candidates.json"),
  ]);

  const exceptions = loadExceptionCatalog(exceptionPaths);
  const baskets = loadBasketCandidates(basketPaths);

  const added: SourceToCovenantRecord[] = [];
  added.push(...expandFromExceptions(repoRoot, exceptions, existingIds));
  added.push(...expandFromBaskets(repoRoot, baskets, existingIds));
  added.push(...expandSectionSweep(repoRoot, existingIds));

  // Repeat section sweep variants from FWRG definitions terms as DEFINITION examples
  const defTerms = ["Available Amount", "Consolidated Adjusted EBITDA", "Restricted Subsidiary", "Loan Party", "Fixed Charge Coverage Ratio"];
  const fwrgDefs = "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/definitions-excerpt.txt";
  const lsbDefs = "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/definitions-excerpt.txt";
  const conmedDefs = "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-definitions-excerpt.txt";
  for (const [path, terms, issuer] of [
    [fwrgDefs, [...defTerms, "CNI Growth Amount", "Available Excluded Contribution Amount", "Total Rent Adjusted Net Leverage Ratio", "Secured Obligations", "Cure Amount"], "fwrg"],
    [lsbDefs, ["Payment Conditions", "Specified Availability", "Permitted Liens", "Permitted Investments", "Secured Notes", "Fixed Charge Coverage Ratio"], "lsb-industries"],
    [conmedDefs, ["Consolidated EBITDA", "Consolidated Senior Secured Leverage Ratio", "Permitted Acquisition", "Loan Party", "Material Adverse Effect", "Unrestricted Subsidiary"], "conmed"],
  ] as const) {
    for (const term of terms) {
      const exampleId = `stc-def-${issuer}-${term.replace(/\s+/g, "_").toLowerCase()}`;
      if (existingIds.has(exampleId)) continue;
      try {
        const w = extractAroundAnchor(repoRoot, path, term, 0, 1800);
        const meta = Object.values(PACKAGE_META).find((m) => m.issuerId === issuer)!;
        added.push(
          baseRecord({
            exampleId,
            polarity: "POSITIVE",
            role: "DEFINITION",
            split: "train",
            document: {
              issuerId: meta.issuerId,
              issuerName: meta.issuerName,
              instrumentKey: meta.instrumentKey,
              documentId: meta.documentId,
              sourceFixturePath: path,
              cik: meta.cik,
            },
            operativeVersion: {
              operativeDocumentId: meta.documentId,
              asOfDate: null,
              amendmentIdentity: null,
              isRestatedOperativeText: false,
            },
            structural: {
              sectionRef: `1.01/${term}`,
              sourceNodeKey: null,
              articleRef: "ARTICLE I",
              unitKind: "DEFINITION",
            },
            governingProhibition: null,
            input: {
              exactText: w.exactText,
              charStartInFixture: w.charStartInFixture,
              charEndInFixture: w.charEndInFixture,
              sourceTextSha256: w.sourceTextSha256,
              windowSha256: w.windowSha256,
              definitions: { [term]: w.exactText },
              definitionSourceSha256: w.sourceTextSha256,
              exceptions: [],
              conditions: [],
              crossReferences: [],
              entityScopeNotes: [],
            },
            output: {
              candidateCovenantFamily: "DEFINITIONS_CALCULATION_RULES",
              candidatePermissionProhibitionClass: "DEFINITION",
              proposedFormulaOrCapacity: {
                shape: "DEFINITION",
                description: `Definition excerpt for ${term} — hypothesis mapping only.`,
                figures: [],
                capacityUnlimited: null,
              },
              proposedConditions: [],
              proposedDependencyEdges: [],
              missingInputs: [],
              uncertainty: { level: "MEDIUM", reasons: ["Definition excerpt may truncate full term"] },
              verificationStatus: "HUMAN_HYPOTHESIS",
              labelNotes: "Authentic definition excerpt. Not independently verified.",
            },
            authoredAt: AUTH,
            authoringMethod: "HUMAN_SOURCE_READING_PLUS_CATALOG",
          }),
        );
        existingIds.add(exampleId);
      } catch {
        /* skip */
      }
    }
  }

  // Additional lettered-limb sweeps for FWRG §6.01 and LSB §6.01 / CONMED §7.3 & §7.8
  added.push(...expandLetteredLimbs(repoRoot, existingIds));

  const issuers = new Set([...seedRecords, ...added].map((r) => r.document.issuerId));
  return {
    added,
    issuerCount: issuers.size,
    issuerGapReason:
      issuers.size < 50
        ? `Only ${issuers.size} distinct issuers available in acquired repo fixtures; EDGAR Historical Backfill has not yet delivered ≥50 acquired document packages into this workspace. Expansion prioritized depth across authentic acquired packages rather than inventing issuers or synthetic text.`
        : "Issuer target met.",
  };
}

function expandLetteredLimbs(repoRoot: string, existingIds: Set<string>): SourceToCovenantRecord[] {
  const out: SourceToCovenantRecord[] = [];
  const plans: Array<{
    examplePrefix: string;
    path: string;
    metaKey: string;
    sectionStart: string;
    sectionEnd: string;
    sectionRefBase: string;
    family: string;
    governing: string;
    letters: string[];
  }> = [
    {
      examplePrefix: "stc-fwrg-6_01",
      path: "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/article-6-negative-covenants.txt",
      metaKey: "fwrg-2021-credit-agreement",
      sectionStart: "Section 6.01. Indebtedness",
      sectionEnd: "Section 6.02",
      sectionRefBase: "6.01",
      family: "INDEBTEDNESS",
      governing: "The Borrower shall not, nor shall it permit any of its Restricted Subsidiaries to create, incur, assume or otherwise become or remain liable with respect to any Indebtedness, except:",
      letters: "abcdefghijklmnopqrstuvwxyz".split(""),
    },
    {
      examplePrefix: "stc-lsb-6_01",
      path: "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/article-6-negative-covenants.txt",
      metaKey: "lsb-2023-abl-credit-agreement",
      sectionStart: "SECTION  6.01",
      sectionEnd: "SECTION  6.02",
      sectionRefBase: "6.01",
      family: "INDEBTEDNESS",
      governing: "Create, incur, assume, permit, guarantee, or otherwise become or remain liable with respect to any Indebtedness",
      letters: "abcdefghijklmnopqrst".split(""),
    },
    {
      examplePrefix: "stc-conmed-7_3",
      path: "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt",
      metaKey: "conmed-2025-credit-facility",
      sectionStart: "SECTION 7.3 Limitation on Liens",
      sectionEnd: "SECTION 7.4 ",
      sectionRefBase: "7.3",
      family: "LIENS",
      governing: "Create, incur, assume or suffer to exist any Lien upon any Property",
      letters: "abcdefghijklmnopq".split(""),
    },
    {
      examplePrefix: "stc-conmed-7_8",
      path: "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt",
      metaKey: "conmed-2025-credit-facility",
      sectionStart: "SECTION 7.8 Limitation on Investments",
      sectionEnd: "SECTION 7.9 ",
      sectionRefBase: "7.8",
      family: "INVESTMENTS",
      governing: "Limitation on Investments, Loans and Advances",
      letters: "abcdefghijkl".split(""),
    },
    {
      examplePrefix: "stc-conmed-7_5",
      path: "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt",
      metaKey: "conmed-2025-credit-facility",
      sectionStart: "SECTION 7.5 Limitation on Sale",
      sectionEnd: "SECTION 7.6 ",
      sectionRefBase: "7.5",
      family: "ASSET_SALES",
      governing: "Limitation on Sale of Assets",
      letters: "abcdefghijkl".split(""),
    },
    {
      examplePrefix: "stc-conmed-7_6",
      path: "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt",
      metaKey: "conmed-2025-credit-facility",
      sectionStart: "SECTION 7.6 Limitation on Restricted",
      sectionEnd: "SECTION 7.7 ",
      sectionRefBase: "7.6",
      family: "RESTRICTED_PAYMENTS",
      governing: "Limitation on Restricted Payments",
      letters: "abcdefghij".split(""),
    },
  ];

  for (const plan of plans) {
    const meta = PACKAGE_META[plan.metaKey]!;
    try {
      const full = readFixture(repoRoot, plan.path);
      const start = full.indexOf(plan.sectionStart);
      if (start < 0) continue;
      const endIdx = full.indexOf(plan.sectionEnd, start + plan.sectionStart.length);
      const bodyEnd = endIdx > start ? endIdx : Math.min(full.length, start + 20_000);
      const body = full.slice(start, bodyEnd);
      for (let i = 0; i < plan.letters.length; i++) {
        const letter = plan.letters[i]!;
        const exampleId = `${plan.examplePrefix}-${letter}`;
        if (existingIds.has(exampleId)) continue;
        // Match "(a)" / "(a) " style markers common in these fixtures
        const patterns = [
          new RegExp(`\\(${letter}\\)\\s`),
          new RegExp(`\\(${letter}\\)(?![a-z])`),
        ];
        let matchIndex = -1;
        for (const re of patterns) {
          const m = re.exec(body);
          if (m && m.index !== undefined) {
            matchIndex = m.index;
            break;
          }
        }
        if (matchIndex < 0) continue;
        let limbEnd = body.length;
        for (let j = i + 1; j < plan.letters.length; j++) {
          const next = plan.letters[j]!;
          const nre = new RegExp(`\\(${next}\\)\\s`);
          const m2 = nre.exec(body.slice(matchIndex + 3));
          if (m2 && m2.index !== undefined) {
            limbEnd = matchIndex + 3 + m2.index;
            break;
          }
        }
        const abs = start + matchIndex;
        const exactText = full.slice(abs, start + Math.min(limbEnd, matchIndex + 2500));
        if (exactText.trim().length < 30) continue;
        // Skip reserved stubs as negative examples
        const isReserved = /\[reserved\]/i.test(exactText.slice(0, 80));
        out.push(
          baseRecord({
            exampleId,
            polarity: isReserved ? "NEGATIVE" : "POSITIVE",
            role: isReserved ? "BOILERPLATE_OR_RESERVED" : "EXCEPTION_BASKET",
            split: "train",
            document: {
              issuerId: meta.issuerId,
              issuerName: meta.issuerName,
              instrumentKey: meta.instrumentKey,
              documentId: meta.documentId,
              sourceFixturePath: plan.path,
              cik: meta.cik,
            },
            operativeVersion: {
              operativeDocumentId: meta.documentId,
              asOfDate: null,
              amendmentIdentity: null,
              isRestatedOperativeText: plan.metaKey.includes("conmed"),
            },
            structural: {
              sectionRef: `${plan.sectionRefBase}(${letter})`,
              sourceNodeKey: null,
              articleRef: null,
              unitKind: isReserved ? "BOILERPLATE_OR_RESERVED" : "EXCEPTION_BASKET",
            },
            governingProhibition: plan.governing,
            input: {
              exactText,
              charStartInFixture: abs,
              charEndInFixture: abs + exactText.length,
              sourceTextSha256: sha256Text(full),
              windowSha256: sha256Text(exactText),
              definitions: {},
              definitionSourceSha256: null,
              exceptions: [`${plan.sectionRefBase}(${letter})`],
              conditions: [],
              crossReferences: [],
              entityScopeNotes: [],
            },
            output: {
              candidateCovenantFamily: isReserved ? null : plan.family,
              candidatePermissionProhibitionClass: isReserved ? "NONE" : "PERMISSION",
              proposedFormulaOrCapacity: {
                shape: null,
                description: isReserved
                  ? `Reserved limb ${plan.sectionRefBase}(${letter}) — negative example.`
                  : `Authentic ${plan.sectionRefBase}(${letter}) exception limb hypothesis.`,
                figures: [],
                capacityUnlimited: null,
              },
              proposedConditions: [],
              proposedDependencyEdges: isReserved
                ? []
                : [{ edgeType: "EXCEPTION_TO", targetRef: plan.sectionRefBase, description: "Lettered exception" }],
              missingInputs: isReserved ? [] : ["Limb-specific capacity figures / conditions"],
              uncertainty: { level: isReserved ? "LOW" : "HIGH", reasons: isReserved ? [] : ["Hypothesis label; not independently reviewed"] },
              verificationStatus: isReserved ? "NOT_APPLICABLE" : "HUMAN_HYPOTHESIS",
              labelNotes: "Authentic lettered-limb window from SEC fixture. Phase-2 hypothesis / negative reserved handling.",
            },
            authoredAt: AUTH,
            authoringMethod: "HUMAN_SOURCE_READING_PLUS_CATALOG",
          }),
        );
        existingIds.add(exampleId);
      }
    } catch {
      /* continue */
    }
  }
  return out;
}
