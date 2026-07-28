import { createHash } from "node:crypto";
import { readFile, stat, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createTtsModelService,
  type TtsModelFile,
} from "../../apps/server/src/integrations/tts-model.js";

function manifestFile(path: string, content: string): TtsModelFile {
  return {
    path,
    sha256: createHash("sha256").update(content).digest("hex"),
    size: Buffer.byteLength(content),
  };
}

describe("Qwen3-TTS model service", () => {
  it("downloads fixed files, reports progress and installs atomically", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "koradio-tts-model-"));
    const contents = new Map([
      ["config.json", '{"model":"qwen"}'],
      ["speech_tokenizer/model.safetensors", "tokenizer"],
    ]);
    const files = [...contents].map(([path, content]) => manifestFile(path, content));
    const requests: string[] = [];
    const service = await createTtsModelService({
      dataRoot,
      files,
      repository: "https://models.invalid/qwen",
      supported: true,
      fetch: (input) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        requests.push(url);
        const path = url.replace("https://models.invalid/qwen/", "").replace("?download=true", "");
        const content = contents.get(path);
        return Promise.resolve(
          content === undefined ? new Response(null, { status: 404 }) : new Response(content),
        );
      },
    });

    expect(service.getStatus()).toMatchObject({ state: "not-installed", progressPercent: 0 });
    expect(service.startInstall()).toMatchObject({ state: "downloading", progressPercent: 0 });
    await service.close();
    expect(service.getStatus()).toMatchObject({ state: "ready", progressPercent: 100 });
    expect(requests).toEqual([
      "https://models.invalid/qwen/config.json?download=true",
      "https://models.invalid/qwen/speech_tokenizer/model.safetensors?download=true",
    ]);
    await expect(readFile(join(service.modelDirectory, "config.json"), "utf8")).resolves.toBe(
      '{"model":"qwen"}',
    );
    await expect(stat(`${service.modelDirectory}.partial`)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects integrity failures and reports unsupported devices without downloading", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "koradio-tts-model-failure-"));
    const files = [manifestFile("model.safetensors", "expected")];
    const failed = await createTtsModelService({
      dataRoot,
      files,
      supported: true,
      fetch: () => Promise.resolve(new Response("corrupt")),
    });
    failed.startInstall();
    await failed.close();
    expect(failed.getStatus()).toMatchObject({
      state: "failed",
      errorCode: "TTS_MODEL_INTEGRITY_FAILED",
    });

    const unsupported = await createTtsModelService({
      dataRoot,
      files,
      supported: false,
      fetch: () => Promise.reject(new Error("must not download")),
    });
    expect(unsupported.startInstall()).toMatchObject({
      state: "unsupported",
      errorCode: "TTS_MODEL_UNSUPPORTED",
    });
  });
});
