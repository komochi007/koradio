import {
  dataRootMigrationStageChangedEventSchema,
  feedbackPersistedEventSchema,
  generationCompletedEventSchema,
  generationDegradedEventSchema,
  generationPlannedEventSchema,
  generationTracksResolvedEventSchema,
  playbackSnapshotEventSchema,
  programCommittedEventSchema,
  serviceHealthChangedEventSchema,
  v1EventSchema,
} from "../../packages/contracts/src/index.js";
import { describe, expect, it } from "vitest";

import {
  checkpoint,
  envelope,
  feedback,
  health,
  ids,
  programDetail,
} from "./v1-contract-fixtures.js";

const events = [
  {
    schema: generationPlannedEventSchema,
    value: {
      ...envelope,
      eventType: "generation.planned",
      payload: { jobId: ids.job },
    },
  },
  {
    schema: generationTracksResolvedEventSchema,
    value: {
      ...envelope,
      eventType: "generation.tracks-resolved",
      payload: { jobId: ids.job, trackCount: 1 },
    },
  },
  {
    schema: generationDegradedEventSchema,
    value: {
      ...envelope,
      eventType: "generation.degraded",
      payload: { jobId: ids.job, capability: "tts", code: "TTS_UNAVAILABLE" },
    },
  },
  {
    schema: generationCompletedEventSchema,
    value: {
      ...envelope,
      eventType: "generation.completed",
      payload: { jobId: ids.job, programId: ids.program },
    },
  },
  {
    schema: programCommittedEventSchema,
    value: {
      ...envelope,
      eventType: "program.committed",
      payload: programDetail,
    },
  },
  {
    schema: playbackSnapshotEventSchema,
    value: {
      ...envelope,
      eventType: "playback.snapshot",
      payload: checkpoint,
    },
  },
  {
    schema: feedbackPersistedEventSchema,
    value: {
      ...envelope,
      eventType: "feedback.persisted",
      payload: feedback,
    },
  },
  {
    schema: serviceHealthChangedEventSchema,
    value: {
      ...envelope,
      eventType: "service.health.changed",
      payload: health,
    },
  },
  {
    schema: dataRootMigrationStageChangedEventSchema,
    value: {
      ...envelope,
      profileId: undefined,
      eventType: "data_root_migration.stage_changed",
      payload: {
        jobId: ids.job,
        stage: "copying",
        status: "running",
      },
    },
  },
] as const;

describe("v1 event contracts", () => {
  it.each(events)(
    "accepts $value.eventType with the common ordered envelope",
    ({ schema, value }) => {
      expect(schema.parse(value)).toEqual(value);
      expect(v1EventSchema.parse(value)).toEqual(value);
    },
  );

  it.each(events)("rejects invalid $value.eventType envelope versions", ({ schema, value }) => {
    expect(schema.safeParse({ ...value, version: 2 }).success).toBe(false);
  });

  it("rejects missing correlation IDs, negative sequences and unknown event fields", () => {
    const event = events[0].value;
    const withoutCorrelation = { ...event, correlationId: undefined };

    expect(generationPlannedEventSchema.safeParse(withoutCorrelation).success).toBe(false);
    expect(generationPlannedEventSchema.safeParse({ ...event, sequence: -1 }).success).toBe(false);
    expect(generationPlannedEventSchema.safeParse({ ...event, providerPayload: {} }).success).toBe(
      false,
    );
  });

  it("rejects mismatched event payloads and unsupported event types", () => {
    expect(
      generationTracksResolvedEventSchema.safeParse({
        ...events[1].value,
        payload: { jobId: ids.job, trackCount: 0 },
      }).success,
    ).toBe(false);
    expect(
      generationDegradedEventSchema.safeParse({
        ...events[2].value,
        payload: { jobId: ids.job, capability: "codex", code: "CODEX_FAILED" },
      }).success,
    ).toBe(false);
    expect(
      dataRootMigrationStageChangedEventSchema.safeParse({
        ...events[8].value,
        payload: { ...events[8].value.payload, path: "/Users/name/data" },
      }).success,
    ).toBe(false);
    expect(
      v1EventSchema.safeParse({
        ...envelope,
        eventType: "playback.position",
        payload: { positionMs: 1000 },
      }).success,
    ).toBe(false);
  });
});
