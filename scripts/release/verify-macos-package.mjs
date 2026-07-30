import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import process from "node:process";
import { URL, fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

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

async function verifyApplication(application) {
  const launcher = resolve(application, "Contents/MacOS/Koradio");
  const node = resolve(application, "Contents/Resources/runtime/bin/node");
  const python = resolve(application, "Contents/Resources/qwen-runtime/bin/python");
  const helper = resolve(application, "Contents/Resources/qwen-tts-helper/main.py");
  const dataDirectory = await mkdtemp(resolve(tmpdir(), "koradio-package-smoke-"));
  try {
    await run("codesign", ["--verify", "--deep", "--strict", application]);
    const nodeVersion = await run(node, ["--version"]);
    if (nodeVersion.stdout.trim() !== "v24.18.0") {
      throw new Error("Bundled Node runtime version is not v24.18.0");
    }
    const pythonVersion = await run(python, ["--version"]);
    if (!pythonVersion.stdout.includes("Python 3.12.13")) {
      throw new Error("Bundled Qwen Python runtime version is invalid");
    }
    await run(python, [
      "-c",
      "import importlib.metadata, mlx_audio, numpy; assert importlib.metadata.version('mlx-audio') == '0.4.5'",
    ]);
    await run(python, ["-m", "py_compile", helper], {
      env: {
        ...process.env,
        PYTHONPYCACHEPREFIX: resolve(dataDirectory, "pycache"),
      },
    });
    const smoke = await run(launcher, ["--smoke"], {
      env: {
        ...process.env,
        KORADIO_LAUNCHER_SMOKE_DATA_DIR: dataDirectory,
      },
    });
    const smokeLines = smoke.stdout.trim().split("\n");
    if (smokeLines.at(-1) !== '{"ok":true}') {
      throw new Error("Launcher smoke result is invalid");
    }
    return {
      node: nodeVersion.stdout.trim(),
      python: pythonVersion.stdout.trim(),
      qwenRuntime: true,
    };
  } finally {
    await rm(dataDirectory, { force: true, recursive: true });
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
