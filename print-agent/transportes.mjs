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
  // EADDRNOTAVAIL: la IP del alias ya no está en la máquina (se perdió al
  // reiniciar o cambiar de red). No se reintenta: se pasa al intento sin bind.
  const esBind = (error) => /EADDRNOTAVAIL/i.test(error?.message || '')
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
    // 2) Sin bind: si el alias no está en la máquina (EADDRNOTAVAIL) o la ruta
    //    con origen falla, se usa la ruta primaria como Terminal.
    // 3) El llamador decide el respaldo CUPS si esto tira el último error.
    try {
      if (localAddress) return await intentar(localAddress)
    } catch (error) {
      if (!esRuta(error) && !esBind(error)) throw error
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

// Cola CUPS de red equivalente al destino `lan:host:puerto` (la misma
// impresora): sirve cuando la cola configurada no existe con ese nombre,
// porque macOS suele nombrarla como el modelo (p. ej. ZKP8008) y la config
// del backend apunta a MobOS_LAN.
export function colaRedParaDestino(colas, destino = '') {
  const valor = String(destino || '').trim()
  if (!valor.startsWith('lan:')) return ''
  const [host, puerto] = valor.replace(/^lan:/, '').split(':')
  if (!host) return ''
  const buscado = Number(puerto) || 9100
  const cola = (Array.isArray(colas) ? colas : []).find((item) => {
    if (item?.tipo !== 'red') return false
    const partes = /^socket:\/\/([^:/]+)(?::(\d+))?/.exec(String(item.uri || ''))
    return Boolean(partes) && partes[1] === host && (Number(partes[2]) || 9100) === buscado
  })
  return cola ? cola.nombre : ''
}

// Comando exacto para crear a mano la cola CUPS de respaldo (el agente no la
// crea: lpadmin necesita administrador). Vacío si el destino no es LAN.
export function comandoColaLan(nombre = 'MobOS_LAN', destino = '') {
  const valor = String(destino || '').trim()
  if (/^(usb|cups):/.test(valor)) return ''
  const [host, puerto] = valor.replace(/^lan:/, '').split(':')
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host || '')) return ''
  return `sudo lpadmin -p ${nombre} -E -v socket://${host}:${Number(puerto) || 9100} -m raw`
}

// Cola CUPS de red (socket://) que respalda la salida directa cuando macOS
// bloquea al proceso del agente: el daemon CUPS del sistema sí tiene permiso
// de red local, así que el trabajo sale por acá. Primero por nombre exacto y,
// si no existe, por la impresora del destino.
export async function colaLanDeCups(nombre = 'MobOS_LAN', destino = '') {
  const colas = await impresorasCups()
  const elegida = colas.find((item) => item.nombre === nombre && item.tipo === 'red')
  if (elegida) return elegida.nombre
  return colaRedParaDestino(colas, destino)
}

// Cache del camino directo: cuando el sistema bloquea la salida TCP del
// proceso (p. ej. macOS con un agente de launchd), cada ticket pagaba los
// reintentos antes de caer al respaldo CUPS. Tras un fallo de ruta con cola
// de respaldo disponible se saltea el intento directo unos minutos; un
// alcance exitoso (autotest) o el vencimiento del TTL lo rehabilitan.
export function crearCacheDirecto({ ttlMs = 120000, ahora = () => Date.now() } = {}) {
  let bloqueadoHasta = 0
  return {
    bloqueado: () => ahora() < bloqueadoHasta,
    bloquear: () => { bloqueadoHasta = ahora() + ttlMs },
    habilitar: () => { bloqueadoHasta = 0 },
  }
}

const cacheDirecto = crearCacheDirecto()

// El USB directo solo aplica cuando el trabajo va a la impresora configurada
// del agente: un trabajo dirigido a otra impresora explícita (p. ej. la red de
// otra sucursal) respeta su transporte y nunca se desvía a un USB distinto.
export function usbAplicaA(destino, impresoraConfigurada = '') {
  const valor = String(destino || '').trim()
  return Boolean(valor) && valor === String(impresoraConfigurada || '').trim()
}

// Destino: `lan:192.168.1.23:9100` o `usb:NombreDeLaCola`. Devuelve el
// transporte real usado ('usb' | 'cups' | 'directo') para que la app solo
// marque éxito cuando hubo entrega por un transporte real.
// Con la bandera USB encendida (opciones.usb) el orden es USB directo → cola
// CUPS → LAN directa. Sin bandera se conserva el camino histórico
// (LAN directo → respaldo CUPS). `deps` inyecta los transportes en los tests.
export async function enviar(destino, bytes, { lanCups = 'MobOS_LAN', alias = '', usb = null, deps = {} } = {}) {
  const valor = String(destino || '').trim()
  if (!valor) throw new Error('Elegí una impresora.')
  const porLan = deps.enviarLan || enviarLan
  const porCola = deps.enviarUsb || enviarUsb
  const colaDeCups = deps.colaLanDeCups || colaLanDeCups
  // 1) USB directo: solo si la bandera está encendida y el dispositivo aparece.
  if (usb?.disponible) {
    try { await usb.enviar(bytes); return 'usb' } catch (error) { usb.ultimoError = error?.message || String(error) }
  }
  // 2) Cola CUPS: destino de cola (`usb:` se acepta por compatibilidad con la
  // app vieja) o respaldo cuando el USB está activo pero no entregó.
  if (/^(usb|cups):/.test(valor)) { await porCola(valor.slice(valor.indexOf(':') + 1), bytes); return 'cups' }
  if (usb) {
    const cola = await colaDeCups(lanCups, valor)
    if (cola) { await porCola(cola, bytes); return 'cups' }
  }
  // 3) LAN directa, con el respaldo CUPS histórico.
  if (cacheDirecto.bloqueado()) {
    // Esta máquina viene fallando el directo: si hay respaldo, no se paga el
    // intento (con su cola resuelta por nombre o por la impresora del destino).
    const cola = await colaDeCups(lanCups, valor)
    if (cola) { await porCola(cola, bytes); return 'cups' }
    cacheDirecto.habilitar()
  }
  try {
    await porLan(valor, bytes, { alias })
    cacheDirecto.habilitar()
    return 'directo'
  } catch (error) {
    if (!/EHOSTUNREACH|ENETUNREACH/i.test(error?.message || '')) throw error
    const cola = await colaDeCups(lanCups, valor)
    if (!cola) throw error
    cacheDirecto.bloquear()
    await porCola(cola, bytes)
    return 'cups'
  }
}

