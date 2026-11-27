# Findings

> **A note on length.** I kept this report short on purpose, so that it can be read quickly. I can explain every choice in more detail, the ranking included, during the interview.
>
> Line links point to [`initial-implementation/`](initial-implementation/), a frozen copy of the original code, because `src/` is rewritten.

**In short.** On the seed data (company A, 1,200 transactions), the original code writes 506 matches. Only 117 follow the rules described in #2, 17 invoices are linked to several transactions, and errors are hidden: the job prints `skip` and still exits with code 0.

**How I ranked.** Two points of view: the README's (a wrong match writes an accounting record that nobody checks, so it is worse than no match, [README.md:7-9](README.md#L7-L9)), and what a production job must never have: security holes, no scaling, hidden failures. I weighed how bad the damage is, how many customers it reaches, how likely it is, and how hard it is to repair. Figures were measured by running the original code on the seed (company A: 1,200 transactions, 35,017 invoices); others are marked _estimated_ or _from the code_.

## Critique of the current implementation

<details>
<summary><b>1. SQL injection:</b> values are pasted into the SQL text, so a crafted siren can run any query.</summary>

All four queries paste values into the SQL text instead of passing them as parameters ([matcher.ts:73-100](initial-implementation/src/matcher.ts#L73-L100)).

_Consequence:_ a crafted `companySiren` changes the query: in my test, it made the database create a table I had not asked for (the run then failed, but the table was already there). By default the job connects as `postgres`, the most powerful database user ([db.ts:6](initial-implementation/src/db.ts#L6)), so an injected query can read, change or delete everything. Today `main.ts` passes a constant ([main.ts:5](initial-implementation/main.ts#L5)), so nobody outside can do this yet.

_Why first:_ unlimited damage, cheap fix (parameters, and check that the siren has 9 digits).

</details>

<details>
<summary><b>2. No rules about what can be matched:</b> only 117 of the 506 matches follow the rules.</summary>

The job checks only the amount and the date ([matcher.ts:48-57](initial-implementation/src/matcher.ts#L48-L57)). `Math.abs` ([matcher.ts:52](initial-implementation/src/matcher.ts#L52)) makes every amount positive, so an incoming payment (money received) can match a supplier invoice. Transaction status, invoice status and deleted records are ignored too.

_Consequence:_ the 117 matches that follow the rules pair an outgoing, `Booked` (confirmed by the bank), not deleted transaction with a `ToPay`, not deleted invoice. If `Pending` invoices were accepted too (a product question, see the notes), 305 would follow the rules. The other 201 are wrong in any case: 146 are on invoices already paid, 28 on cancelled invoices, 10 on deleted invoices, 8 are incoming payments, 24 are transactions still pending at the bank and 5 are deleted transactions (some matches break several rules, so these figures add up to more than 201).

_Why this rank:_ the largest source of wrong data, on every run, invisible in the output.

</details>

<details>
<summary><b>3. Existing matches are overwritten:</b> and nothing records who made a match.</summary>

The job also reads the transactions that are already matched ([matcher.ts:83-88](initial-implementation/src/matcher.ts#L83-L88)), and the update has no condition on the current state ([matcher.ts:99-101](initial-implementation/src/matcher.ts#L99-L101)). It writes no origin.

_Consequence:_ in a test, I pointed the seed's one manual match to another invoice and ran the job: it replaced my choice with its own (on the untouched seed it chooses the same invoice, so nothing changes). After a run, nobody can tell the job's matches from the customer's, so a faulty run cannot be undone.

_Why this rank:_ the customer's work is lost. Fix for #2 and #3: read only matchable, unmatched transactions, update only `where matched_invoice_id is null`, and record the origin.

</details>

<details>
<summary><b>4. One invoice can match several transactions:</b> 17 invoices are linked to 35 transactions.</summary>

Each transaction is decided alone ([matcher.ts:92-102](initial-implementation/src/matcher.ts#L92-L102)).

_Consequence:_ for example, two Regus payments of €690 (July 29 and 30) are linked to the same invoice, so it looks paid twice, while another Regus invoice of the same amount stays unmatched. For 15 of the 17 invoices, another invoice that fits stays unmatched. Repeated amounts are common: in the seed, 11 combinations of supplier and amount (for example Orange at €59.99) each appear on 136 to 153 invoices.

_Why this rank:_ like #2, but it needs repeated amounts. Fix: when nothing clearly separates the candidates, do not match, and let the customer decide.

</details>

<details>
<summary><b>5. The choice between candidates is a guess:</b> 189 transactions have two or more candidates.</summary>

The first invoice after sorting wins ([matcher.ts:67-68](initial-implementation/src/matcher.ts#L67-L68)), and a bonus is given when the bank label contains the supplier name or the invoice number ([matcher.ts:34-39](initial-implementation/src/matcher.ts#L34-L39)). It is fragile: `sfr` is found inside `sfri sarl`, an empty invoice number is "contained" in any label, a NULL supplier name crashes the job for that transaction (the seed has one invoice of each kind), and the `reference` column is never used.

_Consequence:_ up to 23 candidates for one transaction, and the seeded "SFRI SARL" payment is linked to the SFR invoice. In the run, the crash skipped one transaction.

_Why this rank:_ a record chosen by chance cannot be explained afterwards. Below #4 because the label bonus often picks the right invoice.

</details>

<details>
<summary><b>6. The same large query runs once per transaction (N+1):</b> about 90 s for 1,200 transactions.</summary>

`getCandidates` loads every invoice of the company inside the loop ([matcher.ts:71-76](initial-implementation/src/matcher.ts#L71-L76), [matcher.ts:94](initial-implementation/src/matcher.ts#L94)).

_Consequence:_ about 42 million rows read (1,200 × 35,017) to find 506 matches, and the cost grows with transactions × invoices (about a hundred times longer for ten times more of both, _estimated_). The new job, which reads the invoices once, runs on the same seed in about 0.09 s (the job alone, without Node start-up).

_Why this rank:_ important for scaling, but slow code can be rewritten while wrong data is slow to repair.

</details>

<details>
<summary><b>7. Errors are hidden:</b> a failed write is printed as <code>skip</code>, the job exits with code 0, and nothing prevents two runs at once.</summary>

One `try/catch` inside the loop catches every error, prints `skip` and continues ([matcher.ts:93-105](initial-implementation/src/matcher.ts#L93-L105)). The final line counts only the successes. There is no lock.

_Consequence:_ when I made the database read-only, every write failed: the job printed `skip` 507 times, then `Matched 0 of 1200 transactions`, and exited with code 0, so a scheduler would see a success. Two runs at the same time would repeat the 90 s of work, and one could overwrite a match that a customer made during the run (_from the code, not tested_).

_Why this rank:_ no wrong data by itself, but it hides every other defect. Saving each match on its own is acceptable (a failed run keeps its finished matches); what is not acceptable is that nobody is told.

</details>

<details>
<summary><b>8. The schema checks nothing:</b> no foreign key, unique constraint or check.</summary>

Amounts are `real`, `due_date` is text, statuses are free text ([initial schema](initial-implementation/migrations/20260101000000_initial_schema.sql#L13-L36)).

_Consequence:_ nothing stops wrong data from being written. The same invoice can be linked to several transactions (this is how #4 reached the database), a transaction can point to an invoice that does not exist or that belongs to another customer, and a mistyped status such as `Topay` is accepted and makes that invoice silently invisible to any code that filters on status. The seed already has a transaction on an account that does not exist. The original code does not link two customers (its queries filter by company), but the database would not refuse it.

_Why this rank:_ it does not write wrong data by itself, but it removes the safety net that would have stopped #4. It ranks lower because another defect is needed to produce a wrong record.

</details>

<details>
<summary><b>9. The date window depends on the time zone:</b> 508 matches in Paris instead of 506.</summary>

`dayDiff` mixes a local-midnight `Date` (the driver builds it from a `date` column) with a UTC text date ([matcher.ts:23-25](initial-implementation/src/matcher.ts#L23-L25)).

_Consequence:_ in Paris time, 47 transactions get another invoice, 6 are matched only in Paris and 4 only in UTC. The window shifts by one day, and the choice among candidates depends on the distance to the due date.

_Why this rank:_ about 1 match in 10 changes, but a result that differs between a laptop and production is hard to reproduce.

</details>

<details>
<summary><b>10. Amounts are compared as floating-point numbers:</b> about 1 transaction in 5 with a correct invoice is never matched.</summary>

`512.83 + 102.57 === 615.4` is false in JavaScript (the sum is `615.4000000000001`), and the job compares sums of `real` numbers with `===` ([matcher.ts:49-53](initial-implementation/src/matcher.ts#L49-L53)).

_Consequence:_ 116 of the 623 transactions that have an invoice with the same amount and a due date in the window are never matched (58 of 299 if we keep only the pairs that follow the other rules).

_Why this rank:_ the job misses matches instead of creating wrong ones.

</details>

<details>
<summary><b>11. Tests and types give a false feeling of safety:</b> two tests, and none of #1 to #10 breaks them.</summary>

There are two tests ([matcher.test.ts:5-11](initial-implementation/src/matcher.test.ts#L5-L11)), with ISO text dates that avoid the time-zone bug, and `InvoiceRow` ([matcher.ts:10-17](initial-implementation/src/matcher.ts#L10-L17)) says `string` for columns that can be NULL.

_Consequence:_ none of #1 to #10 breaks the build or the tests. The new tests (`npm run test:timezones`) cover #1 to #5, #7 (a failed run keeps nothing and a second run cannot start; the exit code of `main.ts` is not tested), #9 and #10. Not covered by a test: the speed (#6) and the schema constraints (#8).

</details>

**What the original code does well.** The date window follows the README, it compares the total with tax as the transactions do, and it never mixes the data of two companies.

## Schema changes

[`20260102000000_harden_schema.sql`](migrations/20260102000000_harden_schema.sql): the database enforces what only it can guarantee; business rules stay in the application. Amounts to `numeric`, enums for statuses, `due_date` to `date`, foreign keys without cascade (deleting a record that others depend on is refused), `unique (matched_invoice_id)`, `not null` on what matching needs, valid and unique `siren` and `iban`, two indexes. **Not enforced, on purpose:** the foreign key on `transaction.account_id` (the seed has a transaction on an unknown account, and I did not edit the seed), required `due_date` and supplier fields (an incomplete invoice should be kept, not rejected: the seed has 1,051 invoices without a due date, and the job skips them), and unique `remote_id` (product question).

[`20260103000000_match_origin.sql`](migrations/20260103000000_match_origin.sql): adds `match_source` (`manual` or `auto`) and `matched_at`, so the job's matches can be told apart from the customer's and undone. Existing matches are marked `manual`.

## Architecture and code quality

The rules that decide a match are plain functions with no database, so they are tested without one. Everything that touches Postgres sits behind one interface, and a tool (`npm run arch`) checks that dependencies only point inward: `domain` knows nothing, `services` know the domain and the ports, adapters implement the ports, and only the root files know everything. Only what I added is shown:

```text
.
├─ main.ts                               entry point: wires the pieces, prints the report, sets the exit code
├─ db.ts                                 Postgres connection (settings from the environment)
├─ format-report.ts                      the text printed at the end of a run
├─ src/
│  ├─ domain/
│  │  └─ types.ts                        business types and enums (statuses, match rules)
│  ├─ repositories/
│  │  ├─ ports/                          the interface the service needs from storage, and its errors
│  │  └─ adapters/                       the Postgres implementation: transaction, locks, row validation
│  │     └─ sql/                         one .sql file per query
│  ├─ services/
│  │  ├─ reconciliation-rules.ts         decide(): which transaction paid which invoice, pure code
│  │  └─ reconciliation.service.ts       the use case: read, decide, save, report
│  └─ *.test.ts                          next to the code: unit tests (fake repository) and integration tests
├─ migrations/
│  ├─ 20260102000000_harden_schema.sql   exact types, enums, foreign keys, uniqueness
│  └─ 20260103000000_match_origin.sql    who made each match, and when
├─ test/                                 helpers for the integration tests (temporary database, factories)
├─ .dependency-cruiser.cjs               the architecture rules checked by npm run arch
└─ initial-implementation/               frozen copy of the original code, for the line links above
```

Quality checks, all run in two time zones with `npm run test:timezones`:

- **Types and boundaries.** Strict TypeScript. Database rows are validated where they enter (`zod`), so the rules only see integer cents and UTC days. Every query of the job is parameterised and kept in its own `.sql` file (only `begin`, `commit` and `rollback` are in the code).
- **Tests.** 14 tests, kept few on purpose, one or two per important finding. Unit tests cover the rules and the service (with a fake repository); integration tests use a real temporary Postgres database. They check, among others, that a failed run keeps nothing, that a second run cannot start at the same time, and that a siren that looks like SQL is treated as text.
- **On the seed.** A test checks that every match is allowed, that no invoice is linked twice, that nothing crosses companies (company B is left alone), that the customer's match is kept, and that decimal amounts such as 512.83 + 102.57 match.
- **Trade-off I accept.** The eligibility rules (outgoing, booked, `ToPay`) are applied in the SQL query, not in the domain. It loads fewer rows, but it splits the business rules between two places, and only the integration tests guard them.

## Notes

### What I deliberately left undone

- **Partial and grouped payments** (one invoice paid in two payments, or one payment for several invoices) and **currencies**.
- **Amount tolerance:** amounts must be equal to the cent. In the seed, about 70 transactions are exactly 1 cent away from an invoice, but only a few of them also fit the status and the date window, so a tolerance would gain little and risk wrong matches.
- **Credit notes** (a refund from a supplier): none in the seed.
- **Approximate name matching** ("OVH SAS" for "OVHcloud"): it brings a risk of wrong matches.
- **A screen for unclear cases** and **cancelled invoices after matching**.

### What I would need from the product side

1. **Which invoice statuses can a payment settle?** I chose `ToPay` only. With `Pending` too, about 450 transactions would be matchable instead of about 300 (company A).
2. **When several invoices fit, stay unmatched or suggest to a person?** I chose not to match: about 170 of the 300 matchable transactions have two or more candidates, and the invoice number is in the label or reference for only a handful of them.
3. **Should a transaction still `Pending` at the bank wait until it is `Booked`?** The seed has 59.
4. **Two bank lines with the same `remote_id`, date and amount (the €1,500 rent): one payment imported twice, or two payments?**
5. **Is the window a rule or a safety setting?** An invoice fits a payment if its due date is from 3 days before to 30 days after the payment date, as the README says.

### What I would build next

Record why each match was made or refused (the database keeps only who and when), suggestions to the customer for unclear cases, processing only new transactions in batches, and tests that run automatically on every commit.
