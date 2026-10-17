/**
 * ERP connection provisioning (ERP-1, operator-facing).
 *
 * Session-authenticated (same tenant gate as app/api/ask/route.ts): the
 * signed-in user may only provision a connection for their OWN company.
 * The response carries the raw inbound ingestion token EXACTLY ONCE - only
 * its sha256 is stored (lib/erp/secret.ts) - so this response is the one
 * moment the operator copies it into their ERP/middleware configuration.
 * The stored hash is never included in any response.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { canAccessTenant } from "@/lib/auth/tenant";
import { createErpConnection, ErpConnectionExistsError, UnsupportedErpConfigError } from "@/lib/erp/connections";
import { isErpProviderKind } from "@/lib/erp/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    companyId?: string;
    providerKind?: string;
    externalAccountRef?: string;
    metricKeyMap?: Record<string, string>;
    sourcePriority?: number;
  };

  const session = await getServerSession(authOptions);
  if (!session?.user?.companyId || !canAccessTenant(session.user, body.companyId ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: session?.user ? 403 : 401 });
  }
  if (!isErpProviderKind(body.providerKind)) {
    return NextResponse.json({ error: "providerKind must be one of NETSUITE, SAP, ORACLE, DYNAMICS, GENERIC." }, { status: 400 });
  }

  try {
    const { connection, secret } = await createErpConnection({
      companyId: body.companyId!,
      providerKind: body.providerKind,
      externalAccountRef: body.externalAccountRef,
      metricKeyMap: body.metricKeyMap,
      sourcePriority: body.sourcePriority,
      createdBy: session.user.id,
    });
    return NextResponse.json(
      {
        connection: {
          id: connection.id,
          companyId: connection.companyId,
          connectorType: connection.connectorType,
          provider: connection.provider,
          status: connection.status,
          capabilities: connection.capabilities,
          externalAccountRef: connection.externalAccountRef,
          ingestPath: `/api/integrations/erp/${connection.id}/financial-facts`,
        },
        // Shown once - only the hash is stored. Copy it into the ERP /
        // middleware configuration now; it cannot be retrieved later
        // (rotate via lib/erp/connections.ts to issue a new one).
        secret,
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof ErpConnectionExistsError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof UnsupportedErpConfigError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
