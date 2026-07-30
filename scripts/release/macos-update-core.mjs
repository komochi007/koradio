export const trustedUpdateRemote = "https://github.com/komochi007/koradio.git";

export function parseBuildMetadata(value) {
  if (
    typeof value !== "object" ||
    value === null ||
    value.schemaVersion !== 1 ||
    typeof value.version !== "string" ||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value.version) ||
    typeof value.sourceCommit !== "string" ||
    !/^[0-9a-f]{40}$/.test(value.sourceCommit) ||
    value.sourceRemote !== trustedUpdateRemote
  ) {
    throw new Error("Invalid Koradio build metadata");
  }
  return {
    schemaVersion: 1,
    sourceCommit: value.sourceCommit,
    sourceRemote: value.sourceRemote,
    version: value.version,
  };
}

export function versionFromCommitCount(value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Git commit count must be a positive integer");
  }
  return `0.0.${value}`;
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
