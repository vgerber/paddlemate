import { useCallback, useEffect, useState } from "react";
import type { User } from "oidc-client-ts";
import {
  initiateLogin,
  logout as authLogout,
  getUserManager,
  userToProfile,
} from "../auth";

export interface Session {
  user: {
    id: string;
    username: string;
  } | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  accessToken: string | null;
}

interface UseSessionReturn extends Session {
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<boolean>;
}

function userToSession(
  user: User | null,
): Pick<Session, "user" | "accessToken"> {
  if (!user || user.expired) {
    return { user: null, accessToken: null };
  }
  const profile = userToProfile(user);
  return {
    user: { id: profile.userId, username: profile.username },
    accessToken: user.access_token,
  };
}

export function useSession(): UseSessionReturn {
  // undefined = still initialising, null = not authenticated, User = authenticated
  const [oidcUser, setOidcUser] = useState<User | null | undefined>(undefined);
  // true while a silent renewal is in-flight so we show a spinner instead of a login prompt
  const [isRenewing, setIsRenewing] = useState(false);

  useEffect(() => {
    // If the stored token is already expired, renew silently before leaving
    // the loading state so the login prompt never flashes.
    getUserManager()
      .getUser()
      .then(async (user) => {
        if (user?.expired) {
          setIsRenewing(true);
          try {
            await getUserManager().signinSilent({ forceIframeAuth: false });
          } catch {
            setOidcUser(null);
          } finally {
            setIsRenewing(false);
          }
        } else {
          setOidcUser(user);
        }
      });

    const onLoaded = (user: User) => setOidcUser(user);
    const onUnloaded = () => setOidcUser(null);
    const onRenewError = () => {
      getUserManager().getUser().then(setOidcUser);
    };

    const onTokenExpired = async () => {
      try {
        setIsRenewing(true);
        await getUserManager().signinSilent({ forceIframeAuth: false });
      } catch {
        getUserManager().getUser().then(setOidcUser);
      } finally {
        setIsRenewing(false);
      }
    };

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
        try {
          setIsRenewing(true);
          await getUserManager().signinSilent({ forceIframeAuth: false });
        } catch {
          getUserManager().getUser().then(setOidcUser);
        } finally {
          setIsRenewing(false);
        }
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
    await initiateLogin();
  }, []);

  const logout = useCallback(async () => {
    await authLogout();
  }, []);

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const user = await getUserManager().signinSilent({
        forceIframeAuth: false,
      });
      return !!user;
    } catch {
      return false;
    }
  }, []);

  const isLoading = oidcUser === undefined || isRenewing;
  const { user, accessToken } = userToSession(oidcUser ?? null);

  return {
    user,
    isAuthenticated: !!accessToken,
    isLoading,
    accessToken,
    login,
    logout,
    refresh,
  };
}

export { initiateLogin } from "../auth";
