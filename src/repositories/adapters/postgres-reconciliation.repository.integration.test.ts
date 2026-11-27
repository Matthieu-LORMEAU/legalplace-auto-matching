import { afterAll, describe, expect, it } from 'vitest';
import { db } from '../../../db';
import { createCompany, createInvoice, createTransaction, readTransaction } from '../../../test/factories';
import { type Match, MatchRule, type Siren } from '../../domain/types';
import { CompanyAlreadyRunningError, CompanyNotFoundError } from '../ports/reconciliation.repository';
import { PostgresReconciliationRepository } from './postgres-reconciliation.repository';

const repository = new PostgresReconciliationRepository(db);
const read = (company: { siren: Siren }) => repository.runForCompany(company.siren, async (run) => run);
const match = (transactionId: string, invoiceId: string): Match => ({
  transactionId,
  invoiceId,
  rule: MatchRule.UniqueCandidate,
});

afterAll(() => db.end());

/** Starts a run that stays open until `finish()` is called. */
async function startOpenRun(company: { siren: Siren }) {
  let release = () => {};
  let started = () => {};
  const hasStarted = new Promise<void>((resolve) => (started = resolve));
  const run = repository.runForCompany(company.siren, async () => {
    started();
    await new Promise<void>((resolve) => (release = resolve));
  });
  await hasStarted;
  return {
    finish: () => {
      release();
      return run;
    },
  };
}

describe('the Postgres repository', () => {
  // Finding #10: 512.83 + 102.57 !== 615.4 with decimal numbers. Finding #9: dates must be UTC days.
  it('converts rows to domain types: exact cents, UTC days, empty text for NULL', async () => {
    const company = await createCompany();
    await createTransaction(company, { amount: '-1028.8', label: null, date: '2026-03-29' });
    await createInvoice(company, { taxFreeTotal: '512.83', vatAmount: '102.57', invoiceNumber: null });

    const { transactions, invoices } = await read(company);

    expect(transactions[0]).toMatchObject({
      amountCents: 102880,
      label: '',
      reference: '',
      date: new Date('2026-03-29'),
    });
    expect(invoices[0]).toMatchObject({ totalCents: 61540, invoiceNumber: '' });
  });

  // Finding #7: a failure in the middle of a run used to leave half of the matches saved.
  it('keeps nothing when it fails after saving', async () => {
    const company = await createCompany();
    const [transactionId, invoiceId] = [await createTransaction(company), await createInvoice(company)];

    const run = repository.runForCompany(company.siren, async ({ saveMatches }) => {
      await saveMatches([match(transactionId, invoiceId)]);
      throw new Error('crash');
    });

    await expect(run).rejects.toThrow('crash');
    expect((await readTransaction(transactionId)).matched_invoice_id).toBeNull();
  });

  // Finding #7: nothing prevented two runs on the same company at the same time.
  it('cannot start while another run is in progress on the same company', async () => {
    const [company, otherCompany] = [await createCompany(), await createCompany()];
    const firstRun = await startOpenRun(company);

    await expect(read(company)).rejects.toThrow(CompanyAlreadyRunningError);
    await expect(read(otherCompany)).resolves.toBeDefined();

    await firstRun.finish();
    await expect(read(company)).resolves.toBeDefined();
  });

  // Finding #1: the siren was pasted into the SQL text. `main.ts` refuses such a sirens; this checks the repository alone.
  it('treats a siren that looks like SQL as plain text', async () => {
    await expect(read({ siren: "x'; create table pwned(x int); --" as Siren })).rejects.toThrow(CompanyNotFoundError);

    const { rows } = await db.query(`select to_regclass('public.pwned') as created`);
    expect(rows[0].created).toBeNull();
  });
});
