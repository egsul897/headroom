import { NextResponse } from "next/server";
import { answerAsk } from "@/lib/ask/shell-runner";
import { authorizeCompanyAccess, TENANT_ACCESS_DENIED_MESSAGE } from "@/lib/auth/tenant-boundary";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    companyId?: string;
    question?: string;
    sourceId?: string;
  };
  // Tenant boundary: the caller-supplied companyId is a request, not an authorization. One fixed,
  // existence-neutral refusal for every denial (lib/auth/tenant-boundary.ts).
  if (typeof body.companyId === "string" && body.companyId.trim()) {
    const access = await authorizeCompanyAccess(body.companyId);
    if (!access.allowed) {
      return NextResponse.json(
        { kind: "refused", caseId: "NO_COMPANY", headline: "Not available", detail: TENANT_ACCESS_DENIED_MESSAGE },
        { status: 403 },
      );
    }
  }
  const result = await answerAsk({
    companyId: body.companyId,
    question: body.question ?? "",
    sourceId: body.sourceId,
  });
  return NextResponse.json(result);
}
