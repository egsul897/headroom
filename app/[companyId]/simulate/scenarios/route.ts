/**
 * GET  /{companyId}/simulate/scenarios — this workspace's saved scenarios (newest first), each with
 *      its freshness against the CURRENT basis (financial state + engine build): CURRENT / STALE / UNKNOWN.
 * POST /{companyId}/simulate/scenarios {name, lines[{label, value}]} — save one. The basis is
 *      resolved on the server at save time (never taken from the client). Cap enforced atomically.
 * Tenant gate first (403, no DB access).
 */
import { NextResponse } from "next/server";
import { requireTenantAction } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { resolveScenarioBasis, scenarioFreshness } from "@/lib/scenarios/basis";
import { createPrismaScenarioStore, createScenarioWithinCap } from "@/lib/scenarios/store";
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
    const [rows, current] = await Promise.all([
      prisma.savedScenario.findMany({ where: { companyId }, orderBy: { savedAt: "desc" }, take: LIMITS.perWorkspace }),
      resolveScenarioBasis(prisma, companyId),
    ]);
    const freshness = Object.fromEntries(rows.map((r) => [r.id, scenarioFreshness(r, current)]));
    return NextResponse.json(
      { scenarios: rows.map(toSavedScenario), freshness, valueKind: "SAVED_DISPLAY_VALUES" },
      { headers: { "Cache-Control": "no-store" } },
    );
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
  try {
    const basis = await resolveScenarioBasis(prisma, companyId);
    const r = await createScenarioWithinCap(createPrismaScenarioStore(prisma), { companyId, createdBy: user.id, name: v.name, lines: v.lines, basis });
    if (!r.ok) return NextResponse.json({ error: `limit of ${LIMITS.perWorkspace} saved scenarios reached` }, { status: 409 });
    return NextResponse.json({ scenario: toSavedScenario(r.row), freshness: scenarioFreshness(r.row, basis) }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "SCENARIOS_UNAVAILABLE" }, { status: 503 });
  }
}
