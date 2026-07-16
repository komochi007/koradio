import { mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ensureDataRoot, resolveDataRoot } from "../../apps/server/src/platform/db/data-root.js";

describe("OS data root adapter", () => {
  it("selects the macOS Application Support directory", () => {
    expect(
      resolveDataRoot({
        environment: {},
        homeDirectory: "/Users/radio",
        platform: "darwin",
      }),
    ).toBe(join("/Users/radio", "Library", "Application Support", "Koradio"));
  });

  it("selects APPDATA on Windows", () => {
    expect(
      resolveDataRoot({
        environment: { APPDATA: "/Users/radio/AppData/Roaming" },
        homeDirectory: "/Users/radio",
        platform: "win32",
      }),
    ).toBe(join("/Users/radio/AppData/Roaming", "Koradio"));
  });

  it("selects an absolute XDG data directory on Linux", () => {
    expect(
      resolveDataRoot({
        environment: { XDG_DATA_HOME: "/var/lib/radio" },
        homeDirectory: "/home/radio",
        platform: "linux",
      }),
    ).toBe(join("/var/lib/radio", "Koradio"));
  });

  it("ignores a relative XDG data directory", () => {
    expect(
      resolveDataRoot({
        environment: { XDG_DATA_HOME: "relative-data" },
        homeDirectory: "/home/radio",
        platform: "linux",
      }),
    ).toBe(join("/home/radio", ".local", "share", "Koradio"));
  });

  it("uses an explicit data directory override", () => {
    expect(resolveDataRoot({ override: "./temporary-data" })).toBe(resolve("./temporary-data"));
  });

  it("creates a private readable and writable directory", async () => {
    const parent = await mkdtemp(join(tmpdir(), "koradio-data-root-"));
    const dataRoot = join(parent, "Koradio");

    await ensureDataRoot(dataRoot);

    const metadata = await stat(dataRoot);
    expect(metadata.isDirectory()).toBe(true);
    if (process.platform !== "win32") {
      expect(metadata.mode & 0o777).toBe(0o700);
    }
  });

  it("rejects a file used as the data root", async () => {
    const parent = await mkdtemp(join(tmpdir(), "koradio-data-root-file-"));
    const dataRoot = join(parent, "not-a-directory");
    await writeFile(dataRoot, "not a directory");

    await expect(ensureDataRoot(dataRoot)).rejects.toThrow();
  });
});
