import createClient from "openapi-fetch";
import { getUserManager } from "@/lib/auth";
import type { paths } from "./schema.d.ts";

// Paths in the generated schema already include /api/v1, so baseUrl must be the origin only.
const API_BASE = import.meta.env.VITE_API_URL ?? window.location.origin;

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
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
      const text = await response.text().catch(() => response.statusText);
      throw new ApiError(response.status, text);
    }
    return response;
  },
});
