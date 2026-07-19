import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";

import { getLatestProgram } from "../programs/index.js";
import type { AppEventBus } from "../../shared/events.js";
import type { ServiceTransport } from "../../shared/transport.js";
import { useFeedback, type FeedbackNoticeState } from "./use-feedback.js";
import "./feedback.css";

export function FeedbackNotice({
  notice,
  onDismiss,
}: {
  notice: FeedbackNoticeState | undefined;
  onDismiss: () => void;
}): ReactElement | null {
  if (notice === undefined) return null;
  return (
    <div
      className={`feedback-toast feedback-toast--${notice.tone}`}
      role="status"
      aria-live="polite"
    >
      <span>{notice.message}</span>
      <button type="button" aria-label="关闭反馈提示" onClick={onDismiss}>
        ×
      </button>
    </div>
  );
}

export function CurrentProgramFeedback({
  eventBus,
  profileId,
  transport,
}: {
  eventBus: AppEventBus;
  profileId: string;
  transport: ServiceTransport;
}): ReactElement {
  const latest = useQuery({
    queryKey: ["programs", "latest", profileId],
    queryFn: () => getLatestProgram(transport, profileId),
  });
  const feedback = useFeedback({ eventBus, profileId, transport });
  const program = latest.data;

  return (
    <section className="program-feedback" aria-labelledby="program-feedback-title">
      <div>
        <p className="eyebrow">CURRENT PROGRAM</p>
        <h2 id="program-feedback-title">节目反馈</h2>
        {latest.isPending ? (
          <p role="status">正在读取当前节目...</p>
        ) : program === null || program === undefined ? (
          <p>完成一段电台后，可以在这里收藏节目。</p>
        ) : (
          <>
            <p>{program.program.title}</p>
            <small>{program.program.scenarioText}</small>
          </>
        )}
      </div>
      {program !== null && program !== undefined && (
        <button
          className="button button--secondary program-feedback__button"
          type="button"
          aria-pressed={feedback.isFavorited(program.program.id)}
          aria-busy={feedback.isPending("program_favorite", program.program.id) || undefined}
          disabled={feedback.isPending("program_favorite", program.program.id)}
          onClick={() => {
            feedback.toggleFavorite(program.program.id);
          }}
        >
          {feedback.isFavorited(program.program.id) ? "取消收藏节目" : "收藏当前节目"}
        </button>
      )}
      <FeedbackNotice notice={feedback.notice} onDismiss={feedback.dismissNotice} />
    </section>
  );
}
