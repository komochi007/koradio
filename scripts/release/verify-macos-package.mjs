import { access, mkdtemp, readFile } from "node:fs/promises";
import { createServer } from "node:http";
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

function startMismatchedKoradioService() {
  const server = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.method === "POST" && request.url === "/api/v1/session/bootstrap") {
      response.end(JSON.stringify({ accessToken: "mismatched-build-token" }));
      return;
    }
    if (request.method === "GET" && request.url === "/api/v1/health") {
      response.end(JSON.stringify({ service: "koradio" }));
      return;
    }
    if (request.method === "GET" && request.url === "/koradio-build.json") {
      response.end(JSON.stringify({ buildId: "0".repeat(64), version: "0.0.0" }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not_found" }));
  });
  return new Promise((resolveStart, reject) => {
    server.once("error", reject);
    server.listen(49373, "127.0.0.1", () => resolveStart(server));
  });
}

function stopServer(server) {
  return new Promise((resolveStop, reject) => {
    server.close((error) => {
      if (error === undefined) {
        resolveStop();
      } else {
        reject(error);
      }
    });
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
  const icon = resolve(application, "Contents/Resources/Koradio.icns");
  const buildMetadata = resolve(
    application,
    "Contents/Resources/app/apps/web/dist/koradio-build.json",
  );
  const dataDirectory = await mkdtemp(resolve(tmpdir(), "koradio-package-smoke-"));
  const pythonEnvironment = {
    ...process.env,
    PYTHONDONTWRITEBYTECODE: "1",
    PYTHONPYCACHEPREFIX: resolve(dataDirectory, "python-cache"),
  };
  await run("codesign", ["--verify", "--deep", "--strict", application]);
  await access(icon);
  const info = await readFile(resolve(application, "Contents/Info.plist"), "utf8");
  if (!info.includes("<key>CFBundleIconFile</key><string>Koradio.icns</string>")) {
    throw new Error("Koradio app icon is not configured");
  }
  const build = JSON.parse(await readFile(buildMetadata, "utf8"));
  if (typeof build.buildId !== "string" || !/^[a-f0-9]{64}$/.test(build.buildId)) {
    throw new Error("Koradio build identity is invalid");
  }
  const nodeVersion = await run(node, ["--version"]);
  if (nodeVersion.stdout.trim() !== "v24.18.0") {
    throw new Error("Bundled Node runtime version is not v24.18.0");
  }
  const pythonVersion = await run(python, ["--version"], { env: pythonEnvironment });
  if (!pythonVersion.stdout.includes("Python 3.12.13")) {
    throw new Error("Bundled Qwen Python runtime version is invalid");
  }
  await run(
    python,
    [
      "-c",
      "import importlib.metadata, mlx_audio, numpy; assert importlib.metadata.version('mlx-audio') == '0.4.5'",
    ],
    { env: pythonEnvironment },
  );
  await run(
    python,
    [
      "-c",
      "import py_compile, sys; py_compile.compile(sys.argv[1], cfile=sys.argv[2], doraise=True)",
      helper,
      resolve(dataDirectory, "main.pyc"),
    ],
    { env: pythonEnvironment },
  );
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
  const mismatchedService = await startMismatchedKoradioService();
  try {
    const mismatchSmoke = await run(launcher, ["--smoke"], {
      env: {
        ...process.env,
        KORADIO_LAUNCHER_SMOKE_DATA_DIR: dataDirectory,
      },
    });
    if (mismatchSmoke.stdout.trim().split("\n").at(-1) !== '{"ok":true}') {
      throw new Error("Launcher did not bypass a mismatched Koradio service");
    }
  } finally {
    await stopServer(mismatchedService);
  }
  await run("codesign", ["--verify", "--deep", "--strict", application]);
  process.stdout.write(
    `${JSON.stringify({
      app: application,
      node: nodeVersion.stdout.trim(),
      python: pythonVersion.stdout.trim(),
      qwenRuntime: true,
      buildId: build.buildId,
      buildMismatchRejected: true,
      icon: true,
    })}\n`,
  );
}

verify().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "macOS package verification failed"}\n`,
  );
  process.exitCode = 1;
});
