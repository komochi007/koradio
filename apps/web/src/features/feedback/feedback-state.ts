import type { CreateFeedbackCommand, TasteResponse } from "@koradio/contracts";

export type ToggleFeedbackKind = "track_like" | "track_dislike" | "program_favorite";

export function feedbackStateKey(kind: ToggleFeedbackKind, targetId: string): string {
  return `${kind}:${targetId}`;
}

export function isFeedbackActive(
  taste: TasteResponse | undefined,
  kind: ToggleFeedbackKind,
  targetId: string,
): boolean {
  if (taste === undefined) return false;
  const stableTarget = `${kind === "program_favorite" ? "program" : "track"}:${targetId}`;
  return kind === "track_dislike"
    ? taste.projection.avoidSignals.includes(stableTarget)
    : taste.projection.affinities.includes(stableTarget);
}

export function toggleFeedbackCommand(
  kind: ToggleFeedbackKind,
  targetId: string,
  active: boolean,
): CreateFeedbackCommand {
  if (kind === "track_like") {
    return { type: active ? "track_like_removed" : "track_liked", targetId };
  }
  if (kind === "track_dislike") {
    return { type: active ? "track_dislike_removed" : "track_disliked", targetId };
  }
  return { type: active ? "program_favorite_removed" : "program_favorited", targetId };
}
