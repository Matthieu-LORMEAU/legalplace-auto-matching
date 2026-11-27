import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../../db';
import { InvoiceStatus, MatchSource, sirenSchema, TransactionStatus } from '../domain/types';
import { PostgresReconciliationRepository } from '../repositories/adapters/postgres-reconciliation.repository';
import { ReconciliationService } from './reconciliation.service';

// The whole job on the seed (company A). Planted scenarios have ids e00000NN (transactions) and f00000NN (invoices).
const service = new ReconciliationService(new PostgresReconciliationRepository(db));
const companyA = sirenSchema.parse('900997767');

beforeAll(async () => {
  await service.run(companyA);
});
afterAll(() => db.end());

async function count(sql: string) {
  return Number((await db.query(sql)).rows[0].count);
}

/** Supplier of the invoice matched to each transaction of a scenario (null: not matched). */
async function matchedSuppliers(scenario: number) {
  const { rows } = await db.query(
    `select i.supplier_name from transaction t left join buying_invoice i on i.id = t.matched_invoice_id
     where t.id::text like $1 order by t.id`,
    [`e${String(scenario).padStart(7, '0')}-%`],
  );
  return rows.map((row) => row.supplier_name);
}

describe('the job on the seed', () => {
  // Finding #2: the original job wrote matches that break the rules.
  it('only makes allowed matches', async () => {
    expect(
      await count(`select count(*) from transaction t join buying_invoice i on i.id = t.matched_invoice_id
                   where t.match_source = '${MatchSource.Auto}' and (t.amount >= 0 or t.status <> '${TransactionStatus.Booked}'
                         or t.deleted_at is not null or i.invoice_status <> '${InvoiceStatus.ToPay}' or i.deleted_at is not null)`),
    ).toBe(0);
  });

  // Finding #4: 17 invoices were linked to several transactions. The original never mixed companies either.
  it('never links an invoice twice or across companies, and leaves company B alone', async () => {
    expect(
      await count(`select count(*) from (select 1 from transaction where matched_invoice_id is not null
                                          group by matched_invoice_id having count(*) > 1) x`),
    ).toBe(0);
    expect(
      await count(`select count(*) from transaction t join account a on a.id = t.account_id
                   join buying_invoice i on i.id = t.matched_invoice_id where a.company_id <> i.company_id`),
    ).toBe(0);
    expect(
      await count(`select count(*) from transaction t join account a on a.id = t.account_id
                   where a.company_id = 'c0000000-0000-4000-8000-00000000000b' and t.matched_invoice_id is not null`),
    ).toBe(0);
  });

  // Finding #3: the original job replaced the customer's match (scenario 05).
  it('keeps the match made by the customer', async () => {
    expect(
      await count(`select count(*) from transaction where id::text like 'e0000005-%'
                   and matched_invoice_id::text like 'f0000005-%' and match_source is distinct from '${MatchSource.Auto}'`),
    ).toBe(1);
  });

  // Finding #10: 512.83 + 102.57 !== 615.4 with decimal numbers (scenario 03).
  // Finding #5: a NULL supplier and an empty invoice number used to crash the job or match by mistake (scenario 13).
  it('matches 512.83 + 102.57 = 615.40, and a NULL supplier or empty number causes no crash or false match', async () => {
    expect((await matchedSuppliers(3))[0]).not.toBeNull();
    expect(await matchedSuppliers(13)).not.toContain('Qonto');
  });
});
