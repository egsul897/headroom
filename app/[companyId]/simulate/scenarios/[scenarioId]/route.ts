/** DELETE /{companyId}/simulate/scenarios/{scenarioId} — remove one of this workspace's saved scenarios. Tenant gate first; the WHERE is scoped by companyId. */
import { NextResponse } from "next/server";
import { requireTenantAction } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, ctx: { params: Promise<{ companyId: string; scenarioId: string }> }) {
  const { companyId, scenarioId } = await ctx.params;
  try {
    await requireTenantAction(companyId);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const r = await prisma.savedScenario.deleteMany({ where: { id: scenarioId, companyId } });
  return r.count ? NextResponse.json({ deleted: scenarioId }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
