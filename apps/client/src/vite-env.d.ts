/// <reference types="vite/client" />

declare interface ImportMetaEnv {
  readonly VITE_SIGNALING_URL?: string;
  readonly VITE_STUN_URL?: string;
  readonly VITE_TURN_URL?: string;
  readonly VITE_TURN_USER?: string;
  readonly VITE_TURN_PASS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
