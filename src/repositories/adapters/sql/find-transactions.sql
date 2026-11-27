-- $1: company id, $2: booked status
-- Outgoing, booked, not deleted, not matched yet. The rows stay locked until the end of the run,
-- so nobody changes them meanwhile. Amounts are returned in cents (numeric); dates as text, so the driver
-- does not build a Date in the local time zone.
select t.id, (- t.amount * 100) as "amountCents", t.label, t.reference, t.date::text as date
from transaction t
    join account a on a.id = t.account_id
where
    a.company_id = $1
    and t.amount < 0
    and t.status = $2
    and t.deleted_at is null
    and t.matched_invoice_id is null
for update of
    t;