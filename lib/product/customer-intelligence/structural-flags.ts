/**
 * Phase E provenance surfacing (display only): ids of this company's
 * Permissions whose minted params carry `structuralUnresolved` — the
 * source provision's structural relationship could not be established
 * deterministically at compile time (see
 * lib/product/customer-intelligence/compile-accepted.ts and
 * `readStructuralProvenanceFlags` in lib/covenant-engine.ts).
 *
 * Surfaces that cite permissions by id (the capacity page's binding
 * citations carry permissionId) use this set to flag the exact
 * permission shown. It changes nothing computed: no figure, status, or
 * gate reads this set.
 */
import { prisma } from "@/lib/prisma";
import { readStructuralProvenanceFlags } from "@/lib/covenant-engine";

export async function loadStructuralUnresolvedPermissionIds(companyId: string): Promise<Set<string>> {
  const rows = await prisma.permission.findMany({
    where: { companyId },
    select: { id: true, params: true },
  });
  const ids = new Set<string>();
  for (const row of rows) {
    if (readStructuralProvenanceFlags(row.params).structuralUnresolved) ids.add(row.id);
  }
  return ids;
}
