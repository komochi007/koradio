import { defineConfig, devices } from "@playwright/test";

const e2ePort = process.env.KORADIO_E2E_PORT ?? "49373";
const e2eOrigin = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: "./tests",
  outputDir: "test-results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{projectName}/{arg}{ext}",
  webServer: {
    command: "pnpm build && pnpm start",
    url: `${e2eOrigin}/`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NODE_ENV: "production",
      KORADIO_HOST: "127.0.0.1",
      KORADIO_PORT: e2ePort,
      KORADIO_PROVIDER_MODE: "mock",
      KORADIO_STRICT_PORT: "true",
      KORADIO_DATA_DIR: "test-results/koradio-data",
    },
  },
  use: {
    baseURL: e2eOrigin,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
});
