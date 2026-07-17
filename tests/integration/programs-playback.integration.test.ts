import { programDetailSchema, type MusicTrack, type ProgramDetail } from "@koradio/contracts";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ProgramNotFoundError,
  ProgramWriteError,
  createProgramRepository,
  createProgramService,
  type ProgramTrackReader,
} from "../../apps/server/src/modules/programs/index.js";
import {
  PlaybackPolicyError,
  PlaybackWriteError,
  createPlaybackCheckpointService,
  createPlaybackRepository,
  createPlaybackTimelineService,
} from "../../apps/server/src/modules/playback/index.js";
import { bootstrapDatabase } from "../../apps/server/src/platform/db/database.js";
import { ids, programDetail, track } from "../contract/v1-contract-fixtures.js";

const secondProfileId = "11111111-1111-4111-8111-111111111112";
const secondProgramId = "0190f4b5-3c44-7b1a-9c69-2d8c4b1be001";
const secondSegmentId = "0190f4b5-3c44-7b1a-9c69-2d8c4b1be002";
const secondTimelineId = "0190f4b5-3c44-7b1a-9c69-2d8c4b1be003";

function createTrackReader(tracks: MusicTrack[]): ProgramTrackReader {
  const byId = new Map(tracks.map((candidate) => [candidate.id, candidate]));
  return {
    getTracks(trackIds) {
      return trackIds.map((trackId) => {
        const candidate = byId.get(trackId);
        if (candidate === undefined) {
          throw new Error("Track missing");
        }
        return candidate;
      });
    },
  };
}

function firstTrack(detail: ProgramDetail): MusicTrack {
  const candidate = detail.tracks[0];
  if (candidate === undefined) {
    throw new Error("Program fixture has no track");
  }
  return candidate;
}

function makeTextOnlyProgram(): ProgramDetail {
  const base = programDetailSchema.parse(programDetail);
  return programDetailSchema.parse({
    program: {
      ...base.program,
      id: secondProgramId,
      title: "Text-only Night",
      createdAt: "2026-07-17T02:00:00.000Z",
    },
    djScripts: [
      {
        ...base.djScripts[0],
        id: secondSegmentId,
        programId: secondProgramId,
        ttsAudioRef: null,
      },
    ],
    tracks: base.tracks,
    timeline: [
      {
        ...base.timeline[1],
        id: secondTimelineId,
        position: 0,
      },
    ],
  });
}

