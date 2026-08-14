import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProgramGenerationStage, RadioTurn } from "@koradio/contracts";
import { useEffect, useReducer, useRef, useState } from "react";

import {
  getLatestProgram,
  getActiveProgramGeneration,
  getProgramHandoff,
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

export interface PendingRadioTurn {
  content: string;
  status: "pending" | "failed";
}

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
  const [pendingTurn, setPendingTurn] = useState<PendingRadioTurn>();
  const [autoplayProgramId, setAutoplayProgramId] = useState<string>();
  const [validationError, setValidationError] = useState<string>();
  const [turnError, setTurnError] = useState<string>();
  const resolvingProgramRef = useRef<string | undefined>(undefined);

  const latestProgram = useQuery({
    queryKey: ["programs", "latest", profileId],
    queryFn: () => getLatestProgram(transport, profileId),
  });
  const conversation = useQuery({
    queryKey: ["radio-conversation", profileId],
    queryFn: () => getRadioConversation(transport, profileId),
  });
  const activeGeneration = useQuery({
    queryKey: ["program-generation", "active", profileId],
    queryFn: () => getActiveProgramGeneration(transport, profileId),
    refetchInterval: (query) => (query.state.data?.active === null ? false : 350),
  });

  useEffect(() => {
    const active = activeGeneration.data?.active;
    if (active === null || active === undefined || generation.active !== undefined) return;
    const turn = [...(conversation.data?.turns ?? [])]
      .reverse()
      .find((candidate) => candidate.programJobId === active.jobId);
    const scenarioText = turn?.userMessage.content ?? "正在准备一档新节目";
    setPendingScenario(scenarioText);
    dispatch({ type: "generation.accepted", jobId: active.jobId, scenarioText });
  }, [activeGeneration.data?.active, conversation.data?.turns, generation.active]);

  useEffect(() => {
    if (latestProgram.data !== undefined) {
      dispatch({ type: "program.loaded", program: latestProgram.data });
    }
  }, [latestProgram.data]);

  useEffect(
    () =>
      eventBus.subscribe((event) => {
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
        if (event.eventType === "program.committed" && event.profileId === profileId) {
          void queryClient.invalidateQueries({ queryKey: ["program-handoff", profileId] });
          void queryClient.invalidateQueries({ queryKey: ["programs", "history", profileId] });
          return;
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
      void getProgramHandoff(transport, profileId)
        .then((handoff) => {
          if (handoff.program?.program.id === snapshot.programId) {
            setDraft("");
            setPendingScenario(undefined);
            dispatch({ type: "generation.ready" });
            return undefined;
          }
          return queryClient.fetchQuery({
            queryKey: ["programs", "detail", profileId, snapshot.programId],
            queryFn: () => getProgram(transport, profileId, snapshot.programId ?? ""),
          });
        })
        .then((program) => {
          if (program === undefined) return;
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
      setPendingTurn(undefined);
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
      setPendingTurn({ content, status: "failed" });
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
    setPendingTurn({ content: scenarioText, status: "pending" });
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
    pendingTurn,
    scenarioText,
    turnError,
    turnPending: turnMutation.isPending,
    setDraft(value: string) {
      setDraft(value);
      if (pendingTurn?.status === "failed" && value !== pendingTurn.content) {
        setPendingTurn(undefined);
      }
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
    pendingTurn: PendingRadioTurn | undefined;
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
