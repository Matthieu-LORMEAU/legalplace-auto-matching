import { randomUUID } from 'node:crypto';
import { db } from '../db';
import { InvoiceStatus, sirenSchema, TransactionStatus } from '../src/domain/types';

/** Small scenarios for the integration tests. Each one gets its own company, so tests do not disturb each other. */

const digits = (length: number) => Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');

export async function createCompany() {
  const company = { id: randomUUID(), siren: sirenSchema.parse(digits(9)), accountId: randomUUID() };
  await db.query('insert into company (id, siren, name) values ($1, $2, $3)', [company.id, company.siren, 'Test']);
  await db.query('insert into account (id, company_id, iban) values ($1, $2, $3)', [
    company.accountId,
    company.id,
    `FR76${digits(23)}`,
  ]);
  return company;
}

type TestCompany = Awaited<ReturnType<typeof createCompany>>;

export async function createTransaction(
  company: TestCompany,
  {
    amount = '-240.00',
    status = TransactionStatus.Booked,
    label = 'PRLV SEPA' as string | null,
    reference = null as string | null,
    date = '2026-05-12',
    deleted = false,
    matchedInvoiceId = null as string | null,
  } = {},
) {
  const id = randomUUID();
  await db.query(
    `insert into transaction (id, account_id, remote_id, amount, label, reference, status, date, matched_invoice_id, deleted_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      company.accountId,
      randomUUID(),
      amount,
      label,
      reference,
      status,
      date,
      matchedInvoiceId,
      deleted ? new Date() : null,
    ],
  );
  return id;
}

export async function createInvoice(
  company: TestCompany,
  {
    taxFreeTotal = '200.00',
    vatAmount = '40.00',
    invoiceNumber = `F-${digits(8)}` as string | null,
    dueDate = '2026-05-12' as string | null,
    status = InvoiceStatus.ToPay,
    deleted = false,
  } = {},
) {
  const id = randomUUID();
  await db.query(
    `insert into buying_invoice (id, company_id, supplier_name, invoice_number, tax_free_total, vat_amount, due_date, invoice_status, deleted_at)
     values ($1, $2, 'Test supplier', $3, $4, $5, $6, $7, $8)`,
    [id, company.id, invoiceNumber, taxFreeTotal, vatAmount, dueDate, status, deleted ? new Date() : null],
  );
  return id;
}

export async function readTransaction(id: string) {
  const { rows } = await db.query(
    'select matched_invoice_id, match_source, matched_at from transaction where id = $1',
    [id],
  );
  return rows[0] as { matched_invoice_id: string | null; match_source: string | null; matched_at: Date | null };
}
