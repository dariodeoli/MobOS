#!/usr/bin/env node
// #233: lista (solo lectura) los registros del IMEI de prueba para obtener el
// requestId del timeout a conciliar. No modifica nada.
//   MOBOS_QA_STORAGE_STATE=/tmp/mobos-qa.json node scripts/imei-registros-233.mjs
import { readFileSync } from 'node:fs'
const API = String(process.env.MOBOS_API_URL || 'https://api.moboss.online').replace(/\/$/, '')
const estado = String(process.env.MOBOS_QA_STORAGE_STATE || '')
if (!estado) { console.error('Falta MOBOS_QA_STORAGE_STATE (sesión de producción).'); process.exit(2) }
const cookies = (JSON.parse(readFileSync(estado, 'utf8')).cookies || []).map(c => `${c.name}=${c.value}`).join('; ')
const respuesta = await fetch(`${API}/api/imei?imei=350970405250150`, { headers: { Cookie: cookies } })
const datos = await respuesta.json().catch(() => null)
if (!respuesta.ok) { console.error(`HTTP ${respuesta.status} · ${datos?.message || ''}`); process.exit(1) }
for (const fila of datos?.consultas || []) console.log(JSON.stringify({ id: fila.id, requestId: fila.requestId, status: fila.status, etiqueta: fila.etiqueta, costUsd: fila.costUsd, externalId: fila.externalId, requestedAt: fila.requestedAt, resolvedAt: fila.resolvedAt, error: fila.error }))
