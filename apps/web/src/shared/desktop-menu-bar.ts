import { useEffect, useMemo } from "react";

import type { AudioEngineFacade, AudioEngineSnapshot } from "../audio/index.js";

type MenuBarCommand = "previous" | "toggle" | "next";

interface MenuBarPlayback {
  artist: string | undefined;
  canNext: boolean;
  canPrevious: boolean;
  canToggle: boolean;
  state: AudioEngineSnapshot["state"];
  title: string | undefined;
}

interface KoradioDesktopBridge {
  onMenuBarCommand(listener: (command: MenuBarCommand) => void): () => void;
  publishMenuBarPlayback(playback: MenuBarPlayback): void;
}

declare global {
  interface Window {
    koradioDesktop?: KoradioDesktopBridge | undefined;
  }
}

function playbackForMenuBar(audio: AudioEngineSnapshot): MenuBarPlayback {
  const track = audio.preview?.track ?? audio.currentTrack;
  const hasTimeline = audio.preview !== undefined || audio.currentItem !== undefined;
  const playing = audio.preview?.state === "playing" || audio.state === "playing";
  return {
    artist: track?.artist,
    canNext: hasTimeline,
    canPrevious:
      audio.preview !== undefined || (audio.currentItem !== undefined && audio.itemCount > 0),
    canToggle: hasTimeline,
    state: playing ? "playing" : audio.preview?.state === "loading" ? "buffering" : audio.state,
    title: track?.title,
  };
}

export function useDesktopMenuBar(
  audio: AudioEngineSnapshot,
  audioEngine: AudioEngineFacade,
): void {
  const playback = useMemo(
    () => playbackForMenuBar(audio),
    [audio.currentItem, audio.currentTrack, audio.itemCount, audio.preview, audio.state],
  );

  useEffect(() => {
    const bridge = window.koradioDesktop;
    if (bridge === undefined) return;
    bridge.publishMenuBarPlayback(playback);
  }, [playback]);

  useEffect(() => {
    const bridge = window.koradioDesktop;
    if (bridge === undefined) return;
    return bridge.onMenuBarCommand((command) => {
      if (command === "previous") {
        void audioEngine.previous();
        return;
      }
      if (command === "next") {
        void audioEngine.next();
        return;
      }
      const snapshot = audioEngine.getSnapshot();
      if (snapshot.preview?.state === "playing" || snapshot.state === "playing") {
        void audioEngine.pause();
      } else {
        void audioEngine.play();
      }
    });
  }, [audioEngine]);
}
