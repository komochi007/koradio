import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const sourceSwitchStyles = readFileSync(
  new URL("../../apps/web/src/features/radio/radio-queue-dialogue.css", import.meta.url),
  "utf8",
);
const dailyMixStyles = readFileSync(
  new URL("../../apps/web/src/features/daily-mix/daily-mix.css", import.meta.url),
  "utf8",
);

describe("UX-30 Daily Mix UI regressions", () => {
  it("keeps source labels centered inside an inset, spaced thumb", () => {
    expect(sourceSwitchStyles).toContain("--radio-source-switch-gap: 6px;");
    expect(sourceSwitchStyles).toContain("--radio-source-switch-inset: 3px;");
    expect(sourceSwitchStyles).toContain("column-gap: var(--radio-source-switch-gap);");
    expect(sourceSwitchStyles).toContain("place-items: center;");
    expect(sourceSwitchStyles).toContain("padding: 0;");
    expect(sourceSwitchStyles).toContain("line-height: 1;");
    expect(sourceSwitchStyles).toContain(
      ".radio-queue > header > span,\n.radio-queue > header > button {",
    );
  });

  it("keeps the date, soundfield, and active row aligned with the card system", () => {
    expect(dailyMixStyles).toContain("height: 0.72em;");
    expect(dailyMixStyles).toContain("top: 50%;");
    expect(dailyMixStyles).toContain("transform: translate(-50%, -50%) skewX(-14deg);");
    expect(dailyMixStyles).toContain("animation: daily-mix-soundfield-line-wave");
    expect(dailyMixStyles).toContain("animation-delay: var(--daily-mix-line-delay, 0ms);");
    expect(dailyMixStyles).toContain("--daily-mix-row-radius: 14px;");
    expect(dailyMixStyles).toContain("border-radius: var(--daily-mix-row-radius);");
    expect(dailyMixStyles).toContain("right: var(--daily-mix-row-radius);");
    expect(dailyMixStyles).toContain("left: var(--daily-mix-row-radius);");
  });
});
