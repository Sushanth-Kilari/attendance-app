import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 15000,
    // RLS tests share live Supabase state (real test accounts, throwaway
    // fixtures) — run them one at a time to avoid one test's setup racing
    // another's cleanup.
    fileParallelism: false,
  },
});
