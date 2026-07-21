import type { Page } from "@playwright/test";

export async function installPlayableMedia(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLMediaElement.prototype, "addEventListener", {
      configurable: true,
      value(this: HTMLMediaElement, ...args: Parameters<HTMLMediaElement["addEventListener"]>) {
        if (args[0] === "error") return;
        EventTarget.prototype.addEventListener.call(this, ...args);
      },
    });
    Object.defineProperty(HTMLMediaElement.prototype, "load", {
      configurable: true,
      value: () => undefined,
    });
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value(this: HTMLMediaElement) {
        this.dispatchEvent(new Event("playing"));
        return Promise.resolve();
      },
    });
  });
}
