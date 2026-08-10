import {
  jobAcceptedResponseSchema,
  radioConversationSchema,
  radioSpeechGenerationSchema,
  radioTurnSchema,
  type RadioConversation,
  type RadioSpeechGeneration,
  type RadioTurn,
} from "@koradio/contracts";

import {
  ApiRequestError,
  createIdempotencyKey,
  jsonRequest,
  requestJson,
} from "../../shared/api.js";
import type { ServiceTransport } from "../../shared/transport.js";

export function getRadioConversation(
  transport: ServiceTransport,
  profileId: string,
): Promise<RadioConversation> {
  return requestJson(
    transport,
    `/api/v1/profiles/${encodeURIComponent(profileId)}/radio-conversation`,
    radioConversationSchema,
  );
}

export function createRadioTurn(
  transport: ServiceTransport,
  profileId: string,
  content: string,
): Promise<RadioTurn> {
  const request = jsonRequest("POST", { content });
  const headers = new Headers(request.headers);
  headers.set("Idempotency-Key", createIdempotencyKey());
  return requestJson(
    transport,
    `/api/v1/profiles/${encodeURIComponent(profileId)}/radio-turns`,
    radioTurnSchema,
    { ...request, headers },
  );
}

export async function clearRadioConversation(
  transport: ServiceTransport,
  profileId: string,
): Promise<void> {
  const response = await transport.request(
    `/api/v1/profiles/${encodeURIComponent(profileId)}/radio-conversation`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmed: true }),
    },
  );
  if (!response.ok) throw new ApiRequestError(response.status);
}

export async function createRadioSpeech(
  transport: ServiceTransport,
  profileId: string,
  messageId: string,
): Promise<RadioSpeechGeneration> {
  const headers = new Headers();
  headers.set("Idempotency-Key", createIdempotencyKey());
  const accepted = await requestJson(
    transport,
    `/api/v1/profiles/${encodeURIComponent(profileId)}/radio-messages/${encodeURIComponent(messageId)}/speech-generations`,
    jobAcceptedResponseSchema,
    { method: "POST", headers },
  );
  return requestJson(
    transport,
    `/api/v1/profiles/${encodeURIComponent(profileId)}/radio-speech-generations/${encodeURIComponent(accepted.jobId)}`,
    radioSpeechGenerationSchema,
  );
}

export function getRadioSpeech(
  transport: ServiceTransport,
  profileId: string,
  jobId: string,
): Promise<RadioSpeechGeneration> {
  return requestJson(
    transport,
    `/api/v1/profiles/${encodeURIComponent(profileId)}/radio-speech-generations/${encodeURIComponent(jobId)}`,
    radioSpeechGenerationSchema,
  );
}
