"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

/**
 * A detail panel over the current page. It shows copy the page already has.
 * It does not load a route or a figure.
 */
export function DetailDrawer({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="drawer-root">
      <button type="button" className="drawer-backdrop" aria-label="Close details" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="detail-drawer-title">
        <header className="drawer-head">
          <h2 id="detail-drawer-title">{title}</h2>
          <button ref={closeRef} type="button" className="button button-quiet" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
  );
}
