import { describe, expect, it } from "vitest";

import { createSessionState } from "../../apps/server/src/bootstrap/session.js";

const processSecret = new Uint8Array(32).fill(7);

describe("local session state", () => {
  it("issues concurrently valid short-lived tokens", () => {
    let now = new Date("2026-07-16T08:00:00.000Z");
    const session = createSessionState({
      clock: () => now,
      lifetimeMs: 5_000,
      processSecret,
    });
    const first = session.issue();
    const second = session.issue();

    expect(first.accessToken).not.toBe(second.accessToken);
    expect(session.validate(first.accessToken)).toEqual({
      status: "valid",
      expiresAt: first.expiresAt,
    });
    expect(session.validate(second.accessToken)).toEqual({
      status: "valid",
      expiresAt: second.expiresAt,
    });

    now = new Date("2026-07-16T08:00:05.000Z");
    expect(session.validate(first.accessToken)).toEqual({ status: "expired" });
    expect(session.validate(second.accessToken)).toEqual({ status: "expired" });
  });

  it("rejects malformed, modified and previous-process tokens", () => {
    const firstProcess = createSessionState({ processSecret });
    const secondProcess = createSessionState({
      processSecret: new Uint8Array(32).fill(9),
    });
    const issued = firstProcess.issue();
    const modified = `${issued.accessToken.slice(0, -1)}x`;

    expect(firstProcess.validate("not-a-token")).toEqual({ status: "invalid" });
    expect(firstProcess.validate(modified)).toEqual({ status: "invalid" });
    expect(secondProcess.validate(issued.accessToken)).toEqual({ status: "invalid" });
  });

  it("rejects unsafe session configuration", () => {
    expect(() =>
      createSessionState({
        lifetimeMs: 0,
        processSecret,
      }),
    ).toThrow();
    expect(() =>
      createSessionState({
        processSecret: new Uint8Array(16),
      }),
    ).toThrow();
  });
});
