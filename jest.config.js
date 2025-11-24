/**
 * Jest Configuration for E2E Tests
 */

const config = {
  testEnvironment: 'node',
  testTimeout: 30000,
  testMatch: ['<rootDir>/e2e/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/'],
  clearMocks: true,
  forceExit: true,
};

export default config;
