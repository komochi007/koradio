import { constants } from "node:fs";
import { access, chmod, mkdir, open, readFile, rename, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { z } from "zod";

export interface ResolveDataRootOptions {
  environment?: NodeJS.ProcessEnv;
  homeDirectory?: string;
  override?: string;
  platform?: NodeJS.Platform;
}

const dataRootBootstrapSchema = z.strictObject({
  version: z.literal(1),
  dataRoot: z.string().trim().min(1).max(300),
});

function resolveEnvironmentDirectory(value: string | undefined): string | undefined {
  const directory = value?.trim();
  return directory === undefined || directory.length === 0 ? undefined : resolve(directory);
}

export function resolveDataRoot(options: ResolveDataRootOptions = {}): string {
  const environment = options.environment ?? process.env;
  const homeDirectory = options.homeDirectory ?? homedir();
  const platform = options.platform ?? process.platform;
  const override = resolveEnvironmentDirectory(options.override);

  if (override !== undefined) {
    return override;
  }

  if (platform === "darwin") {
    return join(homeDirectory, "Library", "Application Support", "Koradio");
  }

  if (platform === "win32") {
    return join(resolveEnvironmentDirectory(environment.APPDATA) ?? homeDirectory, "Koradio");
  }

  const configuredXdgDataHome = environment.XDG_DATA_HOME?.trim();
  const xdgDataHome =
    configuredXdgDataHome !== undefined &&
    configuredXdgDataHome.length > 0 &&
    isAbsolute(configuredXdgDataHome)
      ? resolve(configuredXdgDataHome)
      : undefined;
  const unixDataHome =
    xdgDataHome !== undefined ? xdgDataHome : join(homeDirectory, ".local", "share");

  return join(unixDataHome, "Koradio");
}

export async function ensureDataRoot(dataRoot: string): Promise<void> {
  await mkdir(dataRoot, { mode: 0o700, recursive: true });

  const metadata = await stat(dataRoot);
  if (!metadata.isDirectory()) {
    throw new Error(`Koradio data root is not a directory: ${dataRoot}`);
  }

  await access(dataRoot, constants.R_OK | constants.W_OK);
}

export function resolveDataRootBootstrapPath(initialDataRoot: string): string {
  return `${initialDataRoot}.bootstrap.json`;
}

export async function readActiveDataRoot(
  initialDataRoot: string,
  bootstrapPath = resolveDataRootBootstrapPath(initialDataRoot),
): Promise<string> {
  try {
    const serialized = await readFile(bootstrapPath, "utf8");
    return resolve(dataRootBootstrapSchema.parse(JSON.parse(serialized) as unknown).dataRoot);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return resolve(initialDataRoot);
    }

    throw error;
  }
}

export async function writeActiveDataRoot(bootstrapPath: string, dataRoot: string): Promise<void> {
  await mkdir(dirname(bootstrapPath), { mode: 0o700, recursive: true });

  const temporaryPath = `${bootstrapPath}.${process.pid.toString()}.tmp`;
  const file = await open(temporaryPath, "w", 0o600);

  try {
    await file.writeFile(
      `${JSON.stringify({
        version: 1,
        dataRoot: resolve(dataRoot),
      })}\n`,
      "utf8",
    );
    await file.sync();
  } finally {
    await file.close();
  }

  if (process.platform !== "win32") {
    await chmod(temporaryPath, 0o600);
  }

  await rename(temporaryPath, bootstrapPath);
}
