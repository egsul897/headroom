/**
 * Read-only Neon corpus inventory for the intelligence flywheel.
 * Never mutates. Prints aggregate counts only (no secrets).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function countOrNull(fn: () => Promise<number>): Promise<number | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

async function main() {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (e) {
    console.error("NEON_UNREACHABLE", String(e).slice(0, 240));
    process.exit(2);
  }

  const companies = await prisma.company.findMany({
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  });

  const allDocs = await prisma.document.findMany({
    select: { id: true, companyId: true, name: true, type: true, governs: true },
  });

  const nameKey = new Map<string, number>();
  for (const d of allDocs) {
    const k = `${d.companyId}||${d.name}`;
    nameKey.set(k, (nameKey.get(k) ?? 0) + 1);
  }
  const duplicateNameGroups = [...nameKey.values()].filter((n) => n > 1).length;
  const duplicateDocRows = [...nameKey.values()].filter((n) => n > 1).reduce((s, n) => s + n, 0);

  const [
    permissions,
    covenantProvisions,
    financialStates,
    financialSnapshots,
    ledgerEntries,
    permissionRelationships,
    sharedConstraints,
    definedTerms,
    documentRelationshipEdges,
    knowledgeRelationshipEdges,
    contractRules,
    contractRuleRelationships,
    amendmentEffects,
    approvedSnapshots,
    proposedSnapshots,
    contractLedgerUsages,
    unresolvedItems,
  ] = await Promise.all([
    countOrNull(() => prisma.permission.count()),
    countOrNull(() => prisma.covenantProvision.count()),
    countOrNull(() => prisma.financialState.count()),
    countOrNull(() => prisma.financialSnapshot.count()),
    countOrNull(() => prisma.ledgerEntry.count()),
    countOrNull(() => prisma.permissionRelationship.count()),
    countOrNull(() => prisma.sharedCapacityConstraint.count()),
    countOrNull(() => prisma.definedTerm.count()),
    countOrNull(() => prisma.documentRelationshipEdge.count()),
    countOrNull(() => prisma.knowledgeRelationshipEdge.count()),
    countOrNull(() => prisma.contractRule.count()),
    countOrNull(() => prisma.contractRuleRelationship.count()),
    countOrNull(() => prisma.amendmentEffect.count()),
    countOrNull(() => prisma.contractInputSnapshot.count({ where: { status: "APPROVED" } })),
    countOrNull(() => prisma.contractInputSnapshot.count({ where: { status: "PROPOSED" } })),
    countOrNull(() => prisma.contractLedgerUsage.count()),
    countOrNull(() => prisma.unresolvedContractItem.count()),
  ]);

  const byCompany = new Map<string, { docs: number; types: Record<string, number>; governsLinks: number }>();
  for (const d of allDocs) {
    const cur = byCompany.get(d.companyId) ?? { docs: 0, types: {}, governsLinks: 0 };
    cur.docs += 1;
    cur.types[d.type] = (cur.types[d.type] ?? 0) + 1;
    if (d.governs) cur.governsLinks += 1;
    byCompany.set(d.companyId, cur);
  }

  // Permission grant-type mix (sample of corpus modeling depth)
  const grantTypes = await prisma.permission.groupBy({
    by: ["grantType"],
    _count: { _all: true },
  });

  const report = {
    asOf: new Date().toISOString(),
    access: "READ_ONLY",
    hostHint: "neon-pooler (production read)",
    companies: companies.map((c) => ({
      id: c.id,
      name: c.name,
      documents: byCompany.get(c.id)?.docs ?? 0,
      documentTypes: byCompany.get(c.id)?.types ?? {},
      governsLinks: byCompany.get(c.id)?.governsLinks ?? 0,
    })),
    totals: {
      companies: companies.length,
      documents: allDocs.length,
      permissions,
      covenantProvisions,
      financialStates,
      financialSnapshots,
      ledgerEntries,
      permissionRelationships,
      sharedCapacityConstraints: sharedConstraints,
      definedTerms,
      documentRelationshipEdges,
      knowledgeRelationshipEdges,
      contractRules,
      contractRuleRelationships,
      amendmentEffects,
      approvedContractInputSnapshots: approvedSnapshots,
      proposedContractInputSnapshots: proposedSnapshots,
      contractLedgerUsages,
      unresolvedContractItems: unresolvedItems,
      duplicateNameGroups,
      duplicateDocRows,
    },
    permissionGrantTypes: Object.fromEntries(grantTypes.map((g) => [g.grantType, g._count._all])),
  };

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
