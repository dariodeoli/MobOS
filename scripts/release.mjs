#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const versionFile = resolve(root, 'version.json')
const publish = process.argv.includes('--publish')
const deploy = process.argv.includes('--deploy')

const command = (bin, args) => execFileSync(bin, args, { cwd: root, stdio: 'inherit' })
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)

if (!existsSync(versionFile)) throw new Error('Falta version.json.')
if (publish && execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()) {
  throw new Error('El árbol de trabajo debe estar limpio antes de publicar una versión.')
}

const current = readJson(versionFile).version
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current)
if (!match) throw new Error(`Versión inválida: ${current}`)
const next = `${match[1]}.${match[2]}.${Number(match[3]) + 1}`

writeJson(versionFile, { version: next })

for (const relative of ['package.json', 'backend/package.json', 'package-lock.json', 'backend/package-lock.json']) {
  const file = resolve(root, relative)
  const json = readJson(file)
  json.version = next
  if (json.packages?.['']) json.packages[''].version = next
  writeJson(file, json)
}

console.log(`\nPreparando MobOS v${next}…`)
command('npm', ['run', 'build'])
command('npm', ['--prefix', 'backend', 'run', 'build'])

if (!publish) {
  console.log(`\nListo para revisión local: MobOS v${next}.`)
  console.log('Usá npm run release:publish para crear el commit, pushear y solicitar el despliegue.')
  process.exit(0)
}

command('git', ['add', 'version.json', 'package.json', 'package-lock.json', 'backend/package.json', 'backend/package-lock.json', 'src/lib/brand.js'])
command('git', ['commit', '-m', `chore(release): v${next}`])
command('git', ['push', 'origin', 'main'])

if (deploy) {
  const webhook = process.env.MOBOS_DEPLOY_WEBHOOK
  if (!webhook) {
    console.warn('\nNo se solicitó el despliegue: falta MOBOS_DEPLOY_WEBHOOK en el entorno privado.')
  } else {
    const response = await fetch(webhook, { method: 'POST' })
    if (!response.ok) throw new Error(`El webhook de despliegue respondió ${response.status}.`)
    console.log('\nWebhook de OwnCoding Hub enviado. Ejecutá npm run release:smoke al finalizar el despliegue.')
  }
}
