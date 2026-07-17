import { errorEnvelopeSchema, type ErrorEnvelope } from "@koradio/contracts";
import type { ServiceTransport } from "./transport.js";

interface RuntimeSchema<T> {
  parse(value: unknown): T;
}

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly envelope?: ErrorEnvelope,
  ) {
    super(envelope?.message ?? `Koradio API request failed with status ${String(status)}`);
  }
}

export async function requestJson<T>(
  transport: ServiceTransport,
  path: string,
  schema: RuntimeSchema<T>,
  init?: RequestInit,
): Promise<T> {
  const response = await transport.request(path, init);
  const payload: unknown = await response.json();
  if (!response.ok) {
    const error = errorEnvelopeSchema.safeParse(payload);
    throw new ApiRequestError(response.status, error.success ? error.data : undefined);
  }
  return schema.parse(payload);
}

export function jsonRequest(method: "POST" | "PUT" | "PATCH", body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function createIdempotencyKey(): string {
  return crypto.randomUUID();
}
