export async function registerAppShellServiceWorker(): Promise<void> {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) {
    return;
  }

  await navigator.serviceWorker.register("/service-worker.js", { scope: "/" });
}
