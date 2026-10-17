"use client";
import { useFormStatus } from "react-dom";

/**
 * Submit button with immediate pending feedback. Server actions can
 * take 30–90s (a 1MB credit agreement analyzes synchronously inside
 * the upload action) — without this, the button sits dead after the
 * click and the user has no idea anything is happening. While the
 * action runs the button shows the pending label and disables, so a
 * second click cannot double-submit.
 */
export function PendingSubmitButton({
  label,
  pendingLabel,
  className = "button-primary",
}: {
  label: string;
  pendingLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} style={{ width: "fit-content" }} disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}
