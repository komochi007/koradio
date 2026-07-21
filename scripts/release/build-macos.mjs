import { createHash } from "node:crypto";
import { access, chmod, cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { arch, platform } from "node:os";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { URL, fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const nodeVersion = "24.18.0";
const nodeArchives = {
  arm64: {
    architecture: "arm64",
    sha256: "e1a97e14c99c803e96c7339403282ea05a499c32f8d83defe9ef5ec66f979ed1",
  },
  x64: {
    architecture: "x64",
    sha256: "dfd0dbd3e721503434df7b7205e719f61b3a3a31b2bcf9729b8b91fea240f080",
  },
};

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
  while (values.length > 0) {
    const argument = values.shift();
    if (argument === "--arch") {
      architecture = values.shift() ?? "";
    } else if (argument === "--output") {
      outputDirectory = resolve(repositoryRoot, values.shift() ?? "");
    } else {
      fail(`Unsupported argument: ${argument ?? ""}`);
    }
  }
  if (!(architecture in nodeArchives)) {
    fail("--arch must be arm64 or x64");
  }
  return { architecture, outputDirectory };
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

async function writeInfoPlist(path) {
  await writeFile(
    path,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleDevelopmentRegion</key><string>zh_CN</string>
<key>CFBundleExecutable</key><string>Koradio</string>
<key>CFBundleIdentifier</key><string>app.koradio.launcher</string>
<key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
<key>CFBundleName</key><string>Koradio</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.0.0</string>
<key>CFBundleVersion</key><string>1</string>
<key>LSMinimumSystemVersion</key><string>13.5</string>
<key>LSUIElement</key><true/>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
`,
    "utf8",
  );
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
  const { architecture, outputDirectory } = parseArguments(process.argv.slice(2));
  const cacheDirectory = resolve(outputDirectory, "cache");
  await mkdir(cacheDirectory, { recursive: true });
  const dmg = resolve(outputDirectory, `Koradio-0.0.0-${architecture}.dmg`);
  if (await exists(dmg)) {
    fail(`Refusing to overwrite existing artifact: ${dmg}`);
  }
  const archive = await downloadNodeArchive(architecture, cacheDirectory);
  const stagingRoot = await mkdtemp(resolve(outputDirectory, `.staging-${architecture}-`));
  const buildToolDirectory = resolve(stagingRoot, ".toolchain");
  const application = resolve(stagingRoot, "Koradio.app");
  const contents = resolve(application, "Contents");
  const macOs = resolve(contents, "MacOS");
  const resources = resolve(contents, "Resources");
  const runtime = resolve(resources, "runtime");
  const serverTarget = resolve(resources, "app/apps/server");
  const webTarget = resolve(resources, "app/apps/web/dist");
  await mkdir(macOs, { recursive: true });
  await mkdir(runtime, { recursive: true });
  await mkdir(buildToolDirectory, { recursive: true });
  await mkdir(dirname(serverTarget), { recursive: true });
  await mkdir(dirname(webTarget), { recursive: true });
  await writeInfoPlist(resolve(contents, "Info.plist"));

  await run("tar", [
    "-xzf",
    archive,
    "-C",
    runtime,
    "--strip-components=1",
    `node-v${nodeVersion}-darwin-${architecture}/bin/node`,
    `node-v${nodeVersion}-darwin-${architecture}/LICENSE`,
  ]);
  const bundledNode = resolve(runtime, "bin/node");
  await chmod(bundledNode, 0o755);
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
    PATH: `${buildToolDirectory}:${process.env.PATH ?? ""}`,
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

  const swiftTarget = architecture === "arm64" ? "arm64-apple-macos13.5" : "x86_64-apple-macos13.5";
  await run("swiftc", [
    "-target",
    swiftTarget,
    "-framework",
    "AVFoundation",
    "-o",
    resolve(resources, "koradio-tts-helper"),
    resolve(repositoryRoot, "native/macos/tts-helper/main.swift"),
  ]);
  await run("swiftc", [
    "-target",
    swiftTarget,
    "-framework",
    "AppKit",
    "-o",
    resolve(macOs, "Koradio"),
    resolve(repositoryRoot, "packaging/macos/launcher/main.swift"),
  ]);
  await chmod(resolve(resources, "koradio-tts-helper"), 0o755);
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
  await run("codesign", [
    "--force",
    "--sign",
    "-",
    "--options",
    "runtime",
    resolve(resources, "koradio-tts-helper"),
  ]);
  await run("codesign", ["--force", "--deep", "--sign", "-", "--options", "runtime", application]);
  await run("codesign", ["--verify", "--deep", "--strict", application]);
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
  process.stdout.write(`${JSON.stringify({ app: application, architecture, dmg })}\n`);
}

build().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "macOS packaging failed"}\n`);
  process.exitCode = 1;
});
