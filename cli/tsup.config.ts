import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
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
