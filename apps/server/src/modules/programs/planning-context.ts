import { codexPlanningContextSchema, type CodexPlanningContext } from "./providers.js";
import type { MusicTrack, ProgramListeningIntent } from "@koradio/contracts";
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

function minimumLibraryTrackCount(
  scenarioText: string,
  preferredCount: number,
  targetTrackCount: number,
): number {
  const normalized = scenarioText.toLocaleLowerCase("en-US");
  if (/(?:只探索|只要新歌|全部探索|only\s*(?:new|discovery|explore))/iu.test(normalized)) {
    return 0;
  }
  if (/(?:只听库内|只用库内|全部库内|only\s*library)/iu.test(normalized)) {
    return targetTrackCount;
  }
  return preferredCount;
}

export function createPlanningContext(
  dependencies: PlanningContextDependencies,
  profileId: string,
  scenarioText: string,
  targetTrackCount: number,
  listeningIntent: ProgramListeningIntent | null = null,
  prefetchedLibraryTracks?: MusicTrack[],
): CodexPlanningContext {
  const libraryTracks =
    prefetchedLibraryTracks ??
    dependencies.library.candidateTracks(profileId, planningLibraryCandidateLimit);
  const taste = dependencies.taste.get(profileId);
  const preferredLibraryTrackCount = Math.min(
    libraryTracks.length,
    Math.round(targetTrackCount * 0.7),
  );
  return codexPlanningContextSchema.parse({
    scenarioText,
    listeningIntent,
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
      preferredLibraryTrackCount,
      minimumLibraryTrackCount: Math.min(
        libraryTracks.length,
        minimumLibraryTrackCount(scenarioText, preferredLibraryTrackCount, targetTrackCount),
      ),
    },
    currentTime: dependencies.now().toISOString(),
    preferences: {
      djLanguage: dependencies.preferences.get(profileId).djLanguage,
      djVoiceStyle: dependencies.preferences.get(profileId).djVoiceStyle,
    },
  });
}
