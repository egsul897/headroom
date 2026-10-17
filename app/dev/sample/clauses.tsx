"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { DetailDrawer } from "@/components/motion/DetailDrawer";

const CLAUSES = [
  {
    section: "§6.04",
    title: "Limitation on indebtedness",
    badges: ["PROHIBITION", "DISCOVERED"],
    reading: "Sample reading: incremental debt is permitted only inside the sample basket. Discovered is not counsel-approved, and it is not remaining capacity.",
    cite: "Sample agreement, section 6.04, illustrative page 84",
    source: "No source document is attached",
  },
  {
    section: "§7.01",
    title: "Sample maintenance test",
    badges: ["MAINTENANCE_TEST", "REVIEW_REQUIRED"],
    reading: "Sample reading: a person still has to finish the inputs before anyone relies on a pass or a fail.",
    cite: "Sample agreement, section 7.01",
    source: "No source document is attached",
  },
] as const;

export function SampleClauses({ initialDetail = false }: { initialDetail?: boolean }) {
  const [open, setOpen] = useState<number | null>(initialDetail ? 0 : null);
  const clause = open == null ? null : CLAUSES[open];

  return (
    <>
      {CLAUSES.map((item, index) => (
        <article className="clause" key={item.section}>
          <div className="clause-head">
            <div>
              <div className="clause-sec">{item.section}</div>
              <div className="card-subtitle">{item.title}</div>
            </div>
            <div className="clause-badges">
              {item.badges.map((badge) => (
                <StatusBadge key={badge} status={badge} />
              ))}
            </div>
          </div>
          <p className="row-note">{item.reading}</p>
          <div className="clause-actions">
            <button type="button" className={index === 0 ? "button button-primary" : "button button-quiet"} onClick={() => setOpen(index)}>
              {index === 0 ? "Open the redline" : "Open detail"}
            </button>
          </div>
        </article>
      ))}
      <DetailDrawer open={clause != null} title={clause ? `${clause.section} ${clause.title}` : "Detail"} onClose={() => setOpen(null)}>
        {clause ? (
          <>
            <p className="drawer-note">{clause.reading}</p>
            {clause.section === "§6.04" ? (
              <div className="redline">
                <div className="redline-col redline-base">
                  <span className="redline-label">Base document</span>
                  <div>The sample borrower shall not incur additional debt except as this sample section permits.</div>
                </div>
                <div className="redline-col redline-amend">
                  <span className="redline-label">Amendment</span>
                  <div>The sample borrower may incur incremental debt under a sample basket, subject to a sample ratio test.</div>
                </div>
              </div>
            ) : null}
            <dl className="drawer-facts">
              <div>
                <dt>Citation</dt>
                <dd>{clause.cite}</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>{clause.source}</dd>
              </div>
            </dl>
          </>
        ) : null}
      </DetailDrawer>
    </>
  );
}
