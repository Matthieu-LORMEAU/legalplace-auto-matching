import { describe, expect, it } from 'vitest';
import { type Invoice, MatchRule, type Transaction, UnmatchedReason } from '../domain/types';
import { decide } from './reconciliation-rules';

const day = (text: string) => new Date(text);
const transaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 't1',
  amountCents: 24000,
  label: '',
  reference: '',
  date: day('2026-05-12'),
  ...overrides,
});
const invoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: 'i1',
  invoiceNumber: 'F-1',
  totalCents: 24000,
  dueDate: day('2026-05-12'),
  ...overrides,
});
const pairs = (transactions: Transaction[], invoices: Invoice[]) =>
  decide(transactions, invoices).matches.map((match) => `${match.transactionId}->${match.invoiceId}`);

describe('decide', () => {
  it('matches a transaction with the only invoice of the same amount', () => {
    expect(decide([transaction()], [invoice()]).matches).toEqual([
      { transactionId: 't1', invoiceId: 'i1', rule: MatchRule.UniqueCandidate },
    ]);
  });

  // Finding #9: the window moved with the time zone of the machine (run `npm run test:timezones`).
  it('accepts a due date from 3 days before to 30 days after the transaction', () => {
    const fits = (dueDate: string) => pairs([transaction()], [invoice({ dueDate: day(dueDate) })]).length === 1;

    expect([fits('2026-05-09'), fits('2026-05-08'), fits('2026-06-11'), fits('2026-06-12')]).toEqual([
      true,
      false,
      true,
      false,
    ]);
  });

  it('does not match when two invoices fit', () => {
    const result = decide([transaction()], [invoice({ id: 'i1' }), invoice({ id: 'i2', invoiceNumber: 'F-2' })]);

    expect(result.unmatched).toEqual([{ transactionId: 't1', reason: UnmatchedReason.SeveralInvoicesFit }]);
  });

  // Finding #4: two payments were linked to the same invoice.
  it('does not match when two transactions fit the same invoice', () => {
    const result = decide([transaction({ id: 't1' }), transaction({ id: 't2' })], [invoice()]);

    expect(result.unmatched.map((item) => item.reason)).toEqual([
      UnmatchedReason.InvoiceFitsSeveralTransactions,
      UnmatchedReason.InvoiceFitsSeveralTransactions,
    ]);
  });

  // Finding #5: "sfr" was found inside "sfri sarl", and an empty number was found in every label.
  it('uses the invoice number to settle a doubt, as a whole word only, and never when empty', () => {
    const two = [invoice({ id: 'i1', invoiceNumber: 'F-1' }), invoice({ id: 'i2', invoiceNumber: 'F-2' })];
    const empty = [invoice({ id: 'i1', invoiceNumber: '' }), invoice({ id: 'i2', invoiceNumber: ' ' })];

    expect(pairs([transaction({ reference: 'f-2' })], two)).toEqual(['t1->i2']);
    expect(pairs([transaction({ label: 'PRLV SEPA F-1 MAI' })], two)).toEqual(['t1->i1']);
    expect(pairs([transaction({ label: 'PRLV F-12' })], two)).toEqual([]);
    expect(pairs([transaction({ label: 'PRLV SEPA SAGE' })], empty)).toEqual([]);
  });
});
