"use client";

import { useEffect, useState } from "react";

/**
 * Animates the single number already present in `text`.
 * Dates and unknown copy have more than one number, or none, and stay still.
 */
export function CountUp({ text }: { text: string }) {
  const parsed = parseOneNumber(text);
  const [value, setValue] = useState<number | null>(parsed ? parsed.value : null);

  useEffect(() => {
    if (!parsed) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) {
      setValue(parsed.value);
      return;
    }
    let start: number | null = null;
    let frame = 0;
    const from = 0;
    const to = parsed.value;
    const step = (now: number) => {
      if (start == null) start = now;
      const progress = Math.min(1, (now - start) / 720);
      const eased = 1 - (1 - progress) ** 3;
      setValue(from + (to - from) * eased);
      if (progress < 1) frame = window.requestAnimationFrame(step);
    };
    setValue(0);
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [text, parsed?.raw, parsed?.value]);

  if (!parsed || value == null) return <>{text}</>;
  const shown = formatLike(parsed.raw, value);
  return <span className="count-up">{text.replace(parsed.raw, shown)}</span>;
}

function parseOneNumber(text: string): { raw: string; value: number } | null {
  const matches = text.match(/-?\d[\d,]*(?:\.\d+)?/g);
  if (!matches || matches.length !== 1) return null;
  const raw = matches[0];
  const value = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  return { raw, value };
}

function formatLike(raw: string, value: number): string {
  const decimals = raw.includes(".") ? (raw.split(".")[1]?.length ?? 0) : 0;
  const rounded = decimals === 0 ? Math.round(value) : Number(value.toFixed(decimals));
  if (raw.includes(",")) return rounded.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return decimals === 0 ? String(Math.round(value)) : rounded.toFixed(decimals);
}
