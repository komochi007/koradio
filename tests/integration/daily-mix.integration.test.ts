import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createMockCodexProvider } from "../../apps/server/src/integrations/index.js";
import {
  createDailyMixRepository,
  createDailyMixService,
} from "../../apps/server/src/modules/daily-mixes/index.js";
import { createFeedbackRepository } from "../../apps/server/src/modules/feedback/index.js";
import {
  createLibraryRepository,
  createLibraryService,
  createMockMusicProvider,
} from "../../apps/server/src/modules/library/index.js";
import {
  createPlaybackRepository,
  createPlaybackTimelineService,
} from "../../apps/server/src/modules/playback/index.js";
import { createProfilePreferencesService } from "../../apps/server/src/modules/profile-preferences/index.js";
import {
  createProgramRepository,
  createProgramService,
} from "../../apps/server/src/modules/programs/index.js";
import {
  createProfileRepository,
  createProfileService,
} from "../../apps/server/src/modules/profiles/index.js";
import {
  createTasteDefaultsService,
  createTasteRepository,
  createTasteService,
} from "../../apps/server/src/modules/taste/index.js";
import { bootstrapDatabase } from "../../apps/server/src/platform/db/database.js";

async function waitForTerminal(read: () => { status: string }, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!["queued", "running"].includes(read().status)) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Daily Mix did not finish");
}

async function createHarness() {
  const dataRoot = await mkdtemp(join(tmpdir(), "koradio-daily-mix-"));
  const database = await bootstrapDatabase({ dataRoot });
  const preferences = createProfilePreferencesService({ client: database.client });
  const profiles = createProfileService({
    avatarReferences: { validate: () => Promise.resolve() },
    client: database.client,
    preferences,
    repository: createProfileRepository(database.client),
    tasteDefaults: createTasteDefaultsService(database.client),
  });
  const profile = await profiles.create(
    { radioName: "Daily Signals", nickname: "Klein" },
    "daily-mix-profile",
  );
  const library = createLibraryService({
    provider: createMockMusicProvider(),
    repository: createLibraryRepository(database.client),
  });
  const playback = createPlaybackRepository(database.client);
  const programs = createProgramService({
    client: database.client,
    repository: createProgramRepository(database.client),
    timeline: createPlaybackTimelineService(playback),
    tracks: library,
  });
  const repository = createDailyMixRepository(database.client);
  const service = createDailyMixService({
    client: database.client,
    feedback: createFeedbackRepository(database.client),
    library,
    now: () => new Date("2026-08-26T10:00:00+08:00"),
    planner: createMockCodexProvider(),
    programs,
    repository,
    taste: createTasteService({ repository: createTasteRepository(database.client) }),
    timeoutMs: 5_000,
  });
  return { database, library, profile, repository, service };
}

describe("UX-30 Daily Mix generation", () => {
  it("creates one immutable 20-track mix for a profile and local date", async () => {
    const harness = await createHarness();
    const started = harness.service.ensure(harness.profile.id);
    const repeated = harness.service.ensure(harness.profile.id);
    expect(repeated.jobId).toBe(started.jobId);

    await waitForTerminal(() => harness.service.getGeneration(harness.profile.id, started.jobId));
    const snapshot = harness.service.getGeneration(harness.profile.id, started.jobId);
    expect(snapshot).toMatchObject({
      localDate: "2026-08-26",
      status: "succeeded",
      stage: "completed",
      attemptCount: 1,
    });
    const detail = harness.service.get(harness.profile.id, started.jobId);
    expect(detail.mix.trackIds).toHaveLength(20);
    expect(new Set(detail.mix.trackIds)).toHaveLength(20);
    expect(detail.tracks).toHaveLength(20);
    expect(harness.service.list(harness.profile.id).items).toHaveLength(1);
    expect(harness.service.ensure(harness.profile.id).jobId).toBe(started.jobId);

    await harness.service.close();
    await harness.library.close();
    harness.database.close();
  });
});
