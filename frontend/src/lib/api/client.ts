import createClient from "openapi-fetch";
import { getUserManager, type User } from "@/lib/auth";
import type { paths } from "./schema.d.ts";

// Paths in the generated schema already include /api/v1, so baseUrl must be the origin only.
const API_BASE = import.meta.env.VITE_API_URL ?? window.location.origin;

export class ApiError extends Error {
  readonly status: number;
  /** Stable identifier from the API, e.g. "validation_failed". */
  readonly code?: string;
  /** The request field the error is about, when the API names one. */
  readonly target?: string;

  constructor(
    status: number,
    message: string,
    options?: { code?: string; target?: string },
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = options?.code;
    this.target = options?.target;
  }
}

/** Human-readable message for a failed API call: the server's own message
 * when the error is an ApiError with one, else the given fallback. Raw
 * non-API bodies (proxy HTML pages, stack dumps) fall back too. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const msg = err.message.trim();
    if (msg && msg.length <= 200 && !msg.startsWith("<")) return msg;
  }
  return fallback;
}

/** Read the API error envelope, falling back to the raw body for anything
 * that did not come from the API itself (a proxy or gateway, say). */
async function toApiError(response: Response): Promise<ApiError> {
  const body = await response.text().catch(() => "");
  try {
    const parsed = JSON.parse(body);
    if (parsed?.error?.message) {
      return new ApiError(response.status, parsed.error.message, {
        code: parsed.error.code,
        target: parsed.error.target,
      });
    }
  } catch {
    // not JSON - fall through to the raw body
  }
  return new ApiError(response.status, body || response.statusText);
}

export const client = createClient<paths>({ baseUrl: API_BASE });

// A single in-flight silent renew shared by concurrent requests, so an expired
// token triggers one refresh rather than a stampede.
let renewing: Promise<User | null> | null = null;

/** The current user with a valid access token. `getUser()` returns the stored
 * user even when its access token has expired (oidc-client-ts does not refresh
 * on read), which is what caused signed-in requests to 401. If the token is
 * expired we refresh once via the refresh token before using it; if that fails
 * we proceed unauthenticated rather than send a known-stale token. */
async function activeUser(): Promise<User | null> {
  const um = getUserManager();
  const user = await um.getUser();
  if (!user?.expired) return user;
  if (!renewing) {
    renewing = um
      .signinSilent()
      .catch(() => null)
      .finally(() => {
        renewing = null;
      });
  }
  return renewing;
}

// Inject the Bearer token on every request when the user is signed in.
client.use({
  async onRequest({ request }) {
    const user = await activeUser();
    if (user?.access_token) {
      request.headers.set("Authorization", `Bearer ${user.access_token}`);
    }
    return request;
  },
  async onResponse({ response }) {
    if (!response.ok && response.status !== 204) {
      throw await toApiError(response);
    }
    return response;
  },
});

/** Multipart POST. The typed client cannot express a file upload, so this
 * is the one path that builds its own request - it still carries the bearer
 * token and reports failures as the same ApiError everything else does. */
export async function postForm<T>(path: string, form: FormData): Promise<T> {
  const user = await activeUser();
  const headers = new Headers();
  if (user?.access_token) {
    headers.set("Authorization", `Bearer ${user.access_token}`);
  }
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    body: form,
    headers,
  });
  if (!response.ok) throw await toApiError(response);
  return (await response.json()) as T;
}
