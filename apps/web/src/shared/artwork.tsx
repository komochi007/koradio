import { useState, type ReactElement } from "react";

interface ArtworkImageProps {
  alt?: string;
  src: string | null | undefined;
}

export function ArtworkImage({ alt = "", src }: ArtworkImageProps): ReactElement | null {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  if (src === null || src === undefined || src.length === 0 || failedSource === src) return null;
  return (
    <img
      alt={alt}
      decoding="async"
      onError={() => {
        setFailedSource(src);
      }}
      referrerPolicy="no-referrer"
      src={src}
    />
  );
}
