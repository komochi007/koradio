import { expect, it } from "vitest";

import { parseQualityStatus } from "../fixtures/quality-status.js";

async function readQualityStatus(): Promise<unknown> {
  return Promise.resolve("ready");
}

it("passes validated status through an asynchronous boundary", async () => {
  await expect(readQualityStatus().then(parseQualityStatus)).resolves.toBe("ready");
});
