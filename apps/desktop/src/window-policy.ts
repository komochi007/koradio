export const applicationRoutes = new Set([
  "/radio",
  "/library",
  "/taste",
  "/programs",
  "/settings",
]);

export const minimumWindowWidth = 430;
export const minimumWindowHeight = 652;

export const rendererContentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https:",
  "connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:*",
  "media-src 'self' blob: http://127.0.0.1:* https:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

export function loopbackOrigin(port: number): string {
  return `http://127.0.0.1:${String(port)}`;
}

export function isAllowedNavigation(candidate: string, expectedOrigin: string): boolean {
  try {
    const url = new URL(candidate);
    return (
      url.origin === expectedOrigin &&
      url.username.length === 0 &&
      url.password.length === 0 &&
      url.search.length === 0 &&
      url.hash.length === 0 &&
      applicationRoutes.has(url.pathname)
    );
  } catch {
    return false;
  }
}

export function isLoopbackOrigin(candidate: string): boolean {
  try {
    const url = new URL(candidate);
    return (
      url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" || url.hostname === "[::1]") &&
      url.pathname === "/" &&
      url.search.length === 0 &&
      url.hash.length === 0 &&
      url.username.length === 0 &&
      url.password.length === 0
    );
  } catch {
    return false;
  }
}
