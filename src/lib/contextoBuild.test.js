import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parsearDockerignore,
  estaExcluido,
  medirContexto,
  evaluar,
  verificarContextos,
  MAX_ARCHIVO,
} from '../../scripts/verificar-contexto-build.mjs'

const leer = ruta => readFileSync(new URL(`../../${ruta}`, import.meta.url), 'utf8')
const raiz = parsearDockerignore(leer('.dockerignore'))
const back = parsearDockerignore(leer('backend/.dockerignore'))

test('los archivos locales importados como texto viajan al builder (#480)', () => {
  const repo = fileURLToPath(new URL('../../', import.meta.url))
  const fuentes = execFileSync('git', ['ls-files', 'src'], { cwd: repo, encoding: 'utf8' }).trim().split('\n')
  for (const fuente of fuentes.filter(ruta => /\.[jt]sx?$/.test(ruta) && !ruta.includes('.test.'))) {
    const codigo = readFileSync(resolve(repo, fuente), 'utf8')
    for (const match of codigo.matchAll(/\b(?:import\s*\(\s*|from\s*)['"]([^'"]+\?raw)['"]/g)) {
      if (!match[1].startsWith('.')) continue
      const archivo = resolve(repo, dirname(fuente), match[1].replace(/\?raw$/, ''))
      const ruta = relative(repo, archivo).replaceAll('\\', '/')
      assert.ok(readFileSync(archivo).length > 0, `${fuente}: ${ruta} existe`)
      assert.ok(!estaExcluido(ruta, raiz), `${fuente}: el builder necesita ${ruta}`)
    }
  }
})

test('el .dockerignore raíz excluye lo que el build del frontend no usa', () => {
  for (const ruta of [
    'docs/qa/1/a.png',
    'docs/IOS.md',
    'e2e/x.spec.js',
    'openspec/a.md',
    '.claude/agents/x.md',
    '.atl/x',
    '.git/HEAD',
    'node_modules/a/b.js',
    'backend/node_modules/a.js',
    'backend/.next/BUILD_ID',
    'coverage/x',
    'playwright-report/index.html',
    'test-results/a',
    'sub/captura.har',
    'sub/captura.har.gz',
    'sub/evidencia.zip',
  ]) {
    assert.ok(estaExcluido(ruta, raiz), `${ruta} debe quedar fuera del contexto`)
  }
})

test('el contexto raíz conserva lo que build y runtime necesitan', () => {
  for (const ruta of [
    'index.html',
    'docs/NOVEDADES.md',
    'src/main.jsx',
    'public/mobos-logo-concept-v2.png',
    'version.json',
    'package.json',
    'package-lock.json',
    'vite.config.js',
    'tailwind.config.js',
    'postcss.config.js',
    '.env.production',
    'backend/Dockerfile',
    'backend/prisma/schema.prisma',
    'backend/public/print-agent/manifest.json',
    'backend/public/print-agent/install.sh',
  ]) {
    assert.ok(!estaExcluido(ruta, raiz), `${ruta} no puede excluirse`)
  }
})

test('el .dockerignore del backend deja entrar migraciones, tests y print-agent', () => {
  for (const ruta of ['Dockerfile', 'prisma/migrations/x/migration.sql', 'tests/a.ts', 'public/print-agent/install.sh', 'prisma.config.ts']) {
    assert.ok(!estaExcluido(ruta, back), `${ruta} no puede excluirse`)
  }
  for (const ruta of ['.env', '.env.local', 'node_modules/a', '.next/BUILD_ID', 'a/b.zip', 'coverage/x']) {
    assert.ok(estaExcluido(ruta, back), `${ruta} debe excluirse`)
  }
  assert.ok(!estaExcluido('.env.example', back))
})

test('el contexto real (archivos versionados) cumple los umbrales', () => {
  for (const r of verificarContextos(new URL('../../', import.meta.url).pathname)) {
    assert.deepEqual(r.errores, [], `${r.nombre}: ${r.errores.join(', ')}`)
  }
})

test('evaluar marca contexto y archivos que pasan los umbrales', () => {
  const grande = { ruta: 'x/a.bin', rel: 'x/a.bin', bytes: MAX_ARCHIVO + 1 }
  assert.equal(evaluar({ total: 10, archivos: [grande] }).length, 1)
  assert.equal(evaluar({ total: 500 * 1024 * 1024, archivos: [] }).length, 1)
  const m = medirContexto([{ ruta: 'docs/a.png', bytes: 9 }, { ruta: 'src/a.js', bytes: 1 }], raiz)
  assert.equal(m.total, 1)
})

test('Tailwind solo escanea index.html, src y la biblioteca compartida', async () => {
  const cfg = (await import('../../tailwind.config.js')).default
  const permitido = [/^\.\/index\.html$/, /^\.\/src\//, /^\.\/node_modules\/owncoding-ui\//]
  assert.ok(cfg.content.length >= 3)
  for (const glob of cfg.content) {
    assert.ok(typeof glob === 'string', 'content solo admite globs de texto')
    assert.ok(permitido.some(re => re.test(glob)), `content demasiado ancho: ${glob}`)
    assert.ok(!/docs|e2e|openspec|qa/.test(glob), `content no puede incluir ${glob}`)
  }
  assert.ok(cfg.content.includes('./index.html'))
  assert.ok(cfg.content.includes('./src/**/*.{js,jsx}'))
})
