-- $1: company id
-- Takes a lock that means "a reconciliation is running for this company". It does not wait:
-- it answers false when another run holds it. It is released at commit or rollback.
select pg_try_advisory_xact_lock(
        hashtext ('reconciliation'), hashtext ($1)
    ) as acquired;