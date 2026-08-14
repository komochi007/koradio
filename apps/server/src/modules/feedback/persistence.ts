import { feedbackEventSchema, type FeedbackEvent } from "@koradio/contracts";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";

import { parseSqliteRow, parseSqliteRows } from "../../platform/db/rows.js";

interface FeedbackEventRow {
  replay_order: number;
  id: string;
  profile_id: string;
  target_id: string;
  type: FeedbackEvent["type"];
  idempotency_key: string;
  created_at: string;
}

const feedbackEventRowSchema: z.ZodType<FeedbackEventRow> = z.object({
  replay_order: z.number(),
  id: z.string(),
  profile_id: z.string(),
  target_id: z.string(),
  type: feedbackEventSchema.shape.type,
  idempotency_key: z.string(),
  created_at: z.string(),
});

export class FeedbackDataError extends Error {
  constructor() {
    super("Feedback data could not be read");
    this.name = "FeedbackDataError";
  }
}

export interface FeedbackRepository {
  findByIdempotencyKey(profileId: string, idempotencyKey: string): FeedbackEvent | null;
  insert(event: FeedbackEvent): void;
  list(profileId: string): FeedbackEvent[];
  listForTaste(profileId: string, minimumReplayOrder: number): FeedbackEvent[];
  latestReplayOrder(profileId: string): number;
}

function mapRow(row: FeedbackEventRow): FeedbackEvent {
  const parsed = feedbackEventSchema.safeParse({
    id: row.id,
    profileId: row.profile_id,
    targetId: row.target_id,
    type: row.type,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
  });
  if (!parsed.success) {
    throw new FeedbackDataError();
  }
  return parsed.data;
}

export function createFeedbackRepository(client: DatabaseSync): FeedbackRepository {
  const selectColumns =
    "replay_order, id, profile_id, target_id, type, idempotency_key, created_at";
  const findByIdempotencyKey = client.prepare(`
    SELECT ${selectColumns}
    FROM feedback_event
    WHERE profile_id = ? AND idempotency_key = ?
  `);
  const insert = client.prepare(`
    INSERT INTO feedback_event (
      id,
      profile_id,
      target_id,
      type,
      idempotency_key,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const list = client.prepare(`
    SELECT ${selectColumns}
    FROM feedback_event
    WHERE profile_id = ?
    ORDER BY replay_order ASC
  `);
  const listForTaste = client.prepare(`
    SELECT ${selectColumns}
    FROM feedback_event
    WHERE profile_id = ? AND replay_order > ?
    ORDER BY replay_order ASC
  `);
  const latestReplayOrder = client.prepare(`
    SELECT COALESCE(MAX(replay_order), 0) AS replay_order
    FROM feedback_event
    WHERE profile_id = ?
  `);

  return {
    findByIdempotencyKey(profileId, idempotencyKey) {
      const value = findByIdempotencyKey.get(profileId, idempotencyKey);
      const row = value === undefined ? undefined : parseSqliteRow(feedbackEventRowSchema, value);
      return row === undefined ? null : mapRow(row);
    },
    insert(event) {
      insert.run(
        event.id,
        event.profileId,
        event.targetId,
        event.type,
        event.idempotencyKey,
        event.createdAt,
      );
    },
    list(profileId) {
      return parseSqliteRows(feedbackEventRowSchema, list.all(profileId)).map(mapRow);
    },
    listForTaste(profileId, minimumReplayOrder) {
      return parseSqliteRows(
        feedbackEventRowSchema,
        listForTaste.all(profileId, minimumReplayOrder),
      ).map(mapRow);
    },
    latestReplayOrder(profileId) {
      const row = latestReplayOrder.get(profileId) as { replay_order: number } | undefined;
      return row?.replay_order ?? 0;
    },
  };
}
