import { access, cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { spawn } from "node:child_process";

import { createLauncherEnvironment } from "./service-controller.js";

export type UpdateStatus = "current" | "updated";

export interface UpdatePreflightOptions {
  applicationPath: string;
  resourcesPath: string;
}

export function updateNodeCodesignArguments(node: string): string[] {
  return ["--force", "--sign", "-", "--timestamp=none", node];
}

export function isSupportedApplicationBundleName(value: string): boolean {
  return /^Koradio(?:-(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-arm64)?\.app$/.test(value);
}

async function assertExecutable(path: string): Promise<void> {
  try {
    await access(path);
  } catch {
    throw new Error(`Updater resource is missing: ${path}`);
  }
}

async function runCodesign(argumentsList: string[]): Promise<void> {
  await new Promise<void>((resolveCodeSign, rejectCodeSign) => {
    const child = spawn("/usr/bin/codesign", argumentsList, { stdio: "ignore" });
    child.once("error", rejectCodeSign);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolveCodeSign();
        return;
      }
      rejectCodeSign(
        new Error(`codesign exited with ${String(code)}${signal === null ? "" : ` (${signal})`}`),
      );
    });
  });
}

async function prepareUpdateNode(node: string): Promise<{ directory: string; executable: string }> {
  const directory = await mkdtemp(join(tmpdir(), "koradio-updater-node-"));
  const executable = join(directory, "node");
  try {
    await cp(node, executable);
    await runCodesign(updateNodeCodesignArguments(executable));
    return { directory, executable };
  } catch (error) {
    await rm(directory, { force: true, recursive: true });
    throw error;
  }
}

export function parseUpdateOutput(output: string): UpdateStatus {
  const lines = output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .reverse();
  for (const line of lines) {
    try {
      const payload: unknown = JSON.parse(line);
      if (
        typeof payload === "object" &&
        payload !== null &&
        (payload as { status?: unknown }).status === "current"
      ) {
        return "current";
      }
      if (
        typeof payload === "object" &&
        payload !== null &&
        (payload as { status?: unknown }).status === "updated"
      ) {
        return "updated";
      }
    } catch {
      continue;
    }
  }
  throw new Error("Updater did not return a recognized status");
}

export async function runUpdatePreflight(options: UpdatePreflightOptions): Promise<UpdateStatus> {
  if (!isSupportedApplicationBundleName(basename(options.applicationPath))) {
    throw new Error("Updater application path is invalid");
  }
  const node = `${options.resourcesPath}/runtime/bin/node`;
  const updater = `${options.resourcesPath}/updater/update-macos.mjs`;
  await assertExecutable(node);
  await assertExecutable(updater);
  const updateNode = await prepareUpdateNode(node);
  try {
    return await new Promise((resolveStatus, rejectStatus) => {
      const child = spawn(
        updateNode.executable,
        [updater, "--application", options.applicationPath],
        {
          env: createLauncherEnvironment(),
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.once("error", rejectStatus);
      child.once("exit", (code, signal) => {
        if (code !== 0) {
          rejectStatus(
            new Error(
              `${basename(updater)} exited with ${String(code)}${
                signal === null ? "" : ` (${signal})`
              }: ${stderr.trim()}`,
            ),
          );
          return;
        }
        try {
          resolveStatus(parseUpdateOutput(stdout));
        } catch (error) {
          rejectStatus(error instanceof Error ? error : new Error("Updater output is invalid"));
        }
      });
    });
  } finally {
    await rm(updateNode.directory, { force: true, recursive: true });
  }
}
