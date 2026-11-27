import { Pool } from 'pg';

export const db = new Pool({
  host: process.env.PGHOST ?? 'localhost',
  port: Number(process.env.PGPORT ?? 5432),
  user: process.env.PGUSER ?? 'postgres',
  password: process.env.PGPASSWORD ?? 'postgres',
  database: process.env.PGDATABASE ?? 'matching',
});

// A broken idle connection must not crash the whole process with an unhandled 'error' event.
db.on('error', (error) => console.error('Unexpected database error', error));
