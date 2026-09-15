#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const versionFile = resolve(root, 'version.json')
const publish = process.argv.includes('--publish')
const deploy = process.argv.includes('--deploy')
const checkDeployConfig = process.argv.includes('--check-deploy-config')

const KEYCHAIN_ACCOUNT = process.env.USER
const KEYCHAIN_SERVICES = {
  webhook: 'mobos-release-deploy-webhook',
  token: 'mobos-release-deploy-token',
}

const command = (bin, args) => execFileSync(bin, args, { cwd: root, stdio: 'inherit' })
const readJson = file => JSON.parse(readFileSync(file, 'utf8'))
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)

const readKeychainSecret = service => {
  if (process.platform !== 'darwin' || !KEYCHAIN_ACCOUNT) return null
  try {
    return execFileSync(
      'security',
      ['find-generic-password', '-a', KEYCHAIN_ACCOUNT, '-s', service, '-w'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim()
  } catch {
    return null
  }
}

const resolveDeployConfig = () => {
  const webhook =
    process.env.MOBOS_DEPLOY_WEBHOOK?.trim() || readKeychainSecret(KEYCHAIN_SERVICES.webhook)
  const token =
    process.env.MOBOS_DEPLOY_TOKEN?.trim() || readKeychainSecret(KEYCHAIN_SERVICES.token)

  if (!webhook || !token) {
    throw new Error(
      'Faltan las credenciales privadas de despliegue. Configurá MOBOS_DEPLOY_WEBHOOK y MOBOS_DEPLOY_TOKEN o sus entradas de macOS Keychain.',
    )
  }

  let parsed
  try {
    parsed = new URL(webhook)
  } catch {
    throw new Error('La URL privada de despliegue no es válida.')
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'hub.owncoding.dev') {
    throw new Error('La URL privada de despliegue debe usar HTTPS en hub.owncoding.dev.')
  }
  if (parsed.pathname !== '/api/v1/deploy' || !parsed.searchParams.get('uuid')) {
    throw new Error('La URL privada de despliegue no apunta al endpoint esperado de Coolify.')
  }

  return { webhook: parsed.toString(), token }
}

let deployConfig = null
if (deploy || checkDeployConfig) deployConfig = resolveDeployConfig()
if (checkDeployConfig) {
  console.log('Configuración de despliegue MobOS lista (entorno privado o macOS Keychain).')
  process.exit(0)
}

if (!existsSync(versionFile)) throw new Error('Falta version.json.')
if (
  publish &&
  execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()
) {
  throw new Error('El árbol de trabajo debe estar limpio antes de publicar una versión.')
}

const current = readJson(versionFile).version
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current)
if (!match) throw new Error(`Versión inválida: ${current}`)
const next = `${match[1]}.${match[2]}.${Number(match[3]) + 1}`

writeJson(versionFile, { version: next })

for (const relative of [
  'package.json',
  'backend/package.json',
  'package-lock.json',
  'backend/package-lock.json',
]) {
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
  console.log(
    'Usá npm run release:publish para crear el commit, pushear y solicitar el despliegue.',
  )
  process.exit(0)
}

command('git', [
  'add',
  'version.json',
  'package.json',
  'package-lock.json',
  'backend/package.json',
  'backend/package-lock.json',
  'src/lib/brand.js',
])
command('git', ['commit', '-m', `chore(release): v${next}`])
command('git', ['push', 'origin', 'main'])

if (deploy) {
  const DELAYS_MS = [1000, 4000, 12000]
  for (let attempt = 0; attempt <= DELAYS_MS.length; attempt += 1) {
    let response
    try {
      response = await fetch(deployConfig.webhook, {
        method: 'POST',
        headers: { Authorization: `Bearer ${deployConfig.token}` },
      })
    } catch {
      throw new Error(
        'No se pudo conectar con el webhook de despliegue. La versión ya está pusheada; reintentá el deploy manualmente.',
      )
    }
    if (response.ok) {
      console.log(
        '\nWebhook de OwnCoding Hub enviado. Ejecutá npm run release:smoke al finalizar el despliegue.',
      )
      break
    }
    if (response.status === 429 && attempt < DELAYS_MS.length) {
      const retryAfter = Number(response.headers.get('retry-after')) || DELAYS_MS[attempt] / 1000
      console.warn(`\nEl webhook respondió 429. Reintentando en ${Math.ceil(retryAfter)} s…`)
      await new Promise(resolve => setTimeout(resolve, Math.ceil(retryAfter) * 1000))
      continue
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `El webhook de despliegue rechazó la solicitud (${response.status}). Verificá que el token de la URL siga vigente. La versión ya está pusheada.`,
      )
    }
    throw new Error(
      `El webhook de despliegue respondió ${response.status}. La versión ya está pusheada; reintentá el deploy manualmente.`,
    )
  }
}
