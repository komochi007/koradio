import { access } from "node:fs/promises";
import { basename } from "node:path";
import { spawn } from "node:child_process";

import { createLauncherEnvironment } from "./service-controller.js";

export type UpdateStatus = "current" | "updated";

export interface UpdatePreflightOptions {
  applicationPath: string;
  resourcesPath: string;
}

async function assertExecutable(path: string): Promise<void> {
  try {
    await access(path);
  } catch {
    throw new Error(`Updater resource is missing: ${path}`);
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
  if (basename(options.applicationPath) !== "Koradio.app") {
    throw new Error("Updater application path is invalid");
  }
  const node = `${options.resourcesPath}/runtime/bin/node`;
  const updater = `${options.resourcesPath}/updater/update-macos.mjs`;
  await assertExecutable(node);
  await assertExecutable(updater);
  return new Promise((resolveStatus, rejectStatus) => {
    const child = spawn(node, [updater, "--application", options.applicationPath], {
      env: createLauncherEnvironment(),
      stdio: ["ignore", "pipe", "pipe"],
    });
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
}
