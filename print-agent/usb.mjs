// Camino USB directo (#96): detección por VID/PID y escritura de bytes
// ESC/POS crudos al endpoint de salida de la impresora.
//
// La dependencia nativa `node-usb` VIAJA EN EL TARBALL del agente
// (print-agent/vendor/ + pack-agent.mjs → node_modules/usb): en la Mac
// instalada con install.sh no hay que instalar nada. Se importa dinámicamente
// solo cuando la bandera usb está encendida; si faltara, el agente arranca
// igual, /diagnostico lo explica y el trabajo sigue por CUPS/LAN.
//
// Desarrollo en el repo (sin tarball): `npm install usb` dentro de la carpeta
// y `usb.mjs` lo resuelve igual; la config se enciende con
// ~/.mobos-print/config.json: { "usb": true, "usbVid": "0x0483", "usbPid": "0x5743" }

let modulo = null
let errorCarga = ''

export async function cargarModuloUsb() {
  if (modulo !== null) return modulo
  try {
    modulo = await import('usb')
  } catch (error) {
    modulo = false
    errorCarga = `node-usb no está instalado (${error?.message || error}). Instalalo con \`npm install usb\` en la carpeta del agente para usar USB directo.`
  }
  return modulo
}

// Acepta 1234, '1234', '0x04d2' (o el string vacío) y devuelve el número.
export function normalizarId(valor) {
  if (valor === null || valor === undefined || valor === '') return null
  if (Number.isInteger(valor)) return valor
  const texto = String(valor).trim()
  const numero = /^0x[0-9a-f]+$/i.test(texto) ? Number.parseInt(texto, 16) : /^\d+$/.test(texto) ? Number(texto) : Number.NaN
  return Number.isInteger(numero) && numero >= 0 && numero <= 0xffff ? numero : null
}

export const hex4 = (valor) => (valor === null || valor === undefined ? null : `0x${Number(valor).toString(16).padStart(4, '0')}`)

// Normaliza la lista de dispositivos del módulo usb a algo comparables y
// testeable sin hardware. `impresora` = tiene una interfaz de clase 7 (printer).
export function describirDispositivos(dispositivos = []) {
  return (Array.isArray(dispositivos) ? dispositivos : []).map((device) => {
    const descriptor = device?.deviceDescriptor || {}
    const interfaces = device?.configDescriptor?.interfaces || device?.interfaces || []
    const clases = []
    for (const item of interfaces) {
      for (const alternativa of item?.alternates || item?.interfaces || [item]) {
        if (alternativa && alternativa.bInterfaceClass !== undefined) clases.push(alternativa.bInterfaceClass)
      }
    }
    return {
      device,
      vid: descriptor.idVendor ?? null,
      pid: descriptor.idProduct ?? null,
      interfaces: clases,
      impresora: clases.includes(7),
    }
  })
}

// Detección por VID/PID cuando se configuraron; si no, la primera impresora
// (interfaz de clase printer). Sin coincidencia devuelve null: nunca se manda
// un ticket a un dispositivo que no sea una impresora.
export function seleccionarDescrito(lista = [], { vid = null, pid = null } = {}) {
  if (vid !== null || pid !== null) return lista.find((item) => (vid === null || item.vid === vid) && (pid === null || item.pid === pid)) || null
  return lista.find((item) => item.impresora) || null
}

export function seleccionarDispositivo(dispositivos = [], ids = {}) {
  return seleccionarDescrito(describirDispositivos(dispositivos), ids)
}

export function listarDispositivosUsb() {
  if (!modulo || typeof modulo.getDeviceList !== 'function') return []
  try { return describirDispositivos(modulo.getDeviceList()) } catch { return [] }
}

