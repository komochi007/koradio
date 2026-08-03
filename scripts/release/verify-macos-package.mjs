import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import process from "node:process";
import { URL, fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const applicationBundleIdentifier = "app.koradio.launcher";
const applicationIconName = "KoradioAppIconPadded";
const applicationIconFileName = `${applicationIconName}.icns`;
const electronVersion = "43.2.0";
const applicationIconRepresentations = [
  "icon_16x16.png",
  "icon_16x16@2x.png",
  "icon_32x32.png",
  "icon_32x32@2x.png",
  "icon_128x128.png",
  "icon_128x128@2x.png",
  "icon_256x256.png",
  "icon_256x256@2x.png",
  "icon_512x512.png",
  "icon_512x512@2x.png",
];

function run(executable, commandArguments, { input, ...options } = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(executable, commandArguments, {
      cwd: repositoryRoot,
      stdio: ["pipe", "pipe", "pipe"],
      ...options,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolveRun({ stderr, stdout });
      } else {
        reject(new Error(`${executable} exited with ${String(code)}: ${stderr.trim()}`));
      }
    });
    child.stdin.end(input);
  });
}

async function assertMissing(path) {
  try {
    await access(path);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`Unexpected packaged resource exists: ${path}`);
}

function parseSmokeResult(stdout) {
  const line = stdout.trim().split("\n").at(-1);
  if (line === undefined || line.length === 0) {
    throw new Error("Electron smoke result is missing");
  }
  try {
    return JSON.parse(line);
  } catch {
    throw new Error("Electron smoke result is not JSON");
  }
}

