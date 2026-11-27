import { describe, expect, it } from 'vitest';
import { type Invoice, type Match, MatchRule, sirenSchema, type Transaction } from '../domain/types';
import type { ReconciliationRepository } from '../repositories/ports/reconciliation.repository';
import { ReconciliationService } from './reconciliation.service';

const siren = sirenSchema.parse('900997767');
const company = { siren, name: 'ACME' };
const day = new Date('2026-05-12');
const transaction: Transaction = { id: 't1', amountCents: 24000, label: '', reference: '', date: day };
const invoice: Invoice = { id: 'i1', invoiceNumber: 'F-1', totalCents: 24000, dueDate: day };

/** A repository in memory: the service is tested without a database. */
function fakeRepository(
  transactions: Transaction[],
  invoices: Invoice[],
  saved: Match[] = [],
): ReconciliationRepository {
  return {
    runForCompany: (_siren, work) =>
      work({
        company,
        transactions,
        invoices,
        saveMatches: async (matches) => void saved.push(...matches),
      }),
  };
}

describe('ReconciliationService', () => {
  it('saves the matches it decides and reports them', async () => {
    const saved: Match[] = [];

    const report = await new ReconciliationService(fakeRepository([transaction], [invoice], saved)).run(siren);

    expect(saved).toEqual([{ transactionId: 't1', invoiceId: 'i1', rule: MatchRule.UniqueCandidate }]);
    expect(report).toEqual({
      company,
      transactions: [transaction],
      invoices: [invoice],
      matches: saved,
      unmatched: [],
    });
  });
});
