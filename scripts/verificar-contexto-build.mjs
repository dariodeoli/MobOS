#!/usr/bin/env node
// Gate del contexto de build (Coolify/Docker): suma lo que cada .dockerignore NO
// excluye sobre los archivos versionados y falla si el contexto pasa de 400 MB o
// si algún archivo pesa más de 5 MB. Imprime los culpables.
//   node scripts/verificar-contexto-build.mjs [--json]
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const MAX_CONTEXTO = 400 * 1024 * 1024
export const MAX_ARCHIVO = 5 * 1024 * 1024
export const CONTEXTOS = [
  { nombre: 'frontend (raíz)', dir: '.', ignore: '.dockerignore' },
  { nombre: 'backend', dir: 'backend', ignore: 'backend/.dockerignore' },
]

const escapar = c => c.replace(/[.+^${}()|[\]\\]/g, '\\$&')

export function patronARegex(patron) {
  let p = patron.replace(/^\/+/, '').replace(/\/+$/, '')
  let re = ''
  for (let i = 0; i < p.length; i++) {
    const c = p[i]
    if (c === '*' && p[i + 1] === '*') {
      if (p[i + 2] === '/') {
        re += '(?:.*/)?'
        i += 2
      } else {
        re += '.*'
        i += 1
      }
    } else if (c === '*') re += '[^/]*'
    else if (c === '?') re += '[^/]'
    else re += escapar(c)
  }
  return new RegExp(`^${re}$`)
}

export function parsearDockerignore(texto) {
  return texto
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => (l.startsWith('!') ? { negado: true, re: patronARegex(l.slice(1)) } : { negado: false, re: patronARegex(l) }))
}

/** Semántica Docker: el patrón aplica al camino o a cualquiera de sus carpetas; gana el último. */
export function estaExcluido(ruta, reglas) {
  const partes = ruta.split('/')
  const prefijos = partes.map((_, i) => partes.slice(0, i + 1).join('/'))
  let excluido = false
  for (const r of reglas) {
    if (prefijos.some(p => r.re.test(p))) excluido = !r.negado
  }
  return excluido
}

export function medirContexto(archivos, reglas, dir = '.') {
  const base = dir === '.' ? '' : `${dir}/`
  const incluidos = archivos
    .filter(a => a.ruta.startsWith(base))
    .map(a => ({ ...a, rel: a.ruta.slice(base.length) }))
    .filter(a => !estaExcluido(a.rel, reglas))
  return {
    total: incluidos.reduce((s, a) => s + a.bytes, 0),
    archivos: incluidos,
    pesados: incluidos.filter(a => a.bytes > MAX_ARCHIVO),
  }
}

export function evaluar(medicion, { maxContexto = MAX_CONTEXTO, maxArchivo = MAX_ARCHIVO } = {}) {
  const errores = []
  if (medicion.total > maxContexto) errores.push(`contexto ${mb(medicion.total)} > ${mb(maxContexto)}`)
  for (const a of medicion.archivos) {
    if (a.bytes > maxArchivo) errores.push(`archivo ${a.rel} ${mb(a.bytes)} > ${mb(maxArchivo)}`)
  }
  return errores
}

const mb = n => `${(n / 1024 / 1024).toFixed(1)} MB`

function archivosVersionados(raiz) {
  const salida = execFileSync('git', ['ls-files', '-z'], { cwd: raiz, maxBuffer: 1 << 28 }).toString('utf8')
  return salida
    .split('\0')
    .filter(Boolean)
    .filter(ruta => existsSync(join(raiz, ruta)))
    .map(ruta => ({ ruta, bytes: statSync(join(raiz, ruta)).size }))
}

export function verificarContextos(raiz = process.cwd(), opciones) {
  const archivos = archivosVersionados(raiz)
  return CONTEXTOS.map(ctx => {
    const reglas = parsearDockerignore(readFileSync(join(raiz, ctx.ignore), 'utf8'))
    const medicion = medirContexto(archivos, reglas, ctx.dir)
    return { ...ctx, ...medicion, errores: evaluar(medicion, opciones) }
  })
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const resultados = verificarContextos()
  let fallo = false
  for (const r of resultados) {
    console.log(`${r.nombre}: ${mb(r.total)} en ${r.archivos.length} archivos`)
    if (r.errores.length) {
      fallo = true
      const top = [...r.archivos].sort((a, b) => b.bytes - a.bytes).slice(0, 10)
      for (const e of r.errores.slice(0, 10)) console.error(`  ERROR ${e}`)
      console.error('  más pesados:')
      for (const a of top) console.error(`    ${mb(a.bytes)}  ${a.rel}`)
    }
  }
  if (fallo) {
    console.error('Contexto de build demasiado pesado: revisá .dockerignore.')
    process.exit(1)
  }
}
