// UI and unit tests: `npm test` (CI runs `npm test -- --ci` before building).
module.exports = {
  preset: 'jest-expo',
  clearMocks: true,
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.tsx'],
  testMatch: ['<rootDir>/__tests__/**/*.test.ts?(x)'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/supabase/', '<rootDir>/deploy/', '<rootDir>/android/', '<rootDir>/ios/'],
};
