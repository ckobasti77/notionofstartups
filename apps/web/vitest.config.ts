import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Redosled je bitan: prvi match pobeđuje, pa "@/convex" mora pre "@".
    alias: [
      {
        find: "@/convex",
        replacement: path.resolve(__dirname, "../../packages/backend/convex"),
      },
      { find: "@", replacement: path.resolve(__dirname, ".") },
    ],
  },
  test: {
    name: "web",
    environment: "edge-runtime",
  },
});
