import type { User } from "oidc-client-ts";
import { getUserManager } from "./auth";

export interface SessionState {
  /** undefined = still initialising, null = signed out, User = signed in. */
  user: User | null | undefined;
  /** True while a silent renewal is in flight. */
  renewing: boolean;
}

/** Give up after this many failed renewals in a row. Without a cap, an
 * expiry event that keeps re-firing (a provider handing back an
 * already-expired token, or an unreachable one) retries forever, and every
 * attempt toggles the loading state, which the app chrome shows as a
 * blinking sign-in button. */
const MAX_RENEW_ATTEMPTS = 3;

let state: SessionState = { user: undefined, renewing: false };
const listeners = new Set<() => void>();
let failedRenewals = 0;
let inFlight: Promise<User | null> | null = null;
let started = false;

function setState(next: Partial<SessionState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

/** The one silent renewal, shared by the hook's events and by API requests,
 * so overlapping attempts never fight over the refresh token. "Succeeded but
 * still expired" counts as a failure, so a provider that hands back a stale
 * token cannot drive a retry loop. */
export function renewSession(): Promise<User | null> {
  inFlight ??= (async () => {
    setState({ renewing: true });
    try {
      const user = await getUserManager().signinSilent({
        forceIframeAuth: false,
      });
      if (user && !user.expired) {
        failedRenewals = 0;
        setState({ user });
        return user;
      }
    } catch {
      // counted below
    } finally {
      inFlight = null;
      setState({ renewing: false });
    }
    failedRenewals += 1;
    setState({ user: null });
    return null;
  })();
  return inFlight;
}

async function renewIfAllowed() {
  if (failedRenewals >= MAX_RENEW_ATTEMPTS) {
    setState({ user: null });
    return;
  }
  await renewSession();
}

/** Mobile PWA: when the app resumes from background the access token may
 * have expired because timers were paused. */
async function onVisibilityChange() {
  if (document.visibilityState !== "visible") return;
  const user = await getUserManager().getUser();
  if (!user) return;
  if (user.expired || (user.expires_in !== undefined && user.expires_in < 60)) {
    // A fresh foreground is a fresh chance, even after earlier failures.
    failedRenewals = 0;
    await renewSession();
  }
}

function start() {
  if (started) return;
  started = true;
  const manager = getUserManager();

  // An already-expired stored token is renewed before leaving the loading
  // state, so the sign-in prompt never flashes.
  manager.getUser().then(async (user) => {
    if (user?.expired) await renewIfAllowed();
    else setState({ user });
  });

  manager.events.addUserLoaded((user) => {
    failedRenewals = 0;
    setState({ user });
  });
  manager.events.addUserUnloaded(() => setState({ user: null }));
  manager.events.addSilentRenewError(() => {
    failedRenewals += 1;
    manager.getUser().then((user) => setState({ user }));
  });
  manager.events.addAccessTokenExpired(renewIfAllowed);
  document.addEventListener("visibilitychange", onVisibilityChange);
}

/** For `useSyncExternalStore`; the first subscriber starts the listeners. */
export function subscribeSession(listener: () => void): () => void {
  start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSessionState(): SessionState {
  return state;
}
