function isNetEaseArtworkHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "music.126.net" || normalized.endsWith(".music.126.net");
}

export function normalizeArtworkUrl(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.trim().length === 0) return null;
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return url.toString();
    if (url.protocol === "http:" && isNetEaseArtworkHostname(url.hostname)) {
      url.protocol = "https:";
      return url.toString();
    }
  } catch {
    return null;
  }
  return null;
}
