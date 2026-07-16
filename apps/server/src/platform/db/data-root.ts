import { constants } from "node:fs";
import { access, mkdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

export interface ResolveDataRootOptions {
  environment?: NodeJS.ProcessEnv;
  homeDirectory?: string;
  override?: string;
  platform?: NodeJS.Platform;
}

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
