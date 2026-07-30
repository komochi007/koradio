export const trustedUpdateRemote: string;

export interface MacosBuildMetadata {
  schemaVersion: 1;
  sourceCommit: string;
  sourceRemote: string;
  version: string;
}

export function parseBuildMetadata(value: unknown): MacosBuildMetadata;
export function versionFromCommitCount(value: number): string;
export function needsUpdate(installedCommit: string, remoteCommit: string): boolean;
export function backupDirectoryName(metadata: MacosBuildMetadata, timestamp: number): string;
