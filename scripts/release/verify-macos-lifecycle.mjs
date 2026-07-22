import { createHash } from "node:crypto";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { URL, fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

function fail(message) {
  throw new Error(message);
}

function run(executable, commandArguments, options = {}) {
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
    child.once("exit", (code) => {
      resolveRun({ code: code ?? 1, stderr, stdout });
    });
  });
}

function parseArguments(argumentsList) {
  const values = [...argumentsList];
  let oldApplication;
  let newApplication;
  while (values.length > 0) {
    const argument = values.shift();
    if (argument === "--old") {
      oldApplication = resolve(values.shift() ?? "");
    } else if (argument === "--new") {
      newApplication = resolve(values.shift() ?? "");
    } else {
      fail(`Unsupported argument: ${argument ?? ""}`);
    }
  }
  if (oldApplication === undefined || newApplication === undefined) {
    fail(
      "Usage: node scripts/release/verify-macos-lifecycle.mjs --old <Koradio.app> --new <Koradio.app>",
    );
  }
  return { newApplication, oldApplication };
}

function parseVersion(value) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
  if (match === null) {
    fail(`Unsupported app version: ${value}`);
  }
  return match.slice(1).map(Number);
}

function compareVersions(left, right) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  return leftParts.findIndex((part, index) => part !== rightParts[index]);
}

function compareAppVersions(left, right) {
  const differentIndex = compareVersions(left, right);
  if (differentIndex === -1) return 0;
  return parseVersion(left)[differentIndex] > parseVersion(right)[differentIndex] ? 1 : -1;
}

async function readApplicationVersion(application) {
  const info = await readFile(join(application, "Contents/Info.plist"), "utf8");
  const match = /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/.exec(info);
  if (match === null) {
    fail(`CFBundleShortVersionString is missing: ${application}`);
  }
  parseVersion(match[1]);
  return match[1];
}

async function assertApplication(application) {
  if (!application.endsWith("Koradio.app")) {
    fail(`Expected a Koradio.app bundle: ${application}`);
  }
  await access(join(application, "Contents/MacOS/Koradio"));
  await access(join(application, "Contents/Resources/runtime/bin/node"));
  return readApplicationVersion(application);
}

