import { feedbackEventSchema, type FeedbackEvent } from "@koradio/contracts";
import type { DatabaseSync } from "node:sqlite";

interface FeedbackEventRow {
  replay_order: number;
  id: string;
  profile_id: string;
  target_id: string;
  type: FeedbackEvent["type"];
  idempotency_key: string;
  created_at: string;
}

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

  return {
    findByIdempotencyKey(profileId, idempotencyKey) {
      const row = findByIdempotencyKey.get(profileId, idempotencyKey) as
        FeedbackEventRow | undefined;
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
      return (list.all(profileId) as unknown as FeedbackEventRow[]).map(mapRow);
    },
  };
}
