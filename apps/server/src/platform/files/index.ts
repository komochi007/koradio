import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

const mebibyte = 1_048_576;
const referencePattern =
  /^(avatars|lyrics|media|tts|cache)\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([a-z0-9]+)$/;
const redirectStatuses = new Set([301, 302, 303, 307, 308]);

const filePolicies = {
  avatars: {
    maximumBytes: 5 * mebibyte,
    mimeTypesByExtension: {
      jpeg: ["image/jpeg"],
      jpg: ["image/jpeg"],
      png: ["image/png"],
      webp: ["image/webp"],
    },
  },
  cache: {
    maximumBytes: 10 * mebibyte,
    mimeTypesByExtension: {
      bin: ["application/octet-stream"],
      json: ["application/json"],
    },
  },
  lyrics: {
    maximumBytes: 2 * mebibyte,
    mimeTypesByExtension: {
      json: ["application/json"],
      lrc: ["text/plain"],
      txt: ["text/plain"],
    },
  },
  media: {
    maximumBytes: 100 * mebibyte,
    mimeTypesByExtension: {
      aac: ["audio/aac"],
      aiff: ["audio/aiff", "audio/x-aiff"],
      m4a: ["audio/mp4", "audio/x-m4a"],
      mp3: ["audio/mpeg"],
      wav: ["audio/wav", "audio/x-wav"],
    },
  },
  tts: {
    maximumBytes: 25 * mebibyte,
    mimeTypesByExtension: {
      aiff: ["audio/aiff", "audio/x-aiff"],
      caf: ["audio/x-caf"],
      m4a: ["audio/mp4", "audio/x-m4a"],
      wav: ["audio/wav", "audio/x-wav"],
    },
  },
} as const;

export type FileNamespace = keyof typeof filePolicies;

export type FileStoreErrorCode =
  | "invalid_reference"
  | "unsupported_extension"
  | "mime_not_allowed"
  | "file_too_large"
  | "remote_not_allowed"
  | "redirect_limit_exceeded"
  | "download_timeout"
  | "download_failed"
  | "file_not_found"
  | "storage_unavailable";

const fileStoreErrorMessages: Record<FileStoreErrorCode, string> = {
  invalid_reference: "Controlled file reference is invalid",
  unsupported_extension: "File extension is not allowed",
  mime_not_allowed: "File MIME type is not allowed",
  file_too_large: "File exceeds the allowed size",
  remote_not_allowed: "Remote file location is not allowed",
  redirect_limit_exceeded: "Remote file redirect limit was exceeded",
  download_timeout: "Remote file download timed out",
  download_failed: "Remote file download failed",
  file_not_found: "Controlled file was not found",
  storage_unavailable: "Local File Store is unavailable",
};

export class FileStoreError extends Error {
  readonly code: FileStoreErrorCode;

  constructor(code: FileStoreErrorCode) {
    super(fileStoreErrorMessages[code]);
    this.name = "FileStoreError";
    this.code = code;
  }
}

export interface StoredFile {
  mimeType: string;
  reference: string;
  sizeBytes: number;
}

export interface PutFileCommand {
  content: Uint8Array;
  extension: string;
  mimeType: string;
  namespace: FileNamespace;
}

export interface DownloadFileCommand {
  allowedOrigins: ReadonlySet<string>;
  extension: string;
  maximumRedirects?: number;
  namespace: FileNamespace;
  timeoutMs?: number;
  url: string;
}

export interface LocalFileStore {
  download(command: DownloadFileCommand): Promise<StoredFile>;
  put(command: PutFileCommand): Promise<StoredFile>;
  read(reference: string): Promise<Buffer>;
}

export interface CreateLocalFileStoreOptions {
  dataRoot: string;
  fetchImplementation?: typeof fetch;
}

function normalizeExtension(extension: string): string {
  const normalized = extension.trim().toLowerCase().replace(/^\./, "");
  if (normalized.length === 0 || !/^[a-z0-9]+$/.test(normalized)) {
    throw new FileStoreError("unsupported_extension");
  }

  return normalized;
}

function normalizeMimeType(mimeType: string): string {
  return mimeType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function resolvePolicy(namespace: FileNamespace, extension: string, mimeType: string) {
  const policy = filePolicies[namespace];
  const allowedMimeTypes = (
    policy.mimeTypesByExtension as Readonly<Record<string, readonly string[]>>
  )[extension];

  if (allowedMimeTypes === undefined) {
    throw new FileStoreError("unsupported_extension");
  }
  if (!allowedMimeTypes.includes(mimeType)) {
    throw new FileStoreError("mime_not_allowed");
  }

  return policy;
}

function parseReference(reference: string): {
  extension: string;
  namespace: FileNamespace;
} {
  if (isAbsolute(reference) || reference.includes("\\") || reference.includes("\0")) {
    throw new FileStoreError("invalid_reference");
  }

  const match = referencePattern.exec(reference);
  if (match === null) {
    throw new FileStoreError("invalid_reference");
  }

  const namespace = match[1];
  const extension = match[3];
  if (namespace === undefined || extension === undefined) {
    throw new FileStoreError("invalid_reference");
  }

  return {
    extension,
    namespace: namespace as FileNamespace,
  };
}

function resolveControlledPath(dataRoot: string, reference: string): string {
  parseReference(reference);
  const root = resolve(dataRoot);
  const path = resolve(root, ...reference.split("/"));
  const pathFromRoot = relative(root, path);

  if (pathFromRoot === "" || pathFromRoot === ".." || pathFromRoot.startsWith(`..${sep}`)) {
    throw new FileStoreError("invalid_reference");
  }

  return path;
}

function validateRemoteUrl(value: string, allowedOrigins: ReadonlySet<string>): URL {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new FileStoreError("remote_not_allowed");
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    !allowedOrigins.has(url.origin)
  ) {
    throw new FileStoreError("remote_not_allowed");
  }

  return url;
}

