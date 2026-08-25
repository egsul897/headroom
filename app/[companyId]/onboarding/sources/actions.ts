"use server";

/**
 * Bare-minimum "Connect Source" action layer (docs/autonomous-retrieval-phase-a-foundation.md,
 * task's own "a bare-minimum Connect Source action is welcome if it's quick"
 * allowance - deliberately not polished, Phase B's job). Every action here
 * is a thin call into lib/connectors/** - no business logic lives in this
 * file.
 */

import { revalidatePath } from "next/cache";
import { connectSource } from "@/lib/connectors/registry";
import { createIngestionJob, runAllPendingIngestionStages } from "@/lib/connectors/ingestion";
import { prisma } from "@/lib/prisma";

export async function connectEdgarAction(companyId: string, formData: FormData) {
  const ticker = String(formData.get("ticker") ?? "").trim();
  if (!ticker) throw new Error("Enter a ticker to connect an EDGAR source.");
  await connectSource({ companyId, connectorType: "EDGAR", config: { ticker } });
  revalidatePath(`/${companyId}/onboarding/sources`);
}

/** Runs an INITIALIZE job on first sync, SYNC on every sync after - the connection's own lastSuccessfulSyncAt is what decides which. */
export async function syncConnectionAction(companyId: string, sourceConnectionId: string) {
  const connection = await prisma.companySourceConnection.findUniqueOrThrow({ where: { id: sourceConnectionId } });
  const kind = connection.lastSuccessfulSyncAt ? "SYNC" : "INITIALIZE";
  const job = await createIngestionJob({ companyId, kind, sourceConnectionId });
  await runAllPendingIngestionStages(job.id);
  revalidatePath(`/${companyId}/onboarding/sources`);
}

export async function connectAndSyncCsvAction(companyId: string, formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a CSV file to upload.");
  const buffer = Buffer.from(await file.arrayBuffer());

  const connection = await connectSource({ companyId, connectorType: "CSV_FINANCIAL" });
  const kind = connection.lastSuccessfulSyncAt ? "SYNC" : "INITIALIZE";
  const job = await createIngestionJob({ companyId, kind, sourceConnectionId: connection.id, rawInput: buffer });
  await runAllPendingIngestionStages(job.id);
  revalidatePath(`/${companyId}/onboarding/sources`);
}
