import { codexPlanningContextSchema, type CodexPlanningContext } from "./providers.js";
import type { MusicTrack, ProgramListeningIntent } from "@koradio/contracts";
import type { ProfilePreferencesService } from "../profile-preferences/index.js";
import type { TasteService } from "../taste/index.js";
import type { ProgramService } from "./service.js";
import { isPotentiallyEligibleTrack } from "./track-eligibility.js";

export interface PlanningContextDependencies {
  library: {
    candidateTracks(profileId: string, limit: number): MusicTrack[];
    getTracks?(trackIds: string[]): MusicTrack[];
  };
  now(): Date;
  preferences: Pick<ProfilePreferencesService, "get">;
  programs: Pick<ProgramService, "list">;
  taste: Pick<TasteService, "get">;
}

const planningLibraryCandidateLimit = 1_000;

function sourceTrackCounts(
  scenarioText: string,
  targetTrackCount: number,
  listeningIntent: ProgramListeningIntent | null,
  libraryTracks: MusicTrack[],
): { library: number; discovery: number } {
  const sourceMode = listeningIntent?.sourceMode ?? "balanced";
  const requestedLibrary =
    sourceMode === "library-only"
      ? targetTrackCount
      : sourceMode === "discovery-only"
        ? 0
        : Math.floor(targetTrackCount / 2);
  const eligibleLibraryCount = libraryTracks.filter((track) =>
    isPotentiallyEligibleTrack(track, listeningIntent, scenarioText),
  ).length;
  const library = Math.min(requestedLibrary, eligibleLibraryCount);
  return {
    library,
    discovery: sourceMode === "library-only" ? 0 : targetTrackCount - library,
  };
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
  const sourceCounts = sourceTrackCounts(
    scenarioText,
    targetTrackCount,
    listeningIntent,
    libraryTracks,
  );
  const history = dependencies.programs.list(profileId, undefined, 20).items;
  const historicalTrackIds = [...new Set(history.flatMap((program) => program.trackIds))];
  const historicalTracks = dependencies.library.getTracks?.(historicalTrackIds) ?? [];
  const historicalTracksById = new Map(historicalTracks.map((track) => [track.id, track]));
  return codexPlanningContextSchema.parse({
    scenarioText,
    listeningIntent,
    effectiveTaste: taste.effective,
    tasteBlueprint: taste.blueprint,
    history: history.map((program) => ({
      title: program.title,
      scenarioText: program.scenarioText,
      createdAt: program.createdAt,
      trackIds: program.trackIds,
      tracks: program.trackIds.flatMap((trackId) => {
        const track = historicalTracksById.get(trackId);
        return track === undefined ? [] : [{ trackId, title: track.title, artist: track.artist }];
      }),
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
      preferredLibraryTrackCount: sourceCounts.library,
      minimumLibraryTrackCount: sourceCounts.library,
      requiredDiscoveryTrackCount: sourceCounts.discovery,
    },
    currentTime: dependencies.now().toISOString(),
    preferences: {
      djLanguage: dependencies.preferences.get(profileId).djLanguage,
      djVoiceStyle: dependencies.preferences.get(profileId).djVoiceStyle,
    },
  });
}
