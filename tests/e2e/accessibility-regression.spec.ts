import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const appOrigin = `http://127.0.0.1:${process.env.KORADIO_E2E_PORT ?? "49373"}`;

async function ensureCurrentProfile(page: Page): Promise<void> {
  const destination = await Promise.race([
    page
      .getByRole("heading", { name: "创建电台档案" })
      .waitFor()
      .then(() => "create" as const),
    page
      .getByRole("heading", { name: "Radio", exact: true })
      .waitFor()
      .then(() => "radio" as const),
  ]);
  if (destination === "create") {
    await page.getByRole("textbox", { name: /电台名称/ }).fill("S6 Accessibility Radio");
    await page.getByRole("textbox", { name: /你的昵称/ }).fill("S6 Listener");
    await page.getByRole("button", { name: "保存并进入 Koradio" }).click();
    const afterCreate = await Promise.race([
      page
        .getByRole("heading", { name: "设置", exact: true })
        .waitFor()
        .then(() => "settings" as const),
      page
        .getByRole("heading", { name: "Radio", exact: true })
        .waitFor()
        .then(() => "radio" as const),
    ]);
    if (afterCreate === "settings") {
      await page.getByRole("textbox", { name: "Codex 命令路径" }).fill("codex");
      await page.getByRole("button", { name: "保存配置" }).click();
      await expect(page.getByText("配置已保存。")).toBeVisible();
      await page.getByRole("button", { name: "Radio" }).click();
    }
  }
  await expect(page.getByRole("heading", { name: "Radio", exact: true })).toBeVisible();
}

async function openRoute(page: Page, navigationName: string, headingName: string): Promise<void> {
  const navigation = page.getByRole("button", { name: navigationName, exact: true });
  const wasCurrent = (await navigation.getAttribute("aria-current")) === "page";
  await navigation.click();
  const heading = page.getByRole("heading", { name: headingName, exact: true });
  if (wasCurrent) await expect(heading).toBeVisible();
  else await expect(heading).toBeFocused();
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

test("keeps primary routes keyboard-operable, focused and axe-clean", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${appOrigin}/radio`);
  await ensureCurrentProfile(page);

  const radioNavigation = page.getByRole("button", { name: "Radio", exact: true });
  await radioNavigation.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("button", { name: "Library", exact: true })).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(radioNavigation).toBeFocused();
  const focusStyle = await radioNavigation.evaluate((button) => {
    const style = getComputedStyle(button);
    return { boxShadow: style.boxShadow, outlineStyle: style.outlineStyle };
  });
  expect(focusStyle.boxShadow === "none" && focusStyle.outlineStyle === "none").toBe(false);

  const routes = [
    ["Radio", "Radio"],
    ["Library", "音乐库"],
    ["Taste", "你的音乐品味"],
    ["Programs", "节目"],
    ["Settings", "设置"],
  ] as const;
  for (const [navigationName, headingName] of routes) {
    await openRoute(page, navigationName, headingName);
    if (navigationName === "Settings") {
      await expect(page.getByRole("button", { name: "保存配置" })).toBeEnabled();
      await expect(page.getByRole("button", { name: "测试连接" })).toBeEnabled();
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }

  const reducedMotion = await page.evaluate(() => {
    const wave = document.createElement("i");
    const container = document.createElement("div");
    container.className = "radio-tuning-wave";
    container.append(wave);
    document.body.append(container);
    const animationName = getComputedStyle(wave).animationName;
    container.remove();
    return animationName;
  });
  expect(reducedMotion).toBe("none");
});

test("preserves representative viewport flow and 44px navigation targets", async ({
  browserName,
  page,
}) => {
  test.skip(browserName !== "chromium", "Representative visual geometry is covered in Chromium");
  await page.goto(`${appOrigin}/radio`);
  await ensureCurrentProfile(page);

  const representatives = [
    { width: 390, height: 844, navigation: "Radio", heading: "Radio" },
    { width: 834, height: 1194, navigation: "Taste", heading: "你的音乐品味" },
    { width: 1440, height: 1200, navigation: "Settings", heading: "设置" },
  ] as const;
  for (const representative of representatives) {
    await page.setViewportSize({ width: representative.width, height: representative.height });
    await openRoute(page, representative.navigation, representative.heading);
    await expectNoHorizontalOverflow(page);
    const undersizedTargets = await page
      .getByRole("navigation", { name: "主要导航" })
      .getByRole("button")
      .evaluateAll((buttons) =>
        buttons.flatMap((button) => {
          const rect = button.getBoundingClientRect();
          return rect.width < 44 || rect.height < 44
            ? [{ name: button.getAttribute("aria-label"), width: rect.width, height: rect.height }]
            : [];
        }),
      );
    expect(undersizedTargets).toEqual([]);
  }
});

test("reflows at a 200 percent desktop-equivalent layout viewport", async ({
  browserName,
  page,
}) => {
  test.skip(browserName !== "chromium", "The 200% visual baseline is covered in Chromium");
  await page.setViewportSize({ width: 720, height: 600 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${appOrigin}/radio`);
  await ensureCurrentProfile(page);
  await openRoute(page, "Settings", "设置");

  await expectNoHorizontalOverflow(page);
  await expect(page.getByRole("button", { name: "保存配置" })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await expect(page).toHaveScreenshot("settings-zoom-200.png", {
    animations: "disabled",
    caret: "hide",
  });
});
