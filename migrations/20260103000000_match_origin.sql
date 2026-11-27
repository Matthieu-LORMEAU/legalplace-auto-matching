-- Records who made each match, so the job's matches can be told apart from the customer's own.

begin;

create type match_source as enum ('manual', 'auto');

alter table transaction
  add column match_source match_source,
  add column matched_at timestamptz,
  -- A source only makes sense on a matched transaction. The reverse (a matched transaction must have
  -- a source) is not enforced: the seed inserts its manual match without a source.
  add constraint transaction_match_source_check check (match_source is null or matched_invoice_id is not null);

-- Matches that exist before this migration were not made by the job.
update transaction set match_source = 'manual' where matched_invoice_id is not null;

commit;
