import { Buffer } from "node:buffer";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  healthResponseSchema,
  serviceHealthListResponseSchema,
  sessionBootstrapResponseSchema,
} from "@koradio/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../../apps/server/src/bootstrap/app.js";
import { loadRuntimeConfig, type RuntimeConfig } from "../../apps/server/src/bootstrap/config.js";
import { createLocalFileStore } from "../../apps/server/src/platform/files/index.js";

const origin = "http://127.0.0.1:49373";
const openApps: Awaited<ReturnType<typeof createApp>>[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map(async (app) => app.close()));
});

async function createLiveConfig(): Promise<RuntimeConfig> {
  const dataRoot = await mkdtemp(join(tmpdir(), "koradio-live-provider-composition-"));

  return {
    environment: "test",
    host: "127.0.0.1",
    port: 49373,
    webPort: 5173,
    providerMode: "live",
    strictPort: true,
    dataRoot,
    initialDataRoot: dataRoot,
    dataRootBootstrapPath: join(dataRoot, "bootstrap.json"),
    webRoot: "unused-in-test",
  };
}

describe("S7-06 live provider composition", () => {
  it("keeps mock as the default and accepts an explicit live configuration", () => {
    expect(
      loadRuntimeConfig({ KORADIO_DATA_DIR: "/tmp/koradio-config-default" }).providerMode,
    ).toBe("mock");
    expect(
      loadRuntimeConfig({
        KORADIO_DATA_DIR: "/tmp/koradio-config-live",
        KORADIO_PROVIDER_MODE: "live",
        KORADIO_TTS_HELPER_PATH: "/opt/koradio/tts-helper",
      }),
    ).toMatchObject({
      providerMode: "live",
      ttsHelperPath: "/opt/koradio/tts-helper",
    });
  });

  it("reports live configuration and text-DJ fallback without contacting external providers", async () => {
    const config = await createLiveConfig();
    const app = await createApp({ config, selectedPort: config.port });
    openApps.push(app);
    const bootstrapResponse = await app.inject({
      method: "POST",
      url: "/api/v1/session/bootstrap",
      headers: { origin },
    });
    const session = sessionBootstrapResponseSchema.parse(bootstrapResponse.json<unknown>());
    const headers = { authorization: `Bearer ${session.accessToken}`, origin };

    const health = healthResponseSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/health",
          headers,
        })
      ).json<unknown>(),
    );
    const services = serviceHealthListResponseSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/health/services",
          headers,
        })
      ).json<unknown>(),
    );

    expect(health).toMatchObject({
      mode: "live",
      providers: { codex: "unavailable", netease: "degraded", tts: "degraded" },
    });
    expect(services.items.find((item) => item.service === "tts")).toMatchObject({
      status: "degraded",
      redactedSummary: "Apple system TTS helper is unavailable; text DJ fallback is enabled",
    });
    expect(JSON.stringify({ health, services })).not.toContain(config.dataRoot);
  });

  it("serves controlled TTS audio only to same-origin media requests", async () => {
    const config = await createLiveConfig();
    const content = Buffer.from("controlled TTS audio");
    const stored = await createLocalFileStore({ dataRoot: config.dataRoot }).put({
      content,
      extension: "wav",
      mimeType: "audio/wav",
      namespace: "tts",
    });
    const app = await createApp({ config, selectedPort: config.port });
    openApps.push(app);

    const sameOrigin = await app.inject({
      method: "GET",
      url: `/${stored.reference}`,
      headers: { "sec-fetch-site": "same-origin" },
    });
    const crossSite = await app.inject({
      method: "GET",
      url: `/${stored.reference}`,
      headers: { "sec-fetch-site": "cross-site" },
    });
    const missingHeader = await app.inject({
      method: "GET",
      url: `/${stored.reference}`,
    });

    expect(sameOrigin.statusCode).toBe(200);
    expect(sameOrigin.rawPayload).toEqual(content);
    expect(sameOrigin.headers["cache-control"]).toBe("no-store");
    expect(sameOrigin.headers["cross-origin-resource-policy"]).toBe("same-origin");
    expect(sameOrigin.headers["x-content-type-options"]).toBe("nosniff");
    expect(crossSite.statusCode).toBe(403);
    expect(missingHeader.statusCode).toBe(403);
    expect(crossSite.body).not.toContain(stored.reference);
  });
});
