#!/usr/bin/env node
// Soporte de la rotación de tokens (#232): verifica, después de cada cambio,
// que lo observable sigue sano. No imprime valores: solo OK/FALLO/PENDIENTE.
//
// Uso:
//   node scripts/verificar-rotacion-tokens.mjs
//   MOBOS_MAINTENANCE_TOKEN=<nuevo> node scripts/verificar-rotacion-tokens.mjs
//   QA_API_URL=https://api.moboss.online QA_APP_URL=https://app.moboss.online ...
//
// Sale 1 si algo verificable falla. Los secretos sin valor disponible quedan
// como PENDIENTE (los verifica Dario a mano, ver docs/ROTACION-TOKENS.md).
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const API = (process.env.QA_API_URL || 'https://api.moboss.online').replace(/\/$/, '')
const APP = (process.env.QA_APP_URL || 'https://app.moboss.online').replace(/\/$/, '')
const TOKEN = (process.env.MOBOS_MAINTENANCE_TOKEN || '').trim()

const filas = []
const registrar = (chequeo, estado, detalle = '') => {
  filas.push({ chequeo, estado, detalle })
  const icono = estado === 'OK' ? '✓' : estado === 'FALLO' ? '✖' : '•'
  console.log(`${icono} ${chequeo}${detalle ? ` — ${detalle}` : ''}`)
}

// 1) Higiene del repo: que nada imprima env/secrets.
try {
  const salida = execFileSync('node', ['scripts/audit-logs.mjs'], { cwd: RAIZ, encoding: 'utf8' })
  registrar('auditoría de logs del repo', /Higiene de logs OK/.test(salida) ? 'OK' : 'FALLO', salida.trim().slice(0, 80))
} catch (error) {
  registrar('auditoría de logs del repo', 'FALLO', String(error?.stdout || error?.message || error).trim().slice(0, 120))
}

// 2) Producción sana y en la versión publicada.
try {
  const { version } = JSON.parse(readFileSync(join(RAIZ, 'version.json'), 'utf8'))
  const health = await (await fetch(`${API}/api/health`)).json()
  registrar('API /api/health', health?.ok ? 'OK' : 'FALLO', `versión local v${version}`)
  const login = await (await fetch(`${APP}/login`)).text()
  registrar('frontend /login', login.includes('id="root"') ? 'OK' : 'FALLO')
} catch (error) {
  registrar('producción', 'FALLO', String(error?.message || error).slice(0, 120))
}

// 3) Endpoints internos con el token nuevo (si está exportado).
const endpoints = ['email-outbox', 'remind-due-payments', 'release-expired-reservations']
for (const endpoint of endpoints) {
  if (!TOKEN) {
    registrar(`/api/internal/${endpoint}`, 'PENDIENTE', 'exportá MOBOS_MAINTENANCE_TOKEN para verificarlo')
    continue
  }
  try {
    const respuesta = await fetch(`${API}/api/internal/${endpoint}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}` },
    })
    const cuerpo = await respuesta.text()
    if (respuesta.ok) registrar(`/api/internal/${endpoint}`, 'OK', cuerpo.slice(0, 90))
    else registrar(`/api/internal/${endpoint}`, 'FALLO', `HTTP ${respuesta.status} ${cuerpo.slice(0, 80)}`)
  } catch (error) {
    registrar(`/api/internal/${endpoint}`, 'FALLO', String(error?.message || error).slice(0, 120))
  }
}

// 4) Token viejo rechazado (si se pasó el nuevo, el viejo debe dar 401/503).
if (process.env.MOBOS_MAINTENANCE_TOKEN_VIEJO) {
  try {
    const respuesta = await fetch(`${API}/api/internal/email-outbox`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.MOBOS_MAINTENANCE_TOKEN_VIEJO}` },
    })
    registrar('token viejo rechazado', respuesta.status === 401 || respuesta.status === 503 ? 'OK' : 'FALLO', `HTTP ${respuesta.status}`)
  } catch (error) {
    registrar('token viejo rechazado', 'FALLO', String(error?.message || error).slice(0, 120))
  }
} else {
  registrar('token viejo rechazado', 'PENDIENTE', 'exportá MOBOS_MAINTENANCE_TOKEN_VIEJO (debe dar 401)')
}

// 5) Integraciones con secreto: se verifican a mano (el script no los imprime).
for (const [nombre, variable] of [
  ['IMEIcheck', 'IMEICHECK_TOKEN'],
  ['AEX sandbox', 'MOBOS_AEX_PRIVATE_KEY'],
  ['Relay de correo', 'WEEM_EMAIL_RELAY_TOKEN'],
  ['RUC/SUN', 'RUC_SUN_API_KEY'],
  ['Google', 'GOOGLE_CLIENT_SECRET'],
]) {
  const presente = Boolean((process.env[variable] || '').trim())
  registrar(`${nombre}`, presente ? 'PENDIENTE' : 'PENDIENTE', presente ? `con ${variable}: correr la verificación de docs/ROTACION-TOKENS.md` : `falta ${variable} en el entorno`)
}

const fallos = filas.filter((fila) => fila.estado === 'FALLO')
console.log(`\n${filas.filter((f) => f.estado === 'OK').length} OK · ${filas.filter((f) => f.estado === 'PENDIENTE').length} pendientes · ${fallos.length} fallos`)
if (fallos.length) process.exitCode = 1
