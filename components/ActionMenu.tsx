"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

export interface ActionMenuItem {
  href: string;
  label: string;
}

/**
 * Progressive disclosure for secondary actions. One labeled button, then a
 * menu of the same links that used to sit in a row. Arrow keys move, Enter
 * follows the link, Escape closes.
 */
export function ActionMenu({ label, items }: { label: string; items: readonly ActionMenuItem[] }) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(0);
        return;
      }
      setActiveIndex((index) => (index + 1) % items.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(items.length - 1);
        return;
      }
      setActiveIndex((index) => (index - 1 + items.length) % items.length);
    } else if (event.key === "Escape") {
      setOpen(false);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(Math.max(0, items.length - 1));
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div className={`action-menu${open ? " action-menu-open" : ""}`} ref={rootRef} onKeyDown={onKeyDown}>
      <button
        type="button"
        className="button action-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => {
          setActiveIndex(0);
          setOpen((current) => !current);
        }}
      >
        {label}
      </button>
      {open ? (
        <div id={menuId} role="menu" className="action-menu-panel">
          {items.map((item, index) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              className={`action-menu-item${index === activeIndex ? " is-active" : ""}`}
              tabIndex={index === activeIndex ? 0 : -1}
              onMouseEnter={() => setActiveIndex(index)}
            >
              {item.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
