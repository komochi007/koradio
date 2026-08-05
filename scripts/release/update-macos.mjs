import { randomUUID } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rename, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import {
  backupDirectoryName,
  needsUpdate,
  parseBuildMetadata,
  trustedUpdateRemote,
  versionFromCommitCount,
} from "./macos-update-core.mjs";

const maximumCapturedOutput = 1024 * 1024;

function fail(message) {
  throw new Error(message);
}

function appendBounded(current, chunk) {
  const combined = `${current}${String(chunk)}`;
  return combined.length <= maximumCapturedOutput
    ? combined
    : combined.slice(combined.length - maximumCapturedOutput);
}

function run(executable, commandArguments, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(executable, commandArguments, {
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout = appendBounded(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = appendBounded(stderr, chunk);
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolveRun({ stderr, stdout });
      } else {
        reject(
          new Error(
            `${basename(executable)} exited with ${String(code)}${
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
  let application;
  let checkOnly = false;
  while (values.length > 0) {
    const argument = values.shift();
    if (argument === "--application") {
      application = resolve(values.shift() ?? "");
    } else if (argument === "--check-only") {
      checkOnly = true;
    } else {
      fail(`Unsupported argument: ${argument ?? ""}`);
    }
  }
  if (
    application === undefined ||
    !/^Koradio(?:-(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-arm64)?\.app$/.test(
      basename(application),
    )
  ) {
    fail(
      "Usage: update-macos.mjs --application <Koradio.app|Koradio-<version>-arm64.app> [--check-only]",
    );
  }
  return { application, checkOnly };
}

async function readMetadata(application) {
  const path = join(application, "Contents/Resources/build-metadata.json");
  return parseBuildMetadata(JSON.parse(await readFile(path, "utf8")));
}

async function ensureSourceCheckout(sourceDirectory, cacheDirectory) {
  if (await exists(join(sourceDirectory, ".git"))) {
    const remote = await run("/usr/bin/git", ["remote", "get-url", "origin"], {
      cwd: sourceDirectory,
    });
    if (remote.stdout.trim() !== trustedUpdateRemote) {
      fail("Updater source remote is not trusted");
    }
    const status = await run("/usr/bin/git", ["status", "--porcelain", "--untracked-files=no"], {
      cwd: sourceDirectory,
    });
    if (status.stdout.trim().length > 0) {
      fail("Updater-owned source checkout contains tracked changes");
    }
    return;
  }

  await mkdir(cacheDirectory, { recursive: true });
  const stagingDirectory = await mkdtemp(join(cacheDirectory, "source-"));
  try {
    await run(
      "/usr/bin/git",
      [
        "clone",
        "--filter=blob:none",
        "--branch",
        "main",
        "--single-branch",
        trustedUpdateRemote,
        stagingDirectory,
      ],
      { cwd: cacheDirectory },
    );
    await rename(stagingDirectory, sourceDirectory);
  } catch (error) {
    await rm(stagingDirectory, { force: true, recursive: true });
    throw error;
  }
}

async function installCandidate(candidate, application, backupDirectory, metadata) {
  const stagingApplication = join(
    dirname(application),
    `.Koradio.update-${metadata.sourceCommit.slice(0, 12)}-${randomUUID()}.app`,
  );
  try {
    await run("/usr/bin/ditto", [candidate, stagingApplication]);
    await run("/usr/bin/codesign", ["--verify", "--deep", "--strict", stagingApplication]);
  } catch (error) {
    await rm(stagingApplication, { force: true, recursive: true });
    throw error;
  }

  await mkdir(backupDirectory, { recursive: true });
  const backup = join(backupDirectory, backupDirectoryName(metadata, Date.now()));
  await rename(application, backup);
  try {
    await rename(stagingApplication, application);
  } catch (error) {
    await rename(backup, application);
    await rm(stagingApplication, { force: true, recursive: true });
    throw error;
  }
  return backup;
}

async function update() {
  const { application, checkOnly } = parseArguments(process.argv.slice(2));
  const installedMetadata = await readMetadata(application);
  const userHome = homedir();
  const cacheDirectory = join(userHome, "Library/Caches/Koradio/Updater");
  const sourceDirectory = join(cacheDirectory, "source");
  const stateDirectory = join(userHome, "Library/Application Support/Koradio/Updater");
  await ensureSourceCheckout(sourceDirectory, cacheDirectory);
  await run("/usr/bin/git", ["fetch", "--prune", "origin", "main"], {
    cwd: sourceDirectory,
  });
  const remote = await run("/usr/bin/git", ["rev-parse", "origin/main"], {
    cwd: sourceDirectory,
  });
  const remoteCommit = remote.stdout.trim();
  if (!needsUpdate(installedMetadata.sourceCommit, remoteCommit)) {
    process.stdout.write(`${JSON.stringify({ commit: remoteCommit, status: "current" })}\n`);
    return;
  }
  if (checkOnly) {
    process.stdout.write(
      `${JSON.stringify({
        installedCommit: installedMetadata.sourceCommit,
        remoteCommit,
        status: "update_available",
      })}\n`,
    );
    return;
  }

  await run("/usr/bin/git", ["checkout", "--detach", remoteCommit], {
    cwd: sourceDirectory,
  });
  const commitCountResult = await run("/usr/bin/git", ["rev-list", "--count", remoteCommit], {
    cwd: sourceDirectory,
  });
  const version = versionFromCommitCount(Number(commitCountResult.stdout.trim()));
  const buildDirectory = await mkdtemp(join(tmpdir(), "koradio-auto-update-"));
  const updaterNode = process.execPath;
  const pnpmEntry = join(
    application,
    "Contents/Resources/runtime/lib/node_modules/corepack/dist/pnpm.js",
  );
  const buildScript = join(sourceDirectory, "scripts/release/build-macos.mjs");
  const verifyScript = join(sourceDirectory, "scripts/release/verify-macos-package.mjs");
  try {
    await run(
      updaterNode,
      [
        buildScript,
        "--arch",
        "arm64",
        "--version",
        version,
        "--commit",
        remoteCommit,
        "--output",
        buildDirectory,
        "--keep-app",
        "--no-dmg",
      ],
      {
        cwd: sourceDirectory,
        env: {
          ...process.env,
          COREPACK_HOME: join(cacheDirectory, "corepack"),
          KORADIO_PACKAGING_CACHE_DIRECTORY: join(cacheDirectory, "packaging"),
          KORADIO_PNPM_ENTRY: pnpmEntry,
        },
      },
    );
    const candidate = join(buildDirectory, `Koradio-${version}-arm64.app`);
    await run(updaterNode, [verifyScript, candidate], {
      cwd: sourceDirectory,
      env: process.env,
    });
    const backup = await installCandidate(
      candidate,
      application,
      join(stateDirectory, "backups"),
      installedMetadata,
    );
    process.stdout.write(
      `${JSON.stringify({
        backup,
        commit: remoteCommit,
        status: "updated",
        version,
      })}\n`,
    );
  } finally {
    await rm(buildDirectory, { force: true, recursive: true });
  }
}

update().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Koradio update failed"}\n`);
  process.exitCode = 1;
});
