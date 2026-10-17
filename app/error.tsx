"use client";

import { useEffect } from "react";
import { Card } from "@/components/ui";

/**
 * Root segment boundary for routes that do not define their own (the
 * homepage is the one that 500s when Neon is scaled to zero). Company
 * routes keep app/[companyId]/error.tsx. The raw Prisma message is never
 * rendered — Next already replaces it with a digest in production.
 */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("Page error:", error.digest ?? error.message);
  }, [error]);

  return (
    <Card>
      <div className="card-title">Database waking up, please refresh</div>
      <div className="card-subtitle">
        Headroom could not reach the database. It is likely waking up after being idle. Refresh this page in a few seconds.
      </div>
      <button type="button" className="button button-primary" onClick={() => reset()}>
        Refresh
      </button>
    </Card>
  );
}
