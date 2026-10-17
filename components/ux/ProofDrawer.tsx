"use client";

import { useState, type ReactNode } from "react";
import { DetailDrawer } from "@/components/motion/DetailDrawer";
import { missingInputLabels, type FigureProof } from "@/lib/ux/present";

export function ProofDrawer({ open, proof, onClose }: { open: boolean; proof: FigureProof | null; onClose: () => void }) {
  const missing = proof ? missingInputLabels(proof) : [];
  return (
    <DetailDrawer open={open && proof != null} title="How we got this" onClose={onClose}>
      {proof ? (
        <div className="proof">
          <p className="proof-figure">{proof.figure}</p>
          <p className="proof-value">{proof.value?.trim() ? proof.value : "Not loaded"}</p>
          <h3 className="proof-kicker">Formula</h3>
          {proof.inputs.length === 0 ? (
            <p className="proof-missing">No formula steps are loaded.</p>
          ) : (
            <ol className="proof-steps">
              {proof.inputs.map((input) => {
                const absent = input.value == null || input.value.trim() === "";
                return (
                  <li key={input.label}>
                    <span className="proof-step-name">{input.label}</span>
                    <span className={absent ? "proof-missing" : "proof-step-value"}>
                      {absent ? `Missing: ${input.label}` : input.value}
                    </span>
                    <span className="proof-step-source">{input.source?.trim() ? input.source : "Source not loaded"}</span>
                  </li>
                );
              })}
            </ol>
          )}
          {missing.length > 0 ? <p className="proof-missing">Missing: {missing.join(", ")}.</p> : null}
          <div className="proof-meta">
            <span className="proof-chip">{proof.clause?.trim() ? proof.clause : "Clause is not loaded"}</span>
            <span>{proof.page?.trim() ? proof.page : "Page is not loaded"}</span>
            <span>{proof.review?.trim() ? proof.review : "Needs input"}</span>
          </div>
        </div>
      ) : null}
    </DetailDrawer>
  );
}

export function ProofTrigger({
  proof,
  className = "proof-trigger",
  children,
}: {
  proof: FigureProof;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      <ProofDrawer open={open} proof={proof} onClose={() => setOpen(false)} />
    </>
  );
}
