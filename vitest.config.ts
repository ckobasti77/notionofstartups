import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "apps/web/vitest.config.ts",
      "apps/mobile/vitest.config.ts",
      "packages/backend/vitest.config.ts",
      "packages/shared/vitest.config.ts",
    ],
  },
});
