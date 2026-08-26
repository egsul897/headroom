"use client";

import { useEffect } from "react";
import { Card } from "@/components/ui";

/**
 * Company-scoped error boundary (docs/headroom-master-product-architecture.md
 * §82 - "Never expose raw Prisma errors, provider exceptions, stack traces...
 * every important state should look deliberate"). Covers every page under
 * `/[companyId]/**` - e.g. a Dashboard/Simulate/Capacity page whose company
 * has not yet been fully initialized (no FinancialState/CovenantData yet)
 * throws a real, fail-closed error from the underlying engine rather than
 * fabricating a number; without this boundary that surfaces as Next's
 * generic crash screen. `error.message` is intentionally never rendered -
 * Next.js already strips it to an opaque digest in production, but this
 * component doesn't rely on that: it never reads `error` for display, only
 * logs it for operators.
 */
export default function CompanyErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("Company page error:", error.digest ?? error.message);
  }, [error]);

  return (
    <Card>
      <div className="card-title">This page needs attention</div>
      <div className="card-subtitle">
        Headroom could not load this page — usually because setup for this company isn&apos;t complete yet, or the underlying data is still being processed. Try again, or continue from Sources/Documents to finish
        connecting this company.
      </div>
      <button type="button" className="button button-primary" onClick={() => reset()}>
        Try again
      </button>
    </Card>
  );
}
