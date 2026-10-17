"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

type ToastItem = {
  id: number;
  message: string;
  onUndo?: () => void;
};

const ToastContext = createContext<((message: string, onUndo?: () => void) => void) | null>(null);

export function useToast() {
  const push = useContext(ToastContext);
  return push ?? (() => undefined);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const push = useCallback((message: string, onUndo?: () => void) => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, message, onUndo }]);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <ToastView
            key={toast.id}
            message={toast.message}
            onUndo={
              toast.onUndo
                ? () => {
                    toast.onUndo?.();
                    setToasts((current) => current.filter((item) => item.id !== toast.id));
                  }
                : undefined
            }
            onDone={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastView({ message, onUndo, onDone }: { message: string; onUndo?: () => void; onDone: () => void }) {
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const timer = window.setTimeout(onDone, media.matches ? 4000 : 4800);
    return () => window.clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="toast" role="status">
      <span>{message}</span>
      {onUndo ? (
        <button type="button" className="toast-undo" onClick={onUndo}>
          Undo
        </button>
      ) : null}
    </div>
  );
}
