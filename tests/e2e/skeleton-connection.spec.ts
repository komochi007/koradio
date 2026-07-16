import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("connects the App Shell to REST and authenticated WebSocket probes", async ({ page }) => {
  await page.goto("http://127.0.0.1:49373/");

  await expect(page.getByRole("heading", { name: "声音系统，等待节目。" })).toBeVisible();
  await expect(page.getByTestId("health-status")).toHaveText("已连接");
  await expect(page.getByTestId("event-status")).toHaveText("已连接");
  await expect(page.getByText("MOCK", { exact: true })).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});
