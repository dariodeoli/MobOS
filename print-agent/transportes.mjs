import { execFile } from 'node:child_process'
import { unlink, writeFile } from 'node:fs/promises'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const ejecutar = promisify(execFile)

// Impresora de red: socket TCP crudo al puerto de impresión (9100 por defecto).
export function enviarLan(destino, bytes, { timeoutMs = 6000 } = {}) {
  const [host, puerto] = String(destino).replace(/^lan:/, '').split(':')
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port: Number(puerto) || 9100 })
    const terminar = (error) => {
      socket.destroy()
      if (error) reject(error)
      else resolve(true)
    }
    socket.setTimeout(timeoutMs, () => terminar(new Error(`Sin respuesta de ${host}:${puerto || 9100}.`)))
    socket.on('error', terminar)
    socket.on('connect', () => socket.end(Buffer.from(bytes), () => terminar()))
  })
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

// Destino: `lan:192.168.1.23:9100` o `usb:NombreDeLaCola`.
export function enviar(destino, bytes) {
  const valor = String(destino || '').trim()
  if (!valor) throw new Error('Elegí una impresora.')
  if (valor.startsWith('usb:')) return enviarUsb(valor.slice(4), bytes)
  return enviarLan(valor, bytes)
}

// Prueba de alcance: intenta abrir el socket sin enviar nada. Sirve para
// avisar en la app si la impresora no está en la misma red.
export function probarConexion(destino, { timeoutMs = 1500 } = {}) {
  const valor = String(destino || '').trim()
  if (!valor) return Promise.resolve(false)
  if (valor.startsWith('usb:')) return Promise.resolve(true) // CUPS valida al imprimir
  const [host, puerto] = valor.replace(/^lan:/, '').split(':')
  return new Promise((resolve) => {
    const socket = connect({ host, port: Number(puerto) || 9100 })
    const fin = (ok) => { socket.destroy(); resolve(ok) }
    socket.setTimeout(timeoutMs, () => fin(false))
    socket.on('error', () => fin(false))
    socket.on('connect', () => fin(true))
  })
}
