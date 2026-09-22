#!/usr/bin/env node
// Auditoría de higiene de logs (#232): que el repo, los scripts, el Dockerfile y
// los pipelines NUNCA impriman variables de entorno ni secretos (incluido debug).
//
// Uso: npm run audit:logs        (sale 1 si encuentra algo)
//      node scripts/audit-logs.mjs --json
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))

// Directorios/artefactos que no se auditan (dependencias, builds, evidencia QA).
const IGNORAR = /(^|\/)(node_modules|\.git|\.next|dist|test-results|playwright-report|docs\/qa|public\/print-agent|coverage|\.cache)(\/|$)/
// Solo texto auditable.
const AUDITABLE = /(\.(mjs|js|cjs|ts|tsx|jsx|sh|bash|zsh|yml|yaml|toml|json|md|txt|conf|service|plist)$)|(^|\/)(Dockerfile[^/]*|\.env\.example)$/
// El propio auditor, su guarda y la guía de higiene nombran los patrones
// prohibidos a propósito (checklist para humanos).
const EXCLUIR = new Set(['scripts/audit-logs.mjs', 'src/lib/logsReglas.test.js', 'docs/SEGURIDAD-LOGS.md'])

/**
 * Reglas: cada una detecta una forma de exponer env/secrets en logs o builds.
 * `archivo` limita la regla a ciertos tipos de archivo (regex sobre la ruta).
 */
export const REGLAS = [
  {
    id: 'shell-xtrace',
    descripcion: 'shell con `set -x`: imprime cada comando con sus variables expandidas',
    archivo: /\.(sh|bash|zsh)$|\.github\/workflows\/.*\.ya?ml$/,
    patron: /set\s+-[a-zA-Z]*x[a-zA-Z]*\b|set\s+-o\s+xtrace/,
  },
  {
    id: 'env-dump',
    descripcion: 'volcado del entorno (`printenv` / `env` como comando)',
    patron: /\bprintenv\b|(^|[;&|]\s*)env\s*(\||>|$)|\benv\s*\|\s*(sort|grep|head|cat)/,
  },
  {
    id: 'console-env',
    descripcion: 'console con `process.env` completo (imprime todos los secretos)',
    archivo: /\.(mjs|js|cjs|ts|tsx|jsx)$/,
    patron: /console\.(log|error|warn|info|debug)\(\s*(JSON\.stringify\()?\s*process\.env/,
  },
  {
    id: 'echo-secreto',
    descripcion: '`echo`/`printf` de una variable con pinta de secreto',
    patron: /(echo|printf)[^\n]*\$\{?[A-Za-z0-9_]*(TOKEN|SECRET|PASSWORD|PASSWD|PRIVATE_KEY|API_KEY|CREDENTIAL)/,
  },
  {
    id: 'dockerfile-env-secreto',
    descripcion: 'Dockerfile con `ARG`/`ENV` de nombre secreto (queda en la imagen y en los logs)',
    archivo: /(^|\/)Dockerfile[^/]*$/,
    patron: /^(ARG|ENV)\s+[A-Z0-9_]*(TOKEN|SECRET|PASSWORD|PRIVATE_KEY|API_KEY)[A-Z0-9_]*/m,
  },
  {
    id: 'build-arg-secreto',
    descripcion: '`--build-arg` con nombre secreto (queda en logs del build)',
    patron: /--build-arg\s+[A-Z0-9_]*(TOKEN|SECRET|PASSWORD|PRIVATE_KEY|API_KEY)/,
  },
  {
    id: 'cat-env',
    descripcion: 'lectura de un `.env` por consola (puede terminar en logs)',
    patron: /\b(cat|less|more|tail|head)\s+[^\n|]*\.env\b/,
  },
  {
    id: 'curl-auth-visible',
    descripcion: 'token embebido en la URL de un curl (queda en logs del proceso)',
    patron: /\bcurl\b[^\n]*(token|apikey|api_key|access_token)=[^\s"']+/i,
  },
]

/** Analiza un contenido y devuelve los hallazgos (línea + regla). */
export function analizarContenido(ruta, contenido) {
  const hallazgos = []
  const lineas = contenido.split('\n')
  for (const regla of REGLAS) {
    if (regla.archivo && !regla.archivo.test(ruta)) continue
    lineas.forEach((linea, indice) => {
      if (regla.patron.test(linea)) hallazgos.push({ ruta, linea: indice + 1, regla: regla.id, texto: linea.trim().slice(0, 160) })
    })
  }
  return hallazgos
}

function archivosAuditables(dir = RAIZ) {
  const salida = []
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name)
    const relativa = relative(RAIZ, ruta).split(sep).join('/')
    if (IGNORAR.test(relativa) || EXCLUIR.has(relativa)) continue
    if (entrada.isDirectory()) salida.push(...archivosAuditables(ruta))
    else if (AUDITABLE.test(entrada.name) || AUDITABLE.test(relativa)) salida.push(relativa)
  }
  return salida
}

export function auditarRepo() {
  const hallazgos = []
  for (const relativa of archivosAuditables()) {
    const contenido = readFileSync(join(RAIZ, relativa), 'utf8')
    hallazgos.push(...analizarContenido(relativa, contenido))
  }
  return hallazgos
}

const esCli = process.argv[1] && fileURLToPath(new URL(`file://${process.argv[1]}`)) === fileURLToPath(import.meta.url)
if (esCli) {
  const hallazgos = auditarRepo()
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ hallazgos, total: hallazgos.length }, null, 2))
  } else if (hallazgos.length) {
    for (const h of hallazgos) console.error(`✖ ${h.ruta}:${h.linea} [${h.regla}] ${h.texto}`)
    console.error(`\n${hallazgos.length} hallazgo(s): no se puede imprimir env/secrets en logs ni builds.`)
  } else {
    console.log(`✓ Higiene de logs OK (${archivosAuditables().length} archivos auditados).`)
  }
  if (hallazgos.length) process.exitCode = 1
}
