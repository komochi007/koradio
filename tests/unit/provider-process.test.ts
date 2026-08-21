import { describe, expect, it } from "vitest";

import { createProviderEnvironment } from "../../apps/server/src/integrations/process.js";

describe("provider process environment", () => {
  it("preserves Python's bytecode write guard for bundled runtimes", () => {
    expect(
      createProviderEnvironment({
        PATH: "/usr/bin:/bin",
        PYTHONDONTWRITEBYTECODE: "1",
        SECRET: "must-not-leak",
      }),
    ).toEqual({
      PATH: "/usr/bin:/bin",
      PYTHONDONTWRITEBYTECODE: "1",
    });
  });
});
