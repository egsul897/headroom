import { prisma } from "@/lib/prisma";

/**
 * Rules 135–138 shared: a RULE capacity path whose ruleId matches
 * nothing lands in a bucket no capacity query ever reads, so the
 * usage is recorded but silently never counts against any capacity.
 * Manual entry forms take ruleId as free text, so a typo orphans
 * the usage. Refuse unless the ruleId names a real Permission
 * (id/code) or CovenantProvision (code or basketName) for this
 * company.
 *
 * Rule 138: basketName matching is load-bearing, not loose.
 * Certificate-promoted usages carry ruleId = the certificate
 * line's basketKey, which is the human basket NAME ("General
 * Investments Basket"), not a Permission/Provision code. Without
 * basketName matching, superseding certificate-promoted usage
 * (whose form re-sends the predecessor's ruleId) would refuse.
 *
 * Action-layer only — the shared lib append stays unguarded
 * because system-derived callers (certificate promotion
 * basketKeys, fixture/synthetic ruleIds) use a wider
 * basketKey vocabulary that this check must not refuse.
 */
export async function assertRuleIdResolves(companyId: string, ruleId: string): Promise<void> {
  const [permById, permByCode, provByCode, provByBasketName] = await Promise.all([
    prisma.permission.findFirst({ where: { companyId, id: ruleId }, select: { id: true } }),
    prisma.permission.findFirst({ where: { companyId, code: ruleId }, select: { id: true } }),
    prisma.covenantProvision.findFirst({ where: { companyId, code: ruleId }, select: { id: true } }),
    prisma.covenantProvision.findFirst({ where: { companyId, basketName: ruleId }, select: { id: true } }),
  ]);
  if (!permById && !permByCode && !provByCode && !provByBasketName) {
    throw new Error(
      `ruleId "${ruleId}" matches no Permission (id/code) or CovenantProvision (code/basketName) for this company — usage refused; a mistyped rule id would record usage that never counts against any capacity.`,
    );
  }
}
