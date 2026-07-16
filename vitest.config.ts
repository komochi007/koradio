import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/{unit,contract,integration,component}/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: [
        "apps/**/src/**/*.{ts,tsx}",
        "packages/**/src/**/*.{ts,tsx}",
        "tests/fixtures/**/*.ts",
      ],
      exclude: ["**/*.test.{ts,tsx}", "**/*.config.{js,ts}"],
      thresholds: {
        "apps/server/src/**/domain/**": {
          branches: 90,
          functions: 95,
          lines: 95,
          statements: 95,
        },
        "apps/web/src/audio/**": {
          branches: 90,
          functions: 95,
          lines: 95,
          statements: 95,
        },
        "packages/contracts/src/**": {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
        "tests/fixtures/**": {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
      },
    },
  },
});
