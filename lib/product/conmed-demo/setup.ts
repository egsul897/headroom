/**
 * Idempotent CONMED demo company setup.
 * Default dry-run. Live writes require HEADROOM_DEMO_LIVE_WRITE=I_AUTHORIZE_CONMED_DEMO_SETUP.
 * Preserves existing companies (never touches coherent/matthews).
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../../prisma";
import { LocalFilesystemStorageProvider } from "../../document-storage/local-fs-provider";
import {
  CONMED_DEMO_COMPANY,
  CONMED_DEMO_COMPANY_ID,
  CONMED_DEMO_DOCUMENTS,
  CONMED_DEMO_PACKAGE_KEY,
} from "./package";

export const DEMO_LIVE_WRITE_ENV = "HEADROOM_DEMO_LIVE_WRITE" as const;
export const DEMO_LIVE_WRITE_TOKEN = "I_AUTHORIZE_CONMED_DEMO_SETUP" as const;

export interface SetupResult {
  mode: "dry-run" | "live";
  companyId: string;
  companyExisted: boolean;
  documents: Array<{
    id: string;
    action: "would-create" | "would-update" | "created" | "updated" | "skipped-missing-bytes";
    byteSize?: number;
    contentHash?: string;
    storageRef?: string;
  }>;
  preservedCounts: { companies: number; financialSnapshots: number };
  blockers: string[];
}

function assertLive(live: boolean) {
  if (!live) return;
  if (process.env[DEMO_LIVE_WRITE_ENV] !== DEMO_LIVE_WRITE_TOKEN) {
    throw new Error(
      `Live CONMED demo setup refused. Set ${DEMO_LIVE_WRITE_ENV}=${DEMO_LIVE_WRITE_TOKEN} after approval.`,
    );
  }
}

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export async function setupConmedDemo(params: {
  live?: boolean;
  repoRoot?: string;
}): Promise<SetupResult> {
  const live = Boolean(params.live);
  assertLive(live);
  const repoRoot = params.repoRoot ?? process.cwd();

  const preservedCounts = {
    companies: await prisma.company.count(),
    financialSnapshots: await prisma.financialSnapshot.count(),
  };

  const existing = await prisma.company.findUnique({ where: { id: CONMED_DEMO_COMPANY_ID } });
  const blockers: string[] = [];
  if (!live) {
    blockers.push("DRY_RUN — no Neon writes performed");
  }

  const result: SetupResult = {
    mode: live ? "live" : "dry-run",
    companyId: CONMED_DEMO_COMPANY_ID,
    companyExisted: Boolean(existing),
    documents: [],
    preservedCounts,
    blockers,
  };

  if (live && !existing) {
    await prisma.company.create({
      data: {
        id: CONMED_DEMO_COMPANY.id,
        name: CONMED_DEMO_COMPANY.name,
        ticker: CONMED_DEMO_COMPANY.ticker,
        cik: CONMED_DEMO_COMPANY.cik,
        currency: CONMED_DEMO_COMPANY.currency,
        tenantKind: "EVALUATION",
        onboardingStatus: "ACTIVE_WITH_LIMITATIONS",
      },
    });
  }

  const storage = new LocalFilesystemStorageProvider();

  for (const doc of CONMED_DEMO_DOCUMENTS) {
    const abs = path.join(repoRoot, doc.rawRelativePath);
    if (!existsSync(abs)) {
      result.documents.push({ id: doc.id, action: "skipped-missing-bytes" });
      blockers.push(`Missing fixture bytes: ${doc.rawRelativePath}`);
      continue;
    }
    const bytes = readFileSync(abs);
    const contentHash = sha256(bytes);
    const existingDoc = await prisma.document.findUnique({ where: { id: doc.id } });

    if (!live) {
      result.documents.push({
        id: doc.id,
        action: existingDoc ? "would-update" : "would-create",
        byteSize: bytes.length,
        contentHash,
      });
      continue;
    }

    const stored = await storage.store({
      companyId: CONMED_DEMO_COMPANY_ID,
      filename: doc.originalFilename,
      contentType: "text/html",
      data: bytes,
    });

    const notes = [
      `packageKey=${CONMED_DEMO_PACKAGE_KEY}`,
      `role=${doc.role}`,
      `accession=${doc.accession}`,
      `sourceUrl=${doc.sourceUrl}`,
      `contentSha256=${contentHash}`,
      doc.unresolvedNote ? `unresolved=${doc.unresolvedNote}` : "",
      doc.curatedRelativePath ? `curated=${doc.curatedRelativePath}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const data = {
      companyId: CONMED_DEMO_COMPANY_ID,
      name: doc.name,
      type: doc.type,
      governs: doc.governs,
      executedOn: new Date(doc.executedOn),
      effectiveFrom: new Date(doc.effectiveFrom),
      effectiveTo: doc.effectiveTo ? new Date(doc.effectiveTo) : null,
      supersedesDocumentId: doc.supersedesDocumentId,
      notes,
      storageRef: stored.storageRef,
      storageProvider: stored.provider,
      originalFilename: doc.originalFilename,
      uploadedAt: new Date(),
      source: "conmed-demo-authentic-fixture",
      typeConfirmedByUser: true,
      amendmentRelationshipConfirmedByUser: true,
      // Intentionally null — no fabricated capacity formulas.
      capacityFormulas: undefined,
    };

    if (existingDoc) {
      await prisma.document.update({ where: { id: doc.id }, data });
      result.documents.push({
        id: doc.id,
        action: "updated",
        byteSize: bytes.length,
        contentHash,
        storageRef: stored.storageRef,
      });
    } else {
      await prisma.document.create({ data: { id: doc.id, ...data } });
      result.documents.push({
        id: doc.id,
        action: "created",
        byteSize: bytes.length,
        contentHash,
        storageRef: stored.storageRef,
      });
    }
  }

  if (live) {
    const after = {
      companies: await prisma.company.count(),
      financialSnapshots: await prisma.financialSnapshot.count(),
    };
    if (after.financialSnapshots !== preservedCounts.financialSnapshots) {
      blockers.push("UNEXPECTED: financial snapshot count changed");
    }
    // companies should be +0 or +1
    if (after.companies < preservedCounts.companies) {
      blockers.push("UNEXPECTED: company count decreased");
    }
  }

  return result;
}