async function verifyApplication(application) {
  const infoPlist = resolve(application, "Contents/Info.plist");
  const launcher = resolve(application, "Contents/MacOS/Koradio");
  const electronFramework = resolve(
    application,
    "Contents/Frameworks/Electron Framework.framework",
  );
  const electronHelper = resolve(application, "Contents/Frameworks/Koradio Helper.app");
  const desktopPackage = resolve(application, "Contents/Resources/app/package.json");
  const desktopMain = resolve(application, "Contents/Resources/app/dist/main.js");
  const serverEntrypoint = resolve(
    application,
    "Contents/Resources/app/apps/server/dist/bootstrap/main.js",
  );
  const webIndex = resolve(application, "Contents/Resources/app/apps/web/dist/index.html");
  const node = resolve(application, "Contents/Resources/runtime/bin/node");
  const corepack = resolve(
    application,
    "Contents/Resources/runtime/lib/node_modules/corepack/dist/pnpm.js",
  );
  const python = resolve(application, "Contents/Resources/qwen-runtime/bin/python");
  const helper = resolve(application, "Contents/Resources/qwen-tts-helper/main.py");
  const icon = resolve(application, `Contents/Resources/${applicationIconFileName}`);
  const updater = resolve(application, "Contents/Resources/updater/update-macos.mjs");
  const updaterCore = resolve(application, "Contents/Resources/updater/macos-update-core.mjs");
  const metadata = JSON.parse(
    await readFile(resolve(application, "Contents/Resources/build-metadata.json"), "utf8"),
  );
  if (
    metadata.schemaVersion !== 1 ||
    metadata.shell !== "electron" ||
    metadata.electronVersion !== electronVersion ||
    !/^[0-9a-f]{40}$/.test(metadata.sourceCommit) ||
    metadata.sourceRemote !== "https://github.com/komochi007/koradio.git"
  ) {
    throw new Error("Build metadata is invalid");
  }
  const desktopPackageJson = JSON.parse(await readFile(desktopPackage, "utf8"));
  if (
    desktopPackageJson.name !== "@koradio/desktop" ||
    desktopPackageJson.main !== "dist/main.js"
  ) {
    throw new Error("Electron desktop package metadata is invalid");
  }
  await Promise.all([
    access(electronFramework),
    access(electronHelper),
    access(serverEntrypoint),
    access(webIndex),
    access(desktopMain),
    access(corepack),
    access(icon),
    access(updater),
    access(updaterCore),
    assertMissing(resolve(application, "Contents/Resources/Google Chrome.app")),
    assertMissing(resolve(application, "Contents/Resources/app.asar")),
  ]);
  const dataDirectory = await mkdtemp(resolve(tmpdir(), "koradio-package-smoke-"));
  const smokeUserDataDirectory = `${dataDirectory}-electron-user-data`;
  const pythonEnvironment = {
    ...process.env,
    PYTHONDONTWRITEBYTECODE: "1",
    PYTHONPYCACHEPREFIX: resolve(dataDirectory, "pycache"),
  };
  try {
    await run("codesign", ["--verify", "--deep", "--strict", application]);
    const bundleIdentifier = await run("/usr/bin/plutil", [
      "-extract",
      "CFBundleIdentifier",
      "raw",
      infoPlist,
    ]);
    const iconName = await run("/usr/bin/plutil", [
      "-extract",
      "CFBundleIconFile",
      "raw",
      infoPlist,
    ]);
    const info = await run("/usr/bin/plutil", ["-p", infoPlist]);
    if (
      bundleIdentifier.stdout.trim() !== applicationBundleIdentifier ||
      iconName.stdout.trim() !== applicationIconFileName ||
      /\bLSUIElement\b.*=>\s*(?:1|true)/.test(info.stdout)
    ) {
      throw new Error("Application identity metadata is invalid");
    }
    const iconset = resolve(dataDirectory, "Koradio.iconset");
    await run("/usr/bin/iconutil", ["--convert", "iconset", "--output", iconset, icon]);
    await Promise.all(
      applicationIconRepresentations.map((filename) => access(resolve(iconset, filename))),
    );
    const nodeVersion = await run(node, ["--version"]);
    if (nodeVersion.stdout.trim() !== "v24.18.0") {
      throw new Error("Bundled Node runtime version is not v24.18.0");
    }
    const pythonVersion = await run(python, ["--version"], {
      env: pythonEnvironment,
    });
    if (!pythonVersion.stdout.includes("Python 3.12.13")) {
      throw new Error("Bundled Qwen Python runtime version is invalid");
    }
    await run(
      python,
      [
        "-c",
        "import importlib.metadata, mlx_audio, numpy; assert importlib.metadata.version('mlx-audio') == '0.4.5'",
      ],
      {
        env: pythonEnvironment,
      },
    );
    await run(python, ["-m", "py_compile", helper], {
      env: pythonEnvironment,
    });
    const smoke = await run(launcher, ["--smoke"], {
      env: {
        ...process.env,
        KORADIO_DESKTOP_SMOKE_USER_DATA_DIR: smokeUserDataDirectory,
        KORADIO_LAUNCHER_SMOKE_DATA_DIR: dataDirectory,
      },
    });
    const smokeResult = parseSmokeResult(smoke.stdout);
    if (
      smokeResult.ok !== true ||
      smokeResult.renderer !== true ||
      typeof smokeResult.origin !== "string" ||
      !/^http:\/\/127\.0\.0\.1:\d+$/.test(smokeResult.origin) ||
      !Number.isInteger(smokeResult.port) ||
      smokeResult.port < 49373 ||
      smokeResult.port > 49383
    ) {
      throw new Error("Electron smoke result is invalid");
    }
    await run("codesign", ["--verify", "--deep", "--strict", application]);
    return {
      node: nodeVersion.stdout.trim(),
      python: pythonVersion.stdout.trim(),
      qwenRuntime: true,
      sourceCommit: metadata.sourceCommit,
    };
  } finally {
    await rm(dataDirectory, { force: true, recursive: true });
    await rm(smokeUserDataDirectory, { force: true, recursive: true });
  }
}

async function verify() {
  const packagePath =
    process.argv.slice(2).find((argument) => argument !== "--") === undefined
      ? undefined
      : resolve(repositoryRoot, process.argv.slice(2).find((argument) => argument !== "--") ?? "");
  if (
    packagePath === undefined ||
    (!packagePath.endsWith(".app") && !packagePath.endsWith(".dmg"))
  ) {
    throw new Error(
      "Usage: node scripts/release/verify-macos-package.mjs <Koradio.app|Koradio.dmg>",
    );
  }
  if (packagePath.endsWith(".app")) {
    const result = await verifyApplication(packagePath);
    process.stdout.write(`${JSON.stringify({ app: packagePath, ...result })}\n`);
    return;
  }
  const mountPoint = await mkdtemp(resolve(tmpdir(), "koradio-package-mount-"));
  let mounted = false;
  try {
    await run("hdiutil", [
      "attach",
      "-readonly",
      "-nobrowse",
      "-mountpoint",
      mountPoint,
      packagePath,
    ]);
    mounted = true;
    const application = resolve(mountPoint, "Koradio.app");
    const result = await verifyApplication(application);
    process.stdout.write(`${JSON.stringify({ app: application, dmg: packagePath, ...result })}\n`);
  } finally {
    if (mounted) {
      await run("hdiutil", ["detach", mountPoint]);
    }
    await rm(mountPoint, { force: true, recursive: true });
  }
}

verify().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "macOS package verification failed"}\n`,
  );
  process.exitCode = 1;
});
