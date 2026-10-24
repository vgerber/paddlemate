/** Whether a controller change means "a new version replaced the one this page
 * runs". A first install has no earlier controller, and one offer is enough. */
export function shouldOfferReload(
  hadController: boolean,
  alreadyOffered: boolean,
): boolean {
  return hadController && !alreadyOffered;
}

/** Call `offer` when a new service worker takes over a page that an older one
 * was serving. The plugin's autoUpdate mode claims clients at once, but the
 * page keeps its old bundle - against an API that may have changed shape -
 * until it is reloaded. That is left to the person, so an open form survives. */
export function watchForUpdate(offer: () => void): void {
  if (!("serviceWorker" in navigator)) return;
  const hadController = navigator.serviceWorker.controller !== null;
  let offered = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!shouldOfferReload(hadController, offered)) return;
    offered = true;
    offer();
  });
}
