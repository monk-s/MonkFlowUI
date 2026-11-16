// API tests run against a real, throwaway Postgres (see tests/globalSetup.js),
// one file at a time because they share that database.
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  globalSetup: '<rootDir>/tests/globalSetup.js',
  globalTeardown: '<rootDir>/tests/globalTeardown.js',
  testTimeout: 30000,
  maxWorkers: 1,
  // The API logs every refused request; expected refusals would bury the results.
  silent: true,
};
