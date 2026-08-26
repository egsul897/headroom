import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // Mirrors tsconfig.json's "@/*": ["./*"] path alias (Next.js's own
  // convention, already used throughout app/** and components/**) - vitest
  // has no knowledge of tsconfig `paths` on its own, so a component that
  // imports via `@/...` (e.g. components/CovenantOverview.tsx) previously
  // could not be loaded by a vitest-run test at all.
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  // Automatic JSX runtime so app/**, components/** .tsx source files (which
  // rely on Next's own automatic-runtime JSX compilation and never import
  // React themselves) can be imported and rendered from a Phase 10 UI test
  // (tests/phase10-ui-provenance.test.tsx, react-dom/server) without editing
  // those source files just to satisfy a different bundler's default.
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
