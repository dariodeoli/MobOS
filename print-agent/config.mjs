import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

// Configuración del agente: puerto local, token, impresora predeterminada y
// reintentos. Vive en ~/.mobos-print/config.json (o MOBOS_PRINT_DIR).
export const DIR = process.env.MOBOS_PRINT_DIR || join(homedir(), '.mobos-print')
export const RUTA_CONFIG = join(DIR, 'config.json')
export const RUTA_COLA = join(DIR, 'cola.json')

export function cargarConfig() {
  let guardado = {}
  try { guardado = JSON.parse(readFileSync(RUTA_CONFIG, 'utf8')) || {} } catch { guardado = {} }
  const config = {
    puerto: Number(guardado.puerto) || Number(process.env.MOBOS_PRINT_PORT) || 17890,
    token: String(guardado.token || randomUUID().replace(/-/g, '').slice(0, 24)),
    impresora: String(guardado.impresora || ''),
    ancho: Number(guardado.ancho) === 58 ? 58 : 80,
    copias: Math.min(5, Math.max(1, Number(guardado.copias) || 1)),
    reintentos: Math.min(20, Math.max(1, Number(guardado.reintentos) || 5)),
    esperaMs: Math.min(300000, Math.max(1000, Number(guardado.esperaMs) || 15000)),
    lan: Array.isArray(guardado.lan) ? guardado.lan.filter(Boolean) : [],
  }
  if (!existsSync(RUTA_CONFIG)) guardarConfig(config)
  return config
}

export function guardarConfig(config) {
  mkdirSync(dirname(RUTA_CONFIG), { recursive: true })
  writeFileSync(RUTA_CONFIG, `${JSON.stringify(config, null, 2)}\n`)
  return config
}
