/**
 * Append-only institutional audit events.
 * Application code never updates or deletes audit rows.
 */
import type { InstitutionalAuditAction, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { actorProvenanceString, type ActorProvenance } from "./types";
import { requireCompanyId } from "./tenant";

export interface AppendAuditEventInput {
  companyId: string;
  action: InstitutionalAuditAction;
  entityType: string;
  entityId: string;
  actor: ActorProvenance;
  actorLabel?: string | null;
  priorState?: unknown;
  newState?: unknown;
  evidenceRefs?: unknown;
  payload?: unknown;
  occurredAt?: Date;
  eventId?: string;
}

export async function appendInstitutionalAuditEvent(
  prisma: PrismaClient,
  input: AppendAuditEventInput,
): Promise<{ eventId: string; id: string }> {
  const companyId = requireCompanyId(input.companyId, "appendInstitutionalAuditEvent");
  const eventId = input.eventId ?? `audit:${randomUUID()}`;
  const row = await prisma.institutionalAuditEvent.create({
    data: {
      eventId,
      companyId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      occurredAt: input.occurredAt ?? new Date(),
      actorProvenance: actorProvenanceString(input.actor),
      actorLabel: input.actorLabel ?? null,
      priorState: (input.priorState ?? undefined) as object | undefined,
      newState: (input.newState ?? undefined) as object | undefined,
      evidenceRefs: (input.evidenceRefs ?? undefined) as object | undefined,
      payload: (input.payload ?? undefined) as object | undefined,
    },
  });
  return { eventId: row.eventId, id: row.id };
}

export async function listInstitutionalAuditEvents(
  prisma: PrismaClient,
  companyId: string,
  opts?: { entityType?: string; entityId?: string; limit?: number },
) {
  requireCompanyId(companyId, "listInstitutionalAuditEvents");
  return prisma.institutionalAuditEvent.findMany({
    where: {
      companyId,
      ...(opts?.entityType ? { entityType: opts.entityType } : {}),
      ...(opts?.entityId ? { entityId: opts.entityId } : {}),
    },
    orderBy: { occurredAt: "asc" },
    take: opts?.limit ?? 500,
  });
}
