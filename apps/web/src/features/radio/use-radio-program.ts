import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProgramGenerationStage, RadioTurn } from "@koradio/contracts";
import { useEffect, useReducer, useRef, useState } from "react";

import {
  getLatestProgram,
  getProgram,
  getProgramGeneration,
  initialProgramGenerationState,
  reduceProgramGeneration,
} from "../programs/index.js";
import { createRadioTurn, getRadioConversation } from "./api.js";
import { ApiRequestError } from "../../shared/api.js";
import type { AppEventBus } from "../../shared/events.js";
import type { ServiceTransport } from "../../shared/transport.js";

export type RadioViewState = "empty" | "generating" | "playing";

interface UseRadioProgramOptions {
  eventBus: AppEventBus;
  initialDraft: string | undefined;
  profileId: string;
  transport: ServiceTransport;
}

export function useRadioProgram({
  eventBus,
  initialDraft,
  profileId,
  transport,
}: UseRadioProgramOptions) {
  const queryClient = useQueryClient();
  const [generation, dispatch] = useReducer(reduceProgramGeneration, initialProgramGenerationState);
  const [draft, setDraft] = useState(initialDraft ?? "");
  const [pendingScenario, setPendingScenario] = useState<string>();
  const [autoplayProgramId, setAutoplayProgramId] = useState<string>();
  const [validationError, setValidationError] = useState<string>();
  const [turnError, setTurnError] = useState<string>();
  const activeRef = useRef(generation.active);
  const resolvingProgramRef = useRef<string | undefined>(undefined);
  activeRef.current = generation.active;

  const latestProgram = useQuery({
    queryKey: ["programs", "latest", profileId],
    queryFn: () => getLatestProgram(transport, profileId),
  });
  const conversation = useQuery({
    queryKey: ["radio-conversation", profileId],
    queryFn: () => getRadioConversation(transport, profileId),
  });

  useEffect(() => {
    if (latestProgram.data !== undefined) {
      dispatch({ type: "program.loaded", program: latestProgram.data });
    }
  }, [latestProgram.data]);

  useEffect(
    () =>
      eventBus.subscribe((event) => {
        const active = activeRef.current;
        if (event.eventType === "program.deleted" && event.profileId === profileId) {
          queryClient.removeQueries({
            queryKey: ["programs", "detail", profileId, event.payload.programId],
          });
          void queryClient.invalidateQueries({ queryKey: ["programs", "history", profileId] });
          if (event.payload.clearedCurrentSession) {
            queryClient.setQueryData(["programs", "latest", profileId], null);
            dispatch({ type: "program.loaded", program: null });
          }
          return;
        }
        if (
          active !== undefined &&
          event.eventType === "program.committed" &&
          event.profileId === profileId &&
          event.correlationId === active.jobId &&
          event.sequence > active.sequence
        ) {
          setDraft("");
          setPendingScenario(undefined);
          setAutoplayProgramId(event.payload.program.id);
          queryClient.setQueryData(["programs", "latest", profileId], event.payload);
        }
        dispatch({ type: "generation.event", event, profileId });
      }),
    [eventBus, profileId, queryClient],
  );

  const generationSnapshot = useQuery({
    queryKey: ["program-generation", profileId, generation.active?.jobId],
    queryFn: () => {
      const active = generation.active;
      if (active === undefined) {
        throw new Error("Program generation snapshot requested without an active job");
      }
      return getProgramGeneration(transport, profileId, active.jobId);
    },
    enabled: generation.active !== undefined,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "succeeded" || status === "failed" || status === "canceled" ? false : 350;
    },
    retry: false,
  });

  useEffect(() => {
    const snapshot = generationSnapshot.data;
    const active = generation.active;
    if (snapshot === undefined || active === undefined || snapshot.jobId !== active.jobId) {
      return;
    }
    if (snapshot.status === "failed" || snapshot.status === "canceled") {
      setDraft(active.scenarioText);
      setPendingScenario(undefined);
      dispatch({ type: "generation.snapshot", snapshot });
      return;
    }
    dispatch({ type: "generation.snapshot", snapshot });
    if (snapshot.status === "succeeded" && snapshot.programId !== undefined) {
      if (resolvingProgramRef.current === snapshot.programId) {
        return;
      }
      resolvingProgramRef.current = snapshot.programId;
      void queryClient
        .fetchQuery({
          queryKey: ["programs", "detail", profileId, snapshot.programId],
          queryFn: () => getProgram(transport, profileId, snapshot.programId ?? ""),
        })
        .then((program) => {
          setDraft("");
          setPendingScenario(undefined);
          setAutoplayProgramId(program.program.id);
          queryClient.setQueryData(["programs", "latest", profileId], program);
          dispatch({ type: "generation.committed", program });
        })
        .catch(() => {
          resolvingProgramRef.current = undefined;
          setDraft(active.scenarioText);
          setPendingScenario(undefined);
          dispatch({
            type: "generation.failed",
            code: "PROGRAM_UNREADABLE",
            scenarioText: active.scenarioText,
          });
        });
    }
  }, [generation.active, generationSnapshot.data, profileId, queryClient, transport]);

  useEffect(() => {
    if (!generationSnapshot.isError || generation.active === undefined) {
      return;
    }
    setDraft(generation.active.scenarioText);
    setPendingScenario(undefined);
    dispatch({
      type: "generation.failed",
      code: "PROGRAM_GENERATION_UNREADABLE",
      scenarioText: generation.active.scenarioText,
    });
  }, [generation.active, generationSnapshot.isError]);

  const turnMutation = useMutation({
    mutationFn: (content: string) => createRadioTurn(transport, profileId, content),
    onSuccess(turn, content) {
      setDraft("");
      setTurnError(undefined);
      queryClient.setQueryData<{ turns: RadioTurn[] }>(
        ["radio-conversation", profileId],
        (current) => ({ turns: [...(current?.turns ?? []), turn].slice(-50) }),
      );
      if (turn.decision === "program" && turn.programJobId !== null) {
        setPendingScenario(content);
        dispatch({ type: "generation.accepted", jobId: turn.programJobId, scenarioText: content });
      }
    },
    onError(error, content) {
      setDraft(content);
      setPendingScenario(undefined);
      setTurnError(
        error instanceof ApiRequestError &&
          error.envelope?.code === "PROGRAM_GENERATION_ALREADY_RUNNING"
          ? "已有一档节目正在生成，请等待完成后再发起新的节目。"
          : "DJ 暂时没有完成这次回应，请重试。",
      );
    },
  });

  function submitScenario(candidate = draft): void {
    const scenarioText = candidate.trim();
    if (scenarioText.length === 0) {
      setValidationError("和 DJ 说点什么");
      return;
    }
    if (scenarioText.length > 500) {
      setValidationError("消息不能超过 500 个字符");
      return;
    }
    setValidationError(undefined);
    setTurnError(undefined);
    turnMutation.mutate(scenarioText);
  }

  const scenarioText = pendingScenario ?? generation.active?.scenarioText;
  const generating = scenarioText !== undefined;
  const viewState: RadioViewState =
    generation.program !== null ? "playing" : generating ? "generating" : "empty";

  return {
    autoplayProgramId,
    conversation: conversation.data?.turns ?? [],
    clearConversation() {
      queryClient.setQueryData(["radio-conversation", profileId], { turns: [] });
    },
    draft,
    failure: generation.failure,
    initialError: latestProgram.isError,
    initialLoading: latestProgram.isPending,
    program: generation.program,
    scenarioText,
    turnError,
    turnPending: turnMutation.isPending,
    setDraft(value: string) {
      setDraft(value);
      if (validationError !== undefined) {
        setValidationError(undefined);
      }
      if (generation.failure !== undefined) {
        dispatch({ type: "generation.cleared" });
      }
    },
    stage: generation.active?.stage ?? (generating ? "queued" : undefined),
    submitScenario,
    retryLatestProgram: () => void latestProgram.refetch(),
    validationError,
    viewState,
  } satisfies {
    autoplayProgramId: string | undefined;
    conversation: RadioTurn[];
    clearConversation: () => void;
    draft: string;
    failure: typeof generation.failure;
    initialError: boolean;
    initialLoading: boolean;
    program: typeof generation.program;
    retryLatestProgram: () => void;
    scenarioText: string | undefined;
    setDraft: (value: string) => void;
    stage: ProgramGenerationStage | undefined;
    submitScenario: (candidate?: string) => void;
    validationError: string | undefined;
    turnError: string | undefined;
    turnPending: boolean;
    viewState: RadioViewState;
  };
}
