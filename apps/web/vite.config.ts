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

  return {
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: readPort(environment.KORADIO_WEB_PORT, 5173),
      strictPort: true,
    },
    build: {
      target: "es2024",
      outDir: "dist",
      emptyOutDir: true,
    },
  };
});
