import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    css: true,
    reporters: ['verbose', 'html', 'json'],
    outputFile: {
      html: './test-report/index.html',
      json: './test-results.json',
    },
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'src/index.ts',
        'src/test-setup.ts',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        '**/*.d.ts',
      ],
      include: ['src/**/*.{ts,tsx}'],
    },
  },
});
