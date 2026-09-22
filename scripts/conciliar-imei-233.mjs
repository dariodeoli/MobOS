#!/usr/bin/env node
// #233: conciliación auditada de la consulta de IMEI del 21/09 23:09 con los
// datos del panel del proveedor (Successful, US$ 0,06). No repite la consulta.
//
// Necesita una sesión ADMIN de producción en un storage state de Playwright:
//   MOBOS_QA_STORAGE_STATE=/tmp/mobos-qa.json MOBOS_CONCILIAR_REQUEST_ID=<requestId> \
//   node scripts/conciliar-imei-233.mjs
// También acepta MOBOS_CONCILIAR_ID, MOBOS_CONCILIAR_EXTERNAL_ID y MOBOS_API_URL.
import { readFileSync } from 'node:fs'

const API = String(process.env.MOBOS_API_URL || 'https://api.moboss.online').replace(/\/$/, '')
const estado = String(process.env.MOBOS_QA_STORAGE_STATE || '')
const requestId = String(process.env.MOBOS_CONCILIAR_REQUEST_ID || '').trim()
const id = String(process.env.MOBOS_CONCILIAR_ID || '').trim()
const externalId = String(process.env.MOBOS_CONCILIAR_EXTERNAL_ID || '').trim()
if ((!requestId && !id) || !estado) {
  console.error('Faltan MOBOS_QA_STORAGE_STATE y MOBOS_CONCILIAR_REQUEST_ID (o MOBOS_CONCILIAR_ID).')
  process.exit(2)
}
const cookies = (JSON.parse(readFileSync(estado, 'utf8')).cookies || []).map(c => `${c.name}=${c.value}`).join('; ')
const nota = 'Conciliado con el panel del proveedor (#233): Successful, US$ 0,06, 21/09 23:09. iCloud Clean y US Block Clean NO equivalen a blacklist mundial; no certifican el estado global del equipo.'
const normalizado = [
  { clave: 'blacklist', etiqueta: 'Blacklist actual', valor: 'Sin reportes actuales', fuente: 'imeicheck.net', hora: '2026-09-21T23:09:00-03:00' },
  { clave: 'blacklistHistorial', etiqueta: 'Historial Blacklist Pro', valor: null, fuente: 'imeicheck.net', hora: '2026-09-21T23:09:00-03:00' },
  { clave: 'findMy', etiqueta: 'Find My / iCloud', valor: 'On', fuente: 'imeicheck.net', hora: '2026-09-21T23:09:00-03:00' },
  { clave: 'simLock', etiqueta: 'SIM lock', valor: 'Desbloqueada', fuente: 'imeicheck.net', hora: '2026-09-21T23:09:00-03:00' },
  { clave: 'garantia', etiqueta: 'Garantía', valor: 'Vencida', fuente: 'imeicheck.net', hora: null },
  { clave: 'icloud', etiqueta: 'iCloud (clean)', valor: 'Clean', fuente: 'imeicheck.net', hora: '2026-09-21T23:09:00-03:00' },
  { clave: 'usBlock', etiqueta: 'US Block (clean, no es estado mundial)', valor: 'Clean', fuente: 'imeicheck.net', hora: '2026-09-21T23:09:00-03:00' },
  { clave: 'modelo', etiqueta: 'Modelo', valor: 'iPhone 16 Pro Max', fuente: 'imeicheck.net', hora: '2026-09-21T23:09:00-03:00' },
]
const cuerpo = { action: 'conciliar', ...(requestId ? { requestId } : { id }), status: 'verificado', costUsd: 0.06, resolvedAt: '2026-09-21T23:09:00-03:00', ...(externalId ? { externalId } : {}), normalized: normalizado, note: nota }
const respuesta = await fetch(`${API}/api/imei`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookies }, body: JSON.stringify(cuerpo) })
const datos = await respuesta.json().catch(() => null)
if (!respuesta.ok) { console.error(`✖ Conciliación rechazada: HTTP ${respuesta.status} · ${datos?.message || ''}`); process.exit(1) }
console.log(JSON.stringify({ ok: true, id: datos?.id, imei: datos?.imei, status: datos?.status, etiqueta: datos?.etiqueta, costUsd: datos?.costUsd, externalId: datos?.externalId, resolvedAt: datos?.resolvedAt }, null, 2))
