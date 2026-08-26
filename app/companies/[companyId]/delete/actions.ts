"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PROTECTED_COMPANY_IDS } from "@/lib/coherent";

/**
 * Permanently deletes a company and every row that cascades from it
 * (task "give me a way to delete a test company entirely, so evaluation
 * mistakes don't persist"). Every `companyId`-scoped relation in
 * prisma/schema.prisma is `onDelete: Cascade` (verified by inspection - no
 * exceptions), so a single `prisma.company.delete` removes the company's
 * entire footprint in one transaction; nothing is left orphaned.
 *
 * Destructive and irreversible - gated by requiring the visitor to type the
 * company's exact name (the same "type to confirm" pattern used for
 * destructive actions generally), not just a bare confirm button.
 */
export async function deleteCompanyAction(formData: FormData) {
  const companyId = String(formData.get("companyId") ?? "");
  const confirmName = String(formData.get("confirmName") ?? "").trim();

  // The two golden regression companies (task "UNIVERSAL HEADROOM PRODUCT
  // EXPERIENCE" §79 - "Protected companies: Coherent, Matthews must remain
  // protected") - an explicit, minimal safety allowlist, not
  // company-specific UI/rendering logic. Every other company (any test
  // fixture, any real customer) deletes normally.
  if (PROTECTED_COMPANY_IDS.has(companyId)) {
    throw new Error("This company is protected and cannot be deleted from this instance.");
  }

  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });

  if (confirmName !== company.name) {
    throw new Error(`Typed name "${confirmName}" does not match "${company.name}" - deletion cancelled.`);
  }

  await prisma.company.delete({ where: { id: companyId } });
  redirect("/");
}
