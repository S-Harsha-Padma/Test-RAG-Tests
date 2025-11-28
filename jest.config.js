/**
 * Jest Configuration for E2E and Security Tests
 */

const config = {
  testEnvironment: 'node',
  testTimeout: 30000,
  testMatch: [
    '<rootDir>/e2e/**/*.test.js',
    '<rootDir>/security-test/**/*.test.js'
  ],
  testPathIgnorePatterns: ['/node_modules/'],
  clearMocks: true,
  forceExit: true,
  // Setup file for Azure SDK crypto support
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!(@azure|@typespec)/)',
  ],
};

export default config;
