import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { canAccessTenant } from "@/lib/auth/tenant";
import { analyzeContemplatedTransaction } from "@/lib/product/north-star-workflow";

/**
 * Structured transaction-analysis endpoint (North-Star gated).
 * Corpus research remains on POST /api/ask.
 *
 * Tenant gate: this endpoint previously accepted any companyId from the
 * request body with no authentication — including with confirmed=true.
 * The caller must be signed in, and the requested company must be their own.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    companyId?: string;
    question?: string;
    sourceId?: string;
    confirmed?: boolean;
  };
  if (!body.companyId?.trim()) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }
  const session = await getServerSession(authOptions);
  if (!session?.user?.companyId || !canAccessTenant(session.user, body.companyId.trim())) {
    return NextResponse.json({ error: "Forbidden" }, { status: session?.user ? 403 : 401 });
  }
  const result = await analyzeContemplatedTransaction({
    companyId: body.companyId.trim(),
    question: body.question ?? "",
    sourceId: body.sourceId,
    confirmed: body.confirmed === true,
    verifiedPackage: null,
  });
  return NextResponse.json(result);
}
