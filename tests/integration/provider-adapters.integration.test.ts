import { readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CodexAdapterError,
  DeepseekAdapterError,
  ProviderProcessError,
  TtsAdapterError,
  TtsHelperClientError,
  createCodexAdapter,
  createDeepseekAdapter,
  createNetEaseAdapter,
  createTtsAdapter,
  runProviderProcess,
  type ProviderProcessInvocation,
  type ProviderProcessRunner,
  type DeepseekFetcher,
  type TtsHelperClient,
  type TtsModelService,
} from "../../apps/server/src/integrations/index.js";
import {
  MusicProviderResponseError,
  MusicProviderUnavailableError,
  parseProviderAudioResult,
  parseProviderLyricsResult,
  parseProviderPlaylistResult,
  parseProviderSearchResult,
} from "../../apps/server/src/modules/library/index.js";
import { ttsSynthesisResultSchema } from "../../apps/server/src/modules/programs/index.js";
import { createLocalFileStore } from "../../apps/server/src/platform/files/index.js";
import {
  createSafeLogger,
  type SafeLogEntry,
} from "../../apps/server/src/platform/logging/index.js";
import {
  codexPlanningContextFixture,
  codexProgramPlanFixture,
  netEaseAudioFixture,
  netEaseLyricsFixture,
  netEasePlaylistFixture,
  netEaseSearchFixture,
  netEaseTrackFixture,
  providerCorrelationId,
  ttsSynthesisFixture,
} from "../fixtures/providers.js";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function createFetchQueue(
  responses: Response[],
  invocations: Array<{ input: string; init?: RequestInit }> = [],
): typeof fetch {
  return (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const serializedInput =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    invocations.push({ input: serializedInput, ...(init === undefined ? {} : { init }) });
    const response = responses.shift();
    if (response === undefined) {
      return Promise.reject(new Error("Unexpected fetch"));
    }
    return Promise.resolve(response);
  };
}

function codexJsonl(plan: unknown = codexProgramPlanFixture): string {
  return `${JSON.stringify({
    type: "item.completed",
    item: { id: "item-1", type: "agent_message", text: JSON.stringify(plan) },
  })}\n${JSON.stringify({ type: "turn.completed", usage: {} })}\n`;
}

describe("Provider process boundary", () => {
  it("uses structured stdin and returns bounded process output", async () => {
    const result = await runProviderProcess({
      executable: process.execPath,
      args: [
        "-e",
        "process.stdin.setEncoding('utf8');let value='';process.stdin.on('data',c=>value+=c);process.stdin.on('end',()=>process.stdout.write(JSON.stringify({value})))",
      ],
      cwd: process.cwd(),
      input: "provider-stdin",
      maximumOutputBytes: 1024,
      timeoutMs: 5_000,
    });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ value: "provider-stdin" });
  });

  it("terminates timed-out, cancelled and over-output processes with stable errors", async () => {
    await expect(
      runProviderProcess({
        executable: process.execPath,
        args: ["-e", "setInterval(()=>undefined,1000)"],
        cwd: process.cwd(),
        input: "",
        maximumOutputBytes: 1024,
        timeoutMs: 5,
      }),
    ).rejects.toMatchObject({ code: "timeout" });

    const controller = new AbortController();
    const cancelled = runProviderProcess({
      executable: process.execPath,
      args: ["-e", "setInterval(()=>undefined,1000)"],
      cwd: process.cwd(),
      input: "",
      maximumOutputBytes: 1024,
      signal: controller.signal,
      timeoutMs: 5_000,
    });
    setTimeout(() => {
      controller.abort();
    }, 5);
    await expect(cancelled).rejects.toMatchObject({ code: "cancelled" });

    await expect(
      runProviderProcess({
        executable: process.execPath,
        args: ["-e", "process.stdout.write('x'.repeat(64))"],
        cwd: process.cwd(),
        input: "",
        maximumOutputBytes: 8,
        timeoutMs: 5_000,
      }),
    ).rejects.toMatchObject({ code: "output_limit_exceeded" });
  });
});

