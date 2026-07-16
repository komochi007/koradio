import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

const typedFiles = [
  "apps/**/*.{ts,tsx}",
  "packages/**/*.{ts,tsx}",
  "tests/**/*.{ts,tsx}",
  "*.config.ts",
];
const typedConfigs = tseslint.configs.strictTypeChecked.map((config) => ({
  ...config,
  files: typedFiles,
}));

export default [
  {
    ignores: [
      "design/**",
      "docs/**",
      "node_modules/**",
      "dist/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  {
    ...eslint.configs.recommended,
    files: ["**/*.{js,mjs,cjs}"],
  },
  ...typedConfigs,
  {
    files: typedFiles,
    languageOptions: {
      parserOptions: {
        project: [
          "./tsconfig.quality.json",
          "./apps/*/tsconfig.json",
          "./packages/*/tsconfig.json",
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
    rules: {
      "@typescript-eslint/ban-ts-comment": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
];