export async function estadoUsb({ activo = false, vid = null, pid = null } = {}) {
  const identificados = { vid: normalizarId(vid), pid: normalizarId(pid) }
  const pedidos = { vid: hex4(identificados.vid), pid: hex4(identificados.pid) }
  if (!activo) return { activo: false, disponible: false, ...pedidos, transporte: 'ninguno', motivo: 'USB apagado (config \'usb\': true o --usb).' }
  const cargado = await cargarModuloUsb()
  if (!cargado) return { activo: true, disponible: false, ...pedidos, transporte: 'ninguno', motivo: errorCarga }
  const detectado = seleccionarDescrito(listarDispositivosUsb(), identificados)
  if (!detectado) {
    return {
      activo: true, disponible: false, ...pedidos, transporte: 'ninguno',
      motivo: identificados.vid || identificados.pid
        ? 'No hay una impresora USB conectada con ese VID/PID.'
        : 'No se detectó una impresora USB (interfaz de clase printer). Configurá usbVid/usbPid en config.json o conectá la impresora.',
    }
  }
  return { activo: true, disponible: true, vid: hex4(detectado.vid), pid: hex4(detectado.pid), transporte: 'usb', motivo: '', impresora: { vid: detectado.vid, pid: detectado.pid } }
}

// Escribe bytes ESC/POS al endpoint de salida. Soporta la API clásica de
// node-usb (device.interface/claim/transfer) y la WebUSB (selectConfiguration/
// claimInterface/transferOut), que varía según la versión del módulo.
export async function escribirEnDispositivo(device, datos, { timeoutMs = 8000 } = {}) {
  const buffer = Buffer.from(datos)
  if (typeof device.open === 'function') {
    if (typeof device.interface === 'function') return escribirClasico(device, buffer, timeoutMs)
    if (typeof device.claimInterface === 'function') return escribirWebUsb(device, buffer, timeoutMs)
  }
  throw new Error('La versión de node-usb instalada no expone una API de escritura conocida.')
}

async function escribirClasico(device, buffer, timeoutMs) {
  device.open()
  try {
    const iface = device.interface(0)
    try { iface.claim() } catch (error) { if (!/already|busy/i.test(error?.message || '')) throw error }
    const endpoint = (iface.endpoints || []).find((item) => item.direction === 'out')
    if (!endpoint) throw new Error('La impresora USB no expone un endpoint de salida.')
    await conTiempo((listo, falla) => endpoint.transfer(buffer, (error) => (error ? falla(error) : listo())), timeoutMs)
  } finally {
    try { device.close() } catch { /* el dispositivo ya estaba cerrado */ }
  }
}

async function escribirWebUsb(device, buffer, timeoutMs) {
  await device.open()
  try {
    if (!device.configuration) await device.selectConfiguration(1)
    const iface = (device.configuration?.interfaces || []).find((item) => (item.alternate?.interfaceClass || item.alternates?.[0]?.interfaceClass) === 7) || device.configuration?.interfaces?.[0]
    if (!iface) throw new Error('La impresora USB no expone interfaces.')
    await device.claimInterface(iface.interfaceNumber)
    const endpoint = (iface.alternate?.endpoints || iface.alternates?.[0]?.endpoints || []).find((item) => item.direction === 'out')
    if (!endpoint) throw new Error('La impresora USB no expone un endpoint de salida.')
    await device.transferOut(endpoint.endpointNumber, buffer)
  } finally {
    try { await device.close() } catch { /* el dispositivo ya estaba cerrado */ }
  }
}

function conTiempo(operacion, timeoutMs) {
  return new Promise((listo, falla) => {
    const temporizador = setTimeout(() => falla(new Error(`La impresora USB no respondió en ${timeoutMs} ms.`)), timeoutMs)
    operacion(
      () => { clearTimeout(temporizador); listo() },
      (error) => { clearTimeout(temporizador); falla(error instanceof Error ? error : new Error(String(error))) },
    )
  })
}

export async function enviarUsbDirecto(bytes, { vid = null, pid = null, timeoutMs = 8000 } = {}) {
  if (!bytes || !bytes.length) throw new Error('El ticket llegó vacío.')
  const cargado = await cargarModuloUsb()
  if (!cargado) throw new Error(errorCarga)
  const detectado = seleccionarDescrito(listarDispositivosUsb(), { vid: normalizarId(vid), pid: normalizarId(pid) })
  if (!detectado) throw new Error('No hay una impresora USB disponible para el USB directo.')
  await escribirEnDispositivo(detectado.device, bytes, { timeoutMs })
  return true
}
