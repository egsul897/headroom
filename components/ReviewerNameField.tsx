"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "headroom-onboarding-reviewer-name";

/**
 * A plain-text "who is reviewing this" field, remembered per-browser via
 * localStorage (this app has no auth/session concept - see lib/onboarding/review.ts's
 * own header comment for why `reviewedBy` must be a real, human-supplied
 * value, never fabricated). Rendered inside every review-action `<form>` as
 * a required `name="reviewedBy"` field, so each individual approve/edit/
 * reject/review-required submission carries the reviewer's own typed
 * identifier - remembering it is a convenience, not a substitute for a real
 * identity system.
 */
export function ReviewerNameField({ id }: { id: string }) {
  const [value, setValue] = useState("");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) setValue(stored);
    } catch {
      // Private-browsing/blocked storage - fall back to a blank, still-required field.
    }
  }, []);

  return (
    <input
      type="text"
      id={id}
      name="reviewedBy"
      placeholder="Your name or email"
      required
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        try {
          window.localStorage.setItem(STORAGE_KEY, e.target.value);
        } catch {
          // Ignore - remembering it is a convenience only.
        }
      }}
      style={{ maxWidth: 220 }}
    />
  );
}
