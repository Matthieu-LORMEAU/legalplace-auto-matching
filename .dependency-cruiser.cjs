/** Architecture rules. Arrows point inward: domain <- repositories/ports <- (services, repositories/adapters) <- main. */
module.exports = {
  allowedSeverity: 'error', // a dependency between our files that matches no `allowed` entry is an error
  allowed: [
    { from: {}, to: { dependencyTypes: ['npm', 'npm-dev', 'core'] } }, // libraries: any file may use them
    { from: { path: '^src/domain' }, to: { path: '^src/domain' } },
    { from: { path: '^src/repositories/ports' }, to: { path: '^src/(repositories/ports|domain)' } },
    { from: { path: '^src/repositories/adapters' }, to: { path: '^src/(repositories/(adapters|ports)|domain)' } },
    { from: { path: '^src/services' }, to: { path: '^src/(services|repositories/ports|domain)' } },
    { from: { path: '^(main|db|format-report)\\.ts$' }, to: {} }, // the root files wire everything: free
  ],
  forbidden: [
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
    {
      name: 'database-driver-only-in-adapters', // the one library we restrict: no SQL outside the adapters
      severity: 'error',
      from: { pathNot: '^(db\\.ts|src/repositories/adapters)' },
      to: { path: '^node_modules/pg/' },
    },
  ],
  options: {
    parser: 'swc',
    tsConfig: { fileName: 'tsconfig.json' },
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '\\.test\\.ts$|^test/' },
  },
};
