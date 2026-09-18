import { execFile } from 'node:child_process'
import { unlink, writeFile } from 'node:fs/promises'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const ejecutar = promisify(execFile)

const mismaSubred = (a, b) => String(a).split('.').slice(0, 3).join('.') === String(b).split('.').slice(0, 3).join('.')

// Sin bind, un proceso lanzado por launchd puede salir por la ruta primaria y
// devolver EHOSTUNREACH aunque desde Terminal funcione. Cuando la impresora
// está en la subred del alias, el socket sale con ese origen (la misma
// interfaz que la prueba manual).
function origenPara(host, alias) {
  return host && alias && mismaSubred(host, alias) ? String(alias) : ''
}

// Impresora de red: socket TCP crudo al puerto de impresión (9100 por defecto).
// Si la térmica está dormida y no contesta ARP a la primera, macOS devuelve
// EHOSTUNREACH/ENETUNREACH: se reintenta rápido (3 intentos, 400 ms) para
// despertarla sin esperar el ciclo completo de la cola.
export function enviarLan(destino, bytes, { timeoutMs = 6000, alias = '' } = {}) {
  const [host, puerto] = String(destino).replace(/^lan:/, '').split(':')
  const port = Number(puerto) || 9100
  const localAddress = origenPara(host, alias)
  const escribir = (origen) => new Promise((resolve, reject) => {
    const socket = connect({ host, port, ...(origen ? { localAddress: origen } : {}) })
    const terminar = (error) => {
      socket.destroy()
      if (error) reject(error)
      else resolve(true)
    }
    socket.setTimeout(timeoutMs, () => terminar(new Error(`Sin respuesta de ${host}:${puerto}.`)))
    socket.on('error', terminar)
    socket.on('connect', () => socket.end(Buffer.from(bytes), () => terminar()))
  })
  const esRuta = (error) => /EHOSTUNREACH|ENETUNREACH|ECONNREFUSED/i.test(error?.message || '')
  const intentar = async (origen) => {
    for (let intento = 0; intento < 3; intento += 1) {
      try { return await escribir(origen) } catch (error) {
        if (!esRuta(error)) throw error
        await new Promise((listo) => setTimeout(listo, 400))
      }
    }
    return escribir(origen)
  }
  return (async () => {
    // 1) Con bind al alias: es la MISMA ruta que la prueba manual (nc/ESC-POS
    //    salen con origen 192.168.1.100). Un proceso de launchd sin bind puede
    //    salir por la ruta primaria y devolver EHOSTUNREACH.
    // 2) Sin bind: si el bind falla por algún motivo (alias recién agregado).
    // 3) El llamador decide el respaldo CUPS si esto tira el último error.
    try {
      if (localAddress) return await intentar(localAddress)
    } catch (error) {
      if (!esRuta(error)) throw error
    }
    return intentar('')
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

// Destino: `lan:192.168.1.23:9100` o `usb:NombreDeLaCola`. Devuelve el
// transporte real usado ('directo' | 'cups' | 'usb') para que la app solo
// marque éxito cuando hubo entrega por un transporte real.
export async function enviar(destino, bytes, { lanCups = 'MobOS_LAN', alias = '' } = {}) {
  const valor = String(destino || '').trim()
  if (!valor) throw new Error('Elegí una impresora.')
  if (valor.startsWith('usb:')) { await enviarUsb(valor.slice(4), bytes); return 'usb' }
  try {
    await enviarLan(valor, bytes, { alias })
    return 'directo'
  } catch (error) {
    if (!/EHOSTUNREACH|ENETUNREACH/i.test(error?.message || '')) throw error
    const cola = await colaLanDeCups(lanCups)
    if (!cola) throw error
    await enviarUsb(cola, bytes)
    return 'cups'
  }
}

// Prueba de alcance: intenta abrir el socket sin enviar nada. Sirve para
// avisar en la app si la impresora no está en la misma red.
export async function probarConexion(destino, { timeoutMs = 1500, alias = '' } = {}) {
  const valor = String(destino || '').trim()
  if (!valor) return false
  if (valor.startsWith('usb:')) {
    // La cola USB se verifica contra CUPS: si no existe, no está lista.
    const cola = valor.slice(4)
    const colas = await impresorasUsb()
    return colas.includes(cola)
  }
  const [host, puerto] = valor.replace(/^lan:/, '').split(':')
  const localAddress = origenPara(host, alias)
  return new Promise((resolve) => {
    const socket = connect({ host, port: Number(puerto) || 9100, ...(localAddress ? { localAddress } : {}) })
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
    info.alcance = await probarConexion(valor, { alias })
    if (info.alias?.presente && info.host && mismaSubred(info.host, info.alias.ip)) info.origen = info.alias.ip
  }
  info.tcpReal = info.alcance
  info.transporte = info.alcance ? 'directo' : (info.cups ? 'cups' : 'ninguno')
  return info
}

// Crea la cola CUPS de red (respaldo cuando macOS bloquea la salida directa
// del agente). `sudo -n` no pide contraseña; si no hay permiso se devuelve el
// comando exacto para correrlo a mano.
export async function crearColaLan(nombre = 'MobOS_LAN', host = '', puerto = 9100) {
  const existente = await colaLanDeCups(nombre)
  if (existente) return { ok: true, existente: true, cola: nombre }
  if (!host) return { ok: false, error: 'Falta la IP de la impresora.', comando: '' }
  const uri = `socket://${host}:${Number(puerto) || 9100}`
  const comando = `sudo lpadmin -p ${nombre} -E -v ${uri} -m raw`
  try {
    await ejecutar('lpadmin', ['-p', nombre, '-E', '-v', uri, '-m', 'raw'], { timeout: 10000 })
    return { ok: true, existente: false, cola: nombre, comando }
  } catch {
    try {
      await ejecutar('sudo', ['-n', 'lpadmin', '-p', nombre, '-E', '-v', uri, '-m', 'raw'], { timeout: 10000 })
      return { ok: true, existente: false, cola: nombre, comando }
    } catch {
      return { ok: false, error: 'Sin permiso para crear la cola CUPS.', comando }
    }
  }
}