async function readResponseBody(response: Response, maximumBytes: number): Promise<Buffer> {
  if (response.body === null) {
    throw new FileStoreError("download_failed");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    let result = await reader.read();
    while (!result.done) {
      totalBytes += result.value.byteLength;
      if (totalBytes > maximumBytes) {
        throw new FileStoreError("file_too_large");
      }
      chunks.push(result.value);
      result = await reader.read();
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }

  return Buffer.concat(chunks, totalBytes);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

async function ensurePrivateDirectory(path: string): Promise<void> {
  await mkdir(path, { mode: 0o700, recursive: true });
  const metadata = await lstat(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new FileStoreError("storage_unavailable");
  }
  if (process.platform !== "win32") {
    await chmod(path, 0o700);
  }
}

export function createLocalFileStore(options: CreateLocalFileStoreOptions): LocalFileStore {
  const dataRoot = resolve(options.dataRoot);
  const filesRoot = join(dataRoot, "files");
  const fetchImplementation = options.fetchImplementation ?? fetch;

  async function put(command: PutFileCommand): Promise<StoredFile> {
    const extension = normalizeExtension(command.extension);
    const mimeType = normalizeMimeType(command.mimeType);
    const policy = resolvePolicy(command.namespace, extension, mimeType);

    if (command.content.byteLength > policy.maximumBytes) {
      throw new FileStoreError("file_too_large");
    }

    const directory = join(filesRoot, command.namespace);
    const identifier = randomUUID();
    const reference = `${command.namespace}/${identifier}.${extension}`;
    const path = resolveControlledPath(filesRoot, reference);
    const temporaryPath = join(directory, `.${identifier}.${randomUUID()}.tmp`);

    try {
      await ensurePrivateDirectory(filesRoot);
      await ensurePrivateDirectory(directory);
      await writeFile(temporaryPath, command.content, { flag: "wx", mode: 0o600 });
      await rename(temporaryPath, path);
      if (process.platform !== "win32") {
        await chmod(path, 0o600);
      }
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      if (error instanceof FileStoreError) {
        throw error;
      }
      throw new FileStoreError("storage_unavailable");
    }

    return {
      mimeType,
      reference,
      sizeBytes: command.content.byteLength,
    };
  }

  return {
    async download(command) {
      const extension = normalizeExtension(command.extension);
      const maximumRedirects = command.maximumRedirects ?? 3;
      const timeoutMs = command.timeoutMs ?? 15_000;
      const policy = filePolicies[command.namespace];
      let currentUrl = validateRemoteUrl(command.url, command.allowedOrigins);
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
      }, timeoutMs);

      try {
        for (let redirectCount = 0; ; redirectCount += 1) {
          const response = await fetchImplementation(currentUrl, {
            redirect: "manual",
            signal: controller.signal,
          });

          if (redirectStatuses.has(response.status)) {
            if (redirectCount >= maximumRedirects) {
              throw new FileStoreError("redirect_limit_exceeded");
            }

            const location = response.headers.get("location");
            if (location === null) {
              throw new FileStoreError("download_failed");
            }
            currentUrl = validateRemoteUrl(
              new URL(location, currentUrl).toString(),
              command.allowedOrigins,
            );
            continue;
          }

          if (!response.ok) {
            throw new FileStoreError("download_failed");
          }

          const mimeType = normalizeMimeType(response.headers.get("content-type") ?? "");
          resolvePolicy(command.namespace, extension, mimeType);

          const contentLength = response.headers.get("content-length");
          if (contentLength !== null) {
            const declaredBytes = Number(contentLength);
            if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 0) {
              throw new FileStoreError("download_failed");
            }
            if (declaredBytes > policy.maximumBytes) {
              throw new FileStoreError("file_too_large");
            }
          }

          const content = await readResponseBody(response, policy.maximumBytes);
          return await put({
            content,
            extension,
            mimeType,
            namespace: command.namespace,
          });
        }
      } catch (error) {
        if (error instanceof FileStoreError) {
          throw error;
        }
        if (controller.signal.aborted || isAbortError(error)) {
          throw new FileStoreError("download_timeout");
        }
        throw new FileStoreError("download_failed");
      } finally {
        clearTimeout(timeout);
      }
    },
    put,
    async read(reference) {
      const { extension, namespace } = parseReference(reference);
      const policy = filePolicies[namespace];
      const path = resolveControlledPath(filesRoot, reference);

      try {
        const metadata = await lstat(path);
        if (!metadata.isFile() || metadata.isSymbolicLink()) {
          throw new FileStoreError("invalid_reference");
        }
        if (metadata.size > policy.maximumBytes) {
          throw new FileStoreError("file_too_large");
        }

        const allowedExtensions = policy.mimeTypesByExtension as Readonly<
          Record<string, readonly string[]>
        >;
        if (allowedExtensions[extension] === undefined) {
          throw new FileStoreError("unsupported_extension");
        }

        return await readFile(path);
      } catch (error) {
        if (error instanceof FileStoreError) {
          throw error;
        }
        if (error instanceof Error && "code" in error && error.code === "ENOENT") {
          throw new FileStoreError("file_not_found");
        }
        throw new FileStoreError("storage_unavailable");
      }
    },
  };
}
