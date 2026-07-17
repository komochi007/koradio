import {
  djLanguageSchema,
  djVoiceStyleSchema,
  effectiveTasteSchema,
  occurredAtSchema,
} from "@koradio/contracts";
import { z } from "zod";

export const providerCallOptionsSchema = z.strictObject({
  correlationId: z.uuid(),
  signal: z.instanceof(AbortSignal).optional(),
});

export interface ProviderCallOptions {
  correlationId: string;
  signal?: AbortSignal;
}

export const programHistoryContextSchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  scenarioText: z.string().trim().min(1).max(500),
  createdAt: occurredAtSchema,
});

export const codexPlanningContextSchema = z.strictObject({
  scenarioText: z.string().trim().min(1).max(500),
  effectiveTaste: effectiveTasteSchema,
  history: z.array(programHistoryContextSchema).max(20),
  currentTime: occurredAtSchema,
  preferences: z.strictObject({
    djLanguage: djLanguageSchema,
    djVoiceStyle: djVoiceStyleSchema,
  }),
});

export const codexDjScriptSchema = z.strictObject({
  type: z.enum(["intro", "segue", "outro"]),
  language: djLanguageSchema,
  text: z.string().trim().min(1).max(5000),
  displayText: z.string().trim().min(1).max(5000),
  estimatedTiming: z.boolean(),
});

export const codexMusicQuerySchema = z.strictObject({
  keyword: z.string().trim().min(1).max(100),
  reason: z.string().trim().min(1).max(500),
});

export const codexProgramPlanOutputSchema = z.strictObject({
  programTitle: z.string().trim().min(1).max(200),
  scenarioSummary: z.string().trim().min(1).max(500),
  djLanguage: djLanguageSchema,
  djPersona: djVoiceStyleSchema,
  djScripts: z.array(codexDjScriptSchema).min(1).max(20),
  musicQueries: z.array(codexMusicQuerySchema).min(1).max(50),
  playlistIntent: z.strictObject({
    energy: z.string().trim().min(1).max(100),
    mood: z.string().trim().min(1).max(100),
    avoid: z.array(z.string().trim().min(1).max(120)).max(20),
  }),
});

export const codexProgramPlanSchema = codexProgramPlanOutputSchema.superRefine((plan, context) => {
  if (!plan.djScripts.some((script) => script.type === "intro")) {
    context.addIssue({
      code: "custom",
      message: "At least one intro DJ script is required",
      path: ["djScripts"],
    });
  }
  if (plan.djScripts.some((script) => script.language !== plan.djLanguage)) {
    context.addIssue({
      code: "custom",
      message: "DJ script languages must match the plan language",
      path: ["djScripts"],
    });
  }
});

export const ttsMarkerSchema = z.strictObject({
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  text: z.string().trim().min(1).max(500),
});

export const ttsSynthesisCommandSchema = z.strictObject({
  text: z.string().trim().min(1).max(5000),
  language: djLanguageSchema,
  voiceIdentifier: z.string().trim().min(1).max(200),
  voiceStyle: djVoiceStyleSchema,
});

export const ttsSynthesisResultSchema = z.strictObject({
  audioRef: z
    .string()
    .regex(
      /^tts\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:aiff|caf|m4a|wav)$/,
    ),
  durationMs: z
    .number()
    .int()
    .positive()
    .max(10 * 60_000),
  markers: z.array(ttsMarkerSchema).max(500),
  estimatedTiming: z.boolean(),
});

export interface CodexProvider {
  plan(context: unknown, options: ProviderCallOptions): Promise<unknown>;
}

export interface TtsProvider {
  synthesize(command: unknown, options: ProviderCallOptions): Promise<unknown>;
}

export type CodexPlanningContext = z.infer<typeof codexPlanningContextSchema>;
export type CodexProgramPlan = z.infer<typeof codexProgramPlanSchema>;
export type TtsSynthesisCommand = z.infer<typeof ttsSynthesisCommandSchema>;
export type TtsSynthesisResult = z.infer<typeof ttsSynthesisResultSchema>;
