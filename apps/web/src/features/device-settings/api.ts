import {
  deviceSettingsSchema,
  jobAcceptedResponseSchema,
  serviceHealthListResponseSchema,
  type DeviceSettings,
  type JobAcceptedResponse,
  type ServiceHealthListResponse,
} from "@koradio/contracts";

import { createIdempotencyKey, jsonRequest, requestJson } from "../../shared/api.js";
import type { ServiceTransport } from "../../shared/transport.js";

export function getDeviceSettings(transport: ServiceTransport): Promise<DeviceSettings> {
  return requestJson(transport, "/api/v1/device-settings", deviceSettingsSchema);
}

export function updateDeviceSettings(
  transport: ServiceTransport,
  codexCommand: string,
): Promise<DeviceSettings> {
  return requestJson(
    transport,
    "/api/v1/device-settings",
    deviceSettingsSchema,
    jsonRequest("PATCH", { codexCommand }),
  );
}

export function getServiceHealth(transport: ServiceTransport): Promise<ServiceHealthListResponse> {
  return requestJson(transport, "/api/v1/health/services", serviceHealthListResponseSchema);
}

export function migrateDataRoot(
  transport: ServiceTransport,
  targetDataRoot: string,
): Promise<JobAcceptedResponse> {
  const init = jsonRequest("POST", { targetDataRoot });
  const headers = new Headers(init.headers);
  headers.set("Idempotency-Key", createIdempotencyKey());
  init.headers = headers;
  return requestJson(
    transport,
    "/api/v1/device-settings/data-root-migrations",
    jobAcceptedResponseSchema,
    init,
  );
}
