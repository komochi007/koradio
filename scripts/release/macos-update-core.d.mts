export const trustedUpdateRemote: string;

export interface MacosBuildMetadata {
  buildNumber?: number;
  schemaVersion: 1;
  sourceCommit: string;
  sourceRemote: string;
  version: string;
}

export function parseBuildMetadata(value: unknown): MacosBuildMetadata;
export function parseReleaseVersion(value: unknown): string;
export function needsUpdate(installedCommit: string, remoteCommit: string): boolean;
export function backupDirectoryName(metadata: MacosBuildMetadata, timestamp: number): string;
