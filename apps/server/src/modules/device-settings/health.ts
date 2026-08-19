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
  mode: HealthResponse["mode"];
  now?: () => Date;
  plannerConfigured: () => boolean;
  ttsEnabled: () => boolean;
}

export function createHealthService(options: CreateHealthServiceOptions): HealthService {
  const now = options.now ?? (() => new Date());

  function getServiceHealth(): ServiceHealthListResponse {
    const checkedAt = now().toISOString();
    const plannerConfigured = options.plannerConfigured();
    const mockMode = options.mode === "mock";

    return serviceHealthListResponseSchema.parse({
      items: [
        {
          service: "local-service",
          status: "available",
          checkedAt,
          redactedSummary: "Local Service is ready",
        },
        {
          service: "planner",
          status: plannerConfigured ? "available" : "unavailable",
          checkedAt,
          redactedSummary: plannerConfigured
            ? "Active AI planner is configured"
            : "Active AI planner is not configured",
        },
        {
          service: "netease",
          status: mockMode ? "available" : "degraded",
          checkedAt,
          redactedSummary: mockMode
            ? "Built-in NetEase provider is available in mock mode"
            : "Built-in NetEase provider is enabled for live personal preview",
        },
        {
          service: "tts",
          status: options.ttsEnabled() ? "available" : "degraded",
          checkedAt,
          redactedSummary: options.ttsEnabled()
            ? mockMode
              ? "Qwen3-TTS is available in mock mode"
              : "Qwen3-TTS local model is ready for live personal preview"
            : "Qwen3-TTS local model is unavailable; new programmes cannot be submitted",
        },
      ],
    });
  }

  return {
    getHealth() {
      const items = getServiceHealth().items;
      const providerStatus = (service: "planner" | "netease" | "tts") => {
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
          planner: providerStatus("planner"),
          netease: providerStatus("netease"),
          tts: providerStatus("tts"),
        },
        checkedAt: now().toISOString(),
      });
    },
    getServiceHealth,
  };
}
