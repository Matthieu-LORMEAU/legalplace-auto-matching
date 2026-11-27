import {
  type Invoice,
  type Match,
  MatchRule,
  type Transaction,
  type Unmatched,
  UnmatchedReason,
} from '../domain/types';

// README: the due date is between 3 days before and 30 days after the transaction date.
export const DAYS_BEFORE = 3;
export const DAYS_AFTER = 30;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Finds the invoice each transaction paid. Candidates have the same amount and a due date in the window.
 * A match is made only when sure, otherwise the customer decides:
 * - MatchRule.UniqueCandidate: one candidate, and no other transaction fits that invoice;
 * - MatchRule.InvoiceNumber: several candidates, but only one is named by the transaction, and by no other.
 */
export function decide(transactions: Transaction[], invoices: Invoice[]): { matches: Match[]; unmatched: Unmatched[] } {
  const invoicesByAmount = new Map<number, Invoice[]>();
  for (const invoice of invoices) {
    invoicesByAmount.set(invoice.totalCents, [...(invoicesByAmount.get(invoice.totalCents) ?? []), invoice]);
  }

  const candidatesOf = new Map<string, Invoice[]>();
  const rivalsOf = new Map<string, Transaction[]>(); // invoice id -> transactions that fit it
  for (const transaction of transactions) {
    const candidates = (invoicesByAmount.get(transaction.amountCents) ?? []).filter((invoice) =>
      isDueDateInWindow(transaction, invoice),
    );
    candidatesOf.set(transaction.id, candidates);
    for (const invoice of candidates) {
      rivalsOf.set(invoice.id, [...(rivalsOf.get(invoice.id) ?? []), transaction]);
    }
  }

  const matches: Match[] = [];
  const unmatched: Unmatched[] = [];
  for (const transaction of transactions) {
    const candidates = candidatesOf.get(transaction.id) ?? [];
    const rivals = (invoice: Invoice) => rivalsOf.get(invoice.id) ?? [];
    const named = candidates.filter((invoice) => namesInvoice(transaction, invoice));
    const namedByNoOther = (invoice: Invoice) =>
      rivals(invoice).every((other) => other.id === transaction.id || !namesInvoice(other, invoice));

    if (candidates.length === 1 && rivals(candidates[0]).length === 1) {
      matches.push({ transactionId: transaction.id, invoiceId: candidates[0].id, rule: MatchRule.UniqueCandidate });
    } else if (named.length === 1 && namedByNoOther(named[0])) {
      matches.push({ transactionId: transaction.id, invoiceId: named[0].id, rule: MatchRule.InvoiceNumber });
    } else if (candidates.length === 0) {
      unmatched.push({ transactionId: transaction.id, reason: UnmatchedReason.NoCandidate });
    } else {
      const reason =
        candidates.length > 1 ? UnmatchedReason.SeveralInvoicesFit : UnmatchedReason.InvoiceFitsSeveralTransactions;
      unmatched.push({ transactionId: transaction.id, reason });
    }
  }
  return { matches, unmatched };
}

function isDueDateInWindow(transaction: Transaction, invoice: Invoice): boolean {
  const days = (invoice.dueDate.getTime() - transaction.date.getTime()) / MILLISECONDS_PER_DAY;
  return days >= -DAYS_BEFORE && days <= DAYS_AFTER;
}

/** The invoice number is the reference, or a whole word of the label ("F-1" is not found in "F-12"). */
function namesInvoice(transaction: Transaction, invoice: Invoice): boolean {
  const number = invoice.invoiceNumber.trim().toUpperCase();
  if (number === '') {
    return false;
  }
  const escaped = number.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const inLabel = new RegExp(`(^|[^A-Z0-9])${escaped}($|[^A-Z0-9])`).test(transaction.label.toUpperCase());
  return inLabel || transaction.reference.trim().toUpperCase() === number;
}
