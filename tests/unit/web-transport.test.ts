import { afterEach, describe, expect, it, vi } from "vitest";

import { createServiceTransport } from "../../apps/web/src/transport.js";

const health = {
  service: "koradio",
  status: "ready",
  mode: "mock",
  providers: {
    codex: "available",
    netease: "available",
    tts: "available",
  },
  checkedAt: "2026-07-16T08:00:00.000Z",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("web service transport", () => {
  it("keeps the session in memory and re-bootstraps once after a 401", async () => {
    const firstToken = "a".repeat(48);
    const secondToken = "b".repeat(48);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: firstToken,
            expiresAt: "2099-07-16T08:05:00.000Z",
          }),
          {
            headers: {
              "cache-control": "no-store",
              "content-type": "application/json",
            },
          },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: secondToken,
            expiresAt: "2099-07-16T08:05:00.000Z",
          }),
          {
            headers: {
              "cache-control": "no-store",
              "content-type": "application/json",
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(health), {
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const transport = createServiceTransport("http://127.0.0.1:49373");

    await expect(transport.fetchHealth()).resolves.toEqual(health);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("http://127.0.0.1:49373/api/v1/health");
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("Authorization")).toBe(
      `Bearer ${firstToken}`,
    );
    expect(fetchMock.mock.calls[3]?.[0]).toBe("http://127.0.0.1:49373/api/v1/health");
    expect(new Headers(fetchMock.mock.calls[3]?.[1]?.headers).get("Authorization")).toBe(
      `Bearer ${secondToken}`,
    );
  });

  it("rejects non-loopback and URL-bearing API origins", () => {
    expect(() => createServiceTransport("http://localhost:49373")).toThrow();
    expect(() => createServiceTransport("https://127.0.0.1:49373")).toThrow();
    expect(() => createServiceTransport("http://127.0.0.1:49373?token=secret")).toThrow();
  });
});
