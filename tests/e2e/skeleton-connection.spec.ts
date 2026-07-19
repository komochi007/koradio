import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const appOrigin = `http://127.0.0.1:${process.env.KORADIO_E2E_PORT ?? "49373"}`;
async function ensureCurrentProfile(page: import("@playwright/test").Page): Promise<void> {
  const createHeading = page.getByRole("heading", { name: "创建电台档案" });
  const destination = await Promise.race([
    createHeading.waitFor().then(() => "create" as const),
    page
      .getByRole("heading", { name: "Radio", exact: true })
      .waitFor()
      .then(() => "radio" as const),
  ]);
  if (destination === "create") {
    await page.getByRole("textbox", { name: /电台名称/ }).fill("E2E Local Radio");
    await page.getByRole("textbox", { name: /你的昵称/ }).fill("E2E Listener");
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

test("routes the online App Shell with an in-memory session", async ({ context, page }) => {
  let bootstrapToken: string | undefined;
  page.on("response", async (response) => {
    if (
      response.url() === `${appOrigin}/api/v1/session/bootstrap` &&
      response.request().method() === "POST"
    ) {
      const payload: unknown = await response.json();
      if (
        typeof payload === "object" &&
        payload !== null &&
        "accessToken" in payload &&
        typeof payload.accessToken === "string"
      ) {
        bootstrapToken = payload.accessToken;
      }
    }
  });
  await page.addInitScript(() => {
    localStorage.setItem("koradio-session-token", "persisted-token-must-be-rejected");
  });
  await page.goto(`${appOrigin}/radio`);

  await ensureCurrentProfile(page);
  await expect(page.getByRole("heading", { name: "Radio", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page).toHaveURL(`${appOrigin}/settings`);
  await expect(page.getByRole("heading", { name: "设置", exact: true })).toBeFocused();
  await expect.poll(() => bootstrapToken).toBeDefined();

  if (bootstrapToken === undefined) {
    throw new Error("Session bootstrap token was not observed");
  }

  const persistedTokenStatus = await page.evaluate(async () => {
    const storedToken = localStorage.getItem("koradio-session-token");
    const response = await fetch("/api/v1/health", {
      headers: {
        Authorization: `Bearer ${storedToken ?? ""}`,
      },
    });
    return response.status;
  });
  expect(persistedTokenStatus).toBe(401);

  const browserState = await page.evaluate(() => ({
    href: window.location.href,
    localStorage: Object.fromEntries(
      Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
        .filter((key): key is string => key !== null)
        .map((key) => [key, localStorage.getItem(key)]),
    ),
    resources: performance.getEntriesByType("resource").map((entry) => entry.name),
    sessionStorage: Object.fromEntries(
      Array.from({ length: sessionStorage.length }, (_, index) => sessionStorage.key(index))
        .filter((key): key is string => key !== null)
        .map((key) => [key, sessionStorage.getItem(key)]),
    ),
  }));
  const serializedBrowserState = JSON.stringify(browserState);
  expect(serializedBrowserState).not.toContain(bootstrapToken);
  expect(browserState.href).toBe(`${appOrigin}/settings`);
  expect(browserState.localStorage["koradio-session-token"]).toBe(
    "persisted-token-must-be-rejected",
  );
  expect(Object.keys(browserState.localStorage).sort()).toEqual(
    ["koradio-session-token", "koradio.playback.lease.v1"].sort(),
  );
  expect(browserState.sessionStorage).toEqual({});
  await expect(context.cookies()).resolves.toEqual([]);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("recovers from a disconnected Local Service through read-only Settings", async ({ page }) => {
  await page.route("**/api/v1/session/bootstrap", async (route) => route.abort());
  await page.goto(`${appOrigin}/radio`);

  await expect(page.getByRole("heading", { name: "Koradio 服务未连接" })).toBeVisible();
  await page.getByRole("button", { name: "前往 Settings" }).click();
  await expect(page.getByRole("heading", { name: "设置暂时只读" })).toBeVisible();
  await expect(page.getByRole("button", { name: "保存配置" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "测试连接" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "迁移数据目录" })).toBeDisabled();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  await page.unroute("**/api/v1/session/bootstrap");
  await page.getByRole("button", { name: "重新连接" }).click();
  await expect(page).toHaveURL(`${appOrigin}/radio`);
  await ensureCurrentProfile(page);
  await expect(page.getByRole("heading", { name: "Radio", exact: true })).toBeFocused();
});

test("serves only the static App Shell from cache while fully offline", async ({
  browserName,
  context,
  page,
}) => {
  test.skip(browserName !== "chromium", "CacheStorage inspection is covered once in Chromium");

  await page.goto(`${appOrigin}/radio`);
  await ensureCurrentProfile(page);
  await expect(page.getByRole("heading", { name: "Radio", exact: true })).toBeFocused();
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Radio", exact: true })).toBeFocused();

  const cachedUrls = await page.evaluate(async () => {
    const names = await caches.keys();
    const requests = await Promise.all(names.map(async (name) => (await caches.open(name)).keys()));
    return requests.flat().map((request) => request.url);
  });
  expect(cachedUrls.some((url) => url.includes("/api/v1"))).toBe(false);

  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.getByRole("heading", { name: "Koradio 服务未连接" })).toBeVisible();
    await expect(page.getByText("APP SHELL · READ ONLY")).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
