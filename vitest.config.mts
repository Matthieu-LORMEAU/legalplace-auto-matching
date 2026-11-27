import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        // No database needed: runs in milliseconds.
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.integration.test.ts'],
        },
      },
      {
        // Needs Postgres (docker compose up -d). Works on a temporary database, never on the development one.
        test: {
          name: 'integration',
          environment: 'node',
          include: ['src/**/*.integration.test.ts'],
          globalSetup: ['./test/setup.ts'],
          env: { PGDATABASE: 'matching_test' },
        },
      },
    ],
  },
});
