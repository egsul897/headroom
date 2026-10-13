# Operative source amount / authority consistency

## Defect

Restatement precedence correctly refused superseded *predecessor authority*, but
successor authority could still bind a discovery unit whose amount / operative
text came from the superseded document ($50M predecessor under $100M successor).

## Correction

1. Offline compile tracks `discoveryDocumentId`, `operativeSourceDocumentId`, and
   `operativeSourceBindingStatus`.
2. Exception-catalog text is taken only from the operative/governing document.
3. `UNVERIFIED_DISCOVERY_FALLBACK` applies only when a **confirmed restatement
   succession** requires a different governing document and text was not remapped.
4. `applyOperativeSourcePublicationGate` refuses `SOURCE_BACKED_GROSS_CONTRACTUAL`
   unless operative source is verified on the governing document.
5. Historical predecessor evidence is preserved separately and never published as GROSS.

## Failing-before → passing-after

Before: successor governing + predecessor $50M IR could publish GROSS.
After: `tests/product/operative-source-amount-binding.test.ts` **6/6**;
targeted suite **64/64** (Matthews/MHK authentic packages preserved).
