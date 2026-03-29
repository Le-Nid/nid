import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals:     true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      exclude: ['dist/**', 'src/__tests__/**'],
    },
    include:  ['src/__tests__/**/*.test.ts'],
    testTimeout: 10_000,
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
})
