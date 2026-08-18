import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  backupDirectoryName,
  needsUpdate,
  parseBuildMetadata,
  trustedUpdateRemote,
  versionFromCommitCount,
} from "../../scripts/release/macos-update-core.mjs";

const commit = "0123456789abcdef0123456789abcdef01234567";
const nextCommit = "89abcdef0123456789abcdef0123456789abcdef";
const metadata = {
  schemaVersion: 1 as const,
  sourceCommit: commit,
  sourceRemote: trustedUpdateRemote,
  version: "0.0.17",
};

describe("macOS Personal Local Preview updater", () => {
  it("installs Electron packaging dependencies before resolving the packager", async () => {
    const buildScript = await readFile(
      fileURLToPath(new URL("../../scripts/release/build-macos.mjs", import.meta.url)),
      "utf8",
    );
    expect(buildScript).not.toContain('import { packager } from "@electron/packager"');
    expect(
      buildScript.indexOf('await runPnpm(bundledNode, ["install", "--frozen-lockfile"]'),
    ).toBeLessThan(buildScript.indexOf('await import("@electron/packager")'));
  });

  it("uses the prepared updater Node for packaging and verification", async () => {
    const updateScript = await readFile(
      fileURLToPath(new URL("../../scripts/release/update-macos.mjs", import.meta.url)),
      "utf8",
    );
    expect(updateScript).toContain("const updaterNode = process.execPath;");
    expect(updateScript).toContain("await run(updaterNode, [verifyScript, candidate]");
    expect(updateScript).not.toContain(
      'const bundledNode = join(application, "Contents/Resources/runtime/bin/node");',
    );
  });

  it("重建更新器缓存的锁定依赖，再构建候选包", async () => {
    const updateScript = await readFile(
      fileURLToPath(new URL("../../scripts/release/update-macos.mjs", import.meta.url)),
      "utf8",
    );
    expect(
      updateScript.indexOf(
        'await rm(join(sourceDirectory, "node_modules"), { force: true, recursive: true })',
      ),
    ).toBeLessThan(
      updateScript.indexOf('await run(updaterNode, [pnpmEntry, "install", "--frozen-lockfile"]'),
    );
    expect(
      updateScript.indexOf('await run(updaterNode, [pnpmEntry, "install", "--frozen-lockfile"]'),
    ).toBeLessThan(
      updateScript.indexOf("await run(\n      updaterNode,\n      [\n        buildScript,"),
    );
  });

  it("accepts only pinned build provenance", () => {
    expect(parseBuildMetadata(metadata)).toEqual(metadata);
    expect(
      parseBuildMetadata({ ...metadata, electronVersion: "43.2.0", shell: "electron" }),
    ).toEqual({
      ...metadata,
      electronVersion: "43.2.0",
      shell: "electron",
    });
    expect(() =>
      parseBuildMetadata({ ...metadata, sourceRemote: "https://example.com/koradio.git" }),
    ).toThrow("Invalid Koradio build metadata");
    expect(() => parseBuildMetadata({ ...metadata, sourceCommit: "main" })).toThrow(
      "Invalid Koradio build metadata",
    );
    expect(() =>
      parseBuildMetadata({ ...metadata, electronVersion: "43.2", shell: "electron" }),
    ).toThrow("Invalid Koradio build metadata");
  });

  it("maps the trusted commit count to a monotonic numeric app version", () => {
    expect(versionFromCommitCount(418)).toBe("0.0.418");
    expect(() => versionFromCommitCount(0)).toThrow("Git commit count must be a positive integer");
  });

  it("updates only when origin/main differs from the installed provenance", () => {
    expect(needsUpdate(commit, commit)).toBe(false);
    expect(needsUpdate(commit, nextCommit)).toBe(true);
    expect(() => needsUpdate(commit, "main")).toThrow("Remote commit is invalid");
  });

  it("stores rollback copies with a non-app suffix", () => {
    expect(backupDirectoryName(metadata, 123456789)).toBe("0.0.17-0123456789ab-123456789.backup");
  });
});
