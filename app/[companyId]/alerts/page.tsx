import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { loadMonitoringFeed } from "@/lib/product/customer-intelligence/monitoring";

export const metadata = { title: "Headroom — Alerts" };

function tone(severity: "info" | "attention" | "blocking"): "idle" | "tight" | "navy" {
  if (severity === "blocking") return "tight";
  if (severity === "attention") return "navy";
  return "idle";
}

export default async function AlertsPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const feed = await loadMonitoringFeed(companyId);

  return (
    <div className="stack">
      <Card>
        <div className="card-title">Monitoring</div>
        <div className="card-subtitle">
          Source-backed workspace alerts only — no invented compliance calendars or market-practice deadlines.
        </div>
        <div className="button-row" style={{ marginTop: 12 }}>
          <Link className="button" href={`/${companyId}/covenants`}>
            Covenants
          </Link>
          <Link className="button" href={`/${companyId}/capacity`}>
            Capacity
          </Link>
          <Link className="button" href={`/${companyId}/onboarding/financials`}>
            Financial inputs
          </Link>
        </div>
        <div className="row-note" style={{ marginTop: 8 }}>
          {feed.note}
        </div>
      </Card>

      {feed.alerts.length === 0 ? (
        <Card>
          <div className="card-subtitle">No monitoring alerts from current persisted workspace state.</div>
        </Card>
      ) : (
        feed.alerts.map((a, i) => (
          <Card key={`${a.kind}-${i}`}>
            <div className="row">
              <div className="row-label">{a.title}</div>
              <div className="row-value">
                <Chip tone={tone(a.severity)}>{a.kind}</Chip>
              </div>
            </div>
            <div className="row-note">{a.detail}</div>
            {a.sourceRefs.length > 0 && (
              <div className="row-note" style={{ marginTop: 6 }}>
                Sources: {a.sourceRefs.slice(0, 4).join(" · ")}
              </div>
            )}
          </Card>
        ))
      )}
    </div>
  );
}
