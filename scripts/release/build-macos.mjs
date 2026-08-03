import { createHash } from "node:crypto";
import {
  access,
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { arch, platform } from "node:os";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { URL, fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const nodeVersion = "24.18.0";
const pythonVersion = "3.12.13";
const uvVersion = "0.11.32";
const uvArchiveSha256 = "ed336d0ba49db8ef89b2b41fffa372ce63bd032f22a56f001c265891aec32829";
const applicationIconName = "KoradioAppIconPadded";
const nodeArchives = {
  arm64: {
    architecture: "arm64",
    sha256: "e1a97e14c99c803e96c7339403282ea05a499c32f8d83defe9ef5ec66f979ed1",
  },
};
const applicationIconRepresentations = [
  ["icon_16x16.png", 16],
  ["icon_16x16@2x.png", 32],
  ["icon_32x32.png", 32],
  ["icon_32x32@2x.png", 64],
  ["icon_128x128.png", 128],
  ["icon_128x128@2x.png", 256],
  ["icon_256x256.png", 256],
  ["icon_256x256@2x.png", 512],
  ["icon_512x512.png", 512],
  ["icon_512x512@2x.png", 1024],
];

function fail(message) {
  throw new Error(message);
}

function run(executable, commandArguments, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(executable, commandArguments, {
      cwd: repositoryRoot,
      stdio: "inherit",
      ...options,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolveRun();
      } else {
        reject(
          new Error(
            `${executable} exited with ${String(code)}${signal === null ? "" : ` (${signal})`}`,
          ),
        );
      }
    });
  });
}

function runCapture(executable, commandArguments, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(executable, commandArguments, {
      cwd: repositoryRoot,
      stdio: ["ignore", "pipe", "pipe"],
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
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolveRun({ stderr, stdout });
      } else {
        reject(
          new Error(
            `${executable} exited with ${String(code)}${
              signal === null ? "" : ` (${signal})`
            }: ${stderr.trim()}`,
          ),
        );
      }
    });
  });
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function parseArguments(argumentsList) {
  const values = [...argumentsList];
  let architecture = platform() === "darwin" && arch() === "arm64" ? "arm64" : "x64";
  let outputDirectory = resolve(repositoryRoot, "artifacts/macos");
  let version = "0.0.0";
  let keepApp = false;
  let noDmg = false;
  let sourceCommit;
  while (values.length > 0) {
    const argument = values.shift();
    if (argument === "--") {
      continue;
    }
    if (argument === "--arch") {
      architecture = values.shift() ?? "";
    } else if (argument === "--output") {
      outputDirectory = resolve(repositoryRoot, values.shift() ?? "");
    } else if (argument === "--version") {
      version = values.shift() ?? "";
    } else if (argument === "--commit") {
      sourceCommit = values.shift() ?? "";
    } else if (argument === "--keep-app") {
      keepApp = true;
    } else if (argument === "--no-dmg") {
      noDmg = true;
    } else {
      fail(`Unsupported argument: ${argument ?? ""}`);
    }
  }
  if (architecture !== "arm64") {
    fail("Qwen3-TTS packaging supports arm64 only");
  }
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    fail("--version must be a numeric semantic version such as 1.2.3");
  }
  if (sourceCommit !== undefined && !/^[0-9a-f]{40}$/.test(sourceCommit)) {
    fail("--commit must be a full lowercase Git commit");
  }
  if (noDmg && !keepApp) {
    fail("--no-dmg requires --keep-app");
  }
  return { architecture, keepApp, noDmg, outputDirectory, sourceCommit, version };
}

