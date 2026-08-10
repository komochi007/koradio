import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

function readPort(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new TypeError("Invalid development port");
  }

  return port;
}

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), "");
  const apiPort = readPort(environment.KORADIO_PORT, 49373);
  const apiOrigin = environment.VITE_KORADIO_API_ORIGIN ?? `http://127.0.0.1:${String(apiPort)}`;

  return {
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: readPort(environment.KORADIO_WEB_PORT, 5173),
      strictPort: true,
      proxy: {
        "/media": { target: apiOrigin },
        "/tts": { target: apiOrigin },
      },
    },
    build: {
      target: "es2024",
      outDir: "dist",
      emptyOutDir: true,
    },
  };
});
