import {
  addLibraryItemCommandSchema,
  audioResolutionSchema,
  avatarRefSchema,
  createDataRootMigrationCommandSchema,
  createFeedbackCommandSchema,
  createProfileCommandSchema,
  currentProfileResponseSchema,
  dataRootMigrationSnapshotSchema,
  deviceSettingsSchema,
  djScriptSegmentSchema,
  effectiveTasteSchema,
  feedbackEventSchema,
  generateProgramCommandSchema,
  importPlaylistCommandSchema,
  libraryItemSchema,
  libraryListResponseSchema,
  musicSearchCommandSchema,
  musicSearchResponseSchema,
  musicTrackSchema,
  playlistImportSnapshotSchema,
  playlistSourceSchema,
  playbackCheckpointSchema,
  playbackTimelineItemSchema,
  playableAudioRefSchema,
  profileListResponseSchema,
  profileAvatarUploadResponseSchema,
  profileContextSchema,
  profilePreferencesSchema,
  profileSchema,
  programDetailSchema,
  programGenerationSnapshotSchema,
  programListResponseSchema,
  programSchema,
  savePlaybackCheckpointCommandSchema,
  tasteOverridesSchema,
  tasteProjectionSchema,
  tasteResponseSchema,
  trackLyricsSchema,
  updateDeviceSettingsCommandSchema,
  updateProfileCommandSchema,
  updateProfilePreferencesCommandSchema,
  updateTasteOverridesCommandSchema,
} from "../../packages/contracts/src/index.js";
import { describe, expect, it } from "vitest";

import {
  checkpoint,
  djScript,
  djTimelineItem,
  feedback,
  ids,
  now,
  preferences,
  profile,
  program,
  programDetail,
  track,
  trackTimelineItem,
} from "./v1-contract-fixtures.js";

