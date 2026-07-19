import {
  jobAcceptedResponseSchema,
  programDetailSchema,
  programGenerationSnapshotSchema,
  programListResponseSchema,
  type JobAcceptedResponse,
  type ProgramDetail,
  type ProgramGenerationSnapshot,
} from "@koradio/contracts";

import { createIdempotencyKey, jsonRequest, requestJson } from "../../shared/api.js";
import type { ServiceTransport } from "../../shared/transport.js";

export async function getLatestProgram(
  transport: ServiceTransport,
  profileId: string,
): Promise<ProgramDetail | null> {
  const programs = await requestJson(
    transport,
    `/api/v1/profiles/${profileId}/programs?limit=1`,
    programListResponseSchema,
  );
  const latest = programs.items[0];
  return latest === undefined ? null : getProgram(transport, profileId, latest.id);
}

export function getProgram(
  transport: ServiceTransport,
  profileId: string,
  programId: string,
): Promise<ProgramDetail> {
  return requestJson(
    transport,
    `/api/v1/profiles/${profileId}/programs/${programId}`,
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
    `/api/v1/profiles/${profileId}/program-generations/${jobId}`,
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
    `/api/v1/profiles/${profileId}/program-generations`,
    jobAcceptedResponseSchema,
    { ...request, headers },
  );
}
