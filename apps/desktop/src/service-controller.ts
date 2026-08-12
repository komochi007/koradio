import { access } from "node:fs/promises";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

export const firstPort = 49373;
export const lastPort = 49383;
export const readyTimeoutMs = 30_000;
export const stopTimeoutMs = 10_000;

export interface ServiceHandle {
  owned: boolean;
  port: number;
  process?: ChildProcess;
}

export interface ServiceController {
  detectExisting(): Promise<ServiceHandle | undefined>;
  startBundled(): Promise<ServiceHandle>;
  waitUntilReady(handle: ServiceHandle): Promise<ServiceHandle>;
  stopOwned(handle: ServiceHandle | undefined): Promise<void>;
}

export interface ServiceControllerOptions {
  environment?: NodeJS.ProcessEnv;
  pollIntervalMs?: number;
  probe?: (port: number) => Promise<boolean>;
  providerMode?: "mock" | "live";
  readyTimeoutMs?: number;
  resourcesPath: string;
  spawnProcess?: typeof spawn;
}

export function createPortCandidates(): number[] {
  return Array.from({ length: lastPort - firstPort + 1 }, (_, index) => firstPort + index);
}

export function createLauncherEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const currentUser = userInfo().username;
  return {
    HOME: environment.HOME ?? homedir(),
    LANG: environment.LANG ?? "en_US.UTF-8",
    LOGNAME: environment.LOGNAME ?? currentUser,
    PATH: "/usr/bin:/bin",
    TMPDIR: environment.TMPDIR ?? "/tmp",
    USER: environment.USER ?? currentUser,
  };
}

export function createServiceEnvironment(
  resourcesPath: string,
  port: number,
  options: {
    environment?: NodeJS.ProcessEnv;
    providerMode?: "mock" | "live";
    smokeDataDirectory?: string;
  } = {},
): NodeJS.ProcessEnv {
  const source = options.environment ?? process.env;
  const resources = createLauncherEnvironment(source);
  const environment: NodeJS.ProcessEnv = {
    ...resources,
    NODE_ENV: "production",
    KORADIO_HOST: "127.0.0.1",
    KORADIO_PORT: String(port),
    KORADIO_PROVIDER_MODE: options.providerMode ?? "live",
    KORADIO_STRICT_PORT: "false",
  };
  const dataDirectory = options.smokeDataDirectory ?? source.KORADIO_DATA_DIR;
  if (dataDirectory !== undefined && dataDirectory.length > 0) {
    environment.KORADIO_DATA_DIR = dataDirectory;
  }

  const ttsHelper = join(resourcesPath, "qwen-tts-helper/main.py");
  const ttsPython = join(resourcesPath, "qwen-runtime/bin/python");
  if (source.KORADIO_TTS_HELPER_PATH !== undefined) {
    environment.KORADIO_TTS_HELPER_PATH = source.KORADIO_TTS_HELPER_PATH;
  } else {
    environment.KORADIO_TTS_HELPER_PATH = ttsHelper;
  }
  if (source.KORADIO_TTS_PYTHON_PATH !== undefined) {
    environment.KORADIO_TTS_PYTHON_PATH = source.KORADIO_TTS_PYTHON_PATH;
  } else {
    environment.KORADIO_TTS_PYTHON_PATH = ttsPython;
  }
  return environment;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson(
  url: string,
  options: { headers: Record<string, string>; method?: string },
): Promise<Record<string, unknown> | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, 1_000);
  try {
    const requestInit: RequestInit = {
      headers: options.headers,
      signal: controller.signal,
    };
    if (options.method !== undefined) requestInit.method = options.method;
    const response = await fetch(url, requestInit);
    if (!response.ok) {
      return undefined;
    }
    const payload: unknown = await response.json();
    return typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

async function servesKoradioRenderer(origin: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, 1_000);
  try {
    const response = await fetch(`${origin}/radio`, {
      headers: {
        Accept: "text/html",
        "Cache-Control": "no-store",
      },
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) {
      return false;
    }
    return (await response.text()).includes('id="root"');
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function probeKoradioService(
  port: number,
  expectedMode?: "mock" | "live",
): Promise<boolean> {
  const origin = `http://127.0.0.1:${String(port)}`;
  const bootstrap = await readJson(`${origin}/api/v1/session/bootstrap`, {
    headers: {
      "Cache-Control": "no-store",
      Origin: origin,
    },
    method: "POST",
  });
  const accessToken = bootstrap?.accessToken;
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    return false;
  }
  const health = await readJson(`${origin}/api/v1/health`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Origin: origin,
    },
  });
  if (
    health?.service !== "koradio" ||
    (expectedMode !== undefined && health.mode !== expectedMode)
  ) {
    return false;
  }
  return servesKoradioRenderer(origin);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolveWait) => {
    setTimeout(resolveWait, milliseconds);
  });
}

