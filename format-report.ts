import { MATCHABLE_INVOICE_STATUSES, MatchRule, TransactionStatus, UnmatchedReason } from './src/domain/types';
import type { ReconciliationReport } from './src/services/reconciliation.service';
import { DAYS_AFTER, DAYS_BEFORE } from './src/services/reconciliation-rules';

const BAR = '='.repeat(78);

const RULE_TEXT: Record<MatchRule, string> = {
  [MatchRule.UniqueCandidate]: 'only one invoice fits, and no other transaction fits it',
  [MatchRule.InvoiceNumber]: 'several invoices fit, but only one invoice number is in the label or reference',
};

const REASON_TEXT: Record<UnmatchedReason, string> = {
  [UnmatchedReason.NoCandidate]: 'no invoice has this amount and a due date in the window',
  [UnmatchedReason.SeveralInvoicesFit]: 'several invoices fit and nothing tells which one',
  [UnmatchedReason.InvoiceFitsSeveralTransactions]: 'the invoice also fits other transactions',
};

/** The result of a run, written for the person who launched it: what was read, what was found, how it decides. */
export function formatReport({ company, transactions, invoices, matches, unmatched }: ReconciliationReport): string {
  const number = (value: number) => value.toLocaleString('en-US');
  const percent = (part: number) => (transactions.length === 0 ? 0 : Math.round((part / transactions.length) * 100));
  const total = (value: number, text: string) => `  ${number(value).padStart(6)}  ${text} (${percent(value)}%)`;
  const details = (rows: [number, string][]) =>
    rows.map(
      ([value, text], i) => `       ${i === rows.length - 1 ? '└─' : '├─'} ${number(value).padStart(4)}  ${text}`,
    );

  return [
    BAR,
    ' BANK TRANSACTIONS AND SUPPLIER INVOICES: AUTOMATIC MATCHING',
    BAR,
    `Company: ${company.name || '(no name)'}  (siren ${company.siren})`,
    '',
    'WHAT IT READ',
    `  ${number(transactions.length)} transactions to examine, ${number(invoices.length)} invoices to match them with.`,
    '',
    'RESULT',
    total(matches.length, 'matched and saved'),
    ...details(
      Object.values(MatchRule).map((rule) => [matches.filter((match) => match.rule === rule).length, RULE_TEXT[rule]]),
    ),
    total(unmatched.length, 'left to the customer'),
    ...details(
      Object.values(UnmatchedReason).map((reason) => [
        unmatched.filter((item) => item.reason === reason).length,
        REASON_TEXT[reason],
      ]),
    ),
    '',
    'HOW IT DECIDES',
    '  The job looks for the supplier invoice that each bank transaction paid.',
    `  - Transactions examined: outgoing, ${TransactionStatus.Booked} by the bank, not deleted, not matched yet.`,
    '  - Existing matches, made by the job or by the customer, are never changed.',
    `  - Invoices considered: status ${MATCHABLE_INVOICE_STATUSES.join(' or ')}, not deleted, not paid by a transaction yet.`,
    '  - An invoice fits a transaction when its total with VAT equals the amount to the cent,',
    `    and its due date is between ${DAYS_BEFORE} days before and ${DAYS_AFTER} days after the transaction date.`,
    '  - A match is written only when it is certain:',
    ...Object.values(MatchRule).map((rule) => `      ${RULE_TEXT[rule]}.`),
    '  - Otherwise nothing is written: the customer decides. A wrong match is worse than no match.',
    BAR,
  ].join('\n');
}
