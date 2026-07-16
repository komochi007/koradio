import {
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
  playbackCheckpointSchema,
  playbackTimelineItemSchema,
  profileListResponseSchema,
  profileAvatarUploadResponseSchema,
  profileContextSchema,
  profilePreferencesSchema,
  profileSchema,
  programDetailSchema,
  programListResponseSchema,
  programSchema,
  savePlaybackCheckpointCommandSchema,
  tasteOverridesSchema,
  tasteProjectionSchema,
  tasteResponseSchema,
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
        playlistSourceId: "playlist-123",
      }),
    ).toMatchObject({ track });
    expect(musicSearchCommandSchema.parse({ keyword: "Space Song" })).toEqual({
      keyword: "Space Song",
    });
    expect(musicSearchResponseSchema.parse({ items: [track] }).items).toHaveLength(1);
    expect(importPlaylistCommandSchema.parse({ playlistRef: "123456" })).toEqual({
      playlistRef: "123456",
    });
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
  });

  it("accepts program, script, timeline and checkpoint DTOs", () => {
    expect(programSchema.parse(program)).toEqual(program);
    expect(djScriptSegmentSchema.parse(djScript)).toEqual(djScript);
    expect(playbackTimelineItemSchema.parse(djTimelineItem)).toEqual(djTimelineItem);
    expect(playbackTimelineItemSchema.parse(trackTimelineItem)).toEqual(trackTimelineItem);
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
      }),
    ).toMatchObject({ status: "paused" });
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