async function checksum(path) {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

async function downloadNodeArchive(architecture, cacheDirectory) {
  const details = nodeArchives[architecture];
  const filename = `node-v${nodeVersion}-darwin-${details.architecture}.tar.gz`;
  const archive = resolve(cacheDirectory, filename);
  if (await exists(archive)) {
    if ((await checksum(archive)) !== details.sha256) {
      fail(`Cached Node archive checksum mismatch: ${archive}`);
    }
    return archive;
  }
  const temporaryArchive = `${archive}.partial`;
  if (await exists(temporaryArchive)) {
    fail(`Partial Node archive already exists: ${temporaryArchive}`);
  }
  await run("curl", [
    "--fail",
    "--location",
    "--proto",
    "=https",
    "--tlsv1.2",
    "--output",
    temporaryArchive,
    `https://nodejs.org/dist/v${nodeVersion}/${filename}`,
  ]);
  if ((await checksum(temporaryArchive)) !== details.sha256) {
    fail("Downloaded Node archive checksum mismatch");
  }
  await run("mv", [temporaryArchive, archive]);
  return archive;
}

async function downloadUvArchive(cacheDirectory) {
  const filename = "uv-aarch64-apple-darwin.tar.gz";
  const archive = resolve(cacheDirectory, `uv-${uvVersion}-${filename}`);
  if (await exists(archive)) {
    if ((await checksum(archive)) !== uvArchiveSha256) {
      fail(`Cached uv archive checksum mismatch: ${archive}`);
    }
    return archive;
  }
  const temporaryArchive = `${archive}.partial`;
  if (await exists(temporaryArchive)) {
    fail(`Partial uv archive already exists: ${temporaryArchive}`);
  }
  await run("curl", [
    "--fail",
    "--location",
    "--proto",
    "=https",
    "--tlsv1.2",
    "--output",
    temporaryArchive,
    `https://github.com/astral-sh/uv/releases/download/${uvVersion}/${filename}`,
  ]);
  if ((await checksum(temporaryArchive)) !== uvArchiveSha256) {
    fail("Downloaded uv archive checksum mismatch");
  }
  await run("mv", [temporaryArchive, archive]);
  return archive;
}

async function writeInfoPlist(path, version) {
  await writeFile(
    path,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleDevelopmentRegion</key><string>zh_CN</string>
<key>CFBundleExecutable</key><string>Koradio</string>
<key>CFBundleIdentifier</key><string>app.koradio.launcher</string>
<key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
<key>CFBundleIconFile</key><string>${applicationIconName}</string>
<key>CFBundleName</key><string>Koradio</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>${version}</string>
<key>CFBundleVersion</key><string>${version}</string>
<key>LSMinimumSystemVersion</key><string>15.0</string>
<key>LSUIElement</key><true/>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
`,
    "utf8",
  );
}

async function writeApplicationIcon(iconsetDirectory, destination) {
  const source = resolve(repositoryRoot, "apps/web/public/icons/koradio-app-icon.svg");
  await mkdir(iconsetDirectory, { recursive: true });
  for (const [filename, size] of applicationIconRepresentations) {
    await run("/usr/bin/sips", [
      "-z",
      String(size),
      String(size),
      "-s",
      "format",
      "png",
      source,
      "--out",
      resolve(iconsetDirectory, filename),
    ]);
  }
  await run("/usr/bin/iconutil", ["--convert", "icns", "--output", destination, iconsetDirectory]);
}

async function runPnpm(nodeExecutable, commandArguments, environment) {
  const pnpmEntry = process.env.KORADIO_PNPM_ENTRY;
  if (pnpmEntry === undefined || pnpmEntry.trim().length === 0) {
    await run("pnpm", commandArguments, { env: environment });
    return;
  }
  await run(nodeExecutable, [resolve(pnpmEntry), ...commandArguments], { env: environment });
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\\"'\\\"'")}'`;
}

async function build() {
  if (platform() !== "darwin") {
    fail("macOS packaging can only run on macOS");
  }
  const {
    architecture,
    keepApp,
    noDmg,
    outputDirectory,
    sourceCommit: requestedSourceCommit,
    version,
  } = parseArguments(process.argv.slice(2));
  const sourceCommit =
    requestedSourceCommit ??
    (
      await runCapture("/usr/bin/git", ["rev-parse", "HEAD"], {
        cwd: repositoryRoot,
      })
    ).stdout.trim();
  if (!/^[0-9a-f]{40}$/.test(sourceCommit)) {
    fail("Could not resolve a full lowercase Git source commit");
  }
  const cacheDirectory =
    process.env.KORADIO_PACKAGING_CACHE_DIRECTORY === undefined
      ? resolve(repositoryRoot, "artifacts/macos/cache")
      : resolve(process.env.KORADIO_PACKAGING_CACHE_DIRECTORY);
  await mkdir(cacheDirectory, { recursive: true });
  await mkdir(outputDirectory, { recursive: true });
  const dmg = resolve(outputDirectory, `Koradio-${version}-${architecture}.dmg`);
  const retainedApplication = resolve(outputDirectory, `Koradio-${version}-${architecture}.app`);
  if (!noDmg && (await exists(dmg))) {
    fail(`Refusing to overwrite existing artifact: ${dmg}`);
  }
  if (keepApp && (await exists(retainedApplication))) {
    fail(`Refusing to overwrite existing artifact: ${retainedApplication}`);
  }
  const archive = await downloadNodeArchive(architecture, cacheDirectory);
  const uvArchive = await downloadUvArchive(cacheDirectory);
  const stagingRoot = await mkdtemp(resolve(outputDirectory, `.staging-${architecture}-`));
  try {
    const buildToolDirectory = resolve(stagingRoot, ".toolchain");
    const application = resolve(stagingRoot, "Koradio.app");
    const contents = resolve(application, "Contents");
    const macOs = resolve(contents, "MacOS");
    const resources = resolve(contents, "Resources");
    const runtime = resolve(resources, "runtime");
    const qwenRuntime = resolve(resources, "qwen-runtime");
    const qwenHelper = resolve(resources, "qwen-tts-helper/main.py");
    const updaterTarget = resolve(resources, "updater");
    const serverTarget = resolve(resources, "app/apps/server");
    const webTarget = resolve(resources, "app/apps/web/dist");
    await mkdir(macOs, { recursive: true });
    await mkdir(runtime, { recursive: true });
    await mkdir(buildToolDirectory, { recursive: true });
    await mkdir(dirname(serverTarget), { recursive: true });
    await mkdir(dirname(webTarget), { recursive: true });
    await mkdir(dirname(qwenHelper), { recursive: true });
    await mkdir(updaterTarget, { recursive: true });
    await writeInfoPlist(resolve(contents, "Info.plist"), version);
    await writeApplicationIcon(
      resolve(buildToolDirectory, "Koradio.iconset"),
      resolve(resources, `${applicationIconName}.icns`),
    );
    await writeFile(
      resolve(resources, "build-metadata.json"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          sourceCommit,
          sourceRemote: "https://github.com/komochi007/koradio.git",
          version,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await cp(
      resolve(repositoryRoot, "scripts/release/macos-update-core.mjs"),
      resolve(updaterTarget, "macos-update-core.mjs"),
    );
    await cp(
      resolve(repositoryRoot, "scripts/release/update-macos.mjs"),
      resolve(updaterTarget, "update-macos.mjs"),
    );

    await run("tar", [
      "-xzf",
      archive,
      "-C",
      runtime,
      "--strip-components=1",
      `node-v${nodeVersion}-darwin-${architecture}/bin/node`,
      `node-v${nodeVersion}-darwin-${architecture}/LICENSE`,
      `node-v${nodeVersion}-darwin-${architecture}/lib/node_modules/corepack`,
    ]);
    const bundledNode = resolve(runtime, "bin/node");
    await chmod(bundledNode, 0o755);
    await run("tar", [
      "-xzf",
      uvArchive,
      "-C",
      buildToolDirectory,
      "--strip-components=1",
      "uv-aarch64-apple-darwin/uv",
    ]);
    const uv = resolve(buildToolDirectory, "uv");
    await chmod(uv, 0o755);
    const pythonInstallDirectory = resolve(cacheDirectory, "python");
    const uvCacheDirectory = resolve(cacheDirectory, "uv-packages");
    await run(
      uv,
      ["python", "install", pythonVersion, "--install-dir", pythonInstallDirectory, "--no-bin"],
      {
        env: {
          ...process.env,
          UV_CACHE_DIR: uvCacheDirectory,
        },
      },
    );
    const managedPython = resolve(
      pythonInstallDirectory,
      `cpython-${pythonVersion}-macos-aarch64-none/bin/python3.12`,
    );
    await cp(resolve(managedPython, "../.."), qwenRuntime, {
      recursive: true,
      verbatimSymlinks: true,
    });
    await run(
      uv,
      [
        "pip",
        "install",
        "--python",
        resolve(qwenRuntime, "bin/python"),
        "--system",
        "--break-system-packages",
        "--require-hashes",
        "--requirement",
        resolve(repositoryRoot, "native/macos/qwen-tts-helper/requirements.lock"),
      ],
      {
        env: {
          ...process.env,
          UV_CACHE_DIR: uvCacheDirectory,
        },
      },
    );
    await cp(resolve(repositoryRoot, "native/macos/qwen-tts-helper/main.py"), qwenHelper);
    await chmod(resolve(qwenRuntime, "bin/python"), 0o755);
    const pnpmEntry = process.env.KORADIO_PNPM_ENTRY;
    if (pnpmEntry !== undefined && pnpmEntry.trim().length > 0) {
      const pnpmWrapper = resolve(buildToolDirectory, "pnpm");
      await writeFile(
        pnpmWrapper,
        `#!/bin/sh\nexec ${shellQuote(bundledNode)} ${shellQuote(resolve(pnpmEntry))} "$@"\n`,
        "utf8",
      );
      await chmod(pnpmWrapper, 0o755);
    }
    const buildEnvironment = {
      ...process.env,
      PATH: `${buildToolDirectory}:${dirname(bundledNode)}:${process.env.PATH ?? ""}`,
    };
    await runPnpm(bundledNode, ["install", "--frozen-lockfile"], buildEnvironment);
    await runPnpm(bundledNode, ["build"], buildEnvironment);
    await runPnpm(
      bundledNode,
      [
        "--config.inject-workspace-packages=true",
        "--filter",
        "@koradio/server",
        "deploy",
        "--prod",
        serverTarget,
      ],
      buildEnvironment,
    );
    await cp(resolve(repositoryRoot, "apps/web/dist"), webTarget, { recursive: true });

    const swiftTarget = "arm64-apple-macos15.0";
    await run("swiftc", [
      "-target",
      swiftTarget,
      "-framework",
      "AppKit",
      "-o",
      resolve(macOs, "Koradio"),
      resolve(repositoryRoot, "packaging/macos/launcher/main.swift"),
    ]);
    await chmod(resolve(macOs, "Koradio"), 0o755);
    await run("codesign", [
      "--force",
      "--sign",
      "-",
      "--options",
      "runtime",
      "--entitlements",
      resolve(repositoryRoot, "packaging/macos/node-entitlements.plist"),
      resolve(runtime, "bin/node"),
    ]);
    await run("find", [
      qwenRuntime,
      "-type",
      "f",
      "(",
      "-name",
      "*.so",
      "-o",
      "-name",
      "*.dylib",
      ")",
      "-exec",
      "codesign",
      "--force",
      "--sign",
      "-",
      "{}",
      ";",
    ]);
    await run("codesign", [
      "--force",
      "--deep",
      "--sign",
      "-",
      "--options",
      "runtime",
      "--entitlements",
      resolve(repositoryRoot, "packaging/macos/python-entitlements.plist"),
      resolve(qwenRuntime, "bin/python"),
    ]);
    await run("codesign", [
      "--force",
      "--deep",
      "--sign",
      "-",
      "--options",
      "runtime",
      application,
    ]);
    await run("codesign", ["--verify", "--deep", "--strict", application]);
    if (!noDmg) {
      await run("hdiutil", [
        "create",
        "-volname",
        "Koradio",
        "-srcfolder",
        application,
        "-ov",
        "-format",
        "UDZO",
        dmg,
      ]);
    }
    if (keepApp) {
      await rename(application, retainedApplication);
    }
    process.stdout.write(
      `${JSON.stringify({
        app: keepApp ? retainedApplication : null,
        architecture,
        dmg: noDmg ? null : dmg,
        sourceCommit,
        version,
      })}\n`,
    );
  } finally {
    await rm(stagingRoot, { force: true, recursive: true });
  }
}

build().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "macOS packaging failed"}\n`);
  process.exitCode = 1;
});
