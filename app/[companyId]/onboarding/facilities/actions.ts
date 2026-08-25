"use server";

import { revalidatePath } from "next/cache";
import { createFacilityWithMapping } from "@/lib/onboarding/financial";
import type { CouponType, FacilityType } from "@prisma/client";

export async function createFacilityAction(companyId: string, formData: FormData) {
  const originatingPermissionIds = formData.getAll("originatingPermissionIds").map(String).filter(Boolean);
  await createFacilityWithMapping({
    companyId,
    name: String(formData.get("name")),
    facilityType: String(formData.get("facilityType")) as FacilityType,
    originalPrincipal: Number(formData.get("originalPrincipal")),
    commitmentAmount: formData.get("commitmentAmount") ? Number(formData.get("commitmentAmount")) : undefined,
    secured: formData.get("secured") === "on",
    couponType: String(formData.get("couponType")) as CouponType,
    couponPct: formData.get("couponPct") ? Number(formData.get("couponPct")) : undefined,
    marginBps: formData.get("marginBps") ? Number(formData.get("marginBps")) : undefined,
    referenceRate: String(formData.get("referenceRate") ?? "") || undefined,
    originatingPermissionIds,
  });
  revalidatePath(`/${companyId}/onboarding/facilities`);
}
