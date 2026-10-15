"use server";
import { requireTenantAction } from "@/lib/auth/guard";

import { revalidatePath } from "next/cache";
import { promoteCompanyCandidates } from "@/lib/onboarding/promotion";
import { generateGoldenTestProposals } from "@/lib/onboarding/golden-tests";
import { prisma } from "@/lib/prisma";

export async function promoteAction(companyId: string) {
  await requireTenantAction(companyId);
  await promoteCompanyCandidates(companyId);
  revalidatePath(`/${companyId}/onboarding/activate`);
  revalidatePath(`/${companyId}/onboarding`);
  revalidatePath(`/${companyId}`);
  // Legacy dashboard stays under Deal setup & tools. Invalidate its cache; it is not the home destination.
  revalidatePath(`/${companyId}/dashboard`);
}

export async function generateGoldenTestsAction(companyId: string) {
  await requireTenantAction(companyId);
  const latestState = await prisma.financialState.findFirst({ where: { companyId }, orderBy: { asOfDate: "desc" } });
  const asOfDate = latestState?.asOfDate ?? new Date();
  await generateGoldenTestProposals(companyId, asOfDate);
  revalidatePath(`/${companyId}/onboarding/activate`);
}
