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
  it("keeps source labels centered inside a single inset thumb", () => {
    expect(sourceSwitchStyles).toContain("--radio-source-switch-inset: 3px;");
    expect(sourceSwitchStyles).toContain("padding: 0;");
    expect(sourceSwitchStyles).toContain("border: 0;");
    expect(sourceSwitchStyles).toContain("appearance: none;");
    expect(sourceSwitchStyles).toContain("-webkit-appearance: none;");
    expect(sourceSwitchStyles).toContain("width: calc(50% - var(--radio-source-switch-inset));");
    expect(sourceSwitchStyles).toContain("transform: translateX(100%);");
    expect(sourceSwitchStyles).toContain("place-items: center;");
    expect(sourceSwitchStyles).toContain("line-height: 1;");
    expect(sourceSwitchStyles).toContain(
      ".radio-queue > header > span,\n.radio-queue > header > button {",
    );
  });

  it("keeps the date, dense soundfield, play icon, and active row aligned with the card system", () => {
    expect(dailyMixStyles).toContain("height: 0.72em;");
    expect(dailyMixStyles).toContain("top: 50%;");
    expect(dailyMixStyles).toContain("transform: translate(-50%, -50%) skewX(-14deg);");
    expect(dailyMixStyles).toContain("animation: daily-mix-soundfield-line-wave");
    expect(dailyMixStyles).toContain("animation-delay: var(--daily-mix-line-delay, 0ms);");
    expect(dailyMixStyles).toContain("animation: daily-mix-soundfield-glow 18s linear infinite;");
    expect(dailyMixStyles).toContain("stroke-dasharray: 0.08 0.92;");
    expect(dailyMixStyles).toContain(".daily-mix-play-all__icon {");
    expect(dailyMixStyles).toContain("background: #111317;");
    expect(dailyMixStyles).toContain("fill: #f7f8fa;");
    expect(dailyMixStyles).toContain("--daily-mix-active-overhang-left: 14px;");
    expect(dailyMixStyles).toContain("--daily-mix-active-overhang-right: 18px;");
    expect(dailyMixStyles).toContain("border-bottom: 1px solid var(--kr-border-subtle);");
    expect(dailyMixStyles).toContain("border-bottom-color: transparent;");
    expect(dailyMixStyles).toContain(
      "border-radius: var(--daily-mix-active-overhang-left) var(--daily-mix-active-overhang-right)",
    );
    expect(dailyMixStyles).toContain("top: 100%;");
    expect(dailyMixStyles).toContain("right: var(--daily-mix-active-overhang-right);");
    expect(dailyMixStyles).toContain("left: var(--daily-mix-active-overhang-left);");
  });
});
