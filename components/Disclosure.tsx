"use client";

import { useState, type ReactNode } from "react";

export function Disclosure({
  closedLabel,
  openLabel,
  children,
}: {
  closedLabel: string;
  openLabel: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        className={`button ${open ? "" : "button-primary"}`}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? openLabel : closedLabel}
      </button>
      {open && <div style={{ marginTop: 14 }}>{children}</div>}
    </div>
  );
}
