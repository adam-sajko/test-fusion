/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
  reporters: [
    'default',
    [
      'jest-html-reporter',
      {
        pageTitle: 'App Test Report',
        outputPath: './test-report/index.html',
        includeFailureMsg: true,
      },
    ],
  ],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '^@ex-jest-mono/ui$': '<rootDir>/../ui/src/index.ts',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  testMatch: ['<rootDir>/src/**/*.(test|spec).(ts|tsx)'],
  collectCoverageFrom: [
    'src/**/*.(ts|tsx)',
    '!src/index.tsx',
    '!src/**/*.d.ts',
    '!src/test-setup.ts',
    '!src/**/*.test.*',
    '!src/**/*.spec.*',
  ],
  coverageReporters: ['text', 'json', 'html', 'lcov'],
  coverageDirectory: 'coverage',
};
