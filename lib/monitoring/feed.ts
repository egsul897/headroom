/**
 * "Changes since" feed for the morning brief: everything the monitor
 * recorded for ONE workspace after `since`. Read-only; reports only stored
 * events (no recomputation, no inferred changes).
 */
import type { PrismaClient } from "@prisma/client";

export function parseSince(raw: string | null, now = new Date()): Date | "INVALID" {
  if (!raw) return new Date(now.getTime() - 24 * 3600 * 1000);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime()) || !/^\d{4}-\d{2}-\d{2}/.test(raw)) return "INVALID";
  return d;
}

export async function loadChangesSince(db: PrismaClient, companyId: string, since: Date) {
  const [notifications, bandEvents, filings] = await Promise.all([
    db.workspaceNotification.findMany({ where: { companyId, createdAt: { gt: since } }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.covenantBandEvent.findMany({ where: { companyId, observedAt: { gt: since }, fromBand: { not: null } }, orderBy: { observedAt: "desc" }, take: 200 }),
    db.monitoredFiling.findMany({ where: { companyId, detectedAt: { gt: since } }, orderBy: { detectedAt: "desc" }, take: 200 }),
  ]);
  return {
    companyId,
    since: since.toISOString(),
    generatedAt: new Date().toISOString(),
    counts: { notifications: notifications.length, bandChanges: bandEvents.length, newFilings: filings.length },
    notifications: notifications.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, link: n.link, createdAt: n.createdAt, readAt: n.readAt })),
    bandChanges: bandEvents.map((e) => ({ covenantKey: e.covenantKey, covenant: e.covenantName, documentName: e.documentName, sectionRef: e.sectionRef, from: e.fromBand, to: e.toBand, headroomPct: e.headroomPct, actual: e.actual, limit: e.limitValue, asOfDate: e.asOfDate, thresholdSource: e.thresholdSource, observedAt: e.observedAt })),
    newFilings: filings.map((f) => ({ form: f.form, filingDate: f.filingDate, accessionNumber: f.accessionNumber, detectedAt: f.detectedAt })),
  };
}
