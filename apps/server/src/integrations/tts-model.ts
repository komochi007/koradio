import { createHash } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { arch, platform, release } from "node:os";
import { dirname, join, resolve } from "node:path";

import { ttsModelStatusSchema, type TtsModelStatus } from "@koradio/contracts";

export const qwenTtsModelName = "Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit" as const;
export const qwenTtsModelRevision = "049ef77fe8816b536193c0c25f9a214d17921282" as const;

export interface TtsModelFile {
  path: string;
  sha256: string;
  size: number;
}

const modelFiles: TtsModelFile[] = [
  {
    path: "README.md",
    sha256: "43eb391246ca355e5eaa3fa74b8f9a433dd48d68cdec1e04321f9c1b2c9fd855",
    size: 1068,
  },
  {
    path: "config.json",
    sha256: "2eea3665564268139c3beb8d497fd3c2e4524e9eed5452836cdf1de96ed3cdbd",
    size: 6058,
  },
  {
    path: "generation_config.json",
    sha256: "f1b90b4513f3b34c62851049e2492d7b4c5940daf1276f89c82b8ef04127f3aa",
    size: 245,
  },
  {
    path: "merges.txt",
    sha256: "599bab54075088774b1733fde865d5bd747cbcc7a547c5bc12610e874e26f5e3",
    size: 1_671_839,
  },
  {
    path: "model.safetensors",
    sha256: "3bcb2c4a127e6243e81a30b7126c7865f686d3559de4f938e5d3b150c6a9560d",
    size: 1_286_743_170,
  },
  {
    path: "model.safetensors.index.json",
    sha256: "0c92041960fa189cf35ae538c8d9ca07c468edddd0c9bb52274c5d4d287a860b",
    size: 71_447,
  },
  {
    path: "preprocessor_config.json",
    sha256: "efdde1022ea9d76928bf7a9cd53139138f5ba2e466e837f08f6105ab1af1c119",
    size: 127,
  },
  {
    path: "speech_tokenizer/config.json",
    sha256: "ee65bb901c876664ab8707c487157aa1a6ee57c65969b28fb5ec9dc211e68167",
    size: 2336,
  },
  {
    path: "speech_tokenizer/configuration.json",
    sha256: "6bc26d64eb5024b4d1dab5a52371958b429256d6c9d59787f1f5294a54e0cebd",
    size: 76,
  },
  {
    path: "speech_tokenizer/model.safetensors",
    sha256: "836b7b357f5ea43e889936a3709af68dfe3751881acefe4ecf0dbd30ba571258",
    size: 682_293_092,
  },
  {
    path: "speech_tokenizer/preprocessor_config.json",
    sha256: "fcb3805e597e786d4067706e602f6688524640f8d3396790e2e09b5942fcbdfb",
    size: 234,
  },
  {
    path: "tokenizer_config.json",
    sha256: "dc3c31c3bdaedd5016382bb3cbe07323026775ad51f5a4fb564505992ae4a670",
    size: 7344,
  },
  {
    path: "vocab.json",
    sha256: "ca10d7e9fb3ed18575dd1e277a2579c16d108e32f27439684afa0e10b1440910",
    size: 2_776_833,
  },
];

const modelRepository = `https://huggingface.co/mlx-community/${qwenTtsModelName}/resolve/${qwenTtsModelRevision}`;

export type TtsModelInstallErrorCode = NonNullable<TtsModelStatus["errorCode"]>;

export class TtsModelInstallError extends Error {
  readonly code: TtsModelInstallErrorCode;

  constructor(code: TtsModelInstallErrorCode) {
    super(code);
    this.name = "TtsModelInstallError";
    this.code = code;
  }
}

export interface TtsModelService {
  readonly modelDirectory: string;
  getStatus(): TtsModelStatus;
  startInstall(): TtsModelStatus;
  close(): Promise<void>;
}

export interface CreateTtsModelServiceOptions {
  dataRoot: string;
  fetch?: typeof globalThis.fetch;
  files?: TtsModelFile[];
  repository?: string;
  supported?: boolean;
}

function supportsQwenTts(): boolean {
  const majorVersion = Number.parseInt(release().split(".")[0] ?? "0", 10);
  return platform() === "darwin" && arch() === "arm64" && majorVersion >= 24;
}

