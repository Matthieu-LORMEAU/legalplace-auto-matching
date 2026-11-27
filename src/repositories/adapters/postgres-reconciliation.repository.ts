import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import {
  type Invoice,
  MATCHABLE_INVOICE_STATUSES,
  type Match,
  MatchSource,
  type Siren,
  type Transaction,
  TransactionStatus,
} from '../../domain/types';
import {
  CompanyAlreadyRunningError,
  CompanyNotFoundError,
  type CompanyRun,
  type ReconciliationRepository,
} from '../ports/reconciliation.repository';

// The queries live in sql/, one file each, and are read once when the module loads.
const sql = (name: string) => readFileSync(join(__dirname, 'sql', `${name}.sql`), 'utf8');
const FIND_COMPANY = sql('find-company');
const SET_LOCK_TIMEOUT = sql('set-lock-timeout');
const LOCK_COMPANY = sql('lock-company');
const FIND_TRANSACTIONS = sql('find-transactions');
const FIND_INVOICES = sql('find-invoices');
const SAVE_MATCHES = sql('save-matches');

const LOCK_TIMEOUT = '5s'; // a run fails instead of waiting forever behind a long transaction of the app

// Database frontier: rows are validated and converted to domain types here.
const cents = z.coerce.number().int(); // the driver gives numeric as text: a third decimal fails here instead of being rounded
const day = z.iso.date().transform((text) => new Date(text)); // 'YYYY-MM-DD' is read as UTC midnight
const text = z
  .string()
  .nullable()
  .transform((value) => value ?? '');

const transactionRow = z.object({ id: z.string(), amountCents: cents, label: text, reference: text, date: day });
const invoiceRow = z.object({ id: z.string(), invoiceNumber: text, totalCents: cents, dueDate: day });

export class PostgresReconciliationRepository implements ReconciliationRepository {
  constructor(private readonly pool: Pool) {}

  async runForCompany<Result>(siren: Siren, work: (run: CompanyRun) => Promise<Result>): Promise<Result> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query(SET_LOCK_TIMEOUT, [LOCK_TIMEOUT]);

      const {
        rows: [company],
      } = await client.query<{ id: string; name: string | null }>(FIND_COMPANY, [siren]);
      if (!company) {
        throw new CompanyNotFoundError(siren);
      }
      const {
        rows: [{ acquired }],
      } = await client.query<{ acquired: boolean }>(LOCK_COMPANY, [company.id]);
      if (!acquired) {
        throw new CompanyAlreadyRunningError(siren);
      }

      const result = await work({
        company: { siren, name: company.name ?? '' },
        transactions: await findTransactions(client, company.id),
        invoices: await findInvoices(client, company.id),
        saveMatches: (matches) => saveMatches(client, company.id, matches),
      });
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

async function findTransactions(client: PoolClient, companyId: string): Promise<Transaction[]> {
  const { rows } = await client.query(FIND_TRANSACTIONS, [companyId, TransactionStatus.Booked]);
  return transactionRow.array().parse(rows);
}

async function findInvoices(client: PoolClient, companyId: string): Promise<Invoice[]> {
  const { rows } = await client.query(FIND_INVOICES, [companyId, MATCHABLE_INVOICE_STATUSES]);
  return invoiceRow.array().parse(rows);
}

async function saveMatches(client: PoolClient, companyId: string, matches: Match[]): Promise<void> {
  const { rowCount } = await client.query(SAVE_MATCHES, [
    matches.map((match) => match.transactionId),
    matches.map((match) => match.invoiceId),
    companyId,
    MatchSource.Auto,
  ]);
  if (rowCount !== matches.length) {
    throw new Error(`Saved ${rowCount} of ${matches.length} matches`);
  }
}
