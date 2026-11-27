import { execSync } from 'node:child_process';
import { Client } from 'pg';

/** Recreates the test database (never the development one) with the schema and the seed. */
export async function setup() {
  const admin = new Client({
    host: process.env.PGHOST ?? 'localhost',
    port: Number(process.env.PGPORT ?? 5432),
    user: process.env.PGUSER ?? 'postgres',
    password: process.env.PGPASSWORD ?? 'postgres',
    database: 'postgres',
  });
  await admin.connect().catch(() => {
    throw new Error('Cannot reach Postgres. Start it with: docker compose up -d');
  });
  await admin.query('drop database if exists matching_test with (force)');
  await admin.query('create database matching_test');
  await admin.end();

  execSync('npx tsx scripts/reset.ts', { env: { ...process.env, PGDATABASE: 'matching_test' }, stdio: 'inherit' });
}
