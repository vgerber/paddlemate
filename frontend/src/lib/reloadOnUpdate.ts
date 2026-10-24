/** Reload once when a new service worker takes over a page that an older one
 * was serving. The plugin's autoUpdate mode already skips waiting and claims
 * clients, but the page keeps running its old bundle - against an API that may
 * have changed shape - until someone reloads. A first install has no earlier
 * controller and does not reload. */
export function reloadOnUpdate(): void {
  if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) {
    return;
  }
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}
