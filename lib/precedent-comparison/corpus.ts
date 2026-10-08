/**
 * In-memory searchable corpus of public credit-agreement provisions.
 * File-backed JSON only — no Prisma models, no competing database schema.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CovenantFamily } from "@prisma/client";
import type {
  ComparableCovenantFamily,
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
  amendsProvisionId: string | null;
  tags: string[];
  reviewStatus: ProvisionReviewStatus;
}

export interface CorpusFile {
  schemaVersion: string;
  provisions: CorpusProvisionJson[];
}

function toProvision(row: CorpusProvisionJson): PrecedentProvision {
  return {
    provisionId: row.provisionId,
    covenantFamily: row.covenantFamily as ComparableCovenantFamily | CovenantFamily,
    sourceText: row.sourceText,
    locator: {
      packageId: row.packageId,
      documentId: row.documentId,
      sourcePath: row.sourcePath,
      sourceSectionRef: row.sourceSectionRef,
      charStart: row.charStart,
      charEnd: row.charEnd,
    },
    documentRole: row.documentRole,
    amendsProvisionId: row.amendsProvisionId,
    tags: row.tags,
    reviewStatus: row.reviewStatus,
    reviewedBy: null,
    reviewNote: null,
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
    // Refuse silent elevation: APPROVED_PRECEDENT requires reviewedBy.
    if (provision.reviewStatus === "APPROVED_PRECEDENT" && !provision.reviewedBy) {
      throw new Error(`PrecedentCorpus.add: APPROVED_PRECEDENT requires reviewedBy (${provision.provisionId})`);
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
}

let defaultCorpus: PrecedentCorpus | null = null;

export function getDefaultCorpus(): PrecedentCorpus {
  if (!defaultCorpus) defaultCorpus = PrecedentCorpus.loadDefault();
  return defaultCorpus;
}

/** Test helper — replace the process-wide default corpus. */
export function setDefaultCorpusForTests(corpus: PrecedentCorpus | null): void {
  defaultCorpus = corpus;
}
