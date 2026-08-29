import type { User } from "oidc-client-ts";
import { useCallback, useEffect, useRef, useState } from "react";
import { showErrorSnackbar } from "@/components/AppSnackbar";
import {
  logout as authLogout,
  getUserManager,
  initiateLogin,
  initiateSignup,
  userToProfile,
} from "../auth";

export interface Session {
  user: {
    id: string;
    username: string;
  } | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  accessToken: string | null;
}

interface UseSessionReturn extends Session {
  login: () => Promise<void>;
  signup: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<boolean>;
}

function userToSession(
  user: User | null,
): Pick<Session, "user" | "accessToken" | "isAdmin"> {
  if (!user || user.expired) {
    return { user: null, accessToken: null, isAdmin: false };
  }
  const profile = userToProfile(user);
  return {
    user: { id: profile.userId, username: profile.username },
    accessToken: user.access_token,
    isAdmin: profile.isAdmin,
  };
}

/** Give up after this many failed renewals in a row. Without a cap, an
 * expiry event that keeps re-firing (a provider handing back an
 * already-expired token, or an unreachable one) retries forever, and every
 * attempt toggles the loading state - which the app chrome shows as a
 * blinking sign-in button. */
const MAX_RENEW_ATTEMPTS = 3;

export function useSession(): UseSessionReturn {
  // undefined = still initialising, null = not authenticated, User = authenticated
  const [oidcUser, setOidcUser] = useState<User | null | undefined>(undefined);
  // true while a silent renewal is in-flight so we show a spinner instead of a login prompt
  const [isRenewing, setIsRenewing] = useState(false);
  // One renewal at a time; overlapping attempts fight over the refresh token.
  const renewInFlight = useRef(false);
  const failedRenewals = useRef(0);

  useEffect(() => {
    /** Renew once, treating "succeeded but still expired" as a failure so a
     * provider that hands back a stale token cannot drive a retry loop. */
    const renew = async () => {
      if (renewInFlight.current) return;
      if (failedRenewals.current >= MAX_RENEW_ATTEMPTS) {
        setOidcUser(null);
        return;
      }
      renewInFlight.current = true;
      setIsRenewing(true);
      try {
        const user = await getUserManager().signinSilent({
          forceIframeAuth: false,
        });
        if (user && !user.expired) {
          failedRenewals.current = 0;
          setOidcUser(user);
        } else {
          failedRenewals.current += 1;
          setOidcUser(null);
        }
      } catch {
        failedRenewals.current += 1;
        setOidcUser(null);
      } finally {
        renewInFlight.current = false;
        setIsRenewing(false);
      }
    };

    // If the stored token is already expired, renew silently before leaving
    // the loading state so the login prompt never flashes.
    getUserManager()
      .getUser()
      .then(async (user) => {
        if (user?.expired) {
          await renew();
        } else {
          setOidcUser(user);
        }
      });

    const onLoaded = (user: User) => {
      failedRenewals.current = 0;
      setOidcUser(user);
    };
    const onUnloaded = () => setOidcUser(null);
    const onRenewError = () => {
      failedRenewals.current += 1;
      getUserManager().getUser().then(setOidcUser);
    };

    const onTokenExpired = renew;

    // Mobile PWA: when the app resumes from background the access token may
    // have already expired because JS timers were paused. Re-check on focus.
    const onVisibilityChange = async () => {
      if (document.visibilityState !== "visible") return;
      const user = await getUserManager().getUser();
      if (!user) return;
      if (
        user.expired ||
        (user.expires_in !== undefined && user.expires_in < 60)
      ) {
        // A fresh foreground is a fresh chance, even after earlier failures.
        failedRenewals.current = 0;
        await renew();
      }
    };

    const mgr = getUserManager();
    mgr.events.addUserLoaded(onLoaded);
    mgr.events.addUserUnloaded(onUnloaded);
    mgr.events.addSilentRenewError(onRenewError);
    mgr.events.addAccessTokenExpired(onTokenExpired);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      mgr.events.removeUserLoaded(onLoaded);
      mgr.events.removeUserUnloaded(onUnloaded);
      mgr.events.removeSilentRenewError(onRenewError);
      mgr.events.removeAccessTokenExpired(onTokenExpired);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const login = useCallback(async () => {
    try {
      await initiateLogin();
    } catch {
      showErrorSnackbar("Couldn't reach the sign-in service. Try again.");
    }
  }, []);

  const signup = useCallback(async () => {
    try {
      await initiateSignup();
    } catch {
      showErrorSnackbar("Couldn't reach the sign-up service. Try again.");
    }
  }, []);

  const logout = useCallback(async () => {
    await authLogout();
  }, []);

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const user = await getUserManager().signinSilent({
        forceIframeAuth: false,
      });
      if (user && !user.expired) failedRenewals.current = 0;
      return !!user;
    } catch {
      return false;
    }
  }, []);

  // A renewal only counts as loading while a session might still be valid.
  // Once we know we are signed out, keep the sign-in chrome on screen -
  // hiding it per attempt is what made the buttons blink.
  const isLoading = oidcUser === undefined || (isRenewing && oidcUser !== null);
  const { user, accessToken, isAdmin } = userToSession(oidcUser ?? null);

  return {
    user,
    isAuthenticated: !!accessToken,
    isAdmin,
    isLoading,
    accessToken,
    login,
    signup,
    logout,
    refresh,
  };
}

export { initiateLogin, initiateSignup } from "../auth";
