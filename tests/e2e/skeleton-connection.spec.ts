import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("connects with an in-memory session and rejects persisted tokens", async ({
  context,
  page,
}) => {
  let bootstrapToken: string | undefined;
  page.on("response", async (response) => {
    if (
      response.url() === "http://127.0.0.1:49373/api/v1/session/bootstrap" &&
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
  await page.goto("http://127.0.0.1:49373/");

  await expect(page.getByRole("heading", { name: "声音系统，等待节目。" })).toBeVisible();
  await expect(page.getByTestId("health-status")).toHaveText("已连接");
  await expect(page.getByTestId("event-status")).toHaveText("已连接");
  await expect(page.getByText("MOCK", { exact: true })).toBeVisible();
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
  expect(browserState.href).toBe("http://127.0.0.1:49373/");
  expect(browserState.localStorage).toEqual({
    "koradio-session-token": "persisted-token-must-be-rejected",
  });
  expect(browserState.sessionStorage).toEqual({});
  await expect(context.cookies()).resolves.toEqual([]);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});
