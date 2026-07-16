import { createApp } from "./app.js";
import { createPortCandidates, loadRuntimeConfig } from "./config.js";

const config = loadRuntimeConfig();

for (const port of createPortCandidates(config)) {
  const app = await createApp({ config, selectedPort: port });

  try {
    await app.listen({ host: config.host, port });
    process.stdout.write(`Koradio Local Service ready at http://${config.host}:${String(port)}\n`);
    break;
  } catch (error) {
    await app.close();

    const code = error instanceof Error && "code" in error ? error.code : undefined;
    if (code !== "EADDRINUSE" || port === createPortCandidates(config).at(-1)) {
      throw error;
    }
  }
}
