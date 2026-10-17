import type { ReactNode } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { formatUsd } from "@/lib/home/ebitda-tile";

export type EbitdaSummary = {
  base: string | null;
  confirmed: string | null;
  proForma: string | null;
  additional: string | null;
  needingYou: number | null;
};

export type EbitdaCardModel = {
  id: string;
  name: string;
  amount: string | null;
  status: string;
  source: string | null;
};

const SUMMARY: { key: keyof Omit<EbitdaSummary, "needingYou">; label: string }[] = [
  { key: "base", label: "Base EBITDA" },
  { key: "confirmed", label: "Confirmed add-backs" },
  { key: "proForma", label: "Pro forma EBITDA" },
  { key: "additional", label: "Additional available" },
];

function figure(value: string | null): string {
  return formatUsd(value) ?? "Needs input";
}

/**
 * One baseline of summary boxes, then an aligned add-back grid.
 * The boxes share the dashboard card chrome and the same gutter.
 */
export function EbitdaGrid({
  summary,
  cards,
  onOpen,
  preparing = false,
  failedReason = null,
  retrying = false,
  onRetry,
  children,
}: {
  summary: EbitdaSummary | null;
  cards: readonly EbitdaCardModel[];
  onOpen: (id: string) => void;
  preparing?: boolean;
  failedReason?: string | null;
  retrying?: boolean;
  onRetry?: () => void;
  children?: ReactNode;
}) {
  return (
    <section className="ebitda-panel" data-region="ebitda" aria-label="Consolidated EBITDA">
      <header className="ebitda-panel-head">
        <h2 className="home-eyebrow">Consolidated EBITDA</h2>
      </header>
      {failedReason ? (
        <article className="home-card ebitda-failed">
          <h3 className="home-eyebrow">Couldn't compute</h3>
          <p>{failedReason}</p>
          <button type="button" className="button" disabled={retrying} onClick={onRetry}>
            {retrying ? "Retrying…" : "Retry"}
          </button>
        </article>
      ) : preparing ? (
        <div className="ebitda-summary" aria-busy="true">
          {SUMMARY.map((row) => (
            <article key={row.key} className="home-card ebitda-box">
              <h3 className="home-eyebrow">{row.label}</h3>
              <p className="ebitda-skeleton">Preparing EBITDA…</p>
            </article>
          ))}
          <article className="home-card ebitda-box">
            <h3 className="home-eyebrow">Items needing you</h3>
            <p className="ebitda-skeleton">Preparing EBITDA…</p>
          </article>
        </div>
      ) : (
        <>
          <div className="ebitda-summary">
            {SUMMARY.map((row) => {
              const text = figure(summary?.[row.key] ?? null);
              return (
                <article key={row.key} className="home-card ebitda-box">
                  <h3 className="home-eyebrow">{row.label}</h3>
                  <p className={text === "Needs input" ? "ebitda-box-value is-missing" : "ebitda-box-value"}>{text}</p>
                </article>
              );
            })}
            <article className="home-card ebitda-box">
              <h3 className="home-eyebrow">Items needing you</h3>
              <p className="ebitda-box-value">{summary?.needingYou == null ? "Needs input" : String(summary.needingYou)}</p>
              {summary?.needingYou != null && summary.needingYou > 0 ? (
                <span className="need-chip">{summary.needingYou === 1 ? "1 item" : `${summary.needingYou} items`}</span>
              ) : null}
            </article>
          </div>
          {cards.length > 0 ? (
            <div className="ebitda-cards">
              {cards.map((card) => (
                <button key={card.id} type="button" className="ebitda-card" onClick={() => onOpen(card.id)}>
                  <span className="ebitda-card-top">
                    <span className="ebitda-card-name">{card.name}</span>
                    <span className={card.amount ? "ebitda-card-amount" : "ebitda-card-amount is-missing"}>{card.amount ?? "Needs input"}</span>
                  </span>
                  <span className="ebitda-card-meta">
                    <StatusBadge status={card.status} />
                    <span className="ebitda-source-chip">{card.source ?? "No source"}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="drawer-note">The credit agreement has not been read yet.</p>
          )}
        </>
      )}
      {children}
    </section>
  );
}
