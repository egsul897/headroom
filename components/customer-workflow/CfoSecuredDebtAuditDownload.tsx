"use client";

/**
 * Downloadable audit trail for the Matthews secured-debt CFO workflow.
 * Payload is prepared server-side; this only triggers a browser download.
 */
export function CfoSecuredDebtAuditDownload({
  json,
  filename,
}: {
  json: string;
  filename: string;
}) {
  return (
    <button
      type="button"
      className="button button-primary"
      onClick={() => {
        const blob = new Blob([json], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }}
    >
      Download audit trail (JSON)
    </button>
  );
}
