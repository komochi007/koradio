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
          musicQueries: [
            {
              keyword: "Space Song Beach House",
              reason: "A deterministic low-stimulation fixture",
            },
          ],
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
