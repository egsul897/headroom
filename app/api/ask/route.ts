import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { canAccessTenant } from "@/lib/auth/tenant";
import { answerAsk } from "@/lib/ask/shell-runner";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    companyId?: string;
    question?: string;
    sourceId?: string;
  };
  // Tenant gate: the Ask shell previously accepted any companyId from the
  // request body with no authentication — a cross-tenant query vector.
  // The caller must be signed in, and the requested company must be their own.
  const session = await getServerSession(authOptions);
  if (!session?.user?.companyId || !canAccessTenant(session.user, body.companyId ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: session?.user ? 403 : 401 });
  }
  const result = await answerAsk({
    companyId: body.companyId,
    question: body.question ?? "",
    sourceId: body.sourceId,
  });
  return NextResponse.json(result);
}
