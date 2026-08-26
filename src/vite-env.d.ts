/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TELEGRAM_BOT_USERNAME?: string
  readonly VITE_TELEGRAM_MINIAPP_SHORT_NAME?: string
  readonly VITE_FACEBOOK_APP_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.css?url' {
  const url: string
  export default url
}
