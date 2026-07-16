import { mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ensureDataRoot,
  readActiveDataRoot,
  readCurrentProfileId,
  resolveDataRoot,
  resolveDataRootBootstrapPath,
  writeActiveDataRoot,
  writeCurrentProfileId,
} from "../../apps/server/src/platform/db/data-root.js";

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

  it("uses an atomic bootstrap pointer without changing the initial default", async () => {
    const parent = await mkdtemp(join(tmpdir(), "koradio-data-root-bootstrap-"));
    const initialDataRoot = join(parent, "initial");
    const migratedDataRoot = join(parent, "migrated");
    const bootstrapPath = resolveDataRootBootstrapPath(initialDataRoot);

    expect(await readActiveDataRoot(initialDataRoot, bootstrapPath)).toBe(initialDataRoot);

    await writeActiveDataRoot(bootstrapPath, migratedDataRoot);

    expect(await readActiveDataRoot(initialDataRoot, bootstrapPath)).toBe(migratedDataRoot);
    if (process.platform !== "win32") {
      expect((await stat(bootstrapPath)).mode & 0o777).toBe(0o600);
    }
  });

  it("preserves the selected Profile when the active data root changes", async () => {
    const parent = await mkdtemp(join(tmpdir(), "koradio-profile-bootstrap-"));
    const initialDataRoot = join(parent, "initial");
    const migratedDataRoot = join(parent, "migrated");
    const bootstrapPath = resolveDataRootBootstrapPath(initialDataRoot);
    const profileId = "11111111-1111-4111-8111-111111111111";

    expect(await readCurrentProfileId(initialDataRoot, bootstrapPath)).toBeNull();
    await writeCurrentProfileId(bootstrapPath, initialDataRoot, profileId);
    await writeActiveDataRoot(bootstrapPath, migratedDataRoot);

    expect(await readCurrentProfileId(initialDataRoot, bootstrapPath)).toBe(profileId);
    expect(await readActiveDataRoot(initialDataRoot, bootstrapPath)).toBe(migratedDataRoot);
  });
});
