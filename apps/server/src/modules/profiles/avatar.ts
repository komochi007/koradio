import type { LocalFileStore } from "../../platform/files/index.js";

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export class AvatarUploadError extends Error {
  constructor() {
    super("Avatar upload is invalid");
    this.name = "AvatarUploadError";
  }
}

export class AvatarReferenceError extends Error {
  constructor() {
    super("Avatar reference is invalid");
    this.name = "AvatarReferenceError";
  }
}

export interface AvatarUploadService {
  store(content: Uint8Array, declaredMimeType: string): Promise<string>;
  validate(reference: string): Promise<void>;
}

function detectAvatarType(content: Uint8Array): { extension: string; mimeType: string } | null {
  const buffer = Buffer.from(content);

  if (buffer.length >= pngSignature.length && buffer.subarray(0, 8).equals(pngSignature)) {
    return { extension: "png", mimeType: "image/png" };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: "jpg", mimeType: "image/jpeg" };
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { extension: "webp", mimeType: "image/webp" };
  }

  return null;
}

export function createAvatarUploadService(fileStore: LocalFileStore): AvatarUploadService {
  return {
    async store(content, declaredMimeType) {
      const detected = detectAvatarType(content);
      if (detected === null || detected.mimeType !== declaredMimeType.trim().toLowerCase()) {
        throw new AvatarUploadError();
      }

      const stored = await fileStore.put({
        content,
        extension: detected.extension,
        mimeType: detected.mimeType,
        namespace: "avatars",
      });
      return stored.reference;
    },
    async validate(reference) {
      try {
        await fileStore.read(reference);
      } catch {
        throw new AvatarReferenceError();
      }
    },
  };
}