async function findReadyPort(
  probe: (port: number) => Promise<boolean>,
): Promise<number | undefined> {
  const results = await Promise.all(
    createPortCandidates().map(async (port) => ({
      port,
      ready: await probe(port).catch(() => false),
    })),
  );
  return results.find((result) => result.ready)?.port;
}

function waitForExit(child: ChildProcess, timeout: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true);
  }
  return new Promise((resolveExit) => {
    let settled = false;
    const finish = (exited: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveExit(exited);
    };
    const timer = setTimeout(() => {
      finish(false);
    }, timeout);
    child.once("exit", () => {
      finish(true);
    });
  });
}

export function createServiceController(options: ServiceControllerOptions): ServiceController {
  const expectedProviderMode =
    options.providerMode ??
    (options.environment?.KORADIO_PROVIDER_MODE === "mock" ? "mock" : "live");
  const probe =
    options.probe ?? ((port: number) => probeKoradioService(port, expectedProviderMode));
  const pollInterval = options.pollIntervalMs ?? 250;
  const startupTimeout = options.readyTimeoutMs ?? readyTimeoutMs;
  const spawnProcess = options.spawnProcess ?? spawn;
  const entrypoint = join(options.resourcesPath, "app/apps/server/dist/bootstrap/main.js");
  const node = join(options.resourcesPath, "runtime/bin/node");
  let currentHandle: ServiceHandle | undefined;

  return {
    async detectExisting() {
      const port = await findReadyPort(probe);
      if (port !== undefined) {
        currentHandle = { owned: false, port };
        return currentHandle;
      }
      return undefined;
    },

    async startBundled() {
      if (!(await exists(node)) || !(await exists(entrypoint))) {
        throw new Error("Bundled Koradio service resources are missing");
      }
      const source = options.environment ?? process.env;
      const providerMode = source.KORADIO_PROVIDER_MODE === "mock" ? "mock" : "live";
      const smokeDataDirectory =
        source.KORADIO_DESKTOP_SMOKE_DATA_DIR ?? source.KORADIO_LAUNCHER_SMOKE_DATA_DIR;
      const child = spawnProcess(node, [entrypoint], {
        cwd: join(options.resourcesPath, "app"),
        env: createServiceEnvironment(options.resourcesPath, firstPort, {
          environment: source,
          providerMode,
          ...(smokeDataDirectory === undefined ? {} : { smokeDataDirectory }),
        }),
        stdio: ["ignore", "ignore", "ignore"],
      });
      currentHandle = { owned: true, port: firstPort, process: child };
      return currentHandle;
    },

    async waitUntilReady(handle) {
      const deadline = Date.now() + startupTimeout;
      while (Date.now() < deadline) {
        if (handle.process?.exitCode !== null && handle.process?.exitCode !== undefined) {
          throw new Error("Bundled Koradio service exited before becoming ready");
        }
        const port = await findReadyPort(probe);
        if (port !== undefined) {
          const readyHandle = { ...handle, port };
          currentHandle = readyHandle;
          return readyHandle;
        }
        await wait(pollInterval);
      }
      throw new Error("Bundled Koradio service did not become ready");
    },

    async stopOwned(handle) {
      if (handle?.owned !== true || handle.process === undefined) {
        return;
      }
      const child = handle.process;
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
        if (!(await waitForExit(child, stopTimeoutMs))) {
          child.kill("SIGKILL");
          await waitForExit(child, 1_000);
        }
      }
      if (currentHandle?.process === child) {
        currentHandle = undefined;
      }
    },
  };
}
