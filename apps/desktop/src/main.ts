import { app, BrowserWindow, dialog, session } from "electron";
import { dirname, resolve } from "node:path";
import process from "node:process";

import {
  createServiceController,
  type ServiceController,
  type ServiceHandle,
} from "./service-controller.js";
import { runUpdatePreflight } from "./update-preflight.js";
import {
  isAllowedNavigation,
  isLoopbackOrigin,
  loopbackOrigin,
  minimumWindowHeight,
  minimumWindowWidth,
  rendererContentSecurityPolicy,
} from "./window-policy.js";

const smokeMode = process.argv.includes("--smoke");
const smokeUserDataDirectory = process.env.KORADIO_DESKTOP_SMOKE_USER_DATA_DIR;
if (smokeMode && smokeUserDataDirectory !== undefined && smokeUserDataDirectory.trim().length > 0) {
  app.setPath("userData", resolve(smokeUserDataDirectory));
}
const singleInstance = app.requestSingleInstanceLock();
let mainWindow: BrowserWindow | undefined;
let serviceController: ServiceController | undefined;
let serviceHandle: ServiceHandle | undefined;
let quitting = false;
let cleanupStarted = false;

function applicationBundlePath(): string {
  return resolve(dirname(process.execPath), "../..");
}

function productionResourcesPath(): string {
  return process.resourcesPath;
}

function developmentOrigin(): string {
  const configured = process.env.KORADIO_DESKTOP_API_ORIGIN ?? "http://127.0.0.1:49373";
  if (!isLoopbackOrigin(configured)) {
    throw new Error("KORADIO_DESKTOP_API_ORIGIN must be an HTTP loopback origin");
  }
  return new URL(configured).origin;
}

function showFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : "Koradio failed to start";
  if (smokeMode) {
    process.stderr.write(
      `${JSON.stringify({ code: "desktop_start_failed", message, ok: false })}\n`,
    );
    app.exit(1);
    return;
  }
  dialog.showErrorBox("Koradio 无法启动", message);
  app.exit(1);
}

async function stopOwnedService(): Promise<void> {
  if (cleanupStarted) return;
  cleanupStarted = true;
  await serviceController?.stopOwned(serviceHandle);
  serviceHandle = undefined;
}

function installRendererSecurity(window: BrowserWindow, expectedOrigin: string): void {
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedNavigation(url, expectedOrigin)) {
      event.preventDefault();
    }
  });
  window.webContents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ["http://127.0.0.1:*/*"] },
    (details, callback) => {
      if (details.resourceType === "mainFrame") {
        callback({
          responseHeaders: {
            ...(details.responseHeaders ?? {}),
            "Content-Security-Policy": [rendererContentSecurityPolicy],
          },
        });
        return;
      }
      callback({ responseHeaders: details.responseHeaders ?? {} });
    },
  );
}

function createMainWindow(expectedOrigin: string): BrowserWindow {
  const window = new BrowserWindow({
    autoHideMenuBar: true,
    backgroundColor: "#090a0c",
    height: 1_600,
    minHeight: minimumWindowHeight,
    minWidth: minimumWindowWidth,
    show: false,
    titleBarStyle: "hiddenInset",
    useContentSize: true,
    webPreferences: {
      allowRunningInsecureContent: false,
      contextIsolation: true,
      devTools: !app.isPackaged && !smokeMode,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
    },
    width: 960,
  });
  window.setMenuBarVisibility(false);
  installRendererSecurity(window, expectedOrigin);
  window.once("ready-to-show", () => {
    if (!smokeMode) window.show();
  });
  window.on("closed", () => {
    mainWindow = undefined;
    app.quit();
  });
  mainWindow = window;
  return window;
}

async function loadRenderer(window: BrowserWindow, url: string): Promise<void> {
  const deadline = Date.now() + (app.isPackaged ? 30_000 : 45_000);
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await window.loadURL(url);
      return;
    } catch (error) {
      lastError = error;
      if (app.isPackaged) break;
      await new Promise((resolveWait) => setTimeout(resolveWait, 500));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Koradio renderer failed to load");
}

async function runRendererSmoke(window: BrowserWindow, expectedOrigin: string): Promise<void> {
  const result = (await window.webContents.executeJavaScript(
    `
      (async () => {
        const bootstrap = await fetch('/api/v1/session/bootstrap', {
          method: 'POST',
          cache: 'no-store',
          credentials: 'omit',
          redirect: 'error'
        });
        if (!bootstrap.ok) throw new Error('session bootstrap failed');
        const session = await bootstrap.json();
        const health = await fetch('/api/v1/health', {
          headers: { Authorization: 'Bearer ' + session.accessToken },
          cache: 'no-store',
          credentials: 'omit',
          redirect: 'error'
        });
        if (!health.ok) throw new Error('health failed');
        const payload = await health.json();
        return { origin: window.location.origin, service: payload.service };
      })()
    `,
    true,
  )) as unknown;
  if (
    typeof result !== "object" ||
    result === null ||
    (result as { origin?: unknown }).origin !== expectedOrigin ||
    (result as { service?: unknown }).service !== "koradio"
  ) {
    throw new Error("Electron renderer smoke check failed");
  }
}

async function startApplication(): Promise<void> {
  await app.whenReady();
  if (app.isPackaged && !smokeMode) {
    const updateStatus = await runUpdatePreflight({
      applicationPath: applicationBundlePath(),
      resourcesPath: productionResourcesPath(),
    });
    if (updateStatus === "updated") {
      app.relaunch();
      app.exit(0);
      return;
    }
  }

  let expectedOrigin: string;
  if (app.isPackaged) {
    serviceController = createServiceController({
      environment: {
        ...process.env,
        ...(smokeMode && process.env.KORADIO_PROVIDER_MODE === undefined
          ? { KORADIO_PROVIDER_MODE: "mock" }
          : {}),
      },
      resourcesPath: productionResourcesPath(),
    });
    serviceHandle = await serviceController.detectExisting();
    if (serviceHandle === undefined) {
      const started = await serviceController.startBundled();
      serviceHandle = await serviceController.waitUntilReady(started);
    }
    expectedOrigin = loopbackOrigin(serviceHandle.port);
  } else {
    expectedOrigin = developmentOrigin();
  }

  const rendererUrl = app.isPackaged
    ? `${expectedOrigin}/radio`
    : `${process.env.KORADIO_DESKTOP_DEV_URL ?? "http://127.0.0.1:5173"}/radio`;
  const window = createMainWindow(new URL(rendererUrl).origin);
  await loadRenderer(window, rendererUrl);
  if (smokeMode) {
    await runRendererSmoke(window, expectedOrigin);
    const smokePort = serviceHandle?.port;
    await stopOwnedService();
    process.stdout.write(
      `${JSON.stringify({ ok: true, origin: expectedOrigin, port: smokePort, renderer: true })}\n`,
    );
    app.exit(0);
  }
}

if (!singleInstance) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow === undefined) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  app.on("before-quit", (event) => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    void stopOwnedService().finally(() => {
      app.quit();
    });
  });
  void startApplication().catch(async (error: unknown) => {
    await stopOwnedService();
    showFailure(error);
  });
}
