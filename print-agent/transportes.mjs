import { execFile } from 'node:child_process'
import { unlink, writeFile } from 'node:fs/promises'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const ejecutar = promisify(execFile)

// Impresora de red: socket TCP crudo al puerto de impresión (9100 por defecto).
// Si la térmica está dormida y no contesta ARP a la primera, macOS devuelve
// EHOSTUNREACH/ENETUNREACH: se reintenta rápido (3 intentos, 400 ms) para
// despertarla sin esperar el ciclo completo de la cola.
export function enviarLan(destino, bytes, { timeoutMs = 6000 } = {}) {
  const [host, puerto] = String(destino).replace(/^lan:/, '').split(':')
  const port = Number(puerto) || 9100
  const escribir = () => new Promise((resolve, reject) => {
    const socket = connect({ host, port })
    const terminar = (error) => {
      socket.destroy()
      if (error) reject(error)
      else resolve(true)
    }
    socket.setTimeout(timeoutMs, () => terminar(new Error(`Sin respuesta de ${host}:${puerto}.`)))
    socket.on('error', terminar)
    socket.on('connect', () => socket.end(Buffer.from(bytes), () => terminar()))
  })
  return (async () => {
    for (let intento = 0; intento < 3; intento += 1) {
      try { return await escribir() } catch (error) {
        if (!/EHOSTUNREACH|ENETUNREACH|ECONNREFUSED/i.test(error?.message || '')) throw error
        await new Promise((listo) => setTimeout(listo, 400))
      }
    }
    // Último error conocido para el mensaje de la cola.
    try { return await escribir() } catch (error) { throw error }
  })()
}

// Impresora USB: CUPS recibe los mismos bytes crudos con `lp -o raw`.
export async function enviarUsb(cola, bytes) {
  const archivo = join(tmpdir(), `mobos-print-${Date.now()}-${Math.random().toString(16).slice(2)}.bin`)
  await writeFile(archivo, Buffer.from(bytes))
  try {
    await ejecutar('lp', ['-d', cola, '-o', 'raw', archivo], { timeout: 15000 })
    return true
  } finally {
    await unlink(archivo).catch(() => {})
  }
}

export async function impresorasUsb() {
  try {
    const { stdout } = await ejecutar('lpstat', ['-p'], { timeout: 5000 })
    return stdout.split('\n').map((linea) => linea.match(/^printer (\S+)/)?.[1]).filter(Boolean)
  } catch {
    return []
  }
}

// Cola CUPS de red (raw, socket://) que el instalador crea con lpadmin. El
// daemon CUPS del sistema sí tiene permiso de red local: cuando macOS bloquea
// la conexión directa del proceso del agente, el trabajo sale por acá.
export async function colaLanDeCups(nombre = 'MobOS_LAN') {
  const colas = await impresorasUsb()
  return colas.includes(nombre) ? nombre : ''
}

// Destino: `lan:192.168.1.23:9100` o `usb:NombreDeLaCola`.
export async function enviar(destino, bytes, { lanCups = 'MobOS_LAN' } = {}) {
  const valor = String(destino || '').trim()
  if (!valor) throw new Error('Elegí una impresora.')
  if (valor.startsWith('usb:')) return enviarUsb(valor.slice(4), bytes)
  try {
    return await enviarLan(valor, bytes)
  } catch (error) {
    if (!/EHOSTUNREACH|ENETUNREACH/i.test(error?.message || '')) throw error
    const cola = await colaLanDeCups(lanCups)
    if (!cola) throw error
    return enviarUsb(cola, bytes)
  }
}

// Prueba de alcance: intenta abrir el socket sin enviar nada. Sirve para
// avisar en la app si la impresora no está en la misma red.
export async function probarConexion(destino, { timeoutMs = 1500 } = {}) {
  const valor = String(destino || '').trim()
  if (!valor) return false
  if (valor.startsWith('usb:')) {
    // La cola USB se verifica contra CUPS: si no existe, no está lista.
    const cola = valor.slice(4)
    const colas = await impresorasUsb()
    return colas.includes(cola)
  }
  const [host, puerto] = valor.replace(/^lan:/, '').split(':')
  return new Promise((resolve) => {
    const socket = connect({ host, port: Number(puerto) || 9100 })
    const fin = (ok) => { socket.destroy(); resolve(ok) }
    socket.setTimeout(timeoutMs, () => fin(false))
    socket.on('error', () => fin(false))
    socket.on('connect', () => fin(true))
  })
}

// IP secundaria del puente (red de la impresora). Se agrega con red-mac.sh y
// se pierde al reiniciar o cambiar de red; el agente la recrea al arrancar.
export async function aliasSecundario(ip = '192.168.1.100') {
  try {
    const { stdout } = await ejecutar('ifconfig', [], { timeout: 5000 })
    return { ip, presente: stdout.split('\n').some((linea) => linea.includes(`inet ${ip} `)) }
  } catch {
    return { ip, presente: false }
  }
}

// Diagnóstico de red: interfaces IPv4 de la máquina y ruta hacia la impresora.
// Sirve para explicar un EHOSTUNREACH (sin ruta) desde la app.
export async function diagnosticoRed(destino, { alias = '192.168.1.100', cups = 'MobOS_LAN' } = {}) {
  const valor = String(destino || '').trim()
  if (!valor) return { sinDestino: true, mensaje: 'No hay impresora configurada.' }
  const esUsb = valor.startsWith('usb:')
  const host = esUsb ? '' : valor.replace(/^lan:/, '').split(':')[0]
  const puerto = esUsb ? '' : (valor.replace(/^lan:/, '').split(':')[1] || '9100')
  const info = { destino: valor, host, puerto, metodo: esUsb ? 'USB' : 'LAN', interfaces: [], ruta: '', alcance: false, alias: await aliasSecundario(alias), cups: await colaLanDeCups(cups) }
  try {
    const { stdout } = await ejecutar('ifconfig', [], { timeout: 5000 })
    info.interfaces = stdout.split('\n')
      .map((linea) => linea.trim().match(/^inet (\d+\.\d+\.\d+\.\d+)/)?.[1])
      .filter((ip) => ip && !ip.startsWith('127.'))
  } catch { /* sin ifconfig */ }
  if (host) {
    try {
      const { stdout } = await ejecutar('route', ['-n', 'get', host], { timeout: 5000 })
      info.ruta = stdout.split('\n').map((linea) => linea.trim()).filter((linea) => /^(gateway|interface|route to|flags)/i.test(linea)).join(' · ')
    } catch (error) {
      info.ruta = String(error?.stderr || error?.message || '').trim().split('\n')[0] || 'sin ruta'
    }
    info.alcance = await probarConexion(valor)
  }
  return info
}
