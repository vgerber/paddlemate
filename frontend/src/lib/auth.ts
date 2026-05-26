import { type User, UserManager, WebStorageStateStore } from "oidc-client-ts";

const AUTH_SERVER = import.meta.env.VITE_AUTH_SERVER;
const REALM = import.meta.env.VITE_AUTH_REALM;
const CLIENT_ID = import.meta.env.VITE_AUTH_CLIENT_ID;

// Lazily instantiated so the module can be safely evaluated during SSR where
// `window` and `localStorage` are not available.
let _userManager: UserManager | undefined;

export function getUserManager(): UserManager {
	if (!_userManager) {
		_userManager = new UserManager({
			authority: `${AUTH_SERVER}/realms/${REALM}`,
			client_id: CLIENT_ID,
			// Evaluated lazily - only in the browser.
			redirect_uri: `${window.location.origin}/auth/callback`,
			scope: "openid profile email offline_access",
			automaticSilentRenew: true,
			// Store both tokens and PKCE state in localStorage so the code_verifier
			// survives context switches on Android PWA (where sessionStorage is lost
			// when the OS routes the redirect through the system browser).
			userStore: new WebStorageStateStore({ store: localStorage }),
			stateStore: new WebStorageStateStore({ store: localStorage }),
			// Keycloak doesn't expose the standard check_session iframe endpoint by
			// default; silent renew via the refresh token (offline_access scope) is
			// sufficient. In oidc-client-ts v3, the library automatically uses the
			// refresh token grant when a refresh token is available, so no iframe is
			// needed and mobile Safari's 3rd-party cookie blocking doesn't apply.
			monitorSession: false,
		});
	}
	return _userManager;
}

export type { User };

export function userToProfile(user: User): {
	userId: string;
	username: string;
	isAdmin: boolean;
} {
	const profile = user.profile;
	// The OIDC profile shape extends JwtPayload which doesn't include realm_access;
	// cast through unknown to access the Keycloak-specific claim.
	const keycloakProfile = profile as unknown as {
		realm_access?: { roles?: string[] };
	};
	const roles: string[] = keycloakProfile.realm_access?.roles ?? [];
	return {
		userId: profile.sub,
		username:
			(profile.preferred_username as string | undefined) ||
			profile.name ||
			profile.sub,
		isAdmin: roles.includes("server_admin"),
	};
}

export async function initiateLogin(): Promise<void> {
	await getUserManager().signinRedirect();
}

export async function logout(): Promise<void> {
	await getUserManager().removeUser();
}
