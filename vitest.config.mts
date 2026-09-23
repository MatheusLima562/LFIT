import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup-env.ts"],
    // Testes de banco criam e removem organizações próprias; em série para não
    // estourar o rate limit do Supabase Auth.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
  resolve: {
    alias: { "@": new URL("./", import.meta.url).pathname },
  },
});
