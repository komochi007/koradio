import {
  feedbackEventSchema,
  tasteResponseSchema,
  type CreateFeedbackCommand,
  type FeedbackEvent,
  type TasteResponse,
} from "@koradio/contracts";

import { createIdempotencyKey, jsonRequest, requestJson } from "../../shared/api.js";
import type { ServiceTransport } from "../../shared/transport.js";

export function getTaste(transport: ServiceTransport, profileId: string): Promise<TasteResponse> {
  return requestJson(
    transport,
    `/api/v1/profiles/${encodeURIComponent(profileId)}/taste`,
    tasteResponseSchema,
  );
}

export function createFeedback(
  transport: ServiceTransport,
  profileId: string,
  command: CreateFeedbackCommand,
): Promise<FeedbackEvent> {
  const request = jsonRequest("POST", command);
  const headers = new Headers(request.headers);
  headers.set("Idempotency-Key", createIdempotencyKey());
  return requestJson(
    transport,
    `/api/v1/profiles/${encodeURIComponent(profileId)}/feedback-events`,
    feedbackEventSchema,
    { ...request, headers },
  );
}
