import {
  audioResolutionRequestSchema,
  createLibraryItemRequestSchema,
  createDataRootMigrationRequestSchema,
  createFeedbackRequestSchema,
  createProfileRequestSchema,
  generateProgramRequestSchema,
  importPlaylistRequestSchema,
  libraryListRequestSchema,
  musicSearchRequestSchema,
  playlistImportSnapshotRequestSchema,
  playbackSnapshotRequestSchema,
  programDetailRequestSchema,
  programGenerationSnapshotRequestSchema,
  programListRequestSchema,
  savePlaybackCheckpointRequestSchema,
  selectCurrentProfileRequestSchema,
  trackLyricsRequestSchema,
  updateDeviceSettingsRequestSchema,
  updateProfilePreferencesRequestSchema,
  updateProfileRequestSchema,
  updateTasteOverridesRequestSchema,
} from "../../packages/contracts/src/index.js";
import { describe, expect, it } from "vitest";

import { ids } from "./v1-contract-fixtures.js";

const headers = { "idempotency-key": "request-001" };
const params = { profileId: ids.profile };

describe("v1 REST request contracts", () => {
  it("accepts profile-owned route params and idempotent create commands", () => {
    expect(
      createProfileRequestSchema.parse({
        headers,
        body: { radioName: "Night Signals", nickname: "Klein" },
      }),
    ).toMatchObject({ headers });
    expect(
      generateProgramRequestSchema.parse({
        params,
        headers,
        body: { scenarioText: "夜晚写作" },
      }),
    ).toMatchObject({ params, headers });
    expect(
      importPlaylistRequestSchema.parse({
        params,
        headers,
        body: { playlistRef: "123456" },
      }),
    ).toMatchObject({ params, headers });
    expect(
      createLibraryItemRequestSchema.parse({
        params,
        headers,
        body: { trackId: ids.track },
      }),
    ).toMatchObject({ params, headers });
    expect(
      createFeedbackRequestSchema.parse({
        params,
        headers,
        body: { type: "track_liked", targetId: ids.track },
      }),
    ).toMatchObject({ params, headers });
    expect(
      createDataRootMigrationRequestSchema.parse({
        headers,
        body: { targetDataRoot: "/Volumes/Music/Koradio" },
      }),
    ).toMatchObject({ headers });
  });

  it("rejects create commands without Idempotency-Key", () => {
    expect(
      createProfileRequestSchema.safeParse({
        body: { radioName: "Night Signals", nickname: "Klein" },
      }).success,
    ).toBe(false);
    expect(
      generateProgramRequestSchema.safeParse({
        params,
        body: { scenarioText: "夜晚写作" },
      }).success,
    ).toBe(false);
    expect(
      importPlaylistRequestSchema.safeParse({
        params,
        body: { playlistRef: "123456" },
      }).success,
    ).toBe(false);
    expect(
      createLibraryItemRequestSchema.safeParse({
        params,
        body: { trackId: ids.track },
      }).success,
    ).toBe(false);
    expect(
      createFeedbackRequestSchema.safeParse({
        params,
        body: { type: "track_liked", targetId: ids.track },
      }).success,
    ).toBe(false);
    expect(
      createDataRootMigrationRequestSchema.safeParse({
        body: { targetDataRoot: "/Volumes/Music/Koradio" },
      }).success,
    ).toBe(false);
  });

  it("accepts profile updates, preferences, taste and playback commands", () => {
    expect(
      updateProfileRequestSchema.parse({
        params,
        body: { nickname: "Blue" },
      }),
    ).toMatchObject({ params });
    expect(
      updateProfilePreferencesRequestSchema.parse({
        params,
        body: { djLanguage: "en-GB" },
      }),
    ).toMatchObject({ params });
    expect(
      updateTasteOverridesRequestSchema.parse({
        params,
        body: { tags: [], avoidRules: [], sceneRules: [] },
      }),
    ).toMatchObject({ params });
    expect(
      savePlaybackCheckpointRequestSchema.parse({
        params,
        body: {
          profileId: ids.profile,
          programId: ids.program,
          timelineItemId: ids.timelineTrack,
          positionMs: 1000,
          volume: 0.5,
          status: "paused",
          leaseEpoch: 2,
        },
      }),
    ).toMatchObject({ params });
    expect(
      selectCurrentProfileRequestSchema.parse({
        body: { profileId: ids.profile },
      }),
    ).toEqual({
      body: { profileId: ids.profile },
    });
  });

  it("rejects missing or implicit profile ownership", () => {
    expect(updateProfileRequestSchema.safeParse({ body: { nickname: "Blue" } }).success).toBe(
      false,
    );
    expect(
      updateProfilePreferencesRequestSchema.safeParse({
        params: { profileId: "current" },
        body: { themeMode: "dark" },
      }).success,
    ).toBe(false);
    expect(
      selectCurrentProfileRequestSchema.safeParse({
        body: { profileId: "current" },
      }).success,
    ).toBe(false);
    expect(
      updateTasteOverridesRequestSchema.safeParse({
        body: { tags: [], avoidRules: [], sceneRules: [] },
      }).success,
    ).toBe(false);
    expect(
      savePlaybackCheckpointRequestSchema.safeParse({
        params,
        body: {
          programId: ids.program,
          timelineItemId: ids.timelineTrack,
          positionMs: 1000,
          volume: 0.5,
          status: "paused",
        },
      }).success,
    ).toBe(false);
  });

  it("accepts profile-owned reads, searches and device settings updates", () => {
    expect(
      programDetailRequestSchema.parse({
        params: { profileId: ids.profile, programId: ids.program },
      }),
    ).toMatchObject({ params: { profileId: ids.profile } });
    expect(programListRequestSchema.parse({ params, query: { limit: "20" } }).query.limit).toBe(20);
    expect(playbackSnapshotRequestSchema.parse({ params })).toEqual({ params });
    expect(
      programGenerationSnapshotRequestSchema.parse({
        params: { profileId: ids.profile, jobId: ids.job },
      }),
    ).toMatchObject({ params: { jobId: ids.job } });
    expect(
      musicSearchRequestSchema.parse({
        params,
        body: { keyword: "Space Song" },
      }),
    ).toMatchObject({ params });
    expect(libraryListRequestSchema.parse({ params, query: { limit: "20" } }).query.limit).toBe(20);
    expect(
      playlistImportSnapshotRequestSchema.parse({
        params: { profileId: ids.profile, jobId: ids.job },
      }),
    ).toMatchObject({ params: { jobId: ids.job } });
    expect(
      trackLyricsRequestSchema.parse({
        params: { profileId: ids.profile, trackId: ids.track },
      }),
    ).toMatchObject({ params: { trackId: ids.track } });
    expect(
      audioResolutionRequestSchema.parse({
        params: { profileId: ids.profile, trackId: ids.track },
      }),
    ).toMatchObject({ params: { trackId: ids.track } });
    expect(
      updateDeviceSettingsRequestSchema.parse({
        body: { codexCommand: "codex" },
      }),
    ).toEqual({ body: { codexCommand: "codex" } });
  });

  it("rejects unknown request fields and invalid resource IDs", () => {
    expect(
      programDetailRequestSchema.safeParse({
        params: { profileId: ids.profile, programId: "latest" },
      }).success,
    ).toBe(false);
    expect(
      programGenerationSnapshotRequestSchema.safeParse({
        params: { profileId: ids.profile, jobId: "current" },
      }).success,
    ).toBe(false);
    expect(
      musicSearchRequestSchema.safeParse({
        params,
        body: { keyword: "Space Song", provider: "netease" },
      }).success,
    ).toBe(false);
    expect(
      libraryListRequestSchema.safeParse({
        params,
        query: { limit: "101" },
      }).success,
    ).toBe(false);
    expect(
      updateDeviceSettingsRequestSchema.safeParse({
        body: { codexCommand: "codex" },
        headers,
      }).success,
    ).toBe(false);
  });
});
