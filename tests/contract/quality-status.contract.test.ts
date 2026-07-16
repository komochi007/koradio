import { expect, it } from "vitest";

import { parseQualityStatus } from "../fixtures/quality-status.js";

it("validates a decoded quality status at the boundary", () => {
  const payload: unknown = JSON.parse('{"status":"ready"}');

  if (typeof payload !== "object" || payload === null || !("status" in payload)) {
    throw new TypeError("Invalid quality payload");
  }

  expect(parseQualityStatus(payload.status)).toBe("ready");
});
