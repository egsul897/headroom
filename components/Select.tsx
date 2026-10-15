"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * One listbox for every menu that used to be a native <select>.
 * Keyboard: Enter/Space/ArrowDown open, arrows move, Enter commits, Escape closes,
 * Home/End jump, printable characters jump by label. A named hidden input keeps
 * form posts on the same field name and value.
 */
export function Select({
  id,
  name,
  options,
  value,
  defaultValue,
  onValueChange,
  disabled = false,
  ariaLabel,
}: {
  id?: string;
  name?: string;
  options: readonly SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const autoId = useId();
  const buttonId = id ?? autoId;
  const listId = `${buttonId}-listbox`;
  const controlled = value !== undefined;
  const initial = defaultValue ?? options[0]?.value ?? "";
  const [uncontrolled, setUncontrolled] = useState(initial);
  const selected = controlled ? value : uncontrolled;
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === selected));
  const selectedOption = options[selectedIndex];
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const rootRef = useRef<HTMLDivElement>(null);
  const typeBuffer = useRef("");
  const typeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  function commit(next: string) {
    if (!controlled) setUncontrolled(next);
    onValueChange?.(next);
    setOpen(false);
  }

  function move(nextIndex: number) {
    if (options.length === 0) return;
    const wrapped = (nextIndex + options.length) % options.length;
    setActiveIndex(wrapped);
  }

  function onTypeahead(key: string) {
    typeBuffer.current = (typeBuffer.current + key).toLowerCase();
    if (typeTimer.current) clearTimeout(typeTimer.current);
    typeTimer.current = setTimeout(() => {
      typeBuffer.current = "";
    }, 500);
    const found = options.findIndex((option) => option.label.toLowerCase().startsWith(typeBuffer.current));
    if (found >= 0) setActiveIndex(found);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (disabled) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setActiveIndex(selectedIndex);
        setOpen(true);
        return;
      }
      move(activeIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setActiveIndex(selectedIndex);
        setOpen(true);
        return;
      }
      move(activeIndex - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(Math.max(0, options.length - 1));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) {
        setActiveIndex(selectedIndex);
        setOpen(true);
        return;
      }
      const option = options[activeIndex];
      if (option) commit(option.value);
    } else if (event.key === "Escape") {
      setOpen(false);
    } else if (event.key === "Tab") {
      setOpen(false);
    } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      if (!open) setOpen(true);
      onTypeahead(event.key);
    }
  }

  return (
    <div className={`select${open ? " select-open" : ""}`} ref={rootRef}>
      {name ? <input type="hidden" name={name} value={selected} /> : null}
      <button
        id={buttonId}
        type="button"
        className="select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setActiveIndex(selectedIndex);
          setOpen((current) => !current);
        }}
        onKeyDown={onKeyDown}
      >
        <span className="select-value">{selectedOption?.label ?? "Select"}</span>
        <span className="select-chevron" aria-hidden="true" />
      </button>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-labelledby={buttonId}
          className="select-menu"
          tabIndex={-1}
          onKeyDown={onKeyDown}
        >
          {options.map((option, index) => {
            const isSelected = option.value === selected;
            const isActive = index === activeIndex;
            return (
              <li
                key={option.value}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={isSelected}
                className={`select-option${isSelected ? " is-selected" : ""}${isActive ? " is-active" : ""}`}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  commit(option.value);
                }}
              >
                {option.label}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
