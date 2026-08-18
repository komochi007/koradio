export const menuBarCommands = ["previous", "toggle", "next"] as const;

export type MenuBarCommand = (typeof menuBarCommands)[number];

export interface MenuBarPlayback {
  artist: string | undefined;
  canNext: boolean;
  canPrevious: boolean;
  canToggle: boolean;
  state: "idle" | "ready" | "playing" | "paused" | "buffering" | "completed" | "failed";
  title: string | undefined;
}

const playbackStates = new Set<MenuBarPlayback["state"]>([
  "idle",
  "ready",
  "playing",
  "paused",
  "buffering",
  "completed",
  "failed",
]);

export const emptyMenuBarPlayback: MenuBarPlayback = {
  artist: undefined,
  canNext: false,
  canPrevious: false,
  canToggle: false,
  state: "idle",
  title: undefined,
};

function boundedText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim().slice(0, 160);
  return text.length === 0 ? undefined : text;
}

export function parseMenuBarPlayback(value: unknown): MenuBarPlayback {
  if (typeof value !== "object" || value === null) return emptyMenuBarPlayback;
  const candidate = value as Record<string, unknown>;
  return {
    artist: boundedText(candidate.artist),
    canNext: candidate.canNext === true,
    canPrevious: candidate.canPrevious === true,
    canToggle: candidate.canToggle === true,
    state: playbackStates.has(candidate.state as MenuBarPlayback["state"])
      ? (candidate.state as MenuBarPlayback["state"])
      : "idle",
    title: boundedText(candidate.title),
  };
}

export function menuBarStatus(playback: MenuBarPlayback): string {
  if (playback.state === "playing") return "● ON AIR";
  if (playback.state === "buffering") return "正在缓冲";
  if (playback.state === "paused") return "已暂停";
  if (playback.state === "failed") return "播放错误";
  return "暂无正在播放";
}
