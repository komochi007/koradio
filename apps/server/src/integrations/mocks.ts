import {
  codexPlanningContextSchema,
  codexProgramPlanSchema,
  providerCallOptionsSchema,
  ttsSynthesisCommandSchema,
  ttsSynthesisResultSchema,
  type CodexProvider,
  type TtsProvider,
} from "../modules/programs/index.js";

const mockTtsAudioRef = "tts/00000000-0000-4000-8000-000000000001.wav";

export function createMockCodexProvider(): CodexProvider {
  return {
    plan(context, options) {
      const parsedContext = codexPlanningContextSchema.parse(context);
      providerCallOptionsSchema.parse(options);
      const text =
        parsedContext.preferences.djLanguage === "zh-CN"
          ? "今晚慢一点，但别让思绪停下来。"
          : "Let us slow the room down without losing the thread.";
      const libraryIntents = parsedContext.library.tracks
        .slice(0, parsedContext.library.preferredLibraryTrackCount)
        .map((track) => ({
          kind: "library" as const,
          trackId: track.trackId,
          reason: "A deterministic library fixture",
        }));
      const discoveryIntents =
        libraryIntents.length < parsedContext.library.maximumTracks
          ? [
              {
                kind: "discovery" as const,
                keyword: "Space Song Beach House",
                reason: "A deterministic low-stimulation fixture",
              },
            ]
          : [];
      return Promise.resolve(
        codexProgramPlanSchema.parse({
          programTitle: "Koradio Mock Session",
          scenarioSummary: parsedContext.scenarioText,
          djLanguage: parsedContext.preferences.djLanguage,
          djPersona: parsedContext.preferences.djVoiceStyle,
          djScripts: [
            {
              type: "intro",
              language: parsedContext.preferences.djLanguage,
              text,
              displayText: text,
              estimatedTiming: true,
            },
          ],
          trackIntents: [...libraryIntents, ...discoveryIntents],
          playlistIntent: {
            energy: "low-mid",
            mood: "calm",
            avoid: [],
          },
        }),
      );
    },
  };
}

export function createMockTtsProvider(): TtsProvider {
  return {
    synthesize(command, options) {
      const parsed = ttsSynthesisCommandSchema.parse(command);
      providerCallOptionsSchema.parse(options);
      return Promise.resolve(
        ttsSynthesisResultSchema.parse({
          audioRef: mockTtsAudioRef,
          durationMs: Math.max(1_000, parsed.text.length * 80),
          markers: [],
          estimatedTiming: true,
        }),
      );
    },
  };
}
