import {
  effectiveTasteSchema,
  tasteProjectionSchema,
  type EffectiveTaste,
  type FeedbackEvent,
  type TasteOverrides,
  type TasteProjection,
} from "@koradio/contracts";

function stableUnique(values: readonly string[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const key = value.trim().toLocaleLowerCase("en-US");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
    if (result.length === limit) {
      break;
    }
  }

  return result;
}

function normalizedSet(values: readonly string[]): Set<string> {
  return new Set(values.map((value) => value.trim().toLocaleLowerCase("en-US")));
}

export function rebuildTasteProjection(
  profileId: string,
  feedbackEvents: readonly FeedbackEvent[],
  emptyUpdatedAt: string,
): TasteProjection {
  const ordered = [...feedbackEvents];
  const likedTracks = new Map<string, boolean>();
  const dislikedTracks = new Map<string, boolean>();
  const favoritedPrograms = new Map<string, boolean>();

  for (const event of ordered) {
    switch (event.type) {
      case "track_liked":
        likedTracks.set(event.targetId, true);
        break;
      case "track_like_removed":
        likedTracks.set(event.targetId, false);
        break;
      case "track_disliked":
        dislikedTracks.set(event.targetId, true);
        break;
      case "track_dislike_removed":
        dislikedTracks.set(event.targetId, false);
        break;
      case "program_favorited":
        favoritedPrograms.set(event.targetId, true);
        break;
      case "program_favorite_removed":
        favoritedPrograms.set(event.targetId, false);
        break;
      case "track_skipped":
        break;
    }
  }

  const affinities = [
    ...[...likedTracks.entries()]
      .filter(([, active]) => active)
      .map(([targetId]) => `track:${targetId}`),
    ...[...favoritedPrograms.entries()]
      .filter(([, active]) => active)
      .map(([targetId]) => `program:${targetId}`),
  ].sort();
  const avoidSignals = [...dislikedTracks.entries()]
    .filter(([, active]) => active)
    .map(([targetId]) => `track:${targetId}`)
    .sort();

  return tasteProjectionSchema.parse({
    profileId,
    tags: [],
    affinities,
    avoidSignals,
    sourceVersion: ordered.length,
    updatedAt: ordered.at(-1)?.createdAt ?? emptyUpdatedAt,
  });
}

export function mergeEffectiveTaste(
  projection: TasteProjection,
  overrides: TasteOverrides,
  overrideVersion: number,
): EffectiveTaste {
  const manualAvoidRules = stableUnique(overrides.avoidRules, 20);
  const manualTags = stableUnique(overrides.tags, 100);
  const manualAvoidKeys = normalizedSet(manualAvoidRules);
  const automaticTags = projection.tags.filter(
    (tag) => !manualAvoidKeys.has(tag.trim().toLocaleLowerCase("en-US")),
  );
  const automaticAffinities = projection.affinities.filter(
    (affinity) => !manualAvoidKeys.has(affinity.trim().toLocaleLowerCase("en-US")),
  );

  return effectiveTasteSchema.parse({
    profileId: projection.profileId,
    projectionVersion: projection.sourceVersion,
    overrideVersion,
    resolvedTaste: {
      tags: stableUnique([...manualTags, ...automaticTags], 100),
      affinities: stableUnique(automaticAffinities, 100),
      avoidRules: stableUnique([...manualAvoidRules, ...projection.avoidSignals], 20),
      sceneRules: stableUnique(overrides.sceneRules, 20),
    },
  });
}
