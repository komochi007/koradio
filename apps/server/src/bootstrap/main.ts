import { createApp } from "./app.js";
import { createPortCandidates, loadRuntimeConfig } from "./config.js";
import { createJsonLineLogSink, createSafeLogger } from "../platform/logging/index.js";

const config = loadRuntimeConfig();
const logger = createSafeLogger({ sink: createJsonLineLogSink() });

try {
  for (const port of createPortCandidates(config)) {
    const app = await createApp({ config, selectedPort: port });

    try {
      await app.listen({ host: config.host, port });
      logger.info("service.ready", { host: config.host, port });
      break;
    } catch (error) {
      await app.close();

      const code = error instanceof Error && "code" in error ? error.code : undefined;
      if (code !== "EADDRINUSE" || port === createPortCandidates(config).at(-1)) {
        throw error;
      }
    }
  }
} catch (error) {
  logger.error("service.start_failed", { error });
  process.exitCode = 1;
}
