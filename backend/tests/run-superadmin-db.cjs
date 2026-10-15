// Ejecuta las pruebas de panel de plataforma que necesitan una base real.
// SUPERADMIN_DB_TEST=1 DATABASE_URL=postgresql://... node tests/run-superadmin-db.cjs
const ts = require('typescript')
const fs = require('node:fs')
require.extensions['.ts'] = (module, path) => module._compile(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
  compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, path)
process.env.SUPERADMIN_DB_TEST = process.env.SUPERADMIN_DB_TEST || '1'
require('./superadmin-db.test.ts')
