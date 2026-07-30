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
  it("accepts only pinned build provenance", () => {
    expect(parseBuildMetadata(metadata)).toEqual(metadata);
    expect(() =>
      parseBuildMetadata({ ...metadata, sourceRemote: "https://example.com/koradio.git" }),
    ).toThrow("Invalid Koradio build metadata");
    expect(() => parseBuildMetadata({ ...metadata, sourceCommit: "main" })).toThrow(
      "Invalid Koradio build metadata",
    );
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
