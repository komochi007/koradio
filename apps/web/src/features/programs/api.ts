import {
  jobAcceptedResponseSchema,
  programDetailSchema,
  programGenerationSnapshotSchema,
  programListResponseSchema,
  type JobAcceptedResponse,
  type ProgramDetail,
  type ProgramGenerationSnapshot,
  type ProgramListResponse,
} from "@koradio/contracts";

import { createIdempotencyKey, jsonRequest, requestJson } from "../../shared/api.js";
import type { ServiceTransport } from "../../shared/transport.js";

export async function getLatestProgram(
  transport: ServiceTransport,
  profileId: string,
): Promise<ProgramDetail | null> {
  const programs = await requestJson(
    transport,
    `/api/v1/profiles/${encodeURIComponent(profileId)}/programs?limit=1`,
    programListResponseSchema,
  );
  const latest = programs.items[0];
  return latest === undefined ? null : getProgram(transport, profileId, latest.id);
}

export function getPrograms(
  transport: ServiceTransport,
  profileId: string,
  cursor?: string,
  limit = 4,
): Promise<ProgramListResponse> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor !== undefined) query.set("cursor", cursor);
  return requestJson(
    transport,
    `/api/v1/profiles/${encodeURIComponent(profileId)}/programs?${query.toString()}`,
    programListResponseSchema,
  );
}

export function getProgram(
  transport: ServiceTransport,
  profileId: string,
  programId: string,
): Promise<ProgramDetail> {
  return requestJson(
    transport,
    `/api/v1/profiles/${encodeURIComponent(profileId)}/programs/${encodeURIComponent(programId)}`,
    programDetailSchema,
  );
}

export function getProgramGeneration(
  transport: ServiceTransport,
  profileId: string,
  jobId: string,
): Promise<ProgramGenerationSnapshot> {
  return requestJson(
    transport,
    `/api/v1/profiles/${encodeURIComponent(profileId)}/program-generations/${encodeURIComponent(jobId)}`,
    programGenerationSnapshotSchema,
  );
}

export function generateProgram(
  transport: ServiceTransport,
  profileId: string,
  scenarioText: string,
): Promise<JobAcceptedResponse> {
  const request = jsonRequest("POST", { scenarioText });
  const headers = new Headers(request.headers);
  headers.set("Idempotency-Key", createIdempotencyKey());
  return requestJson(
    transport,
    `/api/v1/profiles/${encodeURIComponent(profileId)}/program-generations`,
    jobAcceptedResponseSchema,
    { ...request, headers },
  );
}
