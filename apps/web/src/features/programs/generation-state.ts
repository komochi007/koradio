import type {
  ProgramDetail,
  ProgramGenerationSnapshot,
  ProgramGenerationStage,
  V1Event,
} from "@koradio/contracts";

export interface ActiveProgramGeneration {
  jobId: string;
  programId?: string;
  scenarioText: string;
  sequence: number;
  stage: ProgramGenerationStage;
}

export interface ProgramGenerationFailure {
  code: string;
  scenarioText: string;
}

export interface ProgramGenerationState {
  active: ActiveProgramGeneration | undefined;
  failure: ProgramGenerationFailure | undefined;
  program: ProgramDetail | null;
}

export type ProgramGenerationAction =
  | { type: "program.loaded"; program: ProgramDetail | null }
  | { type: "generation.accepted"; jobId: string; scenarioText: string }
  | { type: "generation.event"; event: V1Event; profileId: string }
  | { type: "generation.snapshot"; snapshot: ProgramGenerationSnapshot }
  | { type: "generation.committed"; program: ProgramDetail }
  | { type: "generation.failed"; code: string; scenarioText: string }
  | { type: "generation.cleared" };

const eventStage: Partial<Record<V1Event["eventType"], ProgramGenerationStage>> = {
  "generation.planned": "planning",
  "generation.tracks-resolved": "resolving_tracks",
  "generation.completed": "committing",
  "program.committed": "completed",
};

export const initialProgramGenerationState: ProgramGenerationState = {
  active: undefined,
  failure: undefined,
  program: null,
};

export function reduceProgramGeneration(
  state: ProgramGenerationState,
  action: ProgramGenerationAction,
): ProgramGenerationState {
  if (action.type === "program.loaded") {
    return { ...state, program: action.program };
  }

  if (action.type === "generation.accepted") {
    return {
      ...state,
      active: {
        jobId: action.jobId,
        scenarioText: action.scenarioText,
        sequence: -1,
        stage: "queued",
      },
      failure: undefined,
    };
  }

  if (action.type === "generation.failed") {
    return {
      ...state,
      active: undefined,
      failure: { code: action.code, scenarioText: action.scenarioText },
    };
  }

  if (action.type === "generation.committed") {
    return {
      active: undefined,
      failure: undefined,
      program: action.program,
    };
  }

  if (action.type === "generation.cleared") {
    return { ...state, failure: undefined };
  }

  if (action.type === "generation.snapshot") {
    const active = state.active;
    if (active === undefined || action.snapshot.jobId !== active.jobId) {
      return state;
    }
    if (action.snapshot.status === "failed" || action.snapshot.status === "canceled") {
      return {
        ...state,
        active: undefined,
        failure: {
          code: action.snapshot.errorCode ?? "PROGRAM_GENERATION_FAILED",
          scenarioText: active.scenarioText,
        },
      };
    }
    const programId = action.snapshot.programId ?? active.programId;
    const sequence = Math.max(active.sequence, action.snapshot.sequence);
    if (
      programId === active.programId &&
      sequence === active.sequence &&
      action.snapshot.stage === active.stage
    ) {
      return state;
    }
    return {
      ...state,
      active: {
        ...active,
        ...(programId === undefined ? {} : { programId }),
        sequence,
        stage: action.snapshot.stage,
      },
    };
  }

  const active = state.active;
  const event = action.event;
  if (
    active === undefined ||
    event.profileId !== action.profileId ||
    event.correlationId !== active.jobId ||
    event.sequence <= active.sequence
  ) {
    return state;
  }
  if (event.eventType === "program.committed") {
    return {
      active: undefined,
      failure: undefined,
      program: event.payload,
    };
  }
  const stage = eventStage[event.eventType];
  if (event.eventType === "generation.degraded") {
    return {
      ...state,
      active: { ...active, sequence: event.sequence },
    };
  }
  if (stage === undefined) {
    return state;
  }
  return {
    ...state,
    active: {
      ...active,
      ...(event.eventType === "generation.completed" ? { programId: event.payload.programId } : {}),
      sequence: event.sequence,
      stage,
    },
  };
}
