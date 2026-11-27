import { z } from 'zod';

export const sirenSchema = z
  .string()
  .regex(/^\d{9}$/, 'A siren has exactly 9 digits')
  .brand<'Siren'>();
export type Siren = z.infer<typeof sirenSchema>;

export enum TransactionStatus {
  Booked = 'Booked',
  Pending = 'Pending',
}

export enum InvoiceStatus {
  Pending = 'Pending',
  ToPay = 'ToPay',
  Paid = 'Paid',
  Cancelled = 'Cancelled',
}

/** Only these invoices can receive a match. Adding `InvoiceStatus.Pending` is a product decision. */
export const MATCHABLE_INVOICE_STATUSES = [InvoiceStatus.ToPay];

export enum MatchSource {
  Manual = 'manual',
  Auto = 'auto',
}

export enum MatchRule {
  UniqueCandidate = 'unique_candidate',
  InvoiceNumber = 'invoice_number',
}

export enum UnmatchedReason {
  NoCandidate = 'no_candidate',
  SeveralInvoicesFit = 'several_invoices_fit',
  InvoiceFitsSeveralTransactions = 'invoice_fits_several_transactions',
}

export type Company = { siren: Siren; name: string };

export type Transaction = {
  id: string;
  /** Positive: the bank stores outgoing payments as negative amounts. */
  amountCents: number;
  label: string;
  reference: string;
  /** A calendar day, as UTC midnight (built from 'YYYY-MM-DD'), so the time zone of the machine never matters. */
  date: Date;
};

export type Invoice = {
  id: string;
  invoiceNumber: string;
  /** Total without tax plus VAT. */
  totalCents: number;
  dueDate: Date; // same convention as Transaction.date
};

export type Match = { transactionId: string; invoiceId: string; rule: MatchRule };

export type Unmatched = { transactionId: string; reason: UnmatchedReason };
