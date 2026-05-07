/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MOLLY_HISTORY_AWARE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
