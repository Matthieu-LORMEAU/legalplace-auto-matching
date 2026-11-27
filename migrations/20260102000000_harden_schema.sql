-- Hardening of the initial schema: exact types, required columns, foreign keys, uniqueness.
-- Formats (siren, iban) and business rules (signs, status logic) are validated by the application.
-- Works on an empty database (db:reset runs migrations before seeds) and on a populated one.

begin;

create type transaction_status as enum ('Booked', 'Pending');
create type buying_invoice_status as enum ('Pending', 'ToPay', 'Paid', 'Cancelled');

alter table company
  alter column siren set not null,
  -- a SIREN is exactly 9 digits
  add constraint company_siren_format check (siren ~ '^[0-9]{9}$'),
  add constraint company_siren_key unique (siren);

alter table account
  alter column company_id set not null,
  alter column iban type varchar(34),
  alter column iban set not null,
  -- basic shape only: 2 letters, 2 digits, 11 to 30 letters/digits (15 to 34 characters in total, no spaces)
  add constraint account_iban_format check (iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$'),
  add constraint account_iban_key unique (iban),
  -- deferred (checked at commit): db:reset loads the seed AFTER this migration, and the seed file
  -- inserts accounts before their company
  add constraint account_company_fk foreign key (company_id) references company (id)
    deferrable initially deferred;

alter table transaction
  -- No foreign key on account_id yet, on purpose: a transaction must belong to an existing account,
  -- but the shipped seed contains one whose account does not exist (e0000011-...), so the constraint
  -- would make db:reset fail. In production, fix that record by hand first, then run:
  --   alter table transaction add constraint transaction_account_fk
  --     foreign key (account_id) references account (id) not valid;
  --   alter table transaction validate constraint transaction_account_fk;
  alter column account_id set not null,
  -- real -> numeric through text: keeps the decimal that was displayed (e.g. 1028.8).
  alter column amount type numeric using amount::text::numeric,
  alter column amount set not null,
  alter column status type transaction_status using status::transaction_status,
  alter column status set not null,
  alter column date set not null,
  alter column deleted_at type timestamptz using deleted_at at time zone 'UTC',
  add constraint transaction_matched_invoice_fk foreign key (matched_invoice_id) references buying_invoice (id),
  -- an invoice is matched by at most one transaction (NULLs, i.e. unmatched, can repeat)
  add constraint transaction_matched_invoice_key unique (matched_invoice_id);

alter table buying_invoice
  alter column company_id set not null,
  alter column tax_free_total type numeric using tax_free_total::text::numeric,
  alter column tax_free_total set not null,
  alter column vat_amount type numeric using vat_amount::text::numeric,
  alter column vat_amount set not null,
  alter column due_date type date using due_date::date,
  alter column invoice_status type buying_invoice_status using invoice_status::buying_invoice_status,
  alter column invoice_status set not null,
  alter column deleted_at type timestamptz using deleted_at at time zone 'UTC',
  -- deferred (checked at commit): same reason, the seed inserts invoices before their company
  add constraint buying_invoice_company_fk foreign key (company_id) references company (id)
    deferrable initially deferred;

-- The matching reads the transactions of a company's accounts and that company's invoices.
create index transaction_account_id_idx on transaction (account_id);
create index buying_invoice_company_id_idx on buying_invoice (company_id);

commit;
