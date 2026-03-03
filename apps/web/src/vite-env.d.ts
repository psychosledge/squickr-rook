/// <reference types="vite/client" />
declare const __APP_VERSION__: string;

declare module "virtual:pwa-register/react" {
  import type { Dispatch, SetStateAction } from "react";
  export function useRegisterSW(options?: {
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
  }): {
    needRefresh: [boolean, Dispatch<SetStateAction<boolean>>];
    offlineReady: [boolean, Dispatch<SetStateAction<boolean>>];
    updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
  };
}
