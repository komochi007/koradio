import { expect, test } from "@playwright/test";

test("captures a deterministic visual fixture", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 240 });
  await page.setContent(`
    <!doctype html>
    <html lang="zh-CN">
      <head>
        <title>Koradio visual fixture</title>
        <style>
          html, body { margin: 0; background: #ffffff; }
          [data-quality-gate] { width: 160px; height: 120px; background: #111111; }
        </style>
      </head>
      <body><div data-quality-gate aria-label="质量门视觉样例"></div></body>
    </html>
  `);

  await expect(page.locator("[data-quality-gate]")).toHaveScreenshot("quality-gate.png", {
    animations: "disabled",
  });
});
