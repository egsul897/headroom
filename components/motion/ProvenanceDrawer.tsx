"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { DetailDrawer } from "./DetailDrawer";
import { UNLOADED_CLAUSE, UNLOADED_HISTORY, UNLOADED_SOURCE } from "./provenance-copy";

/**
 * The covenants slide-over, with the same three sections on every other surface.
 * Callers pass only text they already have. Missing text stays the unloaded sentence.
 */
export function ProvenanceDrawer({
  open,
  title,
  onClose,
  source,
  clause,
  history,
  note,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  source: string;
  clause: string;
  history: string;
  note?: string;
}) {
  return (
    <DetailDrawer open={open} title={title} onClose={onClose}>
      <dl className="drawer-facts">
        <div>
          <dt>Source</dt>
          <dd>{source}</dd>
        </div>
        <div>
          <dt>Clause</dt>
          <dd>{clause}</dd>
        </div>
        <div>
          <dt>History</dt>
          <dd>{history}</dd>
        </div>
      </dl>
      {note ? <p className="drawer-note">{note}</p> : null}
    </DetailDrawer>
  );
}

export function OpenProvenanceButton({
  title,
  source = UNLOADED_SOURCE,
  clause = UNLOADED_CLAUSE,
  history = UNLOADED_HISTORY,
  note,
  className = "button button-quiet detail-open",
  children,
}: {
  title: string;
  source?: string;
  clause?: string;
  history?: string;
  note?: string;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      <ProvenanceDrawer
        open={open}
        title={title}
        onClose={() => setOpen(false)}
        source={source}
        clause={clause}
        history={history}
        note={note}
      />
    </>
  );
}
