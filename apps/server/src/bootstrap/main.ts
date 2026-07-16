import { createApp } from "./app.js";
import { createPortCandidates, loadRuntimeConfig, resolveRuntimeDataRoot } from "./config.js";
import {
  recordDataRootRestartFailure,
  type DataRootRestartRequest,
} from "../modules/device-settings/data-root-migration.js";
import { writeActiveDataRoot } from "../platform/db/data-root.js";
import { createJsonLineLogSink, createSafeLogger } from "../platform/logging/index.js";

const logger = createSafeLogger({ sink: createJsonLineLogSink() });

async function startService(
  onRestartRequested: (request: DataRootRestartRequest) => void,
): Promise<{
  app: Awaited<ReturnType<typeof createApp>>;
  config: Awaited<ReturnType<typeof resolveRuntimeDataRoot>>;
  port: number;
}> {
  const config = await resolveRuntimeDataRoot(loadRuntimeConfig());

  for (const port of createPortCandidates(config)) {
    const app = await createApp({
      config,
      selectedPort: port,
      requestRestart: (request) => {
        onRestartRequested(request);
        return Promise.resolve();
      },
    });

    try {
      await app.listen({ host: config.host, port });
      return { app, config, port };
    } catch (error) {
      await app.close();

      const code = error instanceof Error && "code" in error ? error.code : undefined;
      if (code !== "EADDRINUSE" || port === createPortCandidates(config).at(-1)) {
        throw error;
      }
    }
  }

  throw new Error("No loopback port candidate was available");
}

async function run(): Promise<void> {
  let restartFallback: DataRootRestartRequest | undefined;

  for (;;) {
    let resolveRestart: ((request: DataRootRestartRequest) => void) | undefined;
    const restartRequested = new Promise<DataRootRestartRequest>((resolve) => {
      resolveRestart = resolve;
    });

    try {
      const running = await startService((request) => {
        resolveRestart?.(request);
      });
      restartFallback = undefined;
      logger.info("service.ready", { host: running.config.host, port: running.port });

      const restart = await restartRequested;
      restartFallback = restart;
      logger.info("service.restarting", { jobId: restart.jobId });
      await running.app.close();
    } catch (error) {
      if (restartFallback !== undefined) {
        await writeActiveDataRoot(restartFallback.bootstrapPath, restartFallback.previousDataRoot);
        await recordDataRootRestartFailure(restartFallback);
        logger.error("data_root_migration.restart_failed", {
          error,
          jobId: restartFallback.jobId,
        });
        restartFallback = undefined;
        continue;
      }

      throw error;
    }
  }
}

try {
  await run();
} catch (error) {
  logger.error("service.start_failed", { error });
  process.exitCode = 1;
}
