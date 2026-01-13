/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ACCESS_KEY: string
  readonly VITE_REGISTRATION_CODE: string
  readonly VITE_DISABLE_AUTH?: string
  // Add more env variables here as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
