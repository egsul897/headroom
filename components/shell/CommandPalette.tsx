"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import type { ShellLink } from "./nav-model";

export function CommandPalette({
  open,
  links,
  onClose,
}: {
  open: boolean;
  links: ShellLink[];
  onClose: () => void;
}) {
  const router = useRouter();
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return links;
    return links.filter((link) => `${link.label} ${link.group}`.toLowerCase().includes(q));
  }, [links, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  if (!open) return null;

  function go(link: ShellLink | undefined) {
    if (!link) return;
    router.push(link.href);
    onClose();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (filtered.length === 0 ? 0 : (index + 1) % filtered.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (filtered.length === 0 ? 0 : (index - 1 + filtered.length) % filtered.length));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(Math.max(0, filtered.length - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(filtered[active]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  let previousGroup = "";

  return (
    <div className="cmdk-backdrop" onMouseDown={onClose}>
      <div
        className="cmdk"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="shell-sr">
          Jump to
        </h2>
        <input
          ref={inputRef}
          className="cmdk-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Jump to a page"
          aria-label="Jump to a page"
          aria-controls="cmdk-list"
          aria-activedescendant={filtered[active] ? `cmdk-opt-${filtered[active].key}` : undefined}
          autoComplete="off"
        />
        <ul id="cmdk-list" className="cmdk-list" role="listbox" aria-label="Pages">
          {filtered.length === 0 ? <li className="cmdk-empty">No pages match.</li> : null}
          {filtered.map((link, index) => {
            const showGroup = !query.trim() && link.group !== previousGroup;
            if (showGroup) previousGroup = link.group;
            return (
              <li key={link.href} role="presentation">
                {showGroup ? <div className="cmdk-group">{link.group}</div> : null}
                <button
                  id={`cmdk-opt-${link.key}`}
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  className={`cmdk-item${index === active ? " is-active" : ""}`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => go(link)}
                >
                  <span>{link.label}</span>
                  <span className="cmdk-item-group">{link.group}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
