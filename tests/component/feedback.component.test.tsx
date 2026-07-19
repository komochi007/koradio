// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CreateFeedbackCommand, TasteResponse } from "@koradio/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useFeedback } from "../../apps/web/src/features/feedback/index.js";
import { createAppQueryClient, QueryClientProvider } from "../../apps/web/src/app/query-client.js";
import { createAppEventBus } from "../../apps/web/src/shared/events.js";
import type { ServiceTransport } from "../../apps/web/src/shared/transport.js";

const firstProfileId = "00000000-0000-4000-8000-000000000010";
const secondProfileId = "00000000-0000-4000-8000-000000000011";
const trackId = "00000000-0000-4000-8000-000000000071";
const programId = "00000000-0000-4000-8000-000000000070";

function taste(profileId: string, liked = false): TasteResponse {
  return {
    projection: {
      profileId,
      tags: [],
      affinities: liked ? [`track:${trackId}`] : [],
      avoidSignals: [],
      sourceVersion: liked ? 1 : 0,
      updatedAt: "2026-07-19T08:00:00.000Z",
    },
    overrides: {
      profileId,
      tags: [],
      avoidRules: [],
      sceneRules: [],
      updatedAt: "2026-07-19T08:00:00.000Z",
    },
    effective: {
      profileId,
      projectionVersion: liked ? 1 : 0,
      overrideVersion: 0,
      resolvedTaste: {
        tags: [],
        affinities: liked ? [`track:${trackId}`] : [],
        avoidRules: [],
        sceneRules: [],
      },
    },
  };
}

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function createTransport(options: { fail?: boolean; firstLiked?: boolean } = {}): {
  commands: CreateFeedbackCommand[];
  transport: ServiceTransport;
} {
  const commands: CreateFeedbackCommand[] = [];
  const request = (path: string, init?: RequestInit): Promise<Response> => {
    if (path.endsWith("/taste")) {
      const profileId = path.split("/").at(-2) ?? "";
      return Promise.resolve(
        response(taste(profileId, options.firstLiked === true && profileId === firstProfileId)),
      );
    }
    if (path.endsWith("/feedback-events") && init?.method === "POST") {
      if (typeof init.body !== "string") throw new TypeError("Expected JSON feedback body");
      const command = JSON.parse(init.body) as CreateFeedbackCommand;
      commands.push(command);
      if (options.fail === true) {
        return Promise.resolve(
          response(
            {
              code: "FEEDBACK_PERSIST_FAILED",
              message: "Feedback could not be saved",
              retryable: true,
              correlationId: "00000000-0000-4000-8000-000000000099",
            },
            500,
          ),
        );
      }
      return Promise.resolve(
        response(
          {
            id: crypto.randomUUID(),
            profileId: path.split("/").at(-2),
            targetId: command.targetId,
            type: command.type,
            idempotencyKey: new Headers(init.headers).get("Idempotency-Key"),
            createdAt: "2026-07-19T08:00:00.000Z",
          },
          201,
        ),
      );
    }
    throw new Error(`Unhandled request: ${path}`);
  };
  return {
    commands,
    transport: {
      clearSession() {},
      connectEvents: vi.fn(),
      fetchHealth: vi.fn(),
      request,
    },
  };
}

function FeedbackHarness({
  profileId,
  transport,
}: {
  profileId: string;
  transport: ServiceTransport;
}) {
  const feedback = useFeedback({ eventBus: createAppEventBus(), profileId, transport });
  return (
    <div>
      <button
        type="button"
        aria-label="like"
        aria-pressed={feedback.isLiked(trackId)}
        disabled={feedback.isPending("track_like", trackId)}
        onClick={() => {
          feedback.toggleLike(trackId);
        }}
      />
      <button
        type="button"
        aria-label="dislike"
        aria-pressed={feedback.isDisliked(trackId)}
        disabled={feedback.isPending("track_dislike", trackId)}
        onClick={() => {
          feedback.toggleDislike(trackId);
        }}
      />
      <button
        type="button"
        aria-label="favorite"
        aria-pressed={feedback.isFavorited(programId)}
        disabled={feedback.isPending("program_favorite", programId)}
        onClick={() => {
          feedback.toggleFavorite(programId);
        }}
      />
      <button
        type="button"
        aria-label="skip"
        onClick={() => {
          feedback.recordSkip(trackId);
        }}
      />
      <output>{feedback.notice?.message ?? "READY"}</output>
    </div>
  );
}

function renderHarness(profileId: string, transport: ServiceTransport) {
  const queryClient = createAppQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <FeedbackHarness profileId={profileId} transport={transport} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Feedback UI state", () => {
  it("emits all seven append-only commands and exposes optimistic states", async () => {
    const { commands, transport } = createTransport();
    renderHarness(firstProfileId, transport);
    await screen.findByText("READY");

    for (const label of ["like", "like", "dislike", "dislike", "favorite", "favorite", "skip"]) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      await waitFor(() => {
        expect(screen.getByRole("button", { name: label }).hasAttribute("disabled")).toBe(false);
      });
    }

    expect(commands.map((command) => command.type)).toEqual([
      "track_liked",
      "track_like_removed",
      "track_disliked",
      "track_dislike_removed",
      "program_favorited",
      "program_favorite_removed",
      "track_skipped",
    ]);
  });

  it("keeps the optimistic state for three seconds, then rolls it back after failure", async () => {
    const { transport } = createTransport({ fail: true });
    renderHarness(firstProfileId, transport);
    await screen.findByText("READY");
    vi.useFakeTimers();

    fireEvent.click(screen.getByRole("button", { name: "like" }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole("button", { name: "like" }).getAttribute("aria-pressed")).toBe("true");

    await act(() => vi.advanceTimersByTimeAsync(2_999));
    expect(screen.getByRole("button", { name: "like" }).getAttribute("aria-pressed")).toBe("true");
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(screen.getByRole("button", { name: "like" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("反馈保存失败，已恢复原状态")).toBeTruthy();
  });

  it("does not leak restored feedback state across Profile changes", async () => {
    const { transport } = createTransport({ firstLiked: true });
    const view = renderHarness(firstProfileId, transport);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "like" }).getAttribute("aria-pressed")).toBe(
        "true",
      );
    });

    view.rerender(
      <QueryClientProvider client={createAppQueryClient()}>
        <FeedbackHarness profileId={secondProfileId} transport={transport} />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "like" }).getAttribute("aria-pressed")).toBe(
        "false",
      );
    });
  });
});
