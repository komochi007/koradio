import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const programsStyles = readFileSync(
  new URL("../../apps/web/src/features/programs/programs.css", import.meta.url),
  "utf8",
);
const radioPlayerStyles = readFileSync(
  new URL("../../apps/web/src/features/radio/radio-player.css", import.meta.url),
  "utf8",
);

describe("UX-31 Programs and Radio UI regressions", () => {
  it("uses one deliberate rhythm for Programs sections and history cards", () => {
    expect(programsStyles).toContain("--programs-section-gap: 24px;");
    expect(programsStyles).toContain("--programs-list-gap: 16px;");
    expect(programsStyles).toContain(".programs-flow {");
    expect(programsStyles).toContain("gap: var(--programs-section-gap);");
    expect(programsStyles).toContain("gap: var(--programs-list-gap);");
    expect(programsStyles).toContain(".programs-daily-history > div > button {");
    expect(programsStyles).toContain("cursor: pointer;");
  });

  it("reveals a smooth seek affordance without changing disabled behavior", () => {
    expect(radioPlayerStyles).toContain("height 180ms ease-out");
    expect(radioPlayerStyles).toContain("height: 6px;");
    expect(radioPlayerStyles).toContain("width: 10px;");
    expect(radioPlayerStyles).toContain("background: var(--kr-accent);");
    expect(radioPlayerStyles).toContain("input:not(:disabled):is(:hover, :focus-visible)");
  });
});
