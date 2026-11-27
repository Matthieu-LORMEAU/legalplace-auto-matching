import { db } from './db';
import { formatReport } from './format-report';
import { sirenSchema } from './src/domain/types';
import { PostgresReconciliationRepository } from './src/repositories/adapters/postgres-reconciliation.repository';
import { ReconciliationService } from './src/services/reconciliation.service';

const SEED_COMPANY_SIREN = '900997767'; // another one: npm start -- 123456789

async function main() {
  const siren = sirenSchema.parse(process.argv[2] ?? SEED_COMPANY_SIREN);
  const service = new ReconciliationService(new PostgresReconciliationRepository(db));

  console.log(formatReport(await service.run(siren)));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1; // a failed run must not look like a success
  })
  .finally(() => db.end());
