import { mkdtemp } from "node:fs/promises";
import { Buffer } from "node:buffer";
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
  const helper = resolve(application, "Contents/Resources/koradio-tts-helper");
  const dataDirectory = await mkdtemp(resolve(tmpdir(), "koradio-package-smoke-"));
  await run("codesign", ["--verify", "--deep", "--strict", application]);
  const nodeVersion = await run(node, ["--version"]);
  if (nodeVersion.stdout.trim() !== "v24.18.0") {
    throw new Error("Bundled Node runtime version is not v24.18.0");
  }
  const voices = await run(helper, ["voices", "--json"]);
  const parsedVoices = JSON.parse(voices.stdout);
  if (!Array.isArray(parsedVoices.voices)) {
    throw new Error("Bundled TTS helper returned an invalid voice list");
  }
  const voice = parsedVoices.voices.find((candidate) => candidate.language === "en-US");
  if (voice === undefined) {
    throw new Error("Bundled TTS helper has no standard en-US voice");
  }
  const synthesis = await run(helper, ["synthesize", "--json"], {
    input: JSON.stringify({
      language: voice.language,
      text: "Koradio packaging verification.",
      voiceIdentifier: voice.identifier,
      voiceStyle: "british-soft-radio",
    }),
  });
  const parsedSynthesis = JSON.parse(synthesis.stdout);
  const audio = Buffer.from(parsedSynthesis.audioBase64, "base64");
  if (
    parsedSynthesis.extension !== "wav" ||
    !Number.isInteger(parsedSynthesis.durationMs) ||
    parsedSynthesis.durationMs < 1 ||
    audio.subarray(0, 4).toString("ascii") !== "RIFF"
  ) {
    throw new Error("Bundled TTS helper returned invalid synthesized audio");
  }
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
    `${JSON.stringify({ app: application, node: nodeVersion.stdout.trim(), voices: parsedVoices.voices.length })}\n`,
  );
}

verify().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "macOS package verification failed"}\n`,
  );
  process.exitCode = 1;
});
