import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    settings: {
      next: {
        rootDir: "apps/web/",
      },
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    "apps/web/.next/**",
    "apps/web/out/**",
    "apps/web/build/**",
    "**/next-env.d.ts",
    "packages/backend/convex/_generated/**",
    // The Expo app has its own React Native ESLint setup (`expo lint`);
    // the Next.js ruleset here does not apply to it.
    "apps/mobile/**",
  ]),
]);

export default eslintConfig;
