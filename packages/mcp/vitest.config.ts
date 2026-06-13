import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: process.env.CI ? 60000 : 30000,
  },
});