async function fileExistsWithSize(path: string, size: number): Promise<boolean> {
  try {
    const metadata = await stat(path);
    return metadata.isFile() && metadata.size === size;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function hasInstalledModel(modelDirectory: string, files: TtsModelFile[]): Promise<boolean> {
  try {
    const marker = JSON.parse(
      await readFile(join(modelDirectory, "koradio-model.json"), "utf8"),
    ) as unknown;
    if (
      typeof marker !== "object" ||
      marker === null ||
      !("model" in marker) ||
      marker.model !== qwenTtsModelName ||
      !("revision" in marker) ||
      marker.revision !== qwenTtsModelRevision
    ) {
      return false;
    }
    return (
      await Promise.all(
        files.map((file) => fileExistsWithSize(join(modelDirectory, file.path), file.size)),
      )
    ).every(Boolean);
  } catch (error) {
    if (
      error instanceof SyntaxError ||
      (error instanceof Error && "code" in error && error.code === "ENOENT")
    ) {
      return false;
    }
    throw error;
  }
}

async function downloadFile(
  fetchImplementation: typeof globalThis.fetch,
  file: TtsModelFile,
  repository: string,
  destination: string,
  signal: AbortSignal,
  onBytes: (count: number) => void,
): Promise<void> {
  const response = await fetchImplementation(`${repository}/${file.path}?download=true`, {
    redirect: "follow",
    signal,
  });
  if (!response.ok || response.body === null) {
    throw new TtsModelInstallError("TTS_MODEL_DOWNLOAD_FAILED");
  }
  await mkdir(dirname(destination), { recursive: true });
  const output = await open(destination, "wx", 0o600);
  const hash = createHash("sha256");
  let downloaded = 0;
  try {
    for await (const value of response.body) {
      const chunk = Buffer.from(value);
      downloaded += chunk.byteLength;
      if (downloaded > file.size) {
        throw new TtsModelInstallError("TTS_MODEL_INTEGRITY_FAILED");
      }
      hash.update(chunk);
      await output.write(chunk);
      onBytes(chunk.byteLength);
    }
  } finally {
    await output.close();
  }
  if (downloaded !== file.size || hash.digest("hex") !== file.sha256) {
    throw new TtsModelInstallError("TTS_MODEL_INTEGRITY_FAILED");
  }
}

export async function createTtsModelService(
  options: CreateTtsModelServiceOptions,
): Promise<TtsModelService> {
  const supported = options.supported ?? supportsQwenTts();
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const files = options.files ?? modelFiles;
  const repository = options.repository ?? modelRepository;
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  const modelsDirectory = resolve(options.dataRoot, "models");
  const modelDirectory = join(modelsDirectory, `${qwenTtsModelName}-${qwenTtsModelRevision}`);
  const stagingDirectory = `${modelDirectory}.partial`;
  const installed = supported && (await hasInstalledModel(modelDirectory, files));
  let status: TtsModelStatus = ttsModelStatusSchema.parse({
    model: qwenTtsModelName,
    revision: qwenTtsModelRevision,
    state: supported ? (installed ? "ready" : "not-installed") : "unsupported",
    downloadedBytes: installed ? totalBytes : 0,
    totalBytes,
    progressPercent: installed ? 100 : 0,
    ...(supported ? {} : { errorCode: "TTS_MODEL_UNSUPPORTED" }),
  });
  let installation: Promise<void> | undefined;
  let installationController: AbortController | undefined;

  function updateProgress(downloadedBytes: number): void {
    status = ttsModelStatusSchema.parse({
      model: qwenTtsModelName,
      revision: qwenTtsModelRevision,
      state: "downloading",
      downloadedBytes,
      totalBytes,
      progressPercent: Math.min(99, Math.floor((downloadedBytes / totalBytes) * 100)),
    });
  }

  async function install(signal: AbortSignal): Promise<void> {
    let downloadedBytes = 0;
    try {
      await mkdir(modelsDirectory, { recursive: true });
      await rm(stagingDirectory, { force: true, recursive: true });
      await mkdir(stagingDirectory, { recursive: true, mode: 0o700 });
      updateProgress(0);
      for (const file of files) {
        await downloadFile(
          fetchImplementation,
          file,
          repository,
          join(stagingDirectory, file.path),
          signal,
          (count) => {
            downloadedBytes += count;
            updateProgress(downloadedBytes);
          },
        );
      }
      await writeFile(
        join(stagingDirectory, "koradio-model.json"),
        `${JSON.stringify({
          model: qwenTtsModelName,
          revision: qwenTtsModelRevision,
          files,
        })}\n`,
        { encoding: "utf8", mode: 0o600 },
      );
      await rm(modelDirectory, { force: true, recursive: true });
      await rename(stagingDirectory, modelDirectory);
      status = ttsModelStatusSchema.parse({
        model: qwenTtsModelName,
        revision: qwenTtsModelRevision,
        state: "ready",
        downloadedBytes: totalBytes,
        totalBytes,
        progressPercent: 100,
      });
    } catch (error) {
      await rm(stagingDirectory, { force: true, recursive: true }).catch(() => undefined);
      const code =
        error instanceof TtsModelInstallError
          ? error.code
          : error instanceof Error &&
              "code" in error &&
              ["EACCES", "EDQUOT", "EIO", "ENOSPC", "EROFS"].includes(String(error.code))
            ? "TTS_MODEL_STORAGE_FAILED"
            : "TTS_MODEL_DOWNLOAD_FAILED";
      status = ttsModelStatusSchema.parse({
        model: qwenTtsModelName,
        revision: qwenTtsModelRevision,
        state: "failed",
        downloadedBytes,
        totalBytes,
        progressPercent: Math.min(99, Math.floor((downloadedBytes / totalBytes) * 100)),
        errorCode: code,
      });
    } finally {
      installation = undefined;
      installationController = undefined;
    }
  }

  return {
    modelDirectory,
    getStatus() {
      return status;
    },
    startInstall() {
      if (status.state === "unsupported" || status.state === "ready") {
        return status;
      }
      if (installation === undefined) {
        updateProgress(0);
        installationController = new AbortController();
        installation = install(installationController.signal);
      }
      return status;
    },
    async close() {
      installationController?.abort();
      await installation;
    },
  };
}
