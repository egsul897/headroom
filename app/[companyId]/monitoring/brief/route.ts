/**
 * GET  /{companyId}/monitoring/brief — morning brief for the signed-in user.
 * POST /{companyId}/monitoring/brief — record "visited now" (next brief counts changes since then).
 * Tenant gate first.
 */
import { NextResponse } from "next/server";
import { requireTenantAction } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { buildMorningBrief } from "@/lib/monitoring/brief";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ companyId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { companyId } = await ctx.params;
  let user: { id: string };
  try {
    user = await requireTenantAction(companyId);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const brief = await buildMorningBrief(companyId, {
    lastVisitAt: async () => (await prisma.workspaceVisit.findUnique({ where: { companyId_userId: { companyId, userId: user.id } } }))?.lastVisitAt ?? null,
    notificationTitlesSince: async (since) =>
      (await prisma.workspaceNotification.findMany({ where: { companyId, createdAt: { gt: since } }, orderBy: { createdAt: "desc" }, take: 50, select: { title: true } })).map((n) => n.title),
    latestBoxItemStatuses: async () => {
      const docs = await prisma.customerEbitdaBox.findMany({ where: { companyId }, select: { documentId: true }, distinct: ["documentId"] });
      const out: string[][] = [];
      for (const d of docs) {
        const box = await prisma.customerEbitdaBox.findFirst({ where: { companyId, documentId: d.documentId }, orderBy: { seq: "desc" }, select: { payload: true } });
        const items = (box?.payload as { items?: Array<{ status?: unknown }> } | null)?.items ?? [];
        out.push(items.map((i) => String(i.status)));
      }
      return out;
    },
    obligations: () => prisma.contractEventObligation.findMany({ where: { companyId } }),
  });
  return NextResponse.json(brief, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(_req: Request, ctx: Ctx) {
  const { companyId } = await ctx.params;
  let user: { id: string };
  try {
    user = await requireTenantAction(companyId);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const now = new Date();
  await prisma.workspaceVisit.upsert({
    where: { companyId_userId: { companyId, userId: user.id } },
    create: { companyId, userId: user.id, lastVisitAt: now },
    update: { lastVisitAt: now },
  });
  return NextResponse.json({ lastVisitAt: now.toISOString() });
}
