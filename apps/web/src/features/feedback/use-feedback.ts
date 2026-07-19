import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateFeedbackCommand } from "@koradio/contracts";
import { feedbackTokens } from "@koradio/design-tokens";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AppEventBus } from "../../shared/events.js";
import type { ServiceTransport } from "../../shared/transport.js";
import { createFeedback, getTaste } from "./api.js";
import {
  feedbackStateKey,
  isFeedbackActive,
  toggleFeedbackCommand,
  type ToggleFeedbackKind,
} from "./feedback-state.js";

export interface FeedbackNoticeState {
  message: string;
  tone: "success" | "error";
}

function withoutKey(values: Record<string, boolean>, key: string): Record<string, boolean> {
  return Object.fromEntries(Object.entries(values).filter(([candidate]) => candidate !== key));
}

interface UseFeedbackOptions {
  eventBus: AppEventBus;
  profileId: string;
  transport: ServiceTransport;
}

export function useFeedback({ eventBus, profileId, transport }: UseFeedbackOptions) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["taste", profileId] as const, [profileId]);
  const taste = useQuery({
    queryKey,
    queryFn: () => getTaste(transport, profileId),
  });
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const [notice, setNotice] = useState<FeedbackNoticeState>();
  const timers = useRef(new Set<number>());
  const noticeTimer = useRef<number | undefined>(undefined);

  const schedule = useCallback((action: () => void, delay: number): number => {
    const timer = window.setTimeout(() => {
      timers.current.delete(timer);
      action();
    }, delay);
    timers.current.add(timer);
    return timer;
  }, []);

  const clearNoticeLater = useCallback(
    (delay: number): void => {
      if (noticeTimer.current !== undefined) {
        window.clearTimeout(noticeTimer.current);
        timers.current.delete(noticeTimer.current);
      }
      noticeTimer.current = schedule(() => {
        noticeTimer.current = undefined;
        setNotice(undefined);
      }, delay);
    },
    [schedule],
  );

  useEffect(
    () => () => {
      for (const timer of timers.current) window.clearTimeout(timer);
      timers.current.clear();
      noticeTimer.current = undefined;
    },
    [],
  );

  useEffect(() => {
    setOptimistic({});
    setPending(new Set());
    setNotice(undefined);
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current.clear();
    noticeTimer.current = undefined;
  }, [profileId]);

  useEffect(
    () =>
      eventBus.subscribe((event) => {
        if (event.eventType === "feedback.persisted" && event.profileId === profileId) {
          void queryClient.invalidateQueries({ queryKey });
        }
      }),
    [eventBus, profileId, queryClient, queryKey],
  );

  useEffect(() => {
    if (taste.data === undefined) return;
    setOptimistic((current) => {
      let next = current;
      for (const [key, desired] of Object.entries(current)) {
        const separator = key.indexOf(":");
        const kind = key.slice(0, separator) as ToggleFeedbackKind;
        const targetId = key.slice(separator + 1);
        if (!pending.has(key) && isFeedbackActive(taste.data, kind, targetId) === desired) {
          next = withoutKey(next, key);
        }
      }
      return next;
    });
  }, [pending, taste.data]);

  const active = useCallback(
    (kind: ToggleFeedbackKind, targetId: string): boolean => {
      const key = feedbackStateKey(kind, targetId);
      return optimistic[key] ?? isFeedbackActive(taste.data, kind, targetId);
    },
    [optimistic, taste.data],
  );

  const persist = useCallback(
    async (command: CreateFeedbackCommand, key: string, desired?: boolean): Promise<void> => {
      setPending((current) => new Set(current).add(key));
      if (desired !== undefined) {
        setOptimistic((current) => ({ ...current, [key]: desired }));
      }
      try {
        await createFeedback(transport, profileId, command);
        setPending((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
        setNotice({ message: "已记住你的偏好", tone: "success" });
        clearNoticeLater(feedbackTokens.successNoticeMs);
        await queryClient.invalidateQueries({ queryKey });
      } catch {
        if (desired === undefined) {
          setPending((current) => {
            const next = new Set(current);
            next.delete(key);
            return next;
          });
          setNotice({ message: "反馈保存失败，请重试", tone: "error" });
          clearNoticeLater(feedbackTokens.errorNoticeMinMs);
          return;
        }
        setNotice({ message: "反馈保存失败，请重试", tone: "error" });
        schedule(() => {
          setOptimistic((current) => {
            return withoutKey(current, key);
          });
          setPending((current) => {
            const next = new Set(current);
            next.delete(key);
            return next;
          });
          setNotice({ message: "反馈保存失败，已恢复原状态", tone: "error" });
          clearNoticeLater(feedbackTokens.errorNoticeMinMs);
        }, feedbackTokens.optimisticRollbackMs);
      }
    },
    [clearNoticeLater, profileId, queryClient, queryKey, schedule, transport],
  );

  const toggle = useCallback(
    (kind: ToggleFeedbackKind, targetId: string): void => {
      const key = feedbackStateKey(kind, targetId);
      if (pending.has(key)) return;
      const current = active(kind, targetId);
      void persist(toggleFeedbackCommand(kind, targetId, current), key, !current);
    },
    [active, pending, persist],
  );

  return {
    dismissNotice: () => {
      if (noticeTimer.current !== undefined) {
        window.clearTimeout(noticeTimer.current);
        timers.current.delete(noticeTimer.current);
        noticeTimer.current = undefined;
      }
      setNotice(undefined);
    },
    isDisliked: (trackId: string) => active("track_dislike", trackId),
    isFavorited: (programId: string) => active("program_favorite", programId),
    isLiked: (trackId: string) => active("track_like", trackId),
    isPending: (kind: ToggleFeedbackKind, targetId: string) =>
      pending.has(feedbackStateKey(kind, targetId)),
    notice,
    recordSkip(trackId: string) {
      const key = `track_skip:${trackId}`;
      if (!pending.has(key)) {
        void persist({ type: "track_skipped", targetId: trackId }, key);
      }
    },
    toggleDislike: (trackId: string) => {
      toggle("track_dislike", trackId);
    },
    toggleFavorite: (programId: string) => {
      toggle("program_favorite", programId);
    },
    toggleLike: (trackId: string) => {
      toggle("track_like", trackId);
    },
  };
}
