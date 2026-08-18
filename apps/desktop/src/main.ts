import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, session, Tray } from "electron";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

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
import { startupPagePrefix, startupPageUrl, startupRetryUrl } from "./startup-page.js";
import {
  emptyMenuBarPlayback,
  menuBarStatus,
  parseMenuBarPlayback,
  type MenuBarCommand,
  type MenuBarPlayback,
} from "./menu-bar.js";

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
let rendererExpectedOrigin: string | undefined;
let rendererSecurityInstalled = false;
let startupAttempt: Promise<void> | undefined;
let startupNavigationActive = true;
let startupRetry: (() => void) | undefined;
let menuBar: Tray | undefined;
let menuBarPlayback: MenuBarPlayback = emptyMenuBarPlayback;

const desktopDirectory = dirname(fileURLToPath(import.meta.url));

function sendMenuBarCommand(command: MenuBarCommand): void {
  const window = mainWindow;
  if (window === undefined || window.isDestroyed()) return;
  window.webContents.send("koradio:menu-bar-command", command);
}

function showMainWindow(): void {
  const window = mainWindow;
  if (window === undefined || window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

function updateMenuBarMenu(): void {
  const tray = menuBar;
  if (tray === undefined) return;
  const playback = menuBarPlayback;
  const title = playback.title ?? "暂无正在播放";
  const artist = playback.artist;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: menuBarStatus(playback), enabled: false },
      { label: title, enabled: false },
      ...(artist === undefined ? [] : [{ label: artist, enabled: false }]),
      { type: "separator" },
      {
        label: "上一首",
        enabled: playback.canPrevious,
        click: () => {
          sendMenuBarCommand("previous");
        },
      },
      {
        label: playback.state === "playing" ? "暂停" : "播放",
        enabled: playback.canToggle,
        click: () => {
          sendMenuBarCommand("toggle");
        },
      },
      {
        label: "下一首",
        enabled: playback.canNext,
        click: () => {
          sendMenuBarCommand("next");
        },
      },
      { type: "separator" },
      { label: "显示 Koradio", click: showMainWindow },
      {
        label: "退出 Koradio",
        click: () => {
          app.quit();
        },
      },
    ]),
  );
}

