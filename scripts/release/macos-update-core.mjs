export const trustedUpdateRemote = "https://github.com/komochi007/koradio.git";

export function parseReleaseVersion(value) {
  const version = String(value).trim();
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error("Release version must be a numeric semantic version such as 1.2.3");
  }
  return version;
}

export function parseBuildMetadata(value) {
  if (
    typeof value !== "object" ||
    value === null ||
    value.schemaVersion !== 1 ||
    typeof value.version !== "string" ||
    parseReleaseVersion(value.version) !== value.version ||
    typeof value.sourceCommit !== "string" ||
    !/^[0-9a-f]{40}$/.test(value.sourceCommit) ||
    value.sourceRemote !== trustedUpdateRemote
  ) {
    throw new Error("Invalid Koradio build metadata");
  }
  if (
    (value.buildNumber !== undefined &&
      (!Number.isSafeInteger(value.buildNumber) || value.buildNumber <= 0)) ||
    (value.shell !== undefined &&
      (value.shell !== "electron" ||
        typeof value.electronVersion !== "string" ||
        !/^\d+\.\d+\.\d+$/.test(value.electronVersion)))
  ) {
    throw new Error("Invalid Koradio build metadata");
  }
  return {
    schemaVersion: 1,
    sourceCommit: value.sourceCommit,
    sourceRemote: value.sourceRemote,
    version: value.version,
    ...(value.buildNumber === undefined ? {} : { buildNumber: value.buildNumber }),
    ...(value.shell === "electron"
      ? { electronVersion: value.electronVersion, shell: value.shell }
      : {}),
  };
}

export function needsUpdate(installedCommit, remoteCommit) {
  if (!/^[0-9a-f]{40}$/.test(remoteCommit)) {
    throw new Error("Remote commit is invalid");
  }
  return installedCommit !== remoteCommit;
}

export function backupDirectoryName(metadata, timestamp) {
  const parsed = parseBuildMetadata(metadata);
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
    throw new Error("Backup timestamp must be a positive integer");
  }
  return `${parsed.version}-${parsed.sourceCommit.slice(0, 12)}-${timestamp}.backup`;
}
