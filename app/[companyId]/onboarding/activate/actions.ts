"use server";

import { revalidatePath } from "next/cache";
import { promoteCompanyCandidates } from "@/lib/onboarding/promotion";
import { generateGoldenTestProposals } from "@/lib/onboarding/golden-tests";
import { prisma } from "@/lib/prisma";

export async function promoteAction(companyId: string) {
  await promoteCompanyCandidates(companyId);
  revalidatePath(`/${companyId}/onboarding/activate`);
  revalidatePath(`/${companyId}/dashboard`);
}

export async function generateGoldenTestsAction(companyId: string) {
  const latestState = await prisma.financialState.findFirst({ where: { companyId }, orderBy: { asOfDate: "desc" } });
  const asOfDate = latestState?.asOfDate ?? new Date();
  await generateGoldenTestProposals(companyId, asOfDate);
  revalidatePath(`/${companyId}/onboarding/activate`);
}
