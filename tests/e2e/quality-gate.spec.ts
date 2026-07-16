import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("runs browser and accessibility checks", async ({ page }) => {
  await page.setContent(`
    <!doctype html>
    <html lang="zh-CN">
      <head><title>Koradio quality gate</title></head>
      <body>
        <main>
          <h1>Koradio</h1>
          <button type="button">开始验证</button>
        </main>
      </body>
    </html>
  `);

  await expect(page.getByRole("button", { name: "开始验证" })).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});
