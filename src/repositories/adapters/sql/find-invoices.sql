-- $1: company id, $2: matchable statuses
-- Matchable status, not deleted, with a due date, not matched yet. Totals (with VAT) are returned in cents (numeric);
-- dates as text, so the driver does not build a Date in the local time zone.
select
    i.id,
    i.invoice_number as "invoiceNumber",
    (
        (
            i.tax_free_total + i.vat_amount
        ) * 100
    ) as "totalCents",
    i.due_date::text as "dueDate"
from buying_invoice i
where
    i.company_id = $1
    and i.invoice_status = any ($2::buying_invoice_status[])
    and i.deleted_at is null
    and i.due_date is not null
    and not exists (
        select 1
        from transaction t
        where
            t.matched_invoice_id = i.id
    );