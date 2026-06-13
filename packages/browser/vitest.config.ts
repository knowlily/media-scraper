import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: process.env.CI ? 60000 : 30000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts',
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
      ],
    },
  },
});
