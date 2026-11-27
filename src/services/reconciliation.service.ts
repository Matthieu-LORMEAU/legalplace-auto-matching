import type { Company, Invoice, Match, Siren, Transaction, Unmatched } from '../domain/types';
import type { ReconciliationRepository } from '../repositories/ports/reconciliation.repository';
import { decide } from './reconciliation-rules';

export type ReconciliationReport = {
  company: Company;
  /** What the run read: the transactions it examined and the invoices it could match them with. */
  transactions: Transaction[];
  invoices: Invoice[];
  matches: Match[];
  /** Left to the customer, with the reason. */
  unmatched: Unmatched[];
};

export class ReconciliationService {
  constructor(private readonly repository: ReconciliationRepository) {}

  run(siren: Siren): Promise<ReconciliationReport> {
    return this.repository.runForCompany(siren, async ({ company, transactions, invoices, saveMatches }) => {
      const { matches, unmatched } = decide(transactions, invoices);
      await saveMatches(matches);
      return { company, transactions, invoices, matches, unmatched };
    });
  }
}
