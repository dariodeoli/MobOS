import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

// Configuración del agente: puerto local, token, impresora predeterminada,
// reintentos y vínculo remoto. Vive en ~/.mobos-print/config.json
// (o MOBOS_PRINT_DIR). Con `apiUrl` vacío el comportamiento es el de la 1.5.0:
// solo camino local.
export const DIR = process.env.MOBOS_PRINT_DIR || join(homedir(), '.mobos-print')
export const RUTA_CONFIG = join(DIR, 'config.json')
export const RUTA_COLA = join(DIR, 'cola.json')
export const RUTA_HISTORIAL = join(DIR, 'historial.json')

// Intervalo base del poll remoto (decisión 5): 2 s, con backoff a 30 s.
export const POLL_MS = 2000

export function cargarConfig() {
  let guardado = {}
  try { guardado = JSON.parse(readFileSync(RUTA_CONFIG, 'utf8')) || {} } catch { guardado = {} }
  const config = {
    puerto: Number(guardado.puerto) || Number(process.env.MOBOS_PRINT_PORT) || 17890,
    // 0.0.0.0 = acepta conexiones de la red (modo puente de impresión);
    // 127.0.0.1 = solo esta computadora.
    host: String(guardado.host || process.env.MOBOS_PRINT_HOST || '0.0.0.0'),
    token: String(guardado.token || randomUUID().replace(/-/g, '').slice(0, 24)),
    impresora: String(guardado.impresora || ''),
    ancho: Number(guardado.ancho) === 80 ? 80 : 58, // sin configurar, 58 mm (el rollo del local)
    copias: Math.min(5, Math.max(1, Number(guardado.copias) || 1)),
    reintentos: Math.min(20, Math.max(1, Number(guardado.reintentos) || 5)),
    esperaMs: Math.min(300000, Math.max(1000, Number(guardado.esperaMs) || 15000)),
    lan: Array.isArray(guardado.lan) ? guardado.lan.filter(Boolean) : [],
    // Cola CUPS de red (fallback cuando macOS bloquea la salida directa) e IP
    // secundaria del puente (red de la impresora).
    lanCups: String(guardado.lanCups || 'MobOS_LAN'),
    alias: String(guardado.alias || '192.168.1.100'),
    // USB directo (#96): apagado por defecto. Se enciende con `"usb": true` en
    // config.json, `--usb` al arrancar o MOBOS_PRINT_USB=1. usbVid/usbPid
    // identifican la impresora (hex o decimal); sin ellos se detecta la
    // primera con interfaz de clase printer.
    usb: guardado.usb === true || process.env.MOBOS_PRINT_USB === '1',
    usbVid: guardado.usbVid ?? process.env.MOBOS_PRINT_USB_VID ?? null,
    usbPid: guardado.usbPid ?? process.env.MOBOS_PRINT_USB_PID ?? null,
    // Vínculo remoto (pair.mjs escribe apiUrl + bridgeToken). Sin ambos el
    // poller no se arranca y todo sigue por el camino local.
    apiUrl: String(guardado.apiUrl || process.env.MOBOS_PRINT_API_URL || '').replace(/\/+$/, ''),
    bridgeToken: String(guardado.bridgeToken || process.env.MOBOS_PRINT_BRIDGE_TOKEN || ''),
    intervaloPollMs: Math.min(60000, Math.max(250, Number(guardado.intervaloPollMs) || POLL_MS)),
  }
  config.remotoActivo = Boolean(config.apiUrl && config.bridgeToken)
  // Se guarda siempre: el token generado tiene que sobrevivir al reinicio.
  if (!existsSync(RUTA_CONFIG) || !guardado.token) guardarConfig(config)
  return config
}

export function guardarConfig(config) {
  mkdirSync(dirname(RUTA_CONFIG), { recursive: true })
  // El archivo guarda el token del puente: solo lectura para el dueño.
  writeFileSync(RUTA_CONFIG, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
  try { chmodSync(RUTA_CONFIG, 0o600) } catch { /* sistemas sin permisos POSIX */ }
  return config
}
