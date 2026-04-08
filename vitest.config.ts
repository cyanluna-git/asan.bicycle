import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // Use happy-dom so browser APIs (DOMParser, File) are available for gpx-parser tests.
    // The validation tests are pure functions and work fine in any environment.
    environment: 'happy-dom',
    include: ['__tests__/**/*.test.ts'],
    setupFiles: ['__tests__/setup/env.ts'],
    // API integration tests hit real Supabase — 5s default is too tight when
    // multiple files run in parallel and share the remote.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