async function applicationArchitecture(application) {
  const result = await run("lipo", ["-archs", join(application, "Contents/MacOS/Koradio")]);
  if (result.code !== 0) {
    fail(`Could not read launcher architecture: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

async function assertSignedApplication(application) {
  const result = await run("codesign", ["--verify", "--deep", "--strict", application]);
  if (result.code !== 0) {
    fail(`App signature verification failed: ${result.stderr.trim()}`);
  }
}

async function snapshotDirectory(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const records = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await snapshotDirectory(path);
      records.push(...nested.map((record) => `${entry.name}/${record}`));
    } else if (entry.isFile()) {
      records.push(
        `${entry.name}:${createHash("sha256")
          .update(await readFile(path))
          .digest("hex")}`,
      );
    } else {
      records.push(`${entry.name}:non-regular`);
    }
  }
  return records;
}

async function assertSameDataRoot(dataDirectory, expectedSnapshot) {
  const actualSnapshot = await snapshotDirectory(dataDirectory);
  if (JSON.stringify(actualSnapshot) !== JSON.stringify(expectedSnapshot)) {
    fail("Data root changed during an app-only lifecycle operation");
  }
}

async function assertDataRetained(dataDirectory, expectedSnapshot) {
  const actualPaths = new Set(
    (await snapshotDirectory(dataDirectory)).map((record) => record.slice(0, record.indexOf(":"))),
  );
  for (const record of expectedSnapshot) {
    const path = record.slice(0, record.indexOf(":"));
    if (!actualPaths.has(path)) {
      fail(`Existing data root file disappeared: ${path}`);
    }
  }
  const sentinel = await readFile(join(dataDirectory, "s7-02-data-retention-sentinel.txt"), "utf8");
  if (sentinel !== "preserve this user data\n") {
    fail("User data retention sentinel changed");
  }
}

async function assertNoKoradioListeners() {
  const result = await run("lsof", ["-nP", "-iTCP:49373-49383", "-sTCP:LISTEN"]);
  if (result.code === 0 && result.stdout.trim().length > 0) {
    fail(`Koradio loopback port is already in use: ${result.stdout.trim()}`);
  }
  if (result.code !== 0 && result.code !== 1) {
    fail(`Could not inspect Koradio loopback ports: ${result.stderr.trim()}`);
  }
}

async function runSmoke(application, dataDirectory, expectSuccess) {
  await assertNoKoradioListeners();
  const result = await run(join(application, "Contents/MacOS/Koradio"), ["--smoke"], {
    env: {
      ...process.env,
      KORADIO_LAUNCHER_SMOKE_DATA_DIR: dataDirectory,
    },
  });
  await assertNoKoradioListeners();
  if (
    expectSuccess &&
    (result.code !== 0 || result.stdout.trim().split("\n").at(-1) !== '{"ok":true}')
  ) {
    fail(`Expected launcher startup success: ${result.stderr.trim()}`);
  }
  if (!expectSuccess && result.code === 0) {
    fail("Expected launcher startup failure");
  }
}

async function preserveApplication(application, recordDirectory, prefix) {
  const directory = await mkdtemp(join(recordDirectory, `${prefix}-`));
  const preserved = join(directory, "Koradio.app");
  await rename(application, preserved);
  return preserved;
}

async function installApplication(source, target, recordDirectory) {
  const candidateVersion = await assertApplication(source);
  const existingVersion = await (async () => {
    try {
      return await assertApplication(target);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
      throw error;
    }
  })();
  if (existingVersion !== undefined && compareAppVersions(candidateVersion, existingVersion) < 0) {
    fail(`Refusing downgrade from ${existingVersion} to ${candidateVersion}`);
  }

  const stagingDirectory = await mkdtemp(join(recordDirectory, "candidate-"));
  const candidate = join(stagingDirectory, "Koradio.app");
  await cp(source, candidate, { recursive: true });
  if ((await assertApplication(candidate)) !== candidateVersion) {
    fail("Copied app version does not match the selected candidate");
  }

  let previous;
  if (existingVersion !== undefined) {
    previous = await preserveApplication(target, recordDirectory, `replaced-${existingVersion}`);
  }
  try {
    await rename(candidate, target);
  } catch (error) {
    if (previous !== undefined) {
      await rename(previous, target);
    }
    throw error;
  }
  return { previous, version: candidateVersion };
}

async function rollbackApplication(target, previous, recordDirectory) {
  await preserveApplication(target, recordDirectory, "startup-failed");
  await rename(previous, target);
}

async function verifyLifecycle() {
  const { newApplication, oldApplication } = parseArguments(process.argv.slice(2));
  const oldVersion = await assertApplication(oldApplication);
  const newVersion = await assertApplication(newApplication);
  if (compareAppVersions(newVersion, oldVersion) <= 0) {
    fail(`--new version must be later than --old version (${oldVersion} -> ${newVersion})`);
  }
  await assertSignedApplication(oldApplication);
  await assertSignedApplication(newApplication);
  const oldArchitecture = await applicationArchitecture(oldApplication);
  const newArchitecture = await applicationArchitecture(newApplication);
  if (oldArchitecture !== newArchitecture) {
    fail(`App architecture changed across upgrade: ${oldArchitecture} -> ${newArchitecture}`);
  }

  const root = await mkdtemp(join(tmpdir(), "koradio-lifecycle-"));
  const applications = join(root, "Applications");
  const installedApplication = join(applications, "Koradio.app");
  const records = join(root, "preserved-apps");
  const dataDirectory = join(root, "Koradio-data");
  await mkdir(applications, { recursive: true });
  await mkdir(records, { recursive: true });

  await installApplication(oldApplication, installedApplication, records);
  await runSmoke(installedApplication, dataDirectory, true);
  await writeFile(
    join(dataDirectory, "s7-02-data-retention-sentinel.txt"),
    "preserve this user data\n",
    "utf8",
  );
  const dataSnapshot = await snapshotDirectory(dataDirectory);

  await installApplication(oldApplication, installedApplication, records);
  await assertSameDataRoot(dataDirectory, dataSnapshot);

  await installApplication(newApplication, installedApplication, records);
  await runSmoke(installedApplication, dataDirectory, true);
  await assertDataRetained(dataDirectory, dataSnapshot);

  let downgradeRefused = false;
  try {
    await installApplication(oldApplication, installedApplication, records);
  } catch (error) {
    downgradeRefused = error instanceof Error && error.message.includes("Refusing downgrade");
  }
  if (!downgradeRefused || (await readApplicationVersion(installedApplication)) !== newVersion) {
    fail("Downgrade was not refused before replacing the installed app");
  }
  await assertDataRetained(dataDirectory, dataSnapshot);

  const brokenDirectory = await mkdtemp(join(records, "broken-candidate-"));
  const brokenApplication = join(brokenDirectory, "Koradio.app");
  await cp(newApplication, brokenApplication, { recursive: true });
  await rename(
    join(brokenApplication, "Contents/Resources/app/apps/server/dist/bootstrap/main.js"),
    join(brokenApplication, "Contents/Resources/app/apps/server/dist/bootstrap/main.js.disabled"),
  );
  const failedInstall = await installApplication(brokenApplication, installedApplication, records);
  if (failedInstall.previous === undefined) {
    fail("Failed startup candidate did not preserve the previous app");
  }
  await runSmoke(installedApplication, dataDirectory, false);
  await rollbackApplication(installedApplication, failedInstall.previous, records);
  await runSmoke(installedApplication, dataDirectory, true);
  await assertDataRetained(dataDirectory, dataSnapshot);

  await preserveApplication(installedApplication, records, "uninstalled");
  try {
    await stat(installedApplication);
    fail("Uninstall did not remove the app from the Applications target");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  await assertDataRetained(dataDirectory, dataSnapshot);
  await assertNoKoradioListeners();

  process.stdout.write(
    `${JSON.stringify({ architecture: oldArchitecture, newVersion, oldVersion, root, scenarios: 7 })}\n`,
  );
}

verifyLifecycle().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "macOS lifecycle verification failed"}\n`,
  );
  process.exitCode = 1;
});
