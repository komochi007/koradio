import { useState, type ReactElement } from "react";

import { resolveApiOrigin } from "./transport.js";

interface KoradioAvatarProps {
  className?: string;
  fallback: string;
  label: string;
  reference: string | null | undefined;
}

function fileName(reference: string): string | undefined {
  if (!/^avatars\/[0-9a-f-]+\.(?:jpe?g|png|webp)$/u.test(reference)) return undefined;
  return reference.slice("avatars/".length);
}

export function avatarUrl(reference: string | null | undefined): string | undefined {
  if (reference === null || reference === undefined) return undefined;
  const name = fileName(reference);
  return name === undefined
    ? undefined
    : `${resolveApiOrigin()}/avatars/${encodeURIComponent(name)}`;
}

export function KoradioAvatar({
  className = "",
  fallback,
  label,
  reference,
}: KoradioAvatarProps): ReactElement {
  const source = avatarUrl(reference);
  const [failedSource, setFailedSource] = useState<string>();
  return (
    <span className={`koradio-avatar ${className}`.trim()} aria-label={label} role="img">
      {source === undefined || source === failedSource ? (
        <span aria-hidden="true">{fallback}</span>
      ) : (
        <img
          alt=""
          src={source}
          onError={() => {
            setFailedSource(source);
          }}
        />
      )}
    </span>
  );
}
