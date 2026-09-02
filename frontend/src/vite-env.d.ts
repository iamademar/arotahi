/// <reference types="vite/client" />

/**
 * No client-side environment variables are needed: the basemap is OpenFreeMap,
 * which takes no key, and VITE_API_TARGET is read by vite.config.ts through
 * process.env rather than import.meta.env.
 */
interface ImportMetaEnv {}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
