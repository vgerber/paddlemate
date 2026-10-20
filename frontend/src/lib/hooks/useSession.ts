import type { User } from "oidc-client-ts";
import { useCallback, useSyncExternalStore } from "react";
import { showErrorSnackbar } from "@/components/AppSnackbar";
import {
  logout as authLogout,
  initiateLogin,
  initiateSignup,
  userToProfile,
} from "@/lib/auth";
import {
  getSessionState,
  renewSession,
  subscribeSession,
} from "@/lib/sessionStore";
import { forgetThisDevice } from "./useNotifications";

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

export function useSession(): UseSessionReturn {
  const { user: oidcUser, renewing } = useSyncExternalStore(
    subscribeSession,
    getSessionState,
  );

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
    // While the token still works: the server entry needs it.
    await forgetThisDevice();
    await authLogout();
  }, []);

  const refresh = useCallback(async (): Promise<boolean> => {
    return (await renewSession()) !== null;
  }, []);

  // A renewal only counts as loading while a session might still be valid;
  // once signed out, the sign-in chrome stays on screen.
  const isLoading = oidcUser === undefined || (renewing && oidcUser !== null);
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

export { initiateLogin, initiateSignup } from "@/lib/auth";
