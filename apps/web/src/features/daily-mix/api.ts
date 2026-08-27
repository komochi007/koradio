import {
  dailyMixDetailSchema,
  dailyMixGenerationSnapshotSchema,
  dailyMixListResponseSchema,
  dailyMixTodayResponseSchema,
  type DailyMixDetail,
  type DailyMixGenerationSnapshot,
  type DailyMixListResponse,
  type DailyMixTodayResponse,
} from "@koradio/contracts";

import { jsonRequest, requestJson } from "../../shared/api.js";
import type { ServiceTransport } from "../../shared/transport.js";

export function getTodayDailyMix(
  transport: ServiceTransport,
  profileId: string,
): Promise<DailyMixTodayResponse> {
  return requestJson(
    transport,
    `/api/v1/profiles/${encodeURIComponent(profileId)}/daily-mixes/today`,
    dailyMixTodayResponseSchema,
  );
}

export function ensureTodayDailyMix(
  transport: ServiceTransport,
  profileId: string,
  retry = false,
): Promise<DailyMixGenerationSnapshot> {
  return requestJson(
    transport,
    `/api/v1/profiles/${encodeURIComponent(profileId)}/daily-mixes/today`,
    dailyMixGenerationSnapshotSchema,
    jsonRequest("POST", { retry }),
  );
}

export function getDailyMixGeneration(
  transport: ServiceTransport,
  profileId: string,
  jobId: string,
): Promise<DailyMixGenerationSnapshot> {
  return requestJson(
    transport,
    `/api/v1/profiles/${encodeURIComponent(profileId)}/daily-mix-generations/${encodeURIComponent(jobId)}`,
    dailyMixGenerationSnapshotSchema,
  );
}

export function getDailyMix(
  transport: ServiceTransport,
  profileId: string,
  dailyMixId: string,
): Promise<DailyMixDetail> {
  return requestJson(
    transport,
    `/api/v1/profiles/${encodeURIComponent(profileId)}/daily-mixes/${encodeURIComponent(dailyMixId)}`,
    dailyMixDetailSchema,
  );
}

export function getDailyMixes(
  transport: ServiceTransport,
  profileId: string,
): Promise<DailyMixListResponse> {
  return requestJson(
    transport,
    `/api/v1/profiles/${encodeURIComponent(profileId)}/daily-mixes`,
    dailyMixListResponseSchema,
  );
}
