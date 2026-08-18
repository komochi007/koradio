// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AudioEngineFacade, AudioEngineSnapshot } from "../../apps/web/src/audio/index.js";
import { useDesktopMenuBar } from "../../apps/web/src/shared/desktop-menu-bar.js";

const audio: AudioEngineSnapshot = {
  checkpointError: false,
  currentIndex: 1,
  currentItem: {
    durationMs: 226_000,
    id: "00000000-0000-4000-8000-000000000501",
    kind: "track",
    trackId: "00000000-0000-4000-8000-000000000502",
  },
  currentTrack: {
    album: "Freudian",
    artist: "Daniel Caesar",
    durationMs: 226_000,
    id: "00000000-0000-4000-8000-000000000502",
    title: "Take Me Away",
  },
  durationMs: 226_000,
  itemCount: 8,
  leaseEpoch: 1,
  mediaError: undefined,
  ownership: "active",
  positionMs: 23_000,
  profileId: "00000000-0000-4000-8000-000000000503",
  programId: "00000000-0000-4000-8000-000000000504",
  state: "playing",
  volume: 1,
};

function Fixture(): null {
  useDesktopMenuBar(audio, {} as AudioEngineFacade);
  return null;
}

describe("Desktop menu bar", () => {
  afterEach(() => {
    delete window.koradioDesktop;
  });

  it("publishes the current track again when the preload bridge requests a snapshot", () => {
    const publishMenuBarPlayback = vi.fn();
    let requestPlayback: (() => void) | undefined;
    window.koradioDesktop = {
      onMenuBarCommand: vi.fn(() => () => undefined),
      onMenuBarPlaybackRequested: vi.fn((listener) => {
        requestPlayback = listener;
        return () => undefined;
      }),
      publishMenuBarPlayback,
    };

    render(<Fixture />);

    expect(publishMenuBarPlayback).toHaveBeenLastCalledWith({
      artist: "Daniel Caesar",
      canNext: true,
      canPrevious: true,
      canToggle: true,
      state: "playing",
      title: "Take Me Away",
    });

    requestPlayback?.();

    expect(publishMenuBarPlayback).toHaveBeenCalledTimes(2);
  });
});
