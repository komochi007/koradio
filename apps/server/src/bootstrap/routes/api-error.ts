import { randomUUID } from "node:crypto";

import { errorEnvelopeSchema } from "@koradio/contracts";
import type { FastifyReply } from "fastify";

export function sendApiError(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
  retryable: boolean,
): FastifyReply {
  return reply.status(statusCode).send(
    errorEnvelopeSchema.parse({
      code,
      message,
      retryable,
      correlationId: randomUUID(),
    }),
  );
}
