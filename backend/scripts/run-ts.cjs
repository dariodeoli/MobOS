// Ejecuta un script TypeScript con las dependencias ya instaladas del backend
// (mismo transpilado que tests/run-unit.cjs): node scripts/run-ts.cjs scripts/<archivo>.ts [args]
const ts = require('typescript')
const fs = require('node:fs')
const path = require('node:path')
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename)
const target = process.argv[2]
if (!target) { console.error('Falta el script .ts a ejecutar.'); process.exit(2) }
const resolved = path.resolve(process.cwd(), target)
process.argv.splice(1, 2, resolved)
require(resolved)
