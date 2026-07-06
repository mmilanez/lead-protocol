import { defineConfig } from "tsup";

export default defineConfig({
  // lib/updater.ts is built as its own entry so the node:test suite in
  // test/ can import the exact code that ships.
  entry: ["src/index.ts", "src/lib/updater.ts"],
  format: ["esm"],
  target: "node18",
  outDir: "dist",
  clean: true,
  splitting: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
  // Mirror the repo-root templates into dist/templates/ after each build
  // (runs after clean, both for `build` and `dev --watch`).
  onSuccess: "node scripts/sync-templates.mjs",
});