function createMenuBar(): void {
  if (menuBar !== undefined) return;
  const icon = nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none"><g stroke="black" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M24 2.5 43.5 13.7v25.1L36 43.1M12 43.1 4.5 38.8V13.7L24 2.5"/><path d="M15.5 33.5a12 12 0 1 1 17 0"/><circle cx="24" cy="20.25" r="3.25"/><path d="m24 23.5-7.2 18.1L24 47l7.2-5.4L24 23.5M20.6 37.8h6.8"/></g></svg>',
    ).toString("base64")}`,
  );
  icon.setTemplateImage(true);
  menuBar = new Tray(icon);
  menuBar.setToolTip("Koradio");
  updateMenuBarMenu();
}

ipcMain.on("koradio:menu-bar-playback", (_event, playback: unknown) => {
  menuBarPlayback = parseMenuBarPlayback(playback);
  updateMenuBarMenu();
});

async function verifyPlannerReadiness(origin: string): Promise<void> {
  const bootstrap = await fetch(`${origin}/api/v1/session/bootstrap`, {
    headers: { Origin: origin },
    method: "POST",
  });
  if (!bootstrap.ok) throw new Error("Koradio session bootstrap failed");
  const session = (await bootstrap.json()) as { accessToken?: unknown };
  if (typeof session.accessToken !== "string" || session.accessToken.length === 0) {
    throw new Error("Koradio session bootstrap returned an invalid token");
  }
  const readiness = await fetch(`${origin}/api/v1/device-settings/planner-test`, {
    headers: { Authorization: `Bearer ${session.accessToken}`, Origin: origin },
    method: "POST",
  });
  if (!readiness.ok) {
    throw new Error("活动 AI 大脑尚未通过完整节目规划检测，请在 Settings 修复后重试。");
  }
}

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

async function updateStartupStatus(
  stage: string,
  detail: string,
  retryable = false,
): Promise<void> {
  const window = mainWindow;
  if (window === undefined || window.isDestroyed()) return;
  try {
    await window.webContents.executeJavaScript(
      `window.__koradioSetStartupStatus(${JSON.stringify(stage)}, ${JSON.stringify(detail)}, ${String(retryable)})`,
      true,
    );
  } catch {
    return;
  }
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
  if (mainWindow === undefined || mainWindow.isDestroyed()) {
    dialog.showErrorBox("Koradio 无法启动", message);
    app.exit(1);
    return;
  }
  void updateStartupStatus("Koradio 启动失败", message, true);
}

async function stopOwnedService(): Promise<void> {
  const handle = serviceHandle;
  serviceHandle = undefined;
  await serviceController?.stopOwned(handle);
}

function installRendererSecurity(window: BrowserWindow, expectedOrigin: string): void {
  rendererExpectedOrigin = expectedOrigin;
  if (rendererSecurityInstalled) return;
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith(startupPagePrefix) || url === startupRetryUrl) return;
    if (!isAllowedNavigation(url, rendererExpectedOrigin ?? expectedOrigin)) {
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
      if (!app.isPackaged) {
        callback({ responseHeaders: details.responseHeaders ?? {} });
        return;
      }
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
  rendererSecurityInstalled = true;
}

function createMainWindow(): BrowserWindow {
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
      preload: resolve(desktopDirectory, "preload.js"),
      webSecurity: true,
      webviewTag: false,
    },
    width: 960,
  });
  window.setMenuBarVisibility(false);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (!startupNavigationActive) return;
    if (url === startupRetryUrl) {
      event.preventDefault();
      startupRetry?.();
      return;
    }
    if (!url.startsWith(startupPagePrefix)) event.preventDefault();
  });
  window.webContents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });
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

async function loadStartupPage(window: BrowserWindow): Promise<void> {
  startupNavigationActive = true;
  await window.loadURL(startupPageUrl);
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

async function runStartupAttempt(window: BrowserWindow): Promise<void> {
  if (startupAttempt !== undefined) return startupAttempt;
  const attempt = (async () => {
    let expectedOrigin: string | undefined;
    try {
      await updateStartupStatus("正在检查更新", "正在验证 Koradio 当前版本");
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

      if (app.isPackaged) {
        await updateStartupStatus("正在启动 Local Service", "正在检查本机服务状态");
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
          await updateStartupStatus("正在启动 Local Service", "正在等待服务健康检查");
          serviceHandle = await serviceController.waitUntilReady(started);
        }
        expectedOrigin = loopbackOrigin(serviceHandle.port);
      } else {
        await updateStartupStatus("正在连接开发服务", "正在等待 Renderer 可用");
        expectedOrigin = developmentOrigin();
      }

      await updateStartupStatus("正在验证 AI 大脑", "正在执行完整节目规划检测");
      await verifyPlannerReadiness(expectedOrigin);

      const rendererUrl = app.isPackaged
        ? `${expectedOrigin}/radio`
        : `${process.env.KORADIO_DESKTOP_DEV_URL ?? "http://127.0.0.1:5173"}/radio`;
      await updateStartupStatus("正在加载 Koradio", "正在打开产品界面");
      startupNavigationActive = false;
      installRendererSecurity(window, new URL(rendererUrl).origin);
      await loadRenderer(window, rendererUrl);
      createMenuBar();
      startupRetry = undefined;
      if (smokeMode) {
        await runRendererSmoke(window, expectedOrigin);
        const smokePort = serviceHandle?.port;
        await stopOwnedService();
        process.stdout.write(
          `${JSON.stringify({ ok: true, origin: expectedOrigin, port: smokePort, renderer: true })}\n`,
        );
        app.exit(0);
      }
    } catch (error) {
      if (expectedOrigin !== undefined) {
        try {
          startupNavigationActive = false;
          installRendererSecurity(window, expectedOrigin);
          await loadRenderer(window, `${expectedOrigin}/settings`);
          await updateStartupStatus(
            "AI 大脑需要修复",
            "请在 Settings 修复活动 AI 大脑后重新打开 Koradio。",
            true,
          );
          return;
        } catch {
          await stopOwnedService();
        }
      } else {
        await stopOwnedService();
      }
      if (smokeMode) {
        showFailure(error);
        return;
      }
      try {
        await loadStartupPage(window);
      } catch {
        startupNavigationActive = true;
      }
      showFailure(error);
    }
  })().finally(() => {
    startupAttempt = undefined;
  });
  startupAttempt = attempt;
  return attempt;
}

async function startApplication(): Promise<void> {
  await app.whenReady();
  const window = createMainWindow();
  await loadStartupPage(window);
  startupRetry = () => {
    void runStartupAttempt(window);
  };
  await runStartupAttempt(window);
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
