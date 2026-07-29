import type { Page } from "@playwright/test";

export interface StandaloneOuterSize {
  height: number;
  width: number;
}

export async function enableStandaloneDesktopPwa(
  page: Page,
  outerSize: StandaloneOuterSize,
): Promise<void> {
  await page.addInitScript((size) => {
    const browserMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query: string): MediaQueryList => {
      if (query === "(display-mode: standalone)" || query === "(pointer: fine)") {
        return {
          addEventListener: () => undefined,
          addListener: () => undefined,
          dispatchEvent: () => false,
          matches: true,
          media: query,
          onchange: null,
          removeEventListener: () => undefined,
          removeListener: () => undefined,
        };
      }
      return browserMatchMedia(query);
    };
    Object.defineProperties(window, {
      outerHeight: { configurable: true, value: size.height },
      outerWidth: { configurable: true, value: size.width },
    });
  }, outerSize);
}
