# Original independent red-team harnesses (verbatim)

These eight files are the independent red team's own scripts, preserved byte-for-byte from `/tmp/rt/`
where the audit recorded in `docs/source-coverage-repair/13-independent-red-team-audit.json` was run.
They are the source of truth for the Phase 3 closure audit (`docs/source-coverage-repair/29-closure-audit.json`)
and for the fixtures of canaries #2-#12.

They are deliberately NOT edited: they import the live compiler by absolute path
(`/home/user/headroom/lib/...`), which is how they were written. Run them from a checkout at that path with
`npx tsx scripts/red-team-original/<file>.ts`. Rewriting the imports would make them something other than the
original evidence.

| file    | what it holds |
|---------|---------------|
| e2e.ts  | S1-S10 - the ten end-to-end silent-omission scenarios (findings RT-1..RT-7) |
| e2e2.ts | V1-V6 - lead-in / child-descent variants (RT-4 x RT-7 interaction) |
| e2e3.ts | A overbroad span (RT-8), B gap-echo (RT-9) |
| e2e4.ts | overbroad span reconciled against an IR carrying the values (RT-8) |
| p1.ts   | 24 classifier probes (RT-3, RT-6, RT-7) |
| p2.ts   | duplicate region ids (RT-12), zero regions (RT-13), bogus external link (RT-10), ordering, false positives (RT-15) |
| p3.ts   | ALL-CAPS waiver paragraph, caption/caps length boundaries (RT-1, RT-2), value-scanner blind spots (RT-7) |
| p4.ts   | OCR/Unicode variants (RT-3), run-on and long-token controls, INFORMATIONAL control (RT-16) |
