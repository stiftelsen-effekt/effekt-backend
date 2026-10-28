/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_AUTH_MODE?: "auth0" | "dev" | "preview";
  readonly VITE_AUTH_DOMAIN?: string;
  readonly VITE_AUTH_CLIENT_ID?: string;
  readonly VITE_AUTH_AUDIENCE?: string;
  readonly VITE_AUTH_SCOPE?: string;
  readonly VITE_DEV_AUTH_TOKEN_URL?: string;
  readonly VITE_FEATURE_REGRANTING?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
