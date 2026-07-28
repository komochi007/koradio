import { mkdtemp } from "node:fs/promises";
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

async function verify() {
  const application =
    process.argv[2] === undefined ? undefined : resolve(repositoryRoot, process.argv[2]);
  if (application === undefined || !application.endsWith(".app")) {
    throw new Error("Usage: node scripts/release/verify-macos-package.mjs <Koradio.app>");
  }
  const launcher = resolve(application, "Contents/MacOS/Koradio");
  const node = resolve(application, "Contents/Resources/runtime/bin/node");
  const python = resolve(application, "Contents/Resources/qwen-runtime/bin/python");
  const helper = resolve(application, "Contents/Resources/qwen-tts-helper/main.py");
  const dataDirectory = await mkdtemp(resolve(tmpdir(), "koradio-package-smoke-"));
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
  await run(python, ["-m", "py_compile", helper]);
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
  process.stdout.write(
    `${JSON.stringify({
      app: application,
      node: nodeVersion.stdout.trim(),
      python: pythonVersion.stdout.trim(),
      qwenRuntime: true,
    })}\n`,
  );
}

verify().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "macOS package verification failed"}\n`,
  );
  process.exitCode = 1;
});
