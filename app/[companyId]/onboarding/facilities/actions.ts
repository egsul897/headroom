"use server";
import { requireTenantAction } from "@/lib/auth/guard";

import { revalidatePath } from "next/cache";
import { createFacilityWithMapping } from "@/lib/onboarding/financial";
import type { CouponType, FacilityType } from "@prisma/client";

export async function createFacilityAction(companyId: string, formData: FormData) {
  await requireTenantAction(companyId);
  const originatingPermissionIds = formData.getAll("originatingPermissionIds").map(String).filter(Boolean);
  // Rule 108: the form no longer pre-selects type/coupon or
  // pre-checks permission links — enforce the explicit choices
  // server-side too (direct action invocation must not write a
  // facility with an empty/invalid type or coupon).
  const facilityType = String(formData.get("facilityType"));
  const couponType = String(formData.get("couponType"));
  const name = String(formData.get("name")).trim();
  const originalPrincipal = Number(formData.get("originalPrincipal"));
  if (!name) throw new Error("Facility name is required");
  if (!["TERM_LOAN", "REVOLVER", "NOTES", "ABL", "OTHER"].includes(facilityType)) throw new Error("Facility type is required");
  if (!["FIXED", "FLOATING"].includes(couponType)) throw new Error("Coupon type is required");
  if (!Number.isFinite(originalPrincipal) || originalPrincipal <= 0) throw new Error("Original principal must be a positive number");
  await createFacilityWithMapping({
    companyId,
    name,
    facilityType: facilityType as FacilityType,
    originalPrincipal,
    commitmentAmount: formData.get("commitmentAmount") ? Number(formData.get("commitmentAmount")) : undefined,
    secured: formData.get("secured") === "on",
    couponType: couponType as CouponType,
    couponPct: formData.get("couponPct") ? Number(formData.get("couponPct")) : undefined,
    marginBps: formData.get("marginBps") ? Number(formData.get("marginBps")) : undefined,
    referenceRate: String(formData.get("referenceRate") ?? "") || undefined,
    originatingPermissionIds,
  });
  revalidatePath(`/${companyId}/onboarding/facilities`);
}
