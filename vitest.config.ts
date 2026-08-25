import { defineConfig } from "vitest/config";

export default defineConfig({
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
