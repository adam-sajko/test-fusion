import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    css: true,
    include: ['src/**/*.test.{ts,tsx}'],
    reporters: ['default', 'json', 'html'],
    outputFile: {
      json: './test-results.json',
      html: './test-report/index.html',
    },
    coverage: {
      // Istanbul provider so unit coverage keys align with the E2E coverage and fuse per file.
      provider: 'istanbul',
      reportsDirectory: './coverage',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/index.tsx',
        'src/components/index.ts',
        'src/test-setup.ts',
        '**/*.test.{ts,tsx}',
        '**/*.d.ts',
      ],
    },
  },
});
