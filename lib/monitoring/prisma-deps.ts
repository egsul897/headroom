import type { PrismaClient } from "@prisma/client";
import type { CovenantBand, RatioRowInput } from "./bands";
import { sendAlertEmail } from "./email";
import { fetchRecentFilings } from "./filings";
import type { MonitoringDeps } from "./sweep";

export function createPrismaMonitoringDeps(db: PrismaClient, env: Record<string, string | undefined> = process.env): MonitoringDeps {
  return {
    async listTrackedCompanies() {
      const rows = await db.company.findMany({ where: { tenantKind: "CUSTOMER", cik: { not: null } }, select: { id: true, name: true, cik: true }, orderBy: { id: "asc" } });
      return rows;
    },
    fetchFilings: (cik) => fetchRecentFilings(cik, { userAgent: env.SEC_EDGAR_USER_AGENT }),
    async seenAccessions(companyId) {
      const rows = await db.monitoredFiling.findMany({ where: { companyId }, select: { accessionNumber: true } });
      return new Set(rows.map((r) => r.accessionNumber));
    },
    async recordFilings(companyId, cik, filings) {
      if (!filings.length) return;
      await db.monitoredFiling.createMany({
        data: filings.map((f) => ({ companyId, cik, accessionNumber: f.accessionNumber, form: f.form, filingDate: f.filingDate })),
        skipDuplicates: true,
      });
    },
    async ebitdaDocuments(companyId) {
      const rows = await db.customerEbitdaBox.findMany({ where: { companyId }, select: { documentId: true }, distinct: ["documentId"] });
      return rows.map((r) => r.documentId).sort();
    },
    async refreshEbitdaBox(companyId, documentId) {
      const { refreshEbitdaBox } = await import("@/lib/covenant-learning-factory/pipeline/ebitda-box-server");
      const r = await refreshEbitdaBox(companyId, documentId);
      return r ? { status: r.box.status, totalEbitda: r.box.totalEbitda } : null;
    },
    async loadRatioRows(companyId) {
      const { getCovenantOverview } = await import("@/lib/covenant-overview-service");
      const o = await getCovenantOverview(companyId);
      const rows: RatioRowInput[] = [];
      for (const fam of o.covenantFamilies) for (const r of fam.rows) if (r.kind === "RATIO") rows.push(r);
      return { asOfDate: o.asOfDate.toISOString().slice(0, 10), rows };
    },
    thresholds: (companyId) => db.covenantBandThreshold.findMany({ where: { companyId }, select: { covenantKey: true, moderateBelow: true, dangerBelow: true } }),
    async lastBands(companyId) {
      const rows = await db.covenantBandEvent.findMany({ where: { companyId }, orderBy: { observedAt: "desc" }, select: { covenantKey: true, toBand: true } });
      const m = new Map<string, string>();
      for (const r of rows) if (!m.has(r.covenantKey)) m.set(r.covenantKey, r.toBand);
      return m;
    },
    async appendBandEvent(companyId, b: CovenantBand, fromBand, asOfDate) {
      await db.covenantBandEvent.create({
        data: {
          companyId,
          covenantKey: b.covenantKey,
          covenantName: b.covenantName,
          documentName: b.documentName,
          sectionRef: b.sectionRef,
          fromBand,
          toBand: b.band,
          headroomPct: b.headroomPct,
          actual: b.actual,
          limitValue: b.limit,
          comparison: b.comparison,
          thresholdSource: b.thresholdSource,
          asOfDate,
        },
      });
    },
    async createNotification(n) {
      try {
        await db.workspaceNotification.create({ data: n });
        return true;
      } catch (err) {
        if ((err as { code?: string }).code === "P2002") return false;
        throw err;
      }
    },
    async recipients(companyId) {
      const users = await db.user.findMany({ where: { companyId }, select: { email: true } });
      return users.map((u) => u.email);
    },
    sendEmail: (msg) => sendAlertEmail(msg, { env }),
    async setEmailStatus(dedupeKey, status) {
      await db.workspaceNotification.update({ where: { dedupeKey }, data: { emailStatus: status } });
    },
  };
}
