import type { Company, Invoice, Match, Siren, Transaction } from '../../domain/types';

export type CompanyRun = {
  company: Company;
  transactions: Transaction[];
  invoices: Invoice[];
  saveMatches: (matches: Match[]) => Promise<void>;
};

/** What the service needs from the database. The tests give it a fake. */
export interface ReconciliationRepository {
  /** Runs `work` on one company, one run at a time, all or nothing. */
  runForCompany<Result>(siren: Siren, work: (run: CompanyRun) => Promise<Result>): Promise<Result>;
}

export class CompanyNotFoundError extends Error {
  constructor(siren: Siren) {
    super(`No company with siren ${siren}`);
  }
}

export class CompanyAlreadyRunningError extends Error {
  constructor(siren: Siren) {
    super(`A run is already in progress for siren ${siren}`);
  }
}
