/**
 * GET  /{companyId}/simulate/scenarios — this workspace's saved scenarios (newest first).
 * POST /{companyId}/simulate/scenarios {name, lines[{label, value}]} — save one.
 * Tenant gate first (403, no DB access).
 */
import { NextResponse } from "next/server";
import { requireTenantAction } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { LIMITS, toSavedScenario, validateScenarioInput } from "@/lib/scenarios/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ companyId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { companyId } = await ctx.params;
  try {
    await requireTenantAction(companyId);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const rows = await prisma.savedScenario.findMany({ where: { companyId }, orderBy: { savedAt: "desc" }, take: LIMITS.perWorkspace });
    return NextResponse.json({ scenarios: rows.map(toSavedScenario), valueKind: "SAVED_DISPLAY_VALUES" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "SCENARIOS_UNAVAILABLE" }, { status: 503 });
  }
}

export async function POST(req: Request, ctx: Ctx) {
  const { companyId } = await ctx.params;
  let user: { id: string };
  try {
    user = await requireTenantAction(companyId);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const v = validateScenarioInput(await req.json().catch(() => null));
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const count = await prisma.savedScenario.count({ where: { companyId } });
  if (count >= LIMITS.perWorkspace) return NextResponse.json({ error: `limit of ${LIMITS.perWorkspace} saved scenarios reached` }, { status: 409 });
  const row = await prisma.savedScenario.create({ data: { companyId, createdBy: user.id, name: v.name, lines: v.lines } });
  return NextResponse.json({ scenario: toSavedScenario(row) }, { status: 201 });
}
