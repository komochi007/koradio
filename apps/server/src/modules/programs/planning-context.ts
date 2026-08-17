import { codexPlanningContextSchema, type CodexPlanningContext } from "./providers.js";
import type { MusicTrack } from "@koradio/contracts";
import type { ProfilePreferencesService } from "../profile-preferences/index.js";
import type { TasteService } from "../taste/index.js";
import type { ProgramService } from "./service.js";

export interface PlanningContextDependencies {
  library: { candidateTracks(profileId: string, limit: number): MusicTrack[] };
  now(): Date;
  preferences: Pick<ProfilePreferencesService, "get">;
  programs: Pick<ProgramService, "list">;
  taste: Pick<TasteService, "get">;
}

const planningLibraryCandidateLimit = 1_000;

export function createPlanningContext(
  dependencies: PlanningContextDependencies,
  profileId: string,
  scenarioText: string,
  targetTrackCount: number,
): CodexPlanningContext {
  const libraryTracks = dependencies.library.candidateTracks(
    profileId,
    planningLibraryCandidateLimit,
  );
  const taste = dependencies.taste.get(profileId);
  return codexPlanningContextSchema.parse({
    scenarioText,
    effectiveTaste: taste.effective,
    tasteBlueprint: taste.blueprint,
    history: dependencies.programs.list(profileId, undefined, 20).items.map((program) => ({
      title: program.title,
      scenarioText: program.scenarioText,
      createdAt: program.createdAt,
      trackIds: program.trackIds,
    })),
    library: {
      tracks: libraryTracks.map((track) => ({
        trackId: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        durationMs: track.durationMs,
      })),
      maximumTracks: targetTrackCount,
      preferredLibraryTrackCount: Math.min(
        libraryTracks.length,
        Math.round(targetTrackCount * 0.7),
      ),
    },
    currentTime: dependencies.now().toISOString(),
    preferences: {
      djLanguage: dependencies.preferences.get(profileId).djLanguage,
      djVoiceStyle: dependencies.preferences.get(profileId).djVoiceStyle,
    },
  });
}
