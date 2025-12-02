module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // Timeout for tests (API calls can be slow)
  testTimeout: 30000,
  
  // Match test files
  testMatch: [
    '<rootDir>/e2e/**/*.test.ts',
    '<rootDir>/security-test/**/*.test.ts'
  ],
  
  // Setup file for polyfills
  setupFilesAfterEnv: ['<rootDir>/jest.setup.cjs'],
  
  // Verbose output
  verbose: true,
  
  // Ignore load tests (they use k6, not Jest)
  testPathIgnorePatterns: ['/node_modules/', '/load-test/']
};