describe("Codex adapter", () => {
  it("uses safe arguments, structured stdin, output schema and normalized JSONL", async () => {
    const runtimeDirectory = await mkdtemp(join(tmpdir(), "koradio-codex-adapter-"));
    const invocations: ProviderProcessInvocation[] = [];
    const runner: ProviderProcessRunner = (invocation) => {
      invocations.push(invocation);
      return Promise.resolve({ exitCode: 0, stderr: "progress", stdout: codexJsonl() });
    };
    const adapter = createCodexAdapter({
      command: "codex",
      resolveExecutable: () => Promise.resolve("/trusted/codex"),
      runner,
      runtimeDirectory,
    });

    await expect(
      adapter.plan(codexPlanningContextFixture, { correlationId: providerCorrelationId }),
    ).resolves.toEqual(codexProgramPlanFixture);
    const invocation = invocations[0];
    expect(invocation?.executable).toBe("/trusted/codex");
    expect(invocation?.args).toEqual(
      expect.arrayContaining([
        "exec",
        "--ephemeral",
        "--ignore-user-config",
        "--ignore-rules",
        "--sandbox",
        "read-only",
        "--json",
        "--output-schema",
      ]),
    );
    expect(invocation?.args.join(" ")).not.toContain(codexPlanningContextFixture.scenarioText);
    expect(invocation?.input).toContain(codexPlanningContextFixture.scenarioText);
    expect(invocation?.environment).not.toHaveProperty("KORADIO_TEST_SECRET");
    const providerInput = JSON.parse(invocation?.input ?? "{}") as {
      instruction?: string;
      context?: unknown;
    };
    expect(providerInput.instruction).toContain("trackIntents");
    expect(providerInput.instruction).toContain("preferredLibraryTrackCount");
    expect(providerInput.instruction).toContain("different primary artist");
    expect(providerInput.instruction).toContain("exact song title and primary artist");
    expect(providerInput.context).toEqual(codexPlanningContextFixture);
    const schemaPath = invocation?.args.at(invocation.args.indexOf("--output-schema") + 1);
    expect(schemaPath).toBeDefined();
    const outputSchema = await readFile(schemaPath ?? "", "utf8");
    expect(outputSchema).toContain('"additionalProperties": false');
    expect(outputSchema).toContain('"trackIntents"');
    expect(outputSchema).toContain('"anyOf"');
    expect(outputSchema).not.toContain('"oneOf"');
    expect(outputSchema).not.toContain('"musicQueries"');
  });

  it("rejects a library intent whose id is absent from the bounded context", async () => {
    const runtimeDirectory = await mkdtemp(join(tmpdir(), "koradio-codex-library-id-"));
    const adapter = createCodexAdapter({
      command: "codex",
      resolveExecutable: () => Promise.resolve("/trusted/codex"),
      runner: () =>
        Promise.resolve({
          exitCode: 0,
          stderr: "",
          stdout: codexJsonl({
            ...codexProgramPlanFixture,
            trackIntents: [
              {
                kind: "library",
                trackId: "90000000-0000-4000-8000-000000000099",
                reason: "该 ID 不在当前 Profile 的有界音乐库上下文中",
              },
            ],
          }),
        }),
      runtimeDirectory,
    });

    await expect(
      adapter.plan(codexPlanningContextFixture, { correlationId: providerCorrelationId }),
    ).rejects.toMatchObject({ code: "response_invalid" });
  });

  it("replans once after an invalid structured response", async () => {
    const runtimeDirectory = await mkdtemp(join(tmpdir(), "koradio-codex-replan-"));
    const invocations: ProviderProcessInvocation[] = [];
    const outputs = [codexJsonl({ invalid: true }), codexJsonl()];
    const adapter = createCodexAdapter({
      command: "codex",
      resolveExecutable: () => Promise.resolve("/trusted/codex"),
      runner: (invocation) => {
        invocations.push(invocation);
        return Promise.resolve({
          exitCode: 0,
          stderr: "",
          stdout: outputs.shift() ?? "",
        });
      },
      runtimeDirectory,
    });

    await expect(
      adapter.plan(codexPlanningContextFixture, { correlationId: providerCorrelationId }),
    ).resolves.toEqual(codexProgramPlanFixture);
    expect(invocations).toHaveLength(2);
    expect(invocations[1]?.input).toContain("The previous response was invalid");
  });

  it("replans once after a transient unavailable response", async () => {
    const runtimeDirectory = await mkdtemp(join(tmpdir(), "koradio-codex-unavailable-replan-"));
    let invocationCount = 0;
    const adapter = createCodexAdapter({
      command: "codex",
      resolveExecutable: () => Promise.resolve("/trusted/codex"),
      runner: () => {
        invocationCount += 1;
        return Promise.resolve(
          invocationCount === 1
            ? { exitCode: 1, stderr: "temporary failure", stdout: "" }
            : { exitCode: 0, stderr: "", stdout: codexJsonl() },
        );
      },
      runtimeDirectory,
    });

    await expect(
      adapter.plan(codexPlanningContextFixture, { correlationId: providerCorrelationId }),
    ).resolves.toEqual(codexProgramPlanFixture);
    expect(invocationCount).toBe(2);
  });

  it("resolves the latest configured command for each plan without changing process arguments", async () => {
    const runtimeDirectory = await mkdtemp(join(tmpdir(), "koradio-codex-dynamic-command-"));
    let command = "/trusted/codex-one";
    const resolvedCommands: string[] = [];
    const adapter = createCodexAdapter({
      command: () => command,
      resolveExecutable: (configuredCommand) => {
        resolvedCommands.push(configuredCommand);
        return Promise.resolve(configuredCommand);
      },
      runner: () => Promise.resolve({ exitCode: 0, stderr: "", stdout: codexJsonl() }),
      runtimeDirectory,
    });

    await adapter.plan(codexPlanningContextFixture, { correlationId: providerCorrelationId });
    command = "/trusted/codex-two";
    await adapter.plan(codexPlanningContextFixture, { correlationId: providerCorrelationId });

    expect(resolvedCommands).toEqual(["/trusted/codex-one", "/trusted/codex-two"]);
  });

  it("rejects invalid output, maps process failures and logs no sensitive body", async () => {
    const runtimeDirectory = await mkdtemp(join(tmpdir(), "koradio-codex-failure-"));
    const entries: SafeLogEntry[] = [];
    const logger = createSafeLogger({ sink: { write: (entry) => entries.push(entry) } });
    const invalid = createCodexAdapter({
      command: "codex",
      logger,
      resolveExecutable: () => Promise.resolve("/trusted/codex"),
      runner: () =>
        Promise.resolve({
          exitCode: 0,
          stderr: "sensitive-provider-warning",
          stdout: "not-jsonl",
        }),
      runtimeDirectory,
    });
    await expect(
      invalid.plan(codexPlanningContextFixture, { correlationId: providerCorrelationId }),
    ).rejects.toBeInstanceOf(CodexAdapterError);

    const timedOut = createCodexAdapter({
      command: "codex",
      resolveExecutable: () => Promise.resolve("/trusted/codex"),
      runner: () => Promise.reject(new ProviderProcessError("timeout")),
      runtimeDirectory,
    });
    await expect(
      timedOut.plan(codexPlanningContextFixture, { correlationId: providerCorrelationId }),
    ).rejects.toMatchObject({ code: "timeout" });

    const controller = new AbortController();
    controller.abort();
    const cancelled = createCodexAdapter({
      command: "codex",
      resolveExecutable: () => Promise.resolve("/trusted/codex"),
      runner: () => Promise.reject(new ProviderProcessError("cancelled")),
      runtimeDirectory,
    });
    await expect(
      cancelled.plan(codexPlanningContextFixture, {
        correlationId: providerCorrelationId,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "cancelled" });

    const serialized = JSON.stringify(entries);
    expect(serialized).not.toContain(codexPlanningContextFixture.scenarioText);
    expect(serialized).not.toContain("sensitive-provider-warning");
    expect(serialized).toContain(providerCorrelationId);
  });
});

describe("DeepSeek adapter", () => {
  it("uses the fixed endpoint, bearer key, JSON output and thinking mode", async () => {
    const invocations: Array<{
      input: string;
      init: { body: string; headers: Record<string, string> };
    }> = [];
    const fetcher: DeepseekFetcher = (input, init) => {
      invocations.push({ input, init });
      return Promise.resolve(
        jsonResponse({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify(codexProgramPlanFixture),
                reasoning_content: "must not enter the plan",
              },
            },
          ],
        }),
      );
    };
    const adapter = createDeepseekAdapter({
      apiKey: "sk-test-secret",
      fetcher,
      model: "deepseek-v4-pro",
    });

    await expect(
      adapter.plan(codexPlanningContextFixture, { correlationId: providerCorrelationId }),
    ).resolves.toEqual(codexProgramPlanFixture);
    const invocation = invocations[0];
    expect(invocation?.input).toBe("https://api.deepseek.com/chat/completions");
    expect(invocation?.init.headers.Authorization).toBe("Bearer sk-test-secret");
    const body = JSON.parse(invocation?.init.body ?? "{}") as {
      messages?: Array<{ content: string }>;
      max_tokens?: number;
      model?: string;
      response_format?: { type: string };
      thinking?: { type: string };
    };
    expect(body.max_tokens).toBe(12_288);
    expect(body.model).toBe("deepseek-v4-pro");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.thinking).toEqual({ type: "enabled" });
    const prompt = body.messages?.map((message) => message.content).join(" ") ?? "";
    expect(prompt).toContain("EffectiveTaste");
    expect(prompt).toContain("different primary artist");
    expect(prompt).toContain("exact song title and primary artist");
    expect(prompt).not.toContain("sk-test-secret");
  });

  it("retries one transient response and never retries authentication failure", async () => {
    const statuses = [429, 200];
    const sleeps: number[] = [];
    const fetcher: DeepseekFetcher = () => {
      const status = statuses.shift();
      if (status === undefined) {
        throw new Error("Unexpected DeepSeek request");
      }
      return Promise.resolve(
        status === 200
          ? jsonResponse({
              choices: [
                {
                  finish_reason: "stop",
                  message: { content: JSON.stringify(codexProgramPlanFixture) },
                },
              ],
            })
          : jsonResponse({ error: { message: "rate limited" } }, status),
      );
    };
    const adapter = createDeepseekAdapter({
      apiKey: "sk-test",
      fetcher,
      model: "deepseek-v4-flash",
      sleep: (milliseconds) => {
        sleeps.push(milliseconds);
        return Promise.resolve();
      },
    });
    await expect(
      adapter.plan(codexPlanningContextFixture, { correlationId: providerCorrelationId }),
    ).resolves.toEqual(codexProgramPlanFixture);
    expect(sleeps).toEqual([250]);

    const unauthorized = createDeepseekAdapter({
      apiKey: "sk-test",
      fetcher: () => Promise.resolve(jsonResponse({ error: { message: "unauthorized" } }, 401)),
      sleep: () => Promise.reject(new Error("must not retry")),
      model: "deepseek-v4-flash",
    });
    await expect(
      unauthorized.plan(codexPlanningContextFixture, { correlationId: providerCorrelationId }),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("replans once after an invalid structured response", async () => {
    const invocations: Array<{ input: string; init?: RequestInit }> = [];
    const responses = [
      jsonResponse({
        choices: [{ finish_reason: "stop", message: { content: "not-json" } }],
      }),
      jsonResponse({
        choices: [
          {
            finish_reason: "stop",
            message: { content: JSON.stringify(codexProgramPlanFixture) },
          },
        ],
      }),
    ];
    const adapter = createDeepseekAdapter({
      apiKey: "sk-test",
      fetcher: createFetchQueue(responses, invocations),
      model: "deepseek-v4-flash",
    });

    await expect(
      adapter.plan(codexPlanningContextFixture, { correlationId: providerCorrelationId }),
    ).resolves.toEqual(codexProgramPlanFixture);
    expect(invocations).toHaveLength(2);
    expect(invocations[1]?.init?.body).toContain("previous planning attempt failed");
    expect(invocations[1]?.init?.body).toContain("no library intents");
  });

  it("rejects empty or invalid JSON without exposing response content", async () => {
    const entries: SafeLogEntry[] = [];
    const logger = createSafeLogger({ sink: { write: (entry) => entries.push(entry) } });
    const adapter = createDeepseekAdapter({
      apiKey: "sk-test",
      fetcher: () =>
        Promise.resolve(
          jsonResponse({
            choices: [
              {
                finish_reason: "stop",
                message: { content: "not-json-and-user-secret" },
              },
            ],
          }),
        ),
      logger,
      model: "deepseek-v4-flash",
    });
    await expect(
      adapter.plan(codexPlanningContextFixture, { correlationId: providerCorrelationId }),
    ).rejects.toBeInstanceOf(DeepseekAdapterError);
    const serialized = JSON.stringify(entries);
    expect(serialized).not.toContain("not-json-and-user-secret");
    expect(serialized).toContain(providerCorrelationId);
  });
});

describe("TTS adapter", () => {
  const readyModel: TtsModelService = {
    modelDirectory: "/trusted/qwen-model",
    getStatus: () => ({
      model: "Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit",
      revision: "049ef77fe8816b536193c0c25f9a214d17921282",
      state: "ready",
      downloadedBytes: 1,
      totalBytes: 1,
      progressPercent: 100,
    }),
    startInstall() {
      return this.getStatus();
    },
    close: () => Promise.resolve(),
  };

  it("routes the complete DJ text through the persistent helper and stores controlled audio", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "koradio-tts-adapter-"));
    const fileStore = createLocalFileStore({ dataRoot });
    const commands: unknown[] = [];
    const client: TtsHelperClient = {
      synthesize(command) {
        commands.push(command);
        return Promise.resolve({
          ...ttsSynthesisFixture,
          markers: [],
        });
      },
      close: () => Promise.resolve(),
    };
    const adapter = createTtsAdapter({
      client,
      fileStore,
      helperPath: "/trusted/tts-helper",
      modelService: readyModel,
      pythonPath: "/trusted/python",
      runtimeDirectory: dataRoot,
    });
    const text = "今晚适合慢一点，但不要睡着。";
    const result = ttsSynthesisResultSchema.parse(
      await adapter.synthesize(
        {
          text,
          language: "zh-CN",
          voiceStyle: "natural-radio",
        },
        { correlationId: providerCorrelationId },
      ),
    );

    expect(result.audioRef).toMatch(/^tts\/[0-9a-f-]+\.wav$/u);
    await expect(fileStore.read(result.audioRef)).resolves.toEqual(
      Buffer.from(ttsSynthesisFixture.audioBase64, "base64"),
    );
    expect(commands).toEqual([
      {
        language: "zh-CN",
        text,
        voiceStyle: "natural-radio",
      },
    ]);
    await adapter.close();
  });

  it("rejects unavailable models, invalid audio and timeout with safe stable errors", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "koradio-tts-failure-"));
    const fileStore = createLocalFileStore({ dataRoot });
    const command = {
      text: "DJ text that must not enter errors",
      language: "zh-CN",
      voiceStyle: "natural-radio",
    } as const;
    const unavailableModel = createTtsAdapter({
      client: {
        synthesize: () => Promise.reject(new Error("must not run")),
        close: () => Promise.resolve(),
      },
      fileStore,
      helperPath: "/trusted/tts-helper",
      modelService: {
        ...readyModel,
        getStatus: () => ({
          ...readyModel.getStatus(),
          state: "not-installed",
          downloadedBytes: 0,
          progressPercent: 0,
        }),
      },
      pythonPath: "/trusted/python",
      runtimeDirectory: dataRoot,
    });
    await expect(
      unavailableModel.synthesize(command, { correlationId: providerCorrelationId }),
    ).rejects.toMatchObject({ code: "helper_unavailable" });

    const invalidAudio = createTtsAdapter({
      client: {
        synthesize: () =>
          Promise.resolve({
            ...ttsSynthesisFixture,
            audioBase64: Buffer.from("bad").toString("base64"),
            markers: [],
          }),
        close: () => Promise.resolve(),
      },
      fileStore,
      helperPath: "/trusted/tts-helper",
      modelService: readyModel,
      pythonPath: "/trusted/python",
      runtimeDirectory: dataRoot,
    });
    const invalidError = await invalidAudio
      .synthesize(command, { correlationId: providerCorrelationId })
      .catch((error: unknown) => error);
    expect(invalidError).toBeInstanceOf(TtsAdapterError);
    expect(String(invalidError)).not.toContain(command.text);

    const timedOut = createTtsAdapter({
      client: {
        synthesize: () => Promise.reject(new TtsHelperClientError("timeout")),
        close: () => Promise.resolve(),
      },
      fileStore,
      helperPath: "/trusted/tts-helper",
      modelService: readyModel,
      pythonPath: "/trusted/python",
      runtimeDirectory: dataRoot,
    });
    await expect(
      timedOut.synthesize(command, { correlationId: providerCorrelationId }),
    ).rejects.toMatchObject({ code: "timeout" });
  });
});

