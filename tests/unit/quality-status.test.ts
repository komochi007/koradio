import { describe, expect, it } from "vitest";

import { parseQualityStatus } from "../fixtures/quality-status.js";

describe("parseQualityStatus", () => {
  it.each(["ready", "blocked"] as const)("accepts %s", (status) => {
    expect(parseQualityStatus(status)).toBe(status);
  });

  it("rejects unsupported input", () => {
    expect(() => parseQualityStatus("unknown")).toThrow(TypeError);
  });
});
