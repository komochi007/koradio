import { mkdir, mkdtemp, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createLocalFileStore } from "../../apps/server/src/platform/files/index.js";
import {
  createSafeLogger,
  type SafeLogEntry,
} from "../../apps/server/src/platform/logging/index.js";
import {
  createMacOsKeychainSecretStore,
  SecretStoreError,
  type SecurityCommandInvocation,
  type SecurityCommandRunner,
} from "../../apps/server/src/platform/secrets/index.js";

function createFetchFixture(responses: Response[]): typeof fetch {
  return (): Promise<Response> => {
    const response = responses.shift();
    if (response === undefined) {
      throw new Error("Unexpected fetch");
    }
    return Promise.resolve(response);
  };
}

function createTimeoutFetchFixture(): typeof fetch {
  return (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    void input;

    return new Promise((_resolve, reject) => {
      const signal = init?.signal;
      if (signal === undefined || signal === null) {
        reject(new Error("Missing abort signal"));
        return;
      }

      const rejectAsAborted = () => {
        reject(new DOMException("Aborted", "AbortError"));
      };
      if (signal.aborted) {
        rejectAsAborted();
        return;
      }
      signal.addEventListener("abort", rejectAsAborted, { once: true });
    });
  };
}

describe("platform security boundaries", () => {
  it("passes secret values through stdin and never through command arguments or errors", async () => {
    const secret = "s2-03-test-secret";
    const invocations: SecurityCommandInvocation[] = [];
    const runner: SecurityCommandRunner = (invocation) => {
      invocations.push(invocation);

      if (invocation.args[0] === "find-generic-password" && invocation.args.at(-1) === "-w") {
        return Promise.resolve({ exitCode: 0, stderr: "", stdout: `${secret}\n` });
      }

      return Promise.resolve({ exitCode: 0, stderr: "", stdout: "" });
    };
    const store = createMacOsKeychainSecretStore({
      platform: "darwin",
      runner,
      service: "app.koradio.tests",
    });

    await expect(store.set("codex.api-key", secret)).resolves.toEqual({
      key: "codex.api-key",
      store: "os-credential-store",
    });
    await expect(store.get("codex.api-key")).resolves.toBe(secret);
    await expect(store.has("codex.api-key")).resolves.toBe(true);
    await expect(store.delete("codex.api-key")).resolves.toBeUndefined();

    expect(invocations[0]?.input).toContain(Buffer.from(secret, "utf8").toString("hex"));
    expect(invocations[0]?.input).not.toContain(secret);
    expect(invocations.flatMap((invocation) => invocation.args)).not.toContain(secret);
    expect(
      JSON.stringify(invocations.map(({ args, executable }) => ({ args, executable }))),
    ).not.toContain(secret);
  });

  it("returns a stable headless error without exposing credential diagnostics", async () => {
    const runner: SecurityCommandRunner = () =>
      Promise.resolve({
        exitCode: 36,
        stderr:
          "User interaction is not allowed for /Users/private/Library/Keychains/login.keychain-db",
        stdout: "",
      });
    const store = createMacOsKeychainSecretStore({ platform: "darwin", runner });

    const error = await store
      .set("codex.api-key", "hidden-value")
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SecretStoreError);
    expect(error).toMatchObject({ code: "unavailable" });
    expect(String(error)).not.toContain("hidden-value");
    expect(String(error)).not.toContain("/Users/private");
  });

  it("rejects credential access on unsupported platforms instead of using a file fallback", async () => {
    const store = createMacOsKeychainSecretStore({ platform: "linux" });

    await expect(store.get("codex.api-key")).rejects.toMatchObject({
      code: "unavailable",
    });
  });

  it("stores private controlled files and rejects malicious references", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "koradio-file-store-"));
    const store = createLocalFileStore({ dataRoot });
    const content = Buffer.from("avatar");
    const stored = await store.put({
      content,
      extension: ".png",
      mimeType: "image/png",
      namespace: "avatars",
    });

    expect(stored.reference).toMatch(/^avatars\/[0-9a-f-]+\.png$/);
    await expect(store.read(stored.reference)).resolves.toEqual(content);

    const path = join(dataRoot, "files", ...stored.reference.split("/"));
    if (process.platform !== "win32") {
      expect((await stat(path)).mode & 0o777).toBe(0o600);
    }

    for (const reference of [
      "../../secret.json",
      "/etc/passwd",
      "avatars/../secret.png",
      "avatars/profile/avatar.png",
      "avatars\\secret.png",
    ]) {
      await expect(store.read(reference)).rejects.toMatchObject({
        code: "invalid_reference",
      });
    }
  });

  it("rejects a controlled reference replaced by a symbolic link", async () => {
    if (process.platform === "win32") {
      return;
    }

    const dataRoot = await mkdtemp(join(tmpdir(), "koradio-file-store-link-"));
    const store = createLocalFileStore({ dataRoot });
    const externalFile = join(dataRoot, "outside.txt");
    const controlledDirectory = join(dataRoot, "files", "avatars");
    const reference = "avatars/00000000-0000-4000-8000-000000000000.png";
    await mkdir(controlledDirectory, { mode: 0o700, recursive: true });
    await writeFile(externalFile, "private file", { mode: 0o600 });
    await symlink(externalFile, join(controlledDirectory, reference.split("/")[1] ?? ""));

    await expect(store.read(reference)).rejects.toMatchObject({
      code: "invalid_reference",
    });
  });

  it("enforces extension, MIME, body size and redirect limits before storing downloads", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "koradio-download-store-"));
    const allowedOrigins = new Set(["https://media.example.test"]);

    const invalidMimeStore = createLocalFileStore({
      dataRoot,
      fetchImplementation: createFetchFixture([
        new Response("not audio", {
          headers: { "content-type": "text/html" },
          status: 200,
        }),
      ]),
    });
    await expect(
      invalidMimeStore.download({
        allowedOrigins,
        extension: "mp3",
        namespace: "media",
        url: "https://media.example.test/song",
      }),
    ).rejects.toMatchObject({ code: "mime_not_allowed" });

    const oversizedStore = createLocalFileStore({
      dataRoot,
      fetchImplementation: createFetchFixture([
        new Response("small body", {
          headers: {
            "content-length": String(101 * 1_048_576),
            "content-type": "audio/mpeg",
          },
          status: 200,
        }),
      ]),
    });
    await expect(
      oversizedStore.download({
        allowedOrigins,
        extension: "mp3",
        namespace: "media",
        url: "https://media.example.test/song",
      }),
    ).rejects.toMatchObject({ code: "file_too_large" });

    const unsafeRedirectStore = createLocalFileStore({
      dataRoot,
      fetchImplementation: createFetchFixture([
        new Response(null, {
          headers: { location: "https://evil.example.test/secret.mp3" },
          status: 302,
        }),
      ]),
    });
    await expect(
      unsafeRedirectStore.download({
        allowedOrigins,
        extension: "mp3",
        namespace: "media",
        url: "https://media.example.test/song",
      }),
    ).rejects.toMatchObject({ code: "remote_not_allowed" });

    const redirectLoopStore = createLocalFileStore({
      dataRoot,
      fetchImplementation: createFetchFixture([
        new Response(null, {
          headers: { location: "/again" },
          status: 302,
        }),
      ]),
    });
    await expect(
      redirectLoopStore.download({
        allowedOrigins,
        extension: "mp3",
        maximumRedirects: 0,
        namespace: "media",
        url: "https://media.example.test/song",
      }),
    ).rejects.toMatchObject({ code: "redirect_limit_exceeded" });

    const unsupportedExtensionStore = createLocalFileStore({ dataRoot });
    await expect(
      unsupportedExtensionStore.put({
        content: Buffer.from("data"),
        extension: "html",
        mimeType: "text/html",
        namespace: "avatars",
      }),
    ).rejects.toMatchObject({ code: "unsupported_extension" });
  });

  it("stores allowed same-origin downloads and enforces the overall timeout", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "koradio-download-success-"));
    const allowedOrigins = new Set(["https://media.example.test"]);
    const content = Buffer.from("audio fixture");
    const store = createLocalFileStore({
      dataRoot,
      fetchImplementation: createFetchFixture([
        new Response(null, {
          headers: { location: "/resolved.mp3" },
          status: 302,
        }),
        new Response(content, {
          headers: {
            "content-length": String(content.byteLength),
            "content-type": "audio/mpeg",
          },
          status: 200,
        }),
      ]),
    });

    const stored = await store.download({
      allowedOrigins,
      extension: "mp3",
      namespace: "media",
      url: "https://media.example.test/song",
    });

    expect(stored).toMatchObject({
      mimeType: "audio/mpeg",
      sizeBytes: content.byteLength,
    });
    await expect(store.read(stored.reference)).resolves.toEqual(content);

    const timeoutStore = createLocalFileStore({
      dataRoot,
      fetchImplementation: createTimeoutFetchFixture(),
    });
    await expect(
      timeoutStore.download({
        allowedOrigins,
        extension: "mp3",
        namespace: "media",
        timeoutMs: 1,
        url: "https://media.example.test/slow",
      }),
    ).rejects.toMatchObject({ code: "download_timeout" });
  });

  it("enforces the streamed body limit when Content-Length is absent", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "koradio-download-stream-limit-"));
    const store = createLocalFileStore({
      dataRoot,
      fetchImplementation: createFetchFixture([
        new Response(Buffer.alloc(2 * 1_048_576 + 1), {
          headers: { "content-type": "text/plain" },
          status: 200,
        }),
      ]),
    });

    await expect(
      store.download({
        allowedOrigins: new Set(["https://lyrics.example.test"]),
        extension: "txt",
        namespace: "lyrics",
        url: "https://lyrics.example.test/song",
      }),
    ).rejects.toMatchObject({ code: "file_too_large" });
  });

  it("redacts secrets, sensitive bodies, credentials and user paths from structured logs", () => {
    const entries: SafeLogEntry[] = [];
    const secret = "key-that-must-not-appear";
    const logger = createSafeLogger({
      now: () => new Date("2026-07-16T00:00:00.000Z"),
      secretValues: [secret],
      sink: {
        write(entry) {
          entries.push(entry);
        },
      },
    });

    logger.error("provider.failed", {
      accessToken: secret,
      apiKey: secret,
      authorization: `Bearer ${secret}`,
      error: new Error(`Provider failed with ${secret} at /Users/kleinblue/Koradio`),
      rawOutput: `invalid payload ${secret}`,
      url: `https://user:password@example.test/song?token=${secret}`,
    });

    const serialized = JSON.stringify(entries);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain("kleinblue");
    expect(serialized).not.toContain("password@example");
    expect(serialized).not.toContain("invalid payload");
    expect(serialized).not.toContain("stack");
    expect(serialized).toContain("[REDACTED]");
    expect(entries).toEqual([
      {
        data: {
          accessToken: "[REDACTED]",
          apiKey: "[REDACTED]",
          authorization: "[REDACTED]",
          error: {
            message: "Provider failed with [REDACTED] at /Users/[REDACTED]/Koradio",
            name: "Error",
          },
          rawOutput: "[REDACTED]",
          url: "https://[REDACTED]@example.test/song?token=[REDACTED]",
        },
        event: "provider.failed",
        level: "error",
        occurredAt: "2026-07-16T00:00:00.000Z",
      },
    ]);
  });
});
