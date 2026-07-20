import type { PlaybackTimelineItem, ProgramDetail } from "@koradio/contracts";

export type AudioOwnership = "active" | "passive";
export type AudioPlaybackState =
  "idle" | "ready" | "playing" | "paused" | "buffering" | "completed" | "failed";

export interface AudioPreviewSnapshot {
  kind: "dj" | "track";
  previewId: string;
  state: "loading" | "playing" | "paused" | "failed";
  positionMs: number;
  durationMs: number;
  mediaError: "autoplay_blocked" | "media_failed" | undefined;
}

export interface PreviewAudioOptions {
  kind: "dj" | "track";
  previewId: string;
  resolvedAudioRef: string;
  durationMs: number;
}

export interface AudioEngineSnapshot {
  ownership: AudioOwnership;
  state: AudioPlaybackState;
  profileId: string | undefined;
  programId: string | undefined;
  currentItem: PlaybackTimelineItem | undefined;
  currentIndex: number;
  itemCount: number;
  positionMs: number;
  durationMs: number;
  volume: number;
  leaseEpoch: number | undefined;
  mediaError: "autoplay_blocked" | "media_failed" | "queue_exhausted" | undefined;
  checkpointError: boolean;
  preview?: AudioPreviewSnapshot | undefined;
}

export interface LoadProgramOptions {
  autoplay: boolean;
}

export interface AudioEngineFacade {
  activateProfile(profileId: string): Promise<void>;
  destroy(): Promise<void>;
  getSnapshot(): AudioEngineSnapshot;
  loadProgram(program: ProgramDetail, options: LoadProgramOptions): Promise<void>;
  next(): Promise<void>;
  pause(): Promise<void>;
  play(): Promise<void>;
  prepareForProfileSwitch(): Promise<void>;
  previous(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  setVolume(volume: number): void;
  previewAudio(options: PreviewAudioOptions): Promise<void>;
  stopPreview(): Promise<void>;
  subscribe(listener: () => void): () => void;
}

export interface LeasePlaybackSnapshot {
  profileId: string;
  programId: string;
  timelineItemId: string;
  currentIndex: number;
  itemCount: number;
  positionMs: number;
  durationMs: number;
  volume: number;
  state: AudioPlaybackState;
  leaseEpoch: number;
  mediaError?: AudioEngineSnapshot["mediaError"];
}
