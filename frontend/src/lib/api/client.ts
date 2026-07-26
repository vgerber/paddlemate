import createClient from "openapi-fetch";
import { getUserManager } from "@/lib/auth";
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

// Inject the Bearer token on every request when the user is signed in.
client.use({
  async onRequest({ request }) {
    const user = await getUserManager().getUser();
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
