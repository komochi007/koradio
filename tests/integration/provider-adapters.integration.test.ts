import { readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CodexAdapterError,
  ProviderProcessError,
  TtsAdapterError,
  createCodexAdapter,
  createNetEaseAdapter,
  createTtsAdapter,
  runProviderProcess,
  type ProviderProcessInvocation,
  type ProviderProcessRunner,
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
  providerCorrelationId,
  ttsSynthesisFixture,
  ttsVoicesFixture,
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
    const schemaPath = invocation?.args.at(invocation.args.indexOf("--output-schema") + 1);
    expect(schemaPath).toBeDefined();
    expect(await readFile(schemaPath ?? "", "utf8")).toContain('"additionalProperties": false');
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

describe("TTS adapter", () => {
  it("validates installed standard voice, keeps DJ text in stdin and stores controlled audio", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "koradio-tts-adapter-"));
    const fileStore = createLocalFileStore({ dataRoot });
    const invocations: ProviderProcessInvocation[] = [];
    const responses = [
      JSON.stringify({
        voices: [
          {
            identifier: "com.apple.eloquence.zh-CN.Eddy",
            language: "zh-CN",
            name: "Eddy",
            isPersonalVoice: false,
          },
          ...ttsVoicesFixture.voices,
        ],
      }),
      JSON.stringify(ttsSynthesisFixture),
    ];
    const adapter = createTtsAdapter({
      fileStore,
      helperPath: "/trusted/tts-helper",
      resolveExecutable: () => Promise.resolve("/trusted/tts-helper"),
      runner: (invocation) => {
        invocations.push(invocation);
        return Promise.resolve({
          exitCode: 0,
          stderr: "",
          stdout: responses.shift() ?? "",
        });
      },
      runtimeDirectory: dataRoot,
    });
    const text = "今晚适合慢一点，但不要睡着。";
    const result = ttsSynthesisResultSchema.parse(
      await adapter.synthesize(
        {
          text,
          language: "zh-CN",
          voiceStyle: "british-soft-radio",
        },
        { correlationId: providerCorrelationId },
      ),
    );

    expect(result.audioRef).toMatch(/^tts\/[0-9a-f-]+\.wav$/u);
    await expect(fileStore.read(result.audioRef)).resolves.toEqual(
      Buffer.from(ttsSynthesisFixture.audioBase64, "base64"),
    );
    expect(invocations[0]?.args).toEqual(["voices", "--json"]);
    expect(invocations[1]?.args).toEqual(["synthesize", "--json"]);
    expect(invocations.flatMap(({ args }) => args)).not.toContain(text);
    expect(invocations[1]?.input).toContain(text);
    expect(invocations[1]?.input).toContain("com.apple.voice.compact.zh-CN.Tingting");
  });

  it("rejects Personal Voice, invalid audio and timeout with safe stable errors", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "koradio-tts-failure-"));
    const fileStore = createLocalFileStore({ dataRoot });
    const command = {
      text: "DJ text that must not enter errors",
      language: "zh-CN",
      voiceIdentifier: "com.apple.voice.compact.zh-CN.Tingting",
      voiceStyle: "british-soft-radio",
    } as const;
    const personalVoice = createTtsAdapter({
      fileStore,
      helperPath: "/trusted/tts-helper",
      resolveExecutable: () => Promise.resolve("/trusted/tts-helper"),
      runner: () =>
        Promise.resolve({
          exitCode: 0,
          stderr: "",
          stdout: JSON.stringify({
            voices: [{ ...ttsVoicesFixture.voices[0], isPersonalVoice: true }],
          }),
        }),
      runtimeDirectory: dataRoot,
    });
    await expect(
      personalVoice.synthesize(command, { correlationId: providerCorrelationId }),
    ).rejects.toMatchObject({ code: "voice_unavailable" });

    const responses = [
      JSON.stringify(ttsVoicesFixture),
      JSON.stringify({
        ...ttsSynthesisFixture,
        audioBase64: Buffer.from("bad").toString("base64"),
      }),
    ];
    const invalidAudio = createTtsAdapter({
      fileStore,
      helperPath: "/trusted/tts-helper",
      resolveExecutable: () => Promise.resolve("/trusted/tts-helper"),
      runner: () => Promise.resolve({ exitCode: 0, stderr: "", stdout: responses.shift() ?? "" }),
      runtimeDirectory: dataRoot,
    });
    const invalidError = await invalidAudio
      .synthesize(command, { correlationId: providerCorrelationId })
      .catch((error: unknown) => error);
    expect(invalidError).toBeInstanceOf(TtsAdapterError);
    expect(String(invalidError)).not.toContain(command.text);

    const timedOut = createTtsAdapter({
      fileStore,
      helperPath: "/trusted/tts-helper",
      resolveExecutable: () => Promise.resolve("/trusted/tts-helper"),
      runner: () => Promise.reject(new ProviderProcessError("timeout")),
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
