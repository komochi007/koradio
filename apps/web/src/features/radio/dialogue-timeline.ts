import type { DjScriptSegment, RadioTurn } from "@koradio/contracts";

export type DialogueTimelineEntry =
  | { kind: "turn"; occurredAt: string; turn: RadioTurn }
  | { kind: "script"; occurredAt: string; script: DjScriptSegment };

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

export function buildDialogueTimeline(
  conversation: RadioTurn[],
  scripts: Array<{ occurredAt: string; script: DjScriptSegment }>,
): DialogueTimelineEntry[] {
  return [
    ...conversation.map((turn): DialogueTimelineEntry => ({
      kind: "turn",
      occurredAt: turn.createdAt,
      turn,
    })),
    ...scripts.map(({ occurredAt, script }): DialogueTimelineEntry => ({
      kind: "script",
      occurredAt,
      script,
    })),
  ].sort((left, right) => {
    const difference = timestamp(left.occurredAt) - timestamp(right.occurredAt);
    if (difference !== 0) return difference;
    return left.kind === "turn" ? -1 : 1;
  });
}
