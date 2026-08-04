import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "backend",
    environment: "edge-runtime",
  },
});
