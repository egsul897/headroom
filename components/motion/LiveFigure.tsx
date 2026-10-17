"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Tweens the number already inside an engine-formatted string.
 * Status words, which have no number, stay still.
 */
export function LiveFigure({ text }: { text: string }) {
  const match = text.match(/-?\d[\d,]*(?:\.\d+)?/);
  const target = match ? Number(match[0].replace(/,/g, "")) : null;
  const decimals = match?.[0].includes(".") ? match[0].split(".")[1]!.length : 0;
  const fromRef = useRef<number | null>(target);
  const [shown, setShown] = useState<number | null>(target);

  useEffect(() => {
    if (target == null || !Number.isFinite(target)) {
      setShown(null);
      return;
    }
    const from = fromRef.current ?? target;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches || from === target) {
      fromRef.current = target;
      setShown(target);
      return;
    }
    let start: number | null = null;
    let frame = 0;
    const step = (now: number) => {
      if (start == null) start = now;
      const progress = Math.min(1, (now - start) / 520);
      const eased = 1 - (1 - progress) ** 3;
      setShown(from + (target - from) * eased);
      if (progress < 1) {
        frame = window.requestAnimationFrame(step);
      } else {
        fromRef.current = target;
      }
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [target, text]);

  if (!match || shown == null || !Number.isFinite(shown)) {
    return <span className="live-figure">{text}</span>;
  }
  const formatted = decimals > 0 ? shown.toFixed(decimals) : Math.round(shown).toLocaleString("en-US");
  return <span className="live-figure">{text.replace(match[0], formatted)}</span>;
}
