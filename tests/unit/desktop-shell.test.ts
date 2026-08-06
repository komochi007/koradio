import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  createLauncherEnvironment,
  createPortCandidates,
  createServiceController,
  createServiceEnvironment,
} from "../../apps/desktop/src/service-controller.js";
import {
  isSupportedApplicationBundleName,
  parseUpdateOutput,
  updateNodeCodesignArguments,
} from "../../apps/desktop/src/update-preflight.js";
import {
  isAllowedNavigation,
  isLoopbackOrigin,
  minimumWindowHeight,
  minimumWindowWidth,
  rendererContentSecurityPolicy,
} from "../../apps/desktop/src/window-policy.js";
import {
  startupPagePrefix,
  startupPageUrl,
  startupRetryUrl,
} from "../../apps/desktop/src/startup-page.js";

describe("Electron desktop shell policy", () => {
  it("enforces the accepted minimum desktop window", () => {
    expect({ height: minimumWindowHeight, width: minimumWindowWidth }).toEqual({
      height: 652,
      width: 430,
    });
  });

  it("keeps the bounded production port range", () => {
    expect(createPortCandidates()).toEqual([
      49373, 49374, 49375, 49376, 49377, 49378, 49379, 49380, 49381, 49382, 49383,
    ]);
  });

  it("probes all service ports concurrently and keeps the lowest ready port", async () => {
    let active = 0;
    let maximumActive = 0;
    const controller = createServiceController({
      probe: async (port) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise<void>((resolveProbe) => setTimeout(resolveProbe, 5));
        active -= 1;
        return port === 49377 || port === 49379;
      },
      resourcesPath: "/unused",
    });

    await expect(controller.detectExisting()).resolves.toMatchObject({
      owned: false,
      port: 49377,
    });
    expect(maximumActive).toBe(createPortCandidates().length);
  });

  it("sanitizes the launcher environment and passes only runtime settings", () => {
    expect(
      createLauncherEnvironment({ HOME: "/tmp/home", LANG: "zh_CN.UTF-8", PATH: "/unsafe" }),
    ).toMatchObject({ HOME: "/tmp/home", LANG: "zh_CN.UTF-8", PATH: "/usr/bin:/bin" });
    expect(
      createServiceEnvironment("/app/Resources", 49374, {
        environment: { KORADIO_PROVIDER_MODE: "mock" },
        smokeDataDirectory: "/tmp/koradio-data",
        providerMode: "mock",
      }),
    ).toMatchObject({
      KORADIO_DATA_DIR: "/tmp/koradio-data",
      KORADIO_PORT: "49374",
      KORADIO_PROVIDER_MODE: "mock",
      KORADIO_TTS_HELPER_PATH: "/app/Resources/qwen-tts-helper/main.py",
      KORADIO_TTS_PYTHON_PATH: "/app/Resources/qwen-runtime/bin/python",
    });
    expect(createServiceEnvironment("/app/Resources", 49374)).toMatchObject({
      KORADIO_PROVIDER_MODE: "live",
    });
  });

  it("accepts only known same-origin product routes", () => {
    expect(isAllowedNavigation("http://127.0.0.1:49373/radio", "http://127.0.0.1:49373")).toBe(
      true,
    );
    expect(isAllowedNavigation("http://127.0.0.1:49373/settings", "http://127.0.0.1:49373")).toBe(
      true,
    );
    expect(isAllowedNavigation("https://example.com/radio", "http://127.0.0.1:49373")).toBe(false);
    expect(
      isAllowedNavigation("http://127.0.0.1:49373/radio?token=secret", "http://127.0.0.1:49373"),
    ).toBe(false);
    expect(isLoopbackOrigin("http://127.0.0.1:49373")).toBe(true);
    expect(isLoopbackOrigin("https://127.0.0.1:49373")).toBe(false);
  });

  it("keeps the renderer CSP free of unsafe eval", () => {
    expect(rendererContentSecurityPolicy).toContain("script-src 'self'");
    expect(rendererContentSecurityPolicy).not.toContain("unsafe-eval");
  });

  it("keeps the startup page local and exposes only the retry navigation", () => {
    expect(startupPageUrl.startsWith(startupPagePrefix)).toBe(true);
    expect(decodeURIComponent(startupPageUrl.slice(startupPagePrefix.length))).toContain(
      "重试启动",
    );
    expect(startupRetryUrl).toBe("koradio-startup://retry");
  });

  it("parses the updater status from bounded output", () => {
    expect(parseUpdateOutput('diagnostic\n{"status":"current"}\n')).toBe("current");
    expect(parseUpdateOutput('{"status":"updated"}\n')).toBe("updated");
    expect(() => parseUpdateOutput('{"status":"failed"}\n')).toThrow("recognized status");
  });

  it("accepts fixed and versioned arm64 application bundles", () => {
    expect(isSupportedApplicationBundleName("Koradio.app")).toBe(true);
    expect(isSupportedApplicationBundleName("Koradio-0.0.912-arm64.app")).toBe(true);
    expect(isSupportedApplicationBundleName("Koradio-1.2.3-arm64.app")).toBe(true);
    expect(isSupportedApplicationBundleName("Koradio-0.0.912-x64.app")).toBe(false);
    expect(isSupportedApplicationBundleName("Other.app")).toBe(false);
  });

  it("removes Hardened Runtime before using Node for updater builds", () => {
    expect(updateNodeCodesignArguments("/tmp/koradio-updater-node/node")).toEqual([
      "--force",
      "--sign",
      "-",
      "--timestamp=none",
      "/tmp/koradio-updater-node/node",
    ]);
  });

  it("injects service probing and process ownership for lifecycle tests", async () => {
    const resourcesPath = await mkdtemp(join(tmpdir(), "koradio-desktop-shell-"));
    const nodePath = join(resourcesPath, "runtime/bin/node");
    const entrypoint = join(resourcesPath, "app/apps/server/dist/bootstrap/main.js");
    await mkdir(join(resourcesPath, "runtime/bin"), { recursive: true });
    await mkdir(join(resourcesPath, "app/apps/server/dist/bootstrap"), { recursive: true });
    await writeFile(nodePath, "node");
    await writeFile(entrypoint, "server");

    let ready = false;
    let spawnArguments:
      { executable: string; arguments: string[]; options: SpawnOptions } | undefined;
    const child = new EventEmitter() as ChildProcess & {
      exitCode: number | null;
      signalCode: NodeJS.Signals | null;
    };
    child.exitCode = null;
    child.signalCode = null;
    child.kill = (signal?: NodeJS.Signals) => {
      child.signalCode = signal ?? "SIGTERM";
      child.exitCode = 0;
      child.emit("exit", 0, child.signalCode);
      return true;
    };

    const controller = createServiceController({
      environment: {
        KORADIO_DESKTOP_SMOKE_DATA_DIR: "/tmp/koradio-smoke-data",
        KORADIO_PROVIDER_MODE: "mock",
      },
      pollIntervalMs: 0,
      probe: (port) => Promise.resolve(ready && port === 49373),
      readyTimeoutMs: 500,
      resourcesPath,
      spawnProcess: ((executable: string, argumentsList: string[], options: SpawnOptions) => {
        spawnArguments = { executable, arguments: argumentsList, options };
        ready = true;
        return child;
      }) as unknown as typeof spawn,
    });

    try {
      const started = await controller.startBundled();
      expect(started).toMatchObject({ owned: true, port: 49373, process: child });
      expect(spawnArguments?.executable).toBe(nodePath);
      expect(spawnArguments?.arguments).toEqual([entrypoint]);
      expect(spawnArguments?.options.cwd).toBe(join(resourcesPath, "app"));
      expect(spawnArguments?.options.env).toMatchObject({
        KORADIO_DATA_DIR: "/tmp/koradio-smoke-data",
        KORADIO_PORT: "49373",
        KORADIO_PROVIDER_MODE: "mock",
      });
      const readyHandle = await controller.waitUntilReady(started);
      expect(readyHandle).toMatchObject({ owned: true, port: 49373, process: child });
      await controller.stopOwned(readyHandle);
      expect(child.signalCode).toBe("SIGTERM");
    } finally {
      await rm(resourcesPath, { force: true, recursive: true });
    }
  });
});
