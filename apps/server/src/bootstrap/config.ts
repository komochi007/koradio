import { fileURLToPath } from "node:url";

import { z } from "zod";

import {
  readActiveDataRoot,
  resolveDataRoot,
  resolveDataRootBootstrapPath,
} from "../platform/db/data-root.js";

const booleanStringSchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true")
  .default(false);

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  KORADIO_HOST: z.enum(["127.0.0.1", "::1"]).default("127.0.0.1"),
  KORADIO_PORT: z.coerce.number().int().min(1024).max(65535).default(49373),
  KORADIO_WEB_PORT: z.coerce.number().int().min(1024).max(65535).default(5173),
  KORADIO_PROVIDER_MODE: z.literal("mock").default("mock"),
  KORADIO_STRICT_PORT: booleanStringSchema,
  KORADIO_DATA_DIR: z.string().trim().min(1).optional(),
});

export interface RuntimeConfig {
  environment: "development" | "production" | "test";
  host: "127.0.0.1" | "::1";
  port: number;
  webPort: number;
  providerMode: "mock";
  strictPort: boolean;
  dataRoot: string;
  initialDataRoot?: string;
  dataRootBootstrapPath?: string;
  webRoot: string;
}

export function loadRuntimeConfig(environment: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const parsed = environmentSchema.parse(environment);
  const initialDataRoot = resolveDataRoot(
    parsed.KORADIO_DATA_DIR === undefined ? undefined : { override: parsed.KORADIO_DATA_DIR },
  );

  return {
    environment: parsed.NODE_ENV,
    host: parsed.KORADIO_HOST,
    port: parsed.KORADIO_PORT,
    webPort: parsed.KORADIO_WEB_PORT,
    providerMode: parsed.KORADIO_PROVIDER_MODE,
    strictPort: parsed.KORADIO_STRICT_PORT,
    dataRoot: initialDataRoot,
    initialDataRoot,
    dataRootBootstrapPath: resolveDataRootBootstrapPath(initialDataRoot),
    webRoot: fileURLToPath(new URL("../../../web/dist/", import.meta.url)),
  };
}

export async function resolveRuntimeDataRoot(config: RuntimeConfig): Promise<RuntimeConfig> {
  const initialDataRoot = config.initialDataRoot ?? config.dataRoot;
  const dataRootBootstrapPath =
    config.dataRootBootstrapPath ?? resolveDataRootBootstrapPath(initialDataRoot);

  return {
    ...config,
    dataRoot: await readActiveDataRoot(initialDataRoot, dataRootBootstrapPath),
    initialDataRoot,
    dataRootBootstrapPath,
  };
}

export function createAllowedOrigins(config: RuntimeConfig, selectedPort: number): Set<string> {
  const host = config.host === "::1" ? "[::1]" : config.host;
  const origins = new Set([`http://${host}:${String(selectedPort)}`]);

  if (config.environment === "development") {
    origins.add(`http://${host}:${String(config.webPort)}`);
  }

  return origins;
}

export function createPortCandidates(config: RuntimeConfig): number[] {
  if (config.environment !== "production" || config.strictPort) {
    return [config.port];
  }

  return Array.from({ length: 11 }, (_, index) => 49373 + index);
}
