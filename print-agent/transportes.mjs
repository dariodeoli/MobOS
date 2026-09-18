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
    let conectado = false
    const terminar = (error) => {
      socket.destroy()
      if (error) {
        // Si el socket ya conectó, los bytes pudieron haberse enviado: el
        // resultado es incierto y reintentar podría duplicar el ticket.
        if (conectado) error.incierto = true
        reject(error)
      } else resolve(true)
    }
    socket.setTimeout(timeoutMs, () => terminar(new Error(`Sin respuesta de ${host}:${puerto}.`)))
    socket.on('error', terminar)
    socket.on('connect', () => { conectado = true; socket.end(Buffer.from(bytes), () => terminar()) })
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

// Colas CUPS del sistema con su device-uri real. La clasificación es por el
// URI: una cola socket:// es CUPS DE RED (aunque antes se reportara como
// "usb"), una usb:// es USB físico; `lpstat -p` solo da el nombre.
// Parser del `lpstat -v` real: «device for ZKP8008: socket://192.168.1.23:9100».
// El nombre termina en dos puntos, por eso el patrón corta antes de «: ».
export function parsearColasCups(stdout = '') {
  return String(stdout)
    .split('\n')
    .map((linea) => {
      const nombre = (linea.match(/^device for ([^:]+):/) || [])[1]
      if (!nombre) return null
      const uri = (linea.match(/^device for [^:]+:\s*(\S+)\s*$/) || [])[1] || ''
      const tipo = uri.startsWith('socket://') ? 'red' : uri.startsWith('usb://') ? 'usb' : 'otro'
      return { nombre: nombre.trim(), uri, tipo }
    })
    .filter(Boolean)
}

export async function impresorasCups() {
  try {
    const { stdout } = await ejecutar('lpstat', ['-v'], { timeout: 5000 })
    return parsearColasCups(stdout)
  } catch {
    return []
  }
}

// Tipo real de una cola CUPS por nombre (red | usb | otro | ''), para mostrar
// el transporte honesto en la app.
export async function tipoDeCola(nombre = '') {
  if (!nombre) return ''
  const cola = (await impresorasCups()).find((item) => item.nombre === nombre)
  return cola ? cola.tipo : ''
}

// Nombres de las colas CUPS del sistema (el prefijo `usb:` de la app es
// histórico: apunta a una cola local, que puede ser de red o USB físico).
export async function impresorasUsb() {
  return (await impresorasCups()).map((cola) => cola.nombre)
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
export function probarConexionDetalle(destino, { timeoutMs = 1500, alias = '' } = {}) {
  const valor = String(destino || '').trim()
  if (!valor) return Promise.resolve({ ok: false, error: 'Sin destino.' })
  if (valor.startsWith('usb:')) {
    const cola = valor.slice(4)
    return impresorasUsb().then((colas) => colas.includes(cola) ? { ok: true } : { ok: false, error: `La cola ${cola} no existe en CUPS.` })
  }
  const [host, puerto] = valor.replace(/^lan:/, '').split(':')
  const localAddress = origenPara(host, alias)
  return new Promise((resolve) => {
    const socket = connect({ host, port: Number(puerto) || 9100, ...(localAddress ? { localAddress } : {}) })
    const fin = (ok, mensaje = '', errno = '') => { socket.destroy(); resolve({ ok, error: mensaje, errno, origen: localAddress || '' }) }
    socket.setTimeout(timeoutMs, () => fin(false, `Sin respuesta de ${host}:${puerto} en ${timeoutMs} ms.`, 'ETIMEDOUT'))
    socket.on('error', (error) => fin(false, `${error?.code || 'ERROR'} ${host}:${puerto}`, error?.code || ''))
    socket.on('connect', () => fin(true))
  })
}

export async function probarConexion(destino, opciones = {}) {
  return (await probarConexionDetalle(destino, opciones)).ok
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
  if (!valor) return { sinDestino: true, mensaje: 'No hay impresora configurada.', interfaces: [], alcance: false, transporte: 'ninguno' }
  const esUsb = valor.startsWith('usb:')
  const host = esUsb ? '' : valor.replace(/^lan:/, '').split(':')[0]
  const puerto = esUsb ? '' : (valor.replace(/^lan:/, '').split(':')[1] || '9100')
  const info = { destino: valor, host, puerto, metodo: esUsb ? 'CUPS' : 'LAN', interfaces: [], ruta: '', alcance: false, alias: await aliasSecundario(alias), cups: await colaLanDeCups(cups) }
  // Una cola CUPS puede ser sobre LAN (socket://) o USB físico (usb://): la
  // URI real evita llamarla "USB" cuando en realidad sale por red.
  if (esUsb) info.cupsUri = await colaUri(valor.replace(/^usb:/, '').split(':')[0] || cups)
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
    const detalle = await probarConexionDetalle(valor, { alias })
    info.alcance = detalle.ok
    info.error = detalle.ok ? '' : (detalle.error || '')
    info.errno = detalle.errno || ''
    // Interpretación honesta del errno: la falta de ruta NO es un permiso de
    // macOS; los permisos de Red Local se manifiestan como EACCES/EPERM.
    if (!detalle.ok) {
      if (/EHOSTUNREACH|ENETUNREACH/.test(info.errno)) info.motivo = 'red_cambiada'
      else if (/EACCES|EPERM/.test(info.errno)) info.motivo = 'permisos_red_local'
      else if (/ECONNREFUSED/.test(info.errno)) info.motivo = 'impresora_apagada'
      else info.motivo = 'otro'
    }
    if (info.alias?.presente && info.host && mismaSubred(info.host, info.alias.ip)) info.origen = info.alias.ip
  }
  info.tcpReal = info.alcance
  info.transporte = info.alcance ? 'directo' : (info.cups ? 'cups' : 'ninguno')
  return info
}

// URI real de una cola CUPS (`lpstat -v`). Crear colas "raw" con lpadmin ya
// no es posible en macOS moderno; lo que existe se lee y se muestra tal cual
// (p. ej. `socket://192.168.1.23:9100`), sin llamarla USB si no lo es.
export async function colaUri(nombre = 'MobOS_LAN') {
  try {
    const { stdout } = await ejecutar('lpstat', ['-v', nombre], { timeout: 5000 })
    const uri = (stdout.match(/device for [^:]+:\s*(\S+)/) || [])[1] || ''
    return uri
  } catch {
    return ''
  }
}

