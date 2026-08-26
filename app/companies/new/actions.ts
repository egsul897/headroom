"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { CompanyTenantKind } from "@prisma/client";

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return base || "company";
}

export async function createCompanyAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Company name is required.");
  const ticker = String(formData.get("ticker") ?? "").trim() || undefined;
  const cik = String(formData.get("cik") ?? "").trim() || undefined;
  const currency = String(formData.get("currency") ?? "USD").trim() || "USD";
  // Defaults to CUSTOMER (Company.tenantKind's own schema default) unless the
  // form explicitly opted into EVALUATION - see app/companies/new/page.tsx's
  // own header comment for the two real callers of this one shared form.
  const tenantKind: CompanyTenantKind = formData.get("tenantKind") === "EVALUATION" ? "EVALUATION" : "CUSTOMER";

  let id = slugify(name);
  // Avoid colliding with an existing company id (e.g. two companies with similar names).
  if (await prisma.company.findUnique({ where: { id } })) {
    id = `${id}-${Date.now().toString(36)}`;
  }

  await prisma.company.create({
    data: { id, name, ticker, cik, currency, onboardingStatus: "ONBOARDING", tenantKind },
  });

  redirect(`/${id}/onboarding`);
}
