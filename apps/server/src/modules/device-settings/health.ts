import {
  healthResponseSchema,
  serviceHealthListResponseSchema,
  type HealthResponse,
  type ServiceHealthListResponse,
} from "@koradio/contracts";

import type { DeviceSettingsService } from "./index.js";

export interface HealthService {
  getHealth(): HealthResponse;
  getServiceHealth(): ServiceHealthListResponse;
}

export interface CreateHealthServiceOptions {
  deviceSettings: DeviceSettingsService;
  mode: "mock";
  now?: () => Date;
}

export function createHealthService(options: CreateHealthServiceOptions): HealthService {
  const now = options.now ?? (() => new Date());

  function getServiceHealth(): ServiceHealthListResponse {
    const checkedAt = now().toISOString();
    const codexConfigured = options.deviceSettings.get().codexCommand !== null;

    return serviceHealthListResponseSchema.parse({
      items: [
        {
          service: "local-service",
          status: "available",
          checkedAt,
          redactedSummary: "Local Service is ready",
        },
        {
          service: "codex",
          status: codexConfigured ? "available" : "unavailable",
          checkedAt,
          redactedSummary: codexConfigured
            ? "Codex command is configured"
            : "Codex command is not configured",
        },
        {
          service: "netease",
          status: "available",
          checkedAt,
          redactedSummary: "Built-in NetEase provider is available in mock mode",
        },
        {
          service: "tts",
          status: "available",
          checkedAt,
          redactedSummary: "Apple system TTS is available in mock mode",
        },
      ],
    });
  }

  return {
    getHealth() {
      const items = getServiceHealth().items;
      const providerStatus = (service: "codex" | "netease" | "tts") => {
        const snapshot = items.find((item) => item.service === service);

        if (snapshot === undefined) {
          throw new Error(`Missing ${service} health snapshot`);
        }

        return snapshot.status;
      };

      return healthResponseSchema.parse({
        service: "koradio",
        status: "ready",
        mode: options.mode,
        providers: {
          codex: providerStatus("codex"),
          netease: providerStatus("netease"),
          tts: providerStatus("tts"),
        },
        checkedAt: now().toISOString(),
      });
    },
    getServiceHealth,
  };
}
