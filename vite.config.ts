import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

// Node-only packages used exclusively by server-side code (src/lib/db.ts,
// src/lib/rembg.ts). These should never end up in the client bundle — if
// they somehow become reachable from client-imported code (a bug, since
// every use of them today is only via createServerFn().handler() bodies),
// explicitly externalizing them here means the client build fails loudly
// with an unresolved-import error immediately at that call site instead of
// silently trying to bundle Node built-ins (fs/net/tls/crypto/perf_hooks)
// that don't exist in a browser and breaking deep inside a dependency's
// internals, which is much harder to trace back to the actual mistake.
const SERVER_ONLY_PACKAGES = ['postgres']

// @tanstack/react-start/server exports (getRequestHeader, setResponseHeader,
// etc.) are only ever called from inside createMiddleware(...).server(...)
// callback bodies in this codebase — never from client-executed code. In
// principle the framework's own client/server code-splitting should strip
// those callback bodies (and their imports) out of the client bundle
// automatically; in practice, for deeply-nested import chains (route file
// -> server function module -> shared auth middleware module -> session
// cookie helper -> this import), that stripping doesn't happen before
// Rollup's static import-protection check runs, and the build fails on an
// import that is real in the source graph but never actually reachable at
// runtime in the browser. Externalizing it here is the pragmatic fix:
// Rollup stops trying to resolve/bundle it, and since nothing client-side
// ever calls into it, there is no runtime behavior change.
const FRAMEWORK_SERVER_ONLY_SPECIFIERS = ['@tanstack/react-start/server']

export default defineConfig({
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    // tanstackStart MUST come before viteReact, per framework requirements.
    tanstackStart(),
    viteReact(),
    tailwindcss(),
  ],
  environments: {
    client: {
      build: {
        rollupOptions: {
          external: [...SERVER_ONLY_PACKAGES, ...FRAMEWORK_SERVER_ONLY_SPECIFIERS],
        },
      },
      optimizeDeps: {
        exclude: SERVER_ONLY_PACKAGES,
      },
    },
  },
})
