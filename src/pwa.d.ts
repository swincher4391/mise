/** Injected at build time from package.json version (see vite.config.ts). */
declare const __APP_VERSION__: string

declare module 'virtual:pwa-register' {
  export function registerSW(options?: {
    immediate?: boolean
    onNeedRefresh?: () => void
    onOfflineReady?: () => void
    onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void
    onRegisterError?: (error: Error) => void
  }): (reloadPage?: boolean) => Promise<void>
}