describe("v1 resource and command contracts", () => {
  it("accepts profile DTOs and create/update commands", () => {
    expect(profileSchema.parse(profile)).toEqual(profile);
    expect(profileListResponseSchema.parse({ items: [profile] }).items).toHaveLength(1);
    expect(
      createProfileCommandSchema.parse({
        radioName: "Night Signals",
        nickname: "Klein",
        frequentGenres: ["ambient"],
      }),
    ).toMatchObject({ radioName: "Night Signals" });
    expect(updateProfileCommandSchema.parse({ avatarRef: null })).toEqual({ avatarRef: null });
    expect(avatarRefSchema.parse("avatars/profile/avatar.webp")).toBe(
      "avatars/profile/avatar.webp",
    );
    expect(profileAvatarUploadResponseSchema.parse({ avatarRef: profile.avatarRef })).toEqual({
      avatarRef: profile.avatarRef,
    });
    const context = profileContextSchema.parse({
      profile,
      preferences,
    });
    expect(currentProfileResponseSchema.parse({ current: context }).current?.profile.id).toBe(
      profile.id,
    );
    expect(currentProfileResponseSchema.parse({ current: null })).toEqual({ current: null });
  });

  it("rejects invalid or empty profile commands and uncontrolled avatars", () => {
    expect(
      createProfileCommandSchema.safeParse({ radioName: " ", nickname: "Klein" }).success,
    ).toBe(false);
    expect(updateProfileCommandSchema.safeParse({}).success).toBe(false);
    expect(
      updateProfileCommandSchema.safeParse({ avatarRef: "https://example.com/avatar.png" }).success,
    ).toBe(false);
    expect(updateProfileCommandSchema.safeParse({ avatarRef: "media/avatar.png" }).success).toBe(
      false,
    );
    expect(profileListResponseSchema.safeParse({ items: [profile], total: 1 }).success).toBe(false);
  });

  it("accepts profile preferences and rejects empty updates", () => {
    expect(profilePreferencesSchema.parse(preferences)).toEqual(preferences);
    expect(updateProfilePreferencesCommandSchema.parse({ themeMode: "light" })).toEqual({
      themeMode: "light",
    });
    expect(updateProfilePreferencesCommandSchema.safeParse({}).success).toBe(false);
    expect(updateProfilePreferencesCommandSchema.safeParse({ djLanguage: "en-US" }).success).toBe(
      false,
    );
  });

  it("accepts projection, overrides and effective taste DTOs", () => {
    const projection = {
      profileId: ids.profile,
      tags: ["dream pop"],
      affinities: ["soft vocals"],
      avoidSignals: ["harsh treble"],
      sourceVersion: 3,
      updatedAt: now,
    };
    const overrides = {
      profileId: ids.profile,
      tags: ["late night"],
      avoidRules: ["避免高亢人声"],
      sceneRules: ["写作时降低鼓点强度"],
      updatedAt: now,
    };
    const effective = {
      profileId: ids.profile,
      projectionVersion: 3,
      overrideVersion: 2,
      resolvedTaste: {
        tags: ["dream pop", "late night"],
        affinities: ["soft vocals"],
        avoidRules: ["避免高亢人声"],
        sceneRules: ["写作时降低鼓点强度"],
      },
    };

    expect(tasteProjectionSchema.parse(projection)).toEqual(projection);
    expect(tasteOverridesSchema.parse(overrides)).toEqual(overrides);
    expect(effectiveTasteSchema.parse(effective)).toEqual(effective);
    expect(tasteResponseSchema.parse({ projection, overrides, effective })).toEqual({
      projection,
      overrides,
      effective,
    });
    expect(
      updateTasteOverridesCommandSchema.parse({
        tags: ["late night"],
        avoidRules: [],
        sceneRules: [],
      }),
    ).toMatchObject({ tags: ["late night"] });
  });

  it("rejects invalid taste limits and blank rules", () => {
    expect(
      tasteProjectionSchema.safeParse({
        profileId: ids.profile,
        tags: [],
        affinities: [],
        avoidSignals: [],
        sourceVersion: -1,
        updatedAt: now,
      }).success,
    ).toBe(false);
    expect(
      updateTasteOverridesCommandSchema.safeParse({
        tags: [],
        avoidRules: [" "],
        sceneRules: [],
      }).success,
    ).toBe(false);
  });

  it("accepts normalized music and library DTOs", () => {
    expect(musicTrackSchema.parse(track)).toEqual(track);
    expect(
      libraryItemSchema.parse({
        track,
        addedAt: now,
        playlistSourceId: ids.playlistSource,
      }),
    ).toMatchObject({ track });
    expect(musicSearchCommandSchema.parse({ keyword: "Space Song" })).toEqual({
      keyword: "Space Song",
    });
    expect(musicSearchResponseSchema.parse({ items: [track] }).items).toHaveLength(1);
    expect(importPlaylistCommandSchema.parse({ playlistRef: "123456" })).toEqual({
      playlistRef: "123456",
    });
    expect(addLibraryItemCommandSchema.parse({ trackId: ids.track })).toEqual({
      trackId: ids.track,
    });
    const playlistSource = {
      id: ids.playlistSource,
      source: "netease",
      sourcePlaylistId: "123456",
      title: "Night Playlist",
      importedAt: now,
      availableTrackCount: 1,
      unavailableTrackCount: 2,
    } as const;
    expect(playlistSourceSchema.parse(playlistSource)).toEqual(playlistSource);
    expect(
      playlistImportSnapshotSchema.parse({
        jobId: ids.job,
        profileId: ids.profile,
        status: "succeeded",
        playlistRef: "123456",
        progress: { total: 3, processed: 3, imported: 1, unavailable: 2 },
        playlistSource,
        createdAt: now,
        updatedAt: now,
      }).playlistSource,
    ).toEqual(playlistSource);
    expect(
      trackLyricsSchema.parse({
        trackId: ids.track,
        status: "available",
        content: "[00:00.00]Night",
      }).status,
    ).toBe("available");
    expect(
      trackLyricsSchema.parse({
        trackId: ids.trackTwo,
        status: "unavailable",
        content: null,
      }).content,
    ).toBeNull();
    expect(
      audioResolutionSchema.parse({
        trackId: ids.track,
        resolvedAudioRef: "https://media.example.com/song.m4a",
        expiresAt: now,
      }).trackId,
    ).toBe(ids.track);
    expect(
      libraryListResponseSchema.parse({
        items: [{ track, addedAt: now, playlistSourceId: null }],
      }).items,
    ).toHaveLength(1);
  });

  it("rejects provider fields, invalid music and blank library commands", () => {
    expect(musicTrackSchema.safeParse({ ...track, playUrl: "https://provider/url" }).success).toBe(
      false,
    );
    expect(musicTrackSchema.safeParse({ ...track, durationMs: 0 }).success).toBe(false);
    expect(musicSearchCommandSchema.safeParse({ keyword: " " }).success).toBe(false);
    expect(importPlaylistCommandSchema.safeParse({ playlistRef: "" }).success).toBe(false);
    expect(addLibraryItemCommandSchema.safeParse({ trackId: "current" }).success).toBe(false);
    expect(
      trackLyricsSchema.safeParse({
        trackId: ids.track,
        status: "unavailable",
        content: "unexpected",
      }).success,
    ).toBe(false);
    expect(
      audioResolutionSchema.safeParse({
        trackId: ids.track,
        resolvedAudioRef: "http://media.example.com/song.m4a",
        expiresAt: now,
      }).success,
    ).toBe(false);
  });

  it("accepts program, script, timeline and checkpoint DTOs", () => {
    expect(programSchema.parse(program)).toEqual(program);
    expect(djScriptSegmentSchema.parse(djScript)).toEqual(djScript);
    expect(playbackTimelineItemSchema.parse(djTimelineItem)).toEqual(djTimelineItem);
    expect(playbackTimelineItemSchema.parse(trackTimelineItem)).toEqual(trackTimelineItem);
    expect(
      playbackTimelineItemSchema.parse({
        ...trackTimelineItem,
        resolvedAudioRef: "https://media.example.com/temporary/space-song.m4a",
      }),
    ).toMatchObject({
      kind: "track",
      resolvedAudioRef: "https://media.example.com/temporary/space-song.m4a",
    });
    expect(playableAudioRefSchema.parse("tts/program/intro.aiff")).toBe("tts/program/intro.aiff");
    expect(programDetailSchema.parse(programDetail)).toEqual(programDetail);
    expect(programListResponseSchema.parse({ items: [program] }).items).toHaveLength(1);
    expect(generateProgramCommandSchema.parse({ scenarioText: "夜晚写作" })).toEqual({
      scenarioText: "夜晚写作",
    });
    expect(playbackCheckpointSchema.parse(checkpoint)).toEqual(checkpoint);
    expect(
      savePlaybackCheckpointCommandSchema.parse({
        profileId: ids.profile,
        programId: ids.program,
        timelineItemId: ids.timelineTrack,
        positionMs: 1000,
        volume: 1,
        status: "paused",
        leaseEpoch: 2,
      }),
    ).toMatchObject({ status: "paused", leaseEpoch: 2 });
  });

  it("accepts recoverable generation snapshots and enforces terminal consistency", () => {
    expect(
      programGenerationSnapshotSchema.parse({
        jobId: ids.job,
        profileId: ids.profile,
        status: "queued",
        stage: "queued",
        sequence: 0,
        createdAt: now,
        updatedAt: now,
      }).status,
    ).toBe("queued");
    expect(
      programGenerationSnapshotSchema.parse({
        jobId: ids.job,
        profileId: ids.profile,
        status: "running",
        stage: "resolving_tracks",
        sequence: 2,
        createdAt: now,
        updatedAt: now,
      }).sequence,
    ).toBe(2);
    expect(
      programGenerationSnapshotSchema.parse({
        jobId: ids.job,
        profileId: ids.profile,
        status: "succeeded",
        stage: "completed",
        sequence: 4,
        programId: ids.program,
        createdAt: now,
        updatedAt: now,
      }).programId,
    ).toBe(ids.program);
    expect(
      programGenerationSnapshotSchema.safeParse({
        jobId: ids.job,
        profileId: ids.profile,
        status: "succeeded",
        stage: "committing",
        sequence: 3,
        createdAt: now,
        updatedAt: now,
      }).success,
    ).toBe(false);
    expect(
      programGenerationSnapshotSchema.safeParse({
        jobId: ids.job,
        profileId: ids.profile,
        status: "succeeded",
        stage: "completed",
        sequence: 3,
        createdAt: now,
        updatedAt: now,
      }).success,
    ).toBe(false);
    expect(
      programGenerationSnapshotSchema.safeParse({
        jobId: ids.job,
        profileId: ids.profile,
        status: "failed",
        stage: "planning",
        sequence: 0,
        programId: ids.program,
        createdAt: now,
        updatedAt: now,
        errorCode: "PROGRAM_GENERATION_FAILED",
      }).success,
    ).toBe(false);
    expect(
      programGenerationSnapshotSchema.safeParse({
        jobId: ids.job,
        profileId: ids.profile,
        status: "queued",
        stage: "planning",
        sequence: 0,
        createdAt: now,
        updatedAt: now,
      }).success,
    ).toBe(false);
  });

  it("rejects empty programs, text-only DJ timeline items and invalid checkpoints", () => {
    expect(programSchema.safeParse({ ...program, trackIds: [] }).success).toBe(false);
    expect(generateProgramCommandSchema.safeParse({ scenarioText: " " }).success).toBe(false);
    expect(
      playbackTimelineItemSchema.safeParse({
        id: ids.timelineDj,
        kind: "dj",
        position: 0,
        segmentId: ids.segment,
        durationMs: 12000,
      }).success,
    ).toBe(false);
    expect(playbackCheckpointSchema.safeParse({ ...checkpoint, volume: 2 }).success).toBe(false);
    expect(
      savePlaybackCheckpointCommandSchema.safeParse({
        profileId: checkpoint.profileId,
        programId: checkpoint.programId,
        timelineItemId: checkpoint.timelineItemId,
        positionMs: checkpoint.positionMs,
        volume: checkpoint.volume,
        status: checkpoint.status,
        leaseEpoch: -1,
      }).success,
    ).toBe(false);
  });

  it("accepts track and program feedback while preserving append-only identity", () => {
    expect(
      createFeedbackCommandSchema.parse({ type: "track_skipped", targetId: ids.track }),
    ).toEqual({ type: "track_skipped", targetId: ids.track });
    expect(
      createFeedbackCommandSchema.parse({
        type: "program_favorited",
        targetId: ids.program,
      }),
    ).toEqual({ type: "program_favorited", targetId: ids.program });
    expect(feedbackEventSchema.parse(feedback)).toEqual(feedback);
  });

  it("rejects unsupported feedback types and invalid targets", () => {
    expect(
      createFeedbackCommandSchema.safeParse({ type: "track_shared", targetId: ids.track }).success,
    ).toBe(false);
    expect(
      createFeedbackCommandSchema.safeParse({
        type: "program_favorited",
        targetId: "current",
      }).success,
    ).toBe(false);
  });

  it("accepts safe device settings and migration snapshots", () => {
    expect(
      deviceSettingsSchema.parse({
        dataRoot: "/Users/example/Library/Application Support/Koradio",
        codexCommand: "/usr/local/bin/codex",
        updatedAt: now,
      }),
    ).toMatchObject({ codexCommand: "/usr/local/bin/codex" });
    expect(
      deviceSettingsSchema.parse({
        dataRoot: "/Users/example/Library/Application Support/Koradio",
        codexCommand: null,
        updatedAt: now,
      }),
    ).toMatchObject({ codexCommand: null });
    expect(updateDeviceSettingsCommandSchema.parse({ codexCommand: "codex" })).toEqual({
      codexCommand: "codex",
    });
    expect(
      createDataRootMigrationCommandSchema.parse({
        targetDataRoot: "/Volumes/Music/Koradio",
      }),
    ).toEqual({ targetDataRoot: "/Volumes/Music/Koradio" });
    expect(
      dataRootMigrationSnapshotSchema.parse({
        jobId: ids.job,
        stage: "rolling_back",
        status: "rolled_back",
        errorCode: "COPY_VERIFICATION_FAILED",
        updatedAt: now,
      }),
    ).toMatchObject({ status: "rolled_back" });
  });

  it("rejects secrets, empty device updates and invalid migration states", () => {
    expect(updateDeviceSettingsCommandSchema.safeParse({}).success).toBe(false);
    expect(
      updateDeviceSettingsCommandSchema.safeParse({
        codexCommand: "codex",
        neteaseCookie: "secret",
      }).success,
    ).toBe(false);
    expect(
      dataRootMigrationSnapshotSchema.safeParse({
        jobId: ids.job,
        stage: "deleting_old_data",
        status: "running",
        updatedAt: now,
      }).success,
    ).toBe(false);
  });
});
