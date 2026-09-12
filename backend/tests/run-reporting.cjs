// Ejecuta las pruebas de lógica de reportes con las dependencias del backend.
// Uso: node backend/tests/run-reporting.cjs
const ts = require('typescript')
const fs = require('node:fs')
require.extensions['.ts'] = (module, path) => module._compile(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
  compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, path)
require('./reporting.test.ts')
