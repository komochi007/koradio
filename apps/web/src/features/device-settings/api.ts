import {
  deepseekCredentialStatusSchema,
  deviceSettingsSchema,
  jobAcceptedResponseSchema,
  serviceHealthSchema,
  serviceHealthListResponseSchema,
  ttsModelStatusSchema,
  type DeepseekCredentialStatus,
  type DeviceSettings,
  type JobAcceptedResponse,
  type ServiceHealthListResponse,
  type TtsModelStatus,
  type UpdateDeviceSettingsCommand,
} from "@koradio/contracts";

import { createIdempotencyKey, jsonRequest, requestJson } from "../../shared/api.js";
import type { ServiceTransport } from "../../shared/transport.js";

export function getDeviceSettings(transport: ServiceTransport): Promise<DeviceSettings> {
  return requestJson(transport, "/api/v1/device-settings", deviceSettingsSchema);
}

export function updateDeviceSettings(
  transport: ServiceTransport,
  command: UpdateDeviceSettingsCommand,
): Promise<DeviceSettings> {
  return requestJson(
    transport,
    "/api/v1/device-settings",
    deviceSettingsSchema,
    jsonRequest("PATCH", command),
  );
}

export function getDeepseekCredentialStatus(
  transport: ServiceTransport,
): Promise<DeepseekCredentialStatus> {
  return requestJson(
    transport,
    "/api/v1/device-settings/deepseek-credentials",
    deepseekCredentialStatusSchema,
  );
}

export function saveDeepseekApiKey(
  transport: ServiceTransport,
  apiKey: string,
): Promise<DeepseekCredentialStatus> {
  return requestJson(
    transport,
    "/api/v1/device-settings/deepseek-credentials",
    deepseekCredentialStatusSchema,
    jsonRequest("PUT", { apiKey }),
  );
}

export function deleteDeepseekApiKey(
  transport: ServiceTransport,
): Promise<DeepseekCredentialStatus> {
  return requestJson(
    transport,
    "/api/v1/device-settings/deepseek-credentials",
    deepseekCredentialStatusSchema,
    { method: "DELETE" },
  );
}

export function testPlanner(transport: ServiceTransport) {
  return requestJson(
    transport,
    "/api/v1/device-settings/planner-test",
    serviceHealthSchema,
    jsonRequest("POST", {}),
  );
}

export function getServiceHealth(transport: ServiceTransport): Promise<ServiceHealthListResponse> {
  return requestJson(transport, "/api/v1/health/services", serviceHealthListResponseSchema);
}

export function getTtsModelStatus(transport: ServiceTransport): Promise<TtsModelStatus> {
  return requestJson(transport, "/api/v1/device-settings/tts-model", ttsModelStatusSchema);
}

export function installTtsModel(transport: ServiceTransport): Promise<TtsModelStatus> {
  return requestJson(
    transport,
    "/api/v1/device-settings/tts-model/install",
    ttsModelStatusSchema,
    jsonRequest("POST", {}),
  );
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
