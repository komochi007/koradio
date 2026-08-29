// @vitest-environment jsdom

import type { DailyMixDetail, DailyMixTodayResponse } from "@koradio/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AudioEngineFacade, AudioEngineSnapshot } from "../../apps/web/src/audio/types.js";
import { DailyMixCard } from "../../apps/web/src/features/daily-mix/daily-mix-card.js";

const profileId = "00000000-0000-4000-8000-000000000010";
const mixId = "00000000-0000-4000-8000-000000000090";
const detail: DailyMixDetail = {
  mix: {
    id: mixId,
    profileId,
    localDate: "2026-08-26",
    trackIds: Array.from(
      { length: 20 },
      (_, index) => `00000000-0000-4000-8000-${String(100 + index).padStart(12, "0")}`,
    ),
    generatedAt: "2026-08-26T00:00:00.000Z",
  },
  tracks: Array.from({ length: 20 }, (_, position) => ({
    position,
    bucket: position < 2 ? ("library" as const) : ("close" as const),
    track: {
      id: `00000000-0000-4000-8000-${String(100 + position).padStart(12, "0")}`,
      source: "netease" as const,
      sourceTrackId: `daily-${String(position)}`,
      title: `TRACK ${String(position + 1)}`,
      artist: `ARTIST ${String(position + 1)}`,
      album: "HIDDEN ALBUM",
      artworkUrl: null,
      durationMs: 180_000,
      lyricStatus: "unavailable" as const,
      playable: true,
      originMode: "mock" as const,
    },
  })),
};

const today: DailyMixTodayResponse = {
  localDate: "2026-08-26",
  generation: {
    jobId: mixId,
    profileId,
    localDate: "2026-08-26",
    status: "succeeded",
    stage: "completed",
    attemptCount: 1,
    dailyMixId: mixId,
    createdAt: "2026-08-26T00:00:00.000Z",
    updatedAt: "2026-08-26T00:00:00.000Z",
  },
  mix: detail,
};

afterEach(cleanup);

describe("UX-30 Daily Mix card", () => {
  it("renders the fixed 20-track grid and dispatches all three playback actions", () => {
    const loadDailyMix = vi.fn(() => Promise.resolve());
    const onPlayNext = vi.fn();
    const audioEngine = { loadDailyMix } as unknown as AudioEngineFacade;
    render(
      <DailyMixCard
        audio={{} as AudioEngineSnapshot}
        audioEngine={audioEngine}
        onClose={vi.fn()}
        onPlayNext={onPlayNext}
        onRetry={vi.fn()}
        open
        retrying={false}
        today={today}
      />,
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(20);
    expect(screen.queryByText("HIDDEN ALBUM")).toBeNull();
    expect(screen.queryByText("03:00")).toBeNull();
    expect(document.querySelectorAll(".daily-mix-soundfield__family")).toHaveLength(3);
    expect(document.querySelector(".daily-mix-soundfield__glint-window")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "PLAY ALL" }));
    fireEvent.click(screen.getByRole("button", { name: "PLAY TRACK 4" }));
    fireEvent.click(screen.getByRole("button", { name: "PLAY TRACK 4 NEXT" }));

    expect(loadDailyMix).toHaveBeenNthCalledWith(1, detail, { autoplay: true, startIndex: 0 });
    expect(loadDailyMix).toHaveBeenNthCalledWith(2, detail, { autoplay: true, startIndex: 3 });
    expect(onPlayNext).toHaveBeenCalledWith(detail.tracks[3]?.track);
  });

  it("shows an explicit unavailable state without an old list", () => {
    const generation = today.generation;
    if (generation === null) throw new Error("Expected the succeeded fixture generation");
    render(
      <DailyMixCard
        audio={{} as AudioEngineSnapshot}
        audioEngine={{} as AudioEngineFacade}
        onClose={vi.fn()}
        onPlayNext={vi.fn()}
        onRetry={vi.fn()}
        open
        retrying={false}
        today={{
          localDate: "2026-08-26",
          generation: {
            ...generation,
            status: "failed",
            stage: "resolving_tracks",
            dailyMixId: undefined,
          },
          mix: null,
        }}
      />,
    );

    expect(screen.getByText("TODAY'S MIX IS NOT READY")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByRole("button", { name: "RETRY" }).hasAttribute("disabled")).toBe(false);
  });

  it("marks the active daily track and toggles pause and resume", () => {
    const pause = vi.fn(() => Promise.resolve());
    const play = vi.fn(() => Promise.resolve());
    const audioEngine = { pause, play } as unknown as AudioEngineFacade;
    const activeAudio = {
      sourceKind: "daily",
      state: "playing",
      currentItem: {
        id: "daily-item-4",
        kind: "track",
        position: 3,
        trackId: detail.tracks[3]?.track.id,
        resolvedAudioRef: "https://media.example.test/track-4.mp3",
        durationMs: 180_000,
      },
      preview: undefined,
    } as unknown as AudioEngineSnapshot;
    const view = render(
      <DailyMixCard
        audio={activeAudio}
        audioEngine={audioEngine}
        onClose={vi.fn()}
        onPlayNext={vi.fn()}
        onRetry={vi.fn()}
        open
        retrying={false}
        today={today}
      />,
    );

    const current = screen.getAllByRole("listitem")[3];
    expect(current?.getAttribute("aria-current")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "PAUSE TRACK 4" }));
    expect(pause).toHaveBeenCalledOnce();

    view.rerender(
      <DailyMixCard
        audio={{ ...activeAudio, state: "paused" }}
        audioEngine={audioEngine}
        onClose={vi.fn()}
        onPlayNext={vi.fn()}
        onRetry={vi.fn()}
        open
        retrying={false}
        today={today}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "PLAY TRACK 4" }));
    expect(play).toHaveBeenCalledOnce();
  });
});
