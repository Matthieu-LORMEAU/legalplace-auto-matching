-- $1: transaction ids, $2: invoice ids (same order), $3: company id, $4: match source
-- Both sides must belong to the company, and the transaction must still be unmatched.
-- The caller checks the number of updated rows: anything missing is a bug.
update transaction t
set
    matched_invoice_id = m.invoice_id,
    match_source = $4,
    matched_at = now()
from unnest($1::uuid [], $2::uuid []) as m (transaction_id, invoice_id), account a, buying_invoice i
where
    t.id = m.transaction_id
    and a.id = t.account_id
    and a.company_id = $3
    and i.id = m.invoice_id
    and i.company_id = $3
    and t.matched_invoice_id is null;