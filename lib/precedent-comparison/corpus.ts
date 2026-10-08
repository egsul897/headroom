/**
 * In-memory searchable corpus of public credit-agreement provisions.
 * File-backed JSON only — no Prisma models, no competing database schema.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CovenantFamily } from "@prisma/client";
import { sha256Hex } from "./hash";
import type {
  AgreementType,
  ComparableCovenantFamily,
  CorpusStatistics,
  DocumentRole,
  PrecedentProvision,
  ProvisionReviewStatus,
} from "./types";

export interface CorpusProvisionJson {
  provisionId: string;
  packageId: string;
  documentId: string;
  sourcePath: string;
  sourceSectionRef: string;
  covenantFamily: string;
  charStart: number;
  charEnd: number;
  sourceText: string;
  documentRole: DocumentRole;
  agreementType?: AgreementType;
  issuerId?: string;
  amendsProvisionId: string | null;
  tags: string[];
  reviewStatus: ProvisionReviewStatus;
  financialDefinitionTerms?: string[];
  sourceVersionHash?: string;
}

export interface CorpusFile {
  schemaVersion: string;
  provisions: CorpusProvisionJson[];
  generatedAt?: string;
  generator?: string;
}

function toProvision(row: CorpusProvisionJson): PrecedentProvision {
  const sourceText = row.sourceText;
  return {
    provisionId: row.provisionId,
    covenantFamily: row.covenantFamily as ComparableCovenantFamily | CovenantFamily,
    sourceText,
    sourceVersionHash: row.sourceVersionHash ?? sha256Hex(sourceText),
    locator: {
      packageId: row.packageId,
      documentId: row.documentId,
      sourcePath: row.sourcePath,
      sourceSectionRef: row.sourceSectionRef,
      charStart: row.charStart,
      charEnd: row.charEnd,
    },
    documentRole: row.documentRole,
    agreementType: row.agreementType ?? (row.documentRole === "DEFINITION" ? "DEFINITIONS_EXCERPT" : row.documentRole === "AMENDMENT" ? "AMENDMENT" : "CREDIT_AGREEMENT"),
    issuerId: row.issuerId ?? row.packageId.split("-")[0] ?? row.packageId,
    amendsProvisionId: row.amendsProvisionId,
    tags: row.tags,
    reviewStatus: row.reviewStatus,
    reviewedBy: null,
    reviewNote: null,
    financialDefinitionTerms: row.financialDefinitionTerms ?? [],
  };
}

export class PrecedentCorpus {
  private readonly byId = new Map<string, PrecedentProvision>();

  constructor(provisions: PrecedentProvision[] = []) {
    for (const p of provisions) this.byId.set(p.provisionId, p);
  }

  static fromJson(file: CorpusFile): PrecedentCorpus {
    return new PrecedentCorpus(file.provisions.map(toProvision));
  }

  static loadDefault(baseDir: string = process.cwd()): PrecedentCorpus {
    const path = join(baseDir, "lib/precedent-comparison/corpus/public-credit-provisions.json");
    const file = JSON.parse(readFileSync(path, "utf8")) as CorpusFile;
    return PrecedentCorpus.fromJson(file);
  }

  add(provision: PrecedentProvision): void {
    if (provision.reviewStatus === "APPROVED_PRECEDENT" && !provision.reviewedBy) {
      throw new Error(`PrecedentCorpus.add: APPROVED_PRECEDENT requires reviewedBy (${provision.provisionId})`);
    }
    if (!provision.sourceVersionHash) {
      throw new Error(`PrecedentCorpus.add: missing sourceVersionHash (${provision.provisionId})`);
    }
    this.byId.set(provision.provisionId, provision);
  }

  get(provisionId: string): PrecedentProvision | null {
    return this.byId.get(provisionId) ?? null;
  }

  list(): PrecedentProvision[] {
    return [...this.byId.values()];
  }

  byFamily(family: CovenantFamily | ComparableCovenantFamily | string): PrecedentProvision[] {
    return this.list().filter((p) => p.covenantFamily === family);
  }

  size(): number {
    return this.byId.size;
  }

  statistics(targets = { agreements: 100, issuers: 50, provisions: 500 }): CorpusStatistics {
    const list = this.list();
    const agreements = new Set(list.map((p) => p.locator.documentId));
    const issuers = new Set(list.map((p) => p.issuerId));
    const packages = new Set(list.map((p) => p.locator.packageId));
    const byAgreementType: Record<string, number> = {};
    const byDocumentRole: Record<string, number> = {};
    const byFamily: Record<string, number> = {};
    for (const p of list) {
      byAgreementType[p.agreementType] = (byAgreementType[p.agreementType] ?? 0) + 1;
      byDocumentRole[p.documentRole] = (byDocumentRole[p.documentRole] ?? 0) + 1;
      byFamily[p.covenantFamily] = (byFamily[p.covenantFamily] ?? 0) + 1;
    }
    return {
      provisionCount: list.length,
      distinctAgreements: agreements.size,
      distinctIssuers: issuers.size,
      distinctPackages: packages.size,
      byAgreementType,
      byDocumentRole,
      byFamily,
      targetAgreements: targets.agreements,
      targetIssuers: targets.issuers,
      targetProvisions: targets.provisions,
      targetsMet: {
        agreements: agreements.size >= targets.agreements,
        issuers: issuers.size >= targets.issuers,
        provisions: list.length >= targets.provisions,
      },
      samplingBiasNotes: [
        "Corpus is built from Headroom research fixtures and peer knowledge-factory exports when available.",
        "Issuer set is not a stratified market sample of all public credit agreements/indentures.",
        "Over-represents packages already used in Phase 2/3 development (CONMED, FWRG, LSB, Chewy, DSGR, Riot, Gibraltar).",
        "EDGAR Backfill / Covenant Knowledge Factory bulk acquisition is required to approach the 100-agreement / 50-issuer targets.",
      ],
      marketPrevalenceClaim: "FORBIDDEN_WITHOUT_REPRESENTATIVE_SAMPLE",
    };
  }
}

let defaultCorpus: PrecedentCorpus | null = null;

export function getDefaultCorpus(): PrecedentCorpus {
  if (!defaultCorpus) defaultCorpus = PrecedentCorpus.loadDefault();
  return defaultCorpus;
}

export function setDefaultCorpusForTests(corpus: PrecedentCorpus | null): void {
  defaultCorpus = corpus;
}