// Prueba de alcance: intenta abrir el socket sin enviar nada. Sirve para
// avisar en la app si la impresora no está en la misma red.
export function probarConexionDetalle(destino, { timeoutMs = 1500, alias = '' } = {}) {
  const valor = String(destino || '').trim()
  if (!valor) return Promise.resolve({ ok: false, error: 'Sin destino.' })
  if (/^(usb|cups):/.test(valor)) {
    const cola = valor.slice(valor.indexOf(':') + 1)
    return impresorasCups().then((colas) => {
      const encontrada = colas.find((item) => item.nombre === cola)
      if (!encontrada) return { ok: false, error: `La cola ${cola} no existe en CUPS.` }
      return { ok: true, metodo: encontrada.tipo === 'red' ? 'CUPS sobre red' : encontrada.tipo === 'usb' ? 'CUPS sobre USB' : 'CUPS' }
    })
  }
  const [host, puerto] = valor.replace(/^lan:/, '').split(':')
  const localAddress = origenPara(host, alias)
  const intento = (origen) => new Promise((resolve) => {
    const socket = connect({ host, port: Number(puerto) || 9100, ...(origen ? { localAddress: origen } : {}) })
    const fin = (ok, mensaje = '', errno = '') => { socket.destroy(); resolve({ ok, error: mensaje, errno, origen: origen || '' }) }
    socket.setTimeout(timeoutMs, () => fin(false, `Sin respuesta de ${host}:${puerto} en ${timeoutMs} ms.`, 'ETIMEDOUT'))
    socket.on('error', (error) => fin(false, `${error?.code || 'ERROR'} ${host}:${puerto}`, error?.code || ''))
    socket.on('connect', () => { cacheDirecto.habilitar(); fin(true) })
  })
  // Alias ausente (EADDRNOTAVAIL): se prueba sin bind, igual que Terminal, para
  // no reportar "no responde" cuando la ruta primaria sí alcanza la impresora.
  if (!localAddress) return intento('')
  return intento(localAddress).then((detalle) => (detalle.errno === 'EADDRNOTAVAIL' ? intento('') : detalle))
}

// Clasificación del fallo TCP para el diagnóstico. macOS puede negar la salida
// del proceso de launchd con EHOSTUNREACH (permiso de Red Local) aunque el
// alias esté presente: si la impresora pertenece a la subred del alias, el
// fallo es ambiguo (permiso o impresora sin responder) y la UI guía primero
// por el permiso; sin alias, EHOSTUNREACH es falta de ruta real.
export function motivoDeFalloRed({ errno = '', aliasPresente = false, host = '', aliasIp = '' } = {}) {
  if (/EACCES|EPERM/i.test(errno)) return 'permisos_red_local'
  if (/ECONNREFUSED/i.test(errno)) return 'impresora_apagada'
  if (/EHOSTUNREACH|ENETUNREACH/i.test(errno)) {
    return aliasPresente && host && aliasIp && mismaSubred(host, aliasIp) ? 'permiso_o_red' : 'red_cambiada'
  }
  return 'otro'
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
  const esUsb = /^(usb|cups):/.test(valor)
  const host = esUsb ? '' : valor.replace(/^lan:/, '').split(':')[0]
  const puerto = esUsb ? '' : (valor.replace(/^lan:/, '').split(':')[1] || '9100')
  const info = { destino: valor, host, puerto, metodo: esUsb ? 'CUPS' : 'LAN', interfaces: [], ruta: '', alcance: false, alias: await aliasSecundario(alias), cups: await colaLanDeCups(cups, valor) }
  // Una cola CUPS puede ser sobre LAN (socket://) o USB físico (usb://): la
  // URI real evita llamarla "USB" cuando en realidad sale por red.
  if (esUsb) info.cupsUri = await colaUri(valor.slice(valor.indexOf(':') + 1) || cups)
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
    // Interpretación honesta del errno: los permisos de Red Local pueden
    // manifestarse como EACCES/EPERM y también como EHOSTUNREACH cuando el
    // alias está presente (la ruta existe, pero macOS bloquea al proceso).
    if (!detalle.ok) info.motivo = motivoDeFalloRed({ errno: info.errno, aliasPresente: info.alias?.presente, host: info.host, aliasIp: info.alias?.ip })
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

