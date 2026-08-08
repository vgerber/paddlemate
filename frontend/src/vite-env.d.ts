/// <reference types="vite/client" />

// The env vars the app requires (see .env.example). Declaring them keeps
// import.meta.env.* typed as string in every project, including the bun
// test project whose ImportMeta typing would otherwise widen them.
interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_AUTH_SERVER: string;
  readonly VITE_AUTH_REALM: string;
  readonly VITE_AUTH_CLIENT_ID: string;
}

declare const __COMMIT_HASH__: string;
