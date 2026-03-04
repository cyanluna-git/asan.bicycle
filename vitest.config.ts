import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // Use happy-dom so browser APIs (DOMParser, File) are available for gpx-parser tests.
    // The validation tests are pure functions and work fine in any environment.
    environment: 'happy-dom',
    include: ['__tests__/**/*.test.ts'],
  },
})
