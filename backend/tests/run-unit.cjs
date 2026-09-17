// Ejecuta pruebas TypeScript con las dependencias ya instaladas del backend.
const ts = require('typescript')
const fs = require('node:fs')
require.extensions['.ts'] = (module, path) => module._compile(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
  compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, path)
require('./payment-proofs.test.ts')
require('./pricing.test.ts')
