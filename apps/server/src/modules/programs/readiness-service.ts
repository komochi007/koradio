import { randomUUID } from "node:crypto";

import {
  codexPlanningContextSchema,
  codexProgramPlanSchema,
  type ProgramPlannerProvider,
} from "./providers.js";

export class PlannerReadinessError extends Error {
  readonly code:
    | "configuration_invalid"
    | "payment_required"
    | "rate_limited"
    | "response_invalid"
    | "timeout"
    | "unauthorized"
    | "unavailable";

  constructor(code: PlannerReadinessError["code"]) {
    super("Active planner readiness check failed");
    this.name = "PlannerReadinessError";
    this.code = code;
  }
}

export interface PlannerReadinessService {
  check(): Promise<void>;
}

export function createPlannerReadinessService(options: {
  now?: () => Date;
  planner: () => ProgramPlannerProvider;
}): PlannerReadinessService {
  const now = options.now ?? (() => new Date());

  return {
    async check() {
      const context = codexPlanningContextSchema.parse({
        scenarioText: "为安静专注的工作时段规划一档 8 首歌的完整节目",
        effectiveTaste: {
          profileId: "00000000-0000-4000-8000-000000000001",
          projectionVersion: 0,
          overrideVersion: 0,
          resolvedTaste: { affinities: [], avoidRules: [], sceneRules: [], tags: [] },
        },
        history: [],
        library: { tracks: [], maximumTracks: 8, preferredLibraryTrackCount: 0 },
        currentTime: now().toISOString(),
        preferences: { djLanguage: "zh-CN", djVoiceStyle: "natural-radio" },
      });
      try {
        const plan = codexProgramPlanSchema.safeParse(
          await options.planner().plan(context, { correlationId: randomUUID() }),
        );
        if (
          !plan.success ||
          plan.data.djLanguage !== context.preferences.djLanguage ||
          plan.data.trackIntents.length < context.library.maximumTracks ||
          plan.data.trackIntents.length > context.library.maximumTracks + 4
        ) {
          throw new PlannerReadinessError("response_invalid");
        }
      } catch (error) {
        if (error instanceof PlannerReadinessError) throw error;
        const code =
          typeof error === "object" && error !== null && "code" in error
            ? (error as { code?: unknown }).code
            : undefined;
        if (
          code === "configuration_invalid" ||
          code === "payment_required" ||
          code === "rate_limited" ||
          code === "response_invalid" ||
          code === "timeout" ||
          code === "unauthorized" ||
          code === "unavailable"
        ) {
          throw new PlannerReadinessError(code);
        }
        throw new PlannerReadinessError("unavailable");
      }
    },
  };
}