describe("S3-04 Programs and Playback persistence", () => {
  it("commits complete programs, restores history and isolates profiles", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "koradio-programs-playback-"));
    let database = await bootstrapDatabase({ dataRoot });
    const canonicalTrack = firstTrack(programDetailSchema.parse(programDetail));
    const tracks = createTrackReader([canonicalTrack]);

    database.client
      .prepare(
        `
          INSERT INTO profile (
            id, creation_idempotency_key, radio_name, nickname, avatar_ref,
            frequent_genres_json, default_scenario, created_at, updated_at
          )
          VALUES (?, ?, ?, 'Klein', NULL, '[]', '', ?, ?)
        `,
      )
      .run(
        ids.profile,
        "program-profile-001",
        "Night Signals",
        programDetail.program.createdAt,
        programDetail.program.createdAt,
      );
    database.client
      .prepare(
        `
          INSERT INTO profile (
            id, creation_idempotency_key, radio_name, nickname, avatar_ref,
            frequent_genres_json, default_scenario, created_at, updated_at
          )
          VALUES (?, ?, ?, 'Guest', NULL, '[]', '', ?, ?)
        `,
      )
      .run(
        secondProfileId,
        "program-profile-002",
        "Guest Signals",
        programDetail.program.createdAt,
        programDetail.program.createdAt,
      );
    database.client
      .prepare(
        `
          INSERT INTO music_track (
            id, source, source_track_id, title, artist, album, duration_ms,
            lyric_status, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        track.id,
        track.source,
        track.sourceTrackId,
        track.title,
        track.artist,
        track.album,
        track.durationMs,
        track.lyricStatus,
        programDetail.program.createdAt,
        programDetail.program.createdAt,
      );

    const playbackRepository = createPlaybackRepository(database.client);
    const timeline = createPlaybackTimelineService(playbackRepository);
    let programs = createProgramService({
      client: database.client,
      repository: createProgramRepository(database.client),
      timeline,
      tracks,
    });
    const committed = programs.commit(programDetailSchema.parse(programDetail));
    expect(committed).toEqual(programDetailSchema.parse(programDetail));
    expect(programs.hasProgram(ids.profile, ids.program)).toBe(true);
    expect(programs.hasProgram(secondProfileId, ids.program)).toBe(false);
    expect(() => programs.get(secondProfileId, ids.program)).toThrow(ProgramNotFoundError);

    database.close();
    database = await bootstrapDatabase({ dataRoot });
    const restoredPlaybackRepository = createPlaybackRepository(database.client);
    programs = createProgramService({
      client: database.client,
      repository: createProgramRepository(database.client),
      timeline: createPlaybackTimelineService(restoredPlaybackRepository),
      tracks,
    });
    expect(programs.get(ids.profile, ids.program)).toEqual(committed);
    expect(programs.list(ids.profile, undefined, 1)).toEqual({ items: [committed.program] });
    database.close();
  });

  it("rolls back partial program and checkpoint writes", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "koradio-programs-rollback-"));
    const database = await bootstrapDatabase({ dataRoot });
    const canonicalTrack = firstTrack(programDetailSchema.parse(programDetail));
    const tracks = createTrackReader([canonicalTrack]);
    database.client.exec(`
      INSERT INTO profile (
        id, creation_idempotency_key, radio_name, nickname, avatar_ref,
        frequent_genres_json, default_scenario, created_at, updated_at
      ) VALUES (
        '${ids.profile}', 'rollback-profile', 'Night Signals', 'Klein', NULL,
        '[]', '', '${programDetail.program.createdAt}', '${programDetail.program.createdAt}'
      );
      INSERT INTO music_track (
        id, source, source_track_id, title, artist, album, duration_ms,
        lyric_status, created_at, updated_at
      ) VALUES (
        '${track.id}', '${track.source}', '${track.sourceTrackId}', '${track.title}',
        '${track.artist}', '${track.album}', ${String(track.durationMs)}, '${track.lyricStatus}',
        '${programDetail.program.createdAt}', '${programDetail.program.createdAt}'
      );
      CREATE TRIGGER fail_program_timeline
      BEFORE INSERT ON playback_timeline_item
      BEGIN
        SELECT RAISE(ABORT, 'timeline failed');
      END;
    `);
    const playbackRepository = createPlaybackRepository(database.client);
    const timeline = createPlaybackTimelineService(playbackRepository);
    const programs = createProgramService({
      client: database.client,
      repository: createProgramRepository(database.client),
      timeline,
      tracks,
    });
    expect(() => programs.commit(programDetailSchema.parse(programDetail))).toThrow(
      ProgramWriteError,
    );
    expect(database.client.prepare("SELECT COUNT(*) AS count FROM program").get()).toEqual({
      count: 0,
    });
    expect(
      database.client.prepare("SELECT COUNT(*) AS count FROM dj_script_segment").get(),
    ).toEqual({ count: 0 });
    database.client.exec("DROP TRIGGER fail_program_timeline");

    const textOnly = programs.commit(makeTextOnlyProgram());
    expect(textOnly.timeline).toHaveLength(1);
    expect(textOnly.djScripts[0]?.ttsAudioRef).toBeNull();
    const checkpointService = createPlaybackCheckpointService({
      client: database.client,
      now: () => new Date("2026-07-17T03:00:00.000Z"),
      programs,
      repository: playbackRepository,
    });
    database.client.exec(`
      CREATE TRIGGER fail_program_completion
      BEFORE UPDATE ON program
      BEGIN
        SELECT RAISE(ABORT, 'completion failed');
      END;
    `);
    expect(() =>
      checkpointService.save(ids.profile, {
        profileId: ids.profile,
        programId: secondProgramId,
        timelineItemId: secondTimelineId,
        positionMs: track.durationMs,
        volume: 0.8,
        status: "completed",
        leaseEpoch: 1,
      }),
    ).toThrow(PlaybackWriteError);
    expect(checkpointService.get(ids.profile)).toBeNull();
    expect(programs.get(ids.profile, secondProgramId).program.status).toBe("ready");
    database.close();
  });

  it("fences stale checkpoints and completes only the final item", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "koradio-checkpoint-policy-"));
    const database = await bootstrapDatabase({ dataRoot });
    const base = programDetailSchema.parse(programDetail);
    database.client.exec(`
      INSERT INTO profile (
        id, creation_idempotency_key, radio_name, nickname, avatar_ref,
        frequent_genres_json, default_scenario, created_at, updated_at
      ) VALUES (
        '${ids.profile}', 'checkpoint-profile', 'Night Signals', 'Klein', NULL,
        '[]', '', '${base.program.createdAt}', '${base.program.createdAt}'
      );
      INSERT INTO music_track (
        id, source, source_track_id, title, artist, album, duration_ms,
        lyric_status, created_at, updated_at
      ) VALUES (
        '${track.id}', '${track.source}', '${track.sourceTrackId}', '${track.title}',
        '${track.artist}', '${track.album}', ${String(track.durationMs)}, '${track.lyricStatus}',
        '${base.program.createdAt}', '${base.program.createdAt}'
      );
    `);
    const playbackRepository = createPlaybackRepository(database.client);
    const programs = createProgramService({
      client: database.client,
      repository: createProgramRepository(database.client),
      timeline: createPlaybackTimelineService(playbackRepository),
      tracks: createTrackReader(base.tracks),
    });
    programs.commit(base);
    const checkpoints = createPlaybackCheckpointService({
      client: database.client,
      now: () => new Date("2026-07-17T03:00:00.000Z"),
      programs,
      repository: playbackRepository,
    });
    expect(
      checkpoints.save(ids.profile, {
        profileId: ids.profile,
        programId: ids.program,
        timelineItemId: ids.timelineTrack,
        positionMs: 1000,
        volume: 0.8,
        status: "paused",
        leaseEpoch: 5,
      }),
    ).toMatchObject({ status: "paused", positionMs: 1000 });
    expect(() =>
      checkpoints.save(ids.profile, {
        profileId: ids.profile,
        programId: ids.program,
        timelineItemId: ids.timelineTrack,
        positionMs: 2000,
        volume: 0.8,
        status: "playing",
        leaseEpoch: 4,
      }),
    ).toThrow(PlaybackPolicyError);
    expect(
      checkpoints.save(ids.profile, {
        profileId: ids.profile,
        programId: ids.program,
        timelineItemId: ids.timelineTrack,
        positionMs: track.durationMs,
        volume: 0.8,
        status: "completed",
        leaseEpoch: 6,
      }),
    ).toMatchObject({ status: "completed" });
    expect(programs.get(ids.profile, ids.program).program.status).toBe("completed");
    expect(
      database.client
        .prepare("SELECT lease_epoch FROM playback_checkpoint WHERE profile_id = ?")
        .get(ids.profile),
    ).toEqual({ lease_epoch: 6 });
    database.close();
  });
});
