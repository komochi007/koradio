import { randomUUID } from "node:crypto";

import { codexProgramPlanSchema, type ProgramPlannerProvider } from "./providers.js";
import { createPlanningContext, type PlanningContextDependencies } from "./planning-context.js";

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
  context: PlanningContextDependencies;
  now?: () => Date;
  planner: () => ProgramPlannerProvider;
  profileId: () => Promise<string | null>;
}): PlannerReadinessService {
  const now = options.now ?? (() => new Date());

  return {
    async check() {
      const profileId = await options.profileId();
      if (profileId === null) return;
      const context = createPlanningContext(
        { ...options.context, now },
        profileId,
        "为安静专注的工作时段规划一档 8 首歌的完整节目",
        8,
      );
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
