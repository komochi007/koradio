const CACHE_NAME = "koradio-app-shell-v1";
const APP_SHELL_URL = "/";
const APP_SHELL_PATHS = new Set(["/", "/index.html", "/manifest.webmanifest"]);

function isStaticAppShellRequest(url) {
  return APP_SHELL_PATHS.has(url.pathname) || url.pathname.startsWith("/assets/");
}

globalThis.addEventListener("install", (event) => {
  event.waitUntil(globalThis.caches.open(CACHE_NAME).then((cache) => cache.add(APP_SHELL_URL)));
  globalThis.skipWaiting();
});

globalThis.addEventListener("activate", (event) => {
  event.waitUntil(
    globalThis.caches
      .keys()
      .then((names) =>
        Promise.all(
          names.filter((name) => name !== CACHE_NAME).map((name) => globalThis.caches.delete(name)),
        ),
      )
      .then(() => globalThis.clients.claim()),
  );
});

globalThis.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new globalThis.URL(request.url);

  if (
    request.method !== "GET" ||
    url.origin !== globalThis.location.origin ||
    (!isStaticAppShellRequest(url) && request.mode !== "navigate")
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      globalThis
        .fetch(request)
        .then((response) => {
          if (response.ok) {
            void globalThis.caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(APP_SHELL_URL, response.clone()));
          }
          return response;
        })
        .catch(async () => {
          const cached = await globalThis.caches.match(APP_SHELL_URL);
          return cached ?? globalThis.Response.error();
        }),
    );
    return;
  }

  event.respondWith(
    globalThis.caches.match(request).then(async (cached) => {
      if (cached !== undefined) {
        return cached;
      }

      const response = await globalThis.fetch(request);
      if (response.ok && response.type === "basic") {
        const cache = await globalThis.caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    }),
  );
});