describe("NetEase linuxapi adapter", () => {
  const publicDns = () => Promise.resolve([{ address: "8.8.8.8", family: 4 }]);

  it("maps search, playlist and lyrics while keeping encrypted protocol fields internal", async () => {
    const searchInvocations: Array<{ input: string; init?: RequestInit }> = [];
    const searchProvider = createNetEaseAdapter({
      dnsResolver: publicDns,
      fetchImplementation: createFetchQueue(
        [jsonResponse(netEaseSearchFixture)],
        searchInvocations,
      ),
    });
    const search = parseProviderSearchResult(await searchProvider.search("Space Song"));
    expect(search.items[0]).toMatchObject({
      source: "netease",
      sourceTrackId: "25638273",
      title: "Space Song",
      artist: "Beach House",
    });
    const searchBody = searchInvocations[0]?.init?.body;
    expect(searchBody).toBeInstanceOf(URLSearchParams);
    const serializedSearchBody = searchBody instanceof URLSearchParams ? searchBody.toString() : "";
    expect(serializedSearchBody).toMatch(/^eparams=[0-9A-F]+$/u);
    expect(serializedSearchBody).not.toContain("Space Song");

    const playlistProvider = createNetEaseAdapter({
      fetchImplementation: createFetchQueue([jsonResponse(netEasePlaylistFixture)]),
    });
    expect(
      parseProviderPlaylistResult(
        await playlistProvider.importPlaylist("https://music.163.com/playlist?id=123456789"),
      ),
    ).toMatchObject({ sourcePlaylistId: "123456789", title: "Koradio Writing" });

    const lyricsProvider = createNetEaseAdapter({
      fetchImplementation: createFetchQueue([jsonResponse(netEaseLyricsFixture)]),
    });
    expect(
      parseProviderLyricsResult(
        await lyricsProvider.getLyrics("25638273"),
        "30000000-0000-4000-8000-000000000001",
      ),
    ).toMatchObject({ status: "available" });
  });

  it("completes a playlist from its full track id list when the detail response is partial", async () => {
    const missingTrack = { ...netEaseTrackFixture, id: 90000001, name: "Complete Import" };
    const playlistProvider = createNetEaseAdapter({
      fetchImplementation: createFetchQueue([
        jsonResponse({
          ...netEasePlaylistFixture,
          playlist: {
            ...netEasePlaylistFixture.playlist,
            trackIds: [{ id: netEaseTrackFixture.id }, { id: missingTrack.id }],
          },
        }),
        jsonResponse({ code: 200, songs: [missingTrack] }),
      ]),
    });

    const playlist = parseProviderPlaylistResult(
      await playlistProvider.importPlaylist("123456789"),
    );
    expect(playlist.tracks.map((track) => track.sourceTrackId)).toEqual(["25638273", "90000001"]);
  });

  it("loads a 403-track playlist in batches of at most 100 and reports bounded progress", async () => {
    const tracks = Array.from({ length: 403 }, (_, index) => ({
      ...netEaseTrackFixture,
      id: 91000000 + index,
      name: `Large Playlist ${String(index + 1)}`,
    }));
    const responses = [
      jsonResponse({
        code: 200,
        playlist: {
          id: 311677454,
          name: "403 Track Regression",
          tracks: tracks.slice(0, 3),
          trackIds: tracks.map((track) => ({ id: track.id })),
        },
      }),
      ...Array.from({ length: 4 }, (_, index) =>
        jsonResponse({
          code: 200,
          songs: tracks.slice(3 + index * 100, 3 + (index + 1) * 100),
        }),
      ),
    ];
    const invocations: Array<{ input: string; init?: RequestInit }> = [];
    const progress: Array<{ processed: number; total: number }> = [];
    const playlistProvider = createNetEaseAdapter({
      fetchImplementation: createFetchQueue(responses, invocations),
    });

    const playlist = parseProviderPlaylistResult(
      await playlistProvider.importPlaylist("311677454", {
        onPlaylistProgress(value) {
          progress.push(value);
        },
      }),
    );

    expect(invocations).toHaveLength(5);
    expect(playlist.tracks).toHaveLength(403);
    expect(playlist.totalTrackCount).toBe(403);
    expect(progress[0]).toEqual({ processed: 3, total: 403 });
    expect(progress.at(-1)).toEqual({ processed: 403, total: 403 });
  });

  it("validates media domain, public DNS, redirect, MIME, Range and size before returning URL", async () => {
    const fetchImplementation = createFetchQueue([
      jsonResponse(netEaseAudioFixture),
      new Response(null, {
        headers: {
          "content-range": "bytes 0-0/3200000",
          "content-type": "audio/mpeg",
        },
        status: 206,
      }),
    ]);
    const provider = createNetEaseAdapter({
      dnsResolver: publicDns,
      fetchImplementation,
      now: () => new Date("2026-07-17T20:00:00.000Z"),
    });
    expect(
      parseProviderAudioResult(
        await provider.resolveAudio("25638273"),
        "30000000-0000-4000-8000-000000000001",
        new Date("2026-07-17T20:00:00.000Z"),
      ),
    ).toMatchObject({
      resolvedAudioRef: "https://m701.music.126.net/song.mp3?token=redacted",
    });
  });

  it("rejects malicious media URL, private DNS, unsafe redirect and invalid media metadata", async () => {
    const maliciousProvider = createNetEaseAdapter({
      dnsResolver: publicDns,
      fetchImplementation: createFetchQueue([
        jsonResponse({
          ...netEaseAudioFixture,
          data: [{ ...netEaseAudioFixture.data[0], url: "https://127.0.0.1/private.mp3" }],
        }),
      ]),
    });
    await expect(maliciousProvider.resolveAudio("25638273")).rejects.toBeInstanceOf(
      MusicProviderResponseError,
    );

    const privateDnsProvider = createNetEaseAdapter({
      dnsResolver: () => Promise.resolve([{ address: "127.0.0.1", family: 4 }]),
      fetchImplementation: createFetchQueue([jsonResponse(netEaseAudioFixture)]),
    });
    await expect(privateDnsProvider.resolveAudio("25638273")).rejects.toBeInstanceOf(
      MusicProviderResponseError,
    );

    const redirectProvider = createNetEaseAdapter({
      dnsResolver: publicDns,
      fetchImplementation: createFetchQueue([
        jsonResponse(netEaseAudioFixture),
        new Response(null, {
          headers: { location: "https://evil.example.test/audio.mp3" },
          status: 302,
        }),
      ]),
    });
    await expect(redirectProvider.resolveAudio("25638273")).rejects.toBeInstanceOf(
      MusicProviderResponseError,
    );

    const malformedRedirectProvider = createNetEaseAdapter({
      dnsResolver: publicDns,
      fetchImplementation: createFetchQueue([
        jsonResponse(netEaseAudioFixture),
        new Response(null, { headers: { location: "http://[" }, status: 302 }),
      ]),
    });
    await expect(malformedRedirectProvider.resolveAudio("25638273")).rejects.toBeInstanceOf(
      MusicProviderResponseError,
    );

    const mimeProvider = createNetEaseAdapter({
      dnsResolver: publicDns,
      fetchImplementation: createFetchQueue([
        jsonResponse(netEaseAudioFixture),
        new Response(null, {
          headers: {
            "content-range": "bytes 0-0/3200000",
            "content-type": "text/html",
          },
          status: 206,
        }),
      ]),
    });
    await expect(mimeProvider.resolveAudio("25638273")).rejects.toBeInstanceOf(
      MusicProviderResponseError,
    );

    const oversizedProvider = createNetEaseAdapter({
      dnsResolver: publicDns,
      fetchImplementation: createFetchQueue([
        jsonResponse(netEaseAudioFixture),
        new Response(null, {
          headers: {
            "content-range": `bytes 0-0/${String(101 * 1_048_576)}`,
            "content-type": "audio/mpeg",
          },
          status: 206,
        }),
      ]),
    });
    await expect(oversizedProvider.resolveAudio("25638273")).rejects.toBeInstanceOf(
      MusicProviderResponseError,
    );
  });

  it("maps external cancellation and timeout without exposing upstream response", async () => {
    const waitingFetch: typeof fetch = (
      _input: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (signal === undefined || signal === null) {
          reject(new Error("Missing signal"));
          return;
        }
        signal.addEventListener(
          "abort",
          () => {
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
      });
    const controller = new AbortController();
    const cancelledProvider = createNetEaseAdapter({ fetchImplementation: waitingFetch });
    const cancelled = cancelledProvider.search("Space", { signal: controller.signal });
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ reason: "cancelled" });

    const dnsController = new AbortController();
    const waitingDnsProvider = createNetEaseAdapter({
      dnsResolver: () => new Promise(() => undefined),
      fetchImplementation: createFetchQueue([jsonResponse(netEaseAudioFixture)]),
    });
    const waitingDns = waitingDnsProvider.resolveAudio("25638273", {
      signal: dnsController.signal,
    });
    dnsController.abort();
    await expect(waitingDns).rejects.toMatchObject({ reason: "cancelled" });

    const timeoutProvider = createNetEaseAdapter({
      fetchImplementation: waitingFetch,
      timeoutMs: 1,
    });
    await expect(timeoutProvider.search("Space")).rejects.toMatchObject({ reason: "timeout" });
    await expect(timeoutProvider.search(" ")).rejects.toBeInstanceOf(MusicProviderResponseError);
    await expect(
      createNetEaseAdapter({
        fetchImplementation: createFetchQueue([jsonResponse({ message: "limited" }, 429)]),
      }).search("Space"),
    ).rejects.toBeInstanceOf(MusicProviderUnavailableError);
  });
});
