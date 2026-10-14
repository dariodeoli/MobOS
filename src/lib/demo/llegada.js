// Llegada de mercadería (#408, unidad G) · SOLO DEMO.
// Intérprete simplificado del pegado de la planilla: alcanza para las filas de
// muestra (fecha en bloque, modelo, IMEI/serie, sigla, costo y nota). El parser
// real vive en el backend (`backend/lib/arrival-parse.ts`) y NO se porta: en la
// demo no hay conciliación fina ni unidades reales, solo la misma forma de datos
// que /api/supply/arrivals para recorrer la pantalla. Estado en memoria de la pestaña.
import { guardarDemo, leerDemo } from '../demoStorage.js'
import { PROVEEDORES_DEMO } from './proveedores.js'
import { listDemoSupplyPurchases } from './abastecimiento.js'

const LLEGADAS_KEY = 'mobos:demo-llegadas:v1'
const SUCURSAL_ACTUAL = 'mobos-demo-central'
const SUCURSAL_DESTINO = 'mobos-demo-villa-morra'

const leerLlegadas = () => { try { return JSON.parse(leerDemo(LLEGADAS_KEY) || '[]') } catch { return [] } }
const guardarUna = (llegada) => {
  guardarDemo(LLEGADAS_KEY, JSON.stringify([llegada, ...leerLlegadas().filter((item) => item.id !== llegada.id)]))
  return llegada
}
const cargarUna = (id) => {
  const llegada = leerLlegadas().find((item) => item.id === id)
  if (!llegada) throw new Error('Llegada no encontrada.')
  return llegada
}

const norm = (valor) => String(valor ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()

function luhnOk(digitos) {
  let suma = 0
  let doble = false
  for (let i = digitos.length - 1; i >= 0; i -= 1) {
    let n = digitos.charCodeAt(i) - 48
    if (doble) { n *= 2; if (n > 9) n -= 9 }
    suma += n
    doble = !doble
  }
  return suma % 10 === 0
}

const CIENTIFICA = /^\d([.,]\d+)?E\+?\d+$/i
const RUIDO_MODELO = new Set(['LL', 'A', 'A/A', 'AA', 'CICLOS', 'IPHONE', 'APPLE', 'SAMSUNG'])

// Productos del catálogo cuyo nombre contiene las fichas útiles del modelo pegado.
function productosCandidatos(texto, productos) {
  const fichas = norm(texto).replace(/[()'"]/g, ' ').split(' ')
    .filter((ficha) => ficha && !RUIDO_MODELO.has(ficha) && !/^\d+%$/.test(ficha) && !/^[A-Z]?\d{4}$/.test(ficha) && !/^\d{1,2}\/\d{1,2}$/.test(ficha))
  if (!fichas.length) return []
  return productos.filter((producto) => {
    const nombre = norm(producto.nombre || producto.name)
    return fichas.every((ficha) => nombre.includes(ficha))
  })
}

function leerFecha(texto) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(?:[·\-–]\s*(.+))?$/.exec(texto.trim())
  if (!m) return null
  return { fecha: `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`, etiqueta: texto.trim() }
}

// Hallazgos de una línea según sus campos (se recalculan al editar).
function hallazgos(linea, todas, productos) {
  const issues = []
  if (linea.match === 'NO_LLEGO') return issues
  const error = (code, message) => issues.push({ code, severity: 'error', message })
  const aviso = (code, message) => issues.push({ code, severity: 'warning', message })
  if (!linea.productId && linea.productCandidates?.length > 1) error('ELEGIR_PRODUCTO', `Hay ${linea.productCandidates.length} productos posibles: elegí uno`)
  else if (!linea.productId) error('PRODUCTO_NO_ENCONTRADO', `No hay un producto para «${linea.raw.modelText}»: elegilo del catálogo`)
  else if (!productos.some((producto) => producto.id === linea.productId)) error('PRODUCTO_INVALIDO', 'El producto no existe en esta sucursal')
  if (!linea.supplierCode) error('PROVEEDOR_FALTA', 'Falta la sigla del proveedor')
  else if (!linea.supplierId) error('PROVEEDOR_DESCONOCIDO', `Proveedor desconocido («${linea.supplierCode}»): crealo antes en Proveedores`)
  if (linea.serialCelda && !linea.serial) {
    error('IMEI_EXCEL', `IMEI perdido por Excel, corregir («${linea.serialCelda}»)`)
  } else if (linea.serial) {
    if (/^\d{15}$/.test(linea.serial)) {
      if (/0{3}$/.test(linea.serial) && !linea.imeiConfirmado) error('IMEI_EXCEL', 'IMEI perdido por Excel, corregir (termina en ceros)')
      else if (!luhnOk(linea.serial)) error('IMEI_INVALIDO', `IMEI inválido (no pasa Luhn): ${linea.serial}`)
      else if (linea.imeiConfirmado) aviso('IMEI_CONFIRMADO', `IMEI ${linea.serial} termina en 000: confirmado por el operador`)
    }
    if (todas.filter((otra) => otra.serial === linea.serial && otra.match !== 'NO_LLEGO').length > 1) error('DUPLICADO_EN_LOTE', `IMEI/serie repetido en la llegada (${linea.serial})`)
  } else if (linea.destination !== 'FALTA_IMEI' && linea.destination !== 'DEVOLVER') {
    error('SERIAL_FALTA', 'Falta el IMEI/serie: usá el destino «Falta IMEI»')
  }
  if (linea.destination === 'FALTA_IMEI') aviso('FALTA_IMEI', 'Sin IMEI/serie: ingresa bloqueada hasta cargarlo')
  if (linea.destination === 'OTRA_SUCURSAL' && !linea.destinationBranchId) error('SUCURSAL_DESTINO_FALTA', 'Elegí la sucursal de destino')
  if (linea.originalCost == null) aviso('COSTO_FALTA', 'Falta el costo')
  if (linea.match === 'SOBRANTE') aviso('SOBRANTE', 'No estaba pedido: ingresa como sobrante')
  if (linea.customerHint && !linea.customerId && !linea.orderId) aviso('CLIENTE_NO_ENCONTRADO', `No se encontró el cliente «${linea.customerHint}»`)
  return issues
}

function resumir(lineas, currency) {
  const porDestino = { STOCK: 0, OTRA_SUCURSAL: 0, DEVOLVER: 0, FALTA_IMEI: 0, TECNICO: 0 }
  const porMatch = { EXACTO: 0, POR_MODELO: 0, SOBRANTE: 0, NO_LLEGO: 0 }
  const resumen = {
    total: lineas.length, ingresaron: 0, preVendidos: 0, aOtraSucursal: 0, devueltos: 0, tecnico: 0, faltaImei: 0, noLlegaron: 0, sobrantes: 0,
    porDestino, porMatch, errores: 0, avisos: 0, currency, costUsd: currency === 'USD' ? 0 : null, costPyg: 0, devueltoPyg: 0,
  }
  for (const linea of lineas) {
    porMatch[linea.match] += 1
    if (linea.match === 'NO_LLEGO') { resumen.noLlegaron += 1; continue }
    porDestino[linea.destination] += 1
    if (linea.match === 'SOBRANTE') resumen.sobrantes += 1
    for (const issue of linea.issues) { if (issue.severity === 'error') resumen.errores += 1; else resumen.avisos += 1 }
    const costo = linea.costPyg || 0
    if (linea.destination === 'DEVOLVER') { resumen.devueltos += 1; resumen.devueltoPyg += costo; continue }
    if (linea.destination === 'FALTA_IMEI') { resumen.faltaImei += 1; continue }
    if (linea.destination === 'OTRA_SUCURSAL') resumen.aOtraSucursal += 1
    else if (linea.destination === 'TECNICO') resumen.tecnico += 1
    else if (linea.customerId || linea.orderId) resumen.preVendidos += 1
    else resumen.ingresaron += 1
    resumen.costPyg += costo
    if (currency === 'USD') resumen.costUsd = Math.round((resumen.costUsd + (linea.originalCost || 0)) * 100) / 100
  }
  return resumen
}

function vista(llegada, productos) {
  return {
    ...llegada,
    lines: llegada.lines.map((linea) => {
      const producto = productos.find((item) => item.id === linea.productId)
      const proveedor = PROVEEDORES_DEMO.find((item) => item.code === linea.supplierCode)
      return { ...linea, product: producto ? { id: producto.id, name: producto.nombre || producto.name } : null, supplier: proveedor ? { code: proveedor.code, name: proveedor.name } : null }
    }),
  }
}

function recalcular(llegada, productos) {
  for (const linea of llegada.lines) {
    linea.costPyg = linea.originalCost == null ? null : Math.round(linea.originalCost * (llegada.currency === 'USD' ? llegada.exchangeRatePyg || 0 : 1))
    linea.issues = hallazgos(linea, llegada.lines, productos)
  }
  llegada.summary = resumir(llegada.lines, llegada.currency)
  return llegada
}

export function createDemoArrival(data = {}) {
  const previa = leerLlegadas().find((item) => item.idempotencyKey === data.idempotencyKey)
  if (previa) return previa
  const currency = data.currency === 'PYG' ? 'PYG' : 'USD'
  return guardarUna({
    id: `demo-llegada-${Date.now().toString(36)}`, code: `LLG-DEMO-${String(leerLlegadas().length + 1).padStart(4, '0')}`, status: 'BORRADOR',
    arrivedAt: data.arrivedAt, currency, exchangeRatePyg: Number(data.exchangeRatePyg) || null, source: 'PEGADO', branchId: SUCURSAL_ACTUAL,
    idempotencyKey: data.idempotencyKey, supplierIds: data.supplierIds || [], shipmentId: data.shipmentId || null, lines: [], summary: resumir([], currency),
  })
}

export const getDemoArrival = (id, productos = []) => vista(cargarUna(id), productos)

export function parseDemoArrival(id, texto, productos = []) {
  const llegada = cargarUna(id)
  const abiertas = new Set(listDemoSupplyPurchases({ pendientes: 1 }).compras.flatMap((compra) => compra.lines.filter((linea) => linea.faltan > 0).map((linea) => linea.productId)))
  const lineas = []
  let bloque = { fecha: null, etiqueta: null }
  for (const crudo of String(texto || '').split(/\r?\n/)) {
    if (!crudo.trim()) continue
    const fecha = leerFecha(crudo)
    if (fecha) { bloque = fecha; continue }
    const celdas = crudo.split(/\t| {2,}/).map((celda) => celda.trim()).filter(Boolean)
    if (celdas.length < 2) continue
    const [modelo, ...resto] = celdas
    let serial = ''
    let serialCelda = ''
    let sigla = ''
    let costo = null
    const notas = []
    for (const celda of resto) {
      const compacta = celda.replace(/[\s-]+/g, '')
      if (!serial && !serialCelda && CIENTIFICA.test(compacta)) serialCelda = celda
      else if (!serial && /^\d{15}$/.test(compacta)) serial = compacta
      else if (!serial && /^[A-Z0-9]{8,14}$/i.test(compacta) && /\d/.test(compacta) && /[A-Z]/i.test(compacta) && !/IMEI|DEVUELVE/i.test(celda)) serial = compacta.toUpperCase()
      else if (!sigla && /^[A-Z]{2,8}$/.test(celda) && (PROVEEDORES_DEMO.some((p) => p.code === celda) || celda.length <= 4)) sigla = celda
      else if (costo === null && /^\d+([.,]\d+)?$/.test(celda)) costo = Number(celda.replace(',', '.'))
      else notas.push(celda)
    }
    const nota = notas.join(' · ')
    const claveNota = norm(nota)
    const candidatos = productosCandidatos(modelo, productos)
    const productoUnico = candidatos.length === 1 ? candidatos[0].id : null
    const noLlego = /NO LLEG|NO INGRES/.test(claveNota)
    const devolver = /DEVUELVE/.test(claveNota)
    const cargarImei = /CARGAR IMEI/.test(claveNota)
    const aCde = /CDE|MANDAR|MANDA/.test(claveNota) && !devolver
    const numeroPedido = /#\s*(\d+)/.exec(nota)?.[1] || null
    const pista = nota.replace(/#\s*\d+/g, '').replace(/SE MANDA A CDE|MANDAR CDE|SE DEVUELVE|CARGAR IMEI|NO LLEG\w*|NO INGRES\w*/gi, '').replace(/PEDIDO/i, '').replace(/·/g, ' ').trim()
    lineas.push({
      id: `${id}-fila-${lineas.length}`, rowIndex: lineas.length,
      raw: { cells: celdas, blockDate: bloque.fecha, blockLabel: bloque.etiqueta, modelText: modelo },
      productId: productoUnico, productCandidates: candidatos.map((item) => item.id), serial: serial || null, serialCelda,
      serialKind: serial ? (/^\d{15}$/.test(serial) ? 'IMEI' : 'SERIE') : 'NINGUNO',
      supplierCode: sigla || null, supplierId: PROVEEDORES_DEMO.find((p) => p.code === sigla)?.id || null, originalCost: costo, note: nota || null,
      match: noLlego ? 'NO_LLEGO' : productoUnico && abiertas.has(productoUnico) ? 'POR_MODELO' : 'SOBRANTE',
      destination: devolver ? 'DEVOLVER' : cargarImei ? 'FALTA_IMEI' : aCde ? 'OTRA_SUCURSAL' : 'STOCK',
      destinationBranchId: aCde ? SUCURSAL_DESTINO : null,
      orderNumber: numeroPedido, orderId: numeroPedido ? `demo-pedido-${numeroPedido}` : null, orderItemId: null,
      customerHint: !numeroPedido && pista && !devolver && !cargarImei && !aCde && !noLlego ? pista : '', customerId: null, unitId: null,
    })
  }
  llegada.lines = lineas
  recalcular(llegada, productos)
  guardarUna(llegada)
  return { ...vista(llegada, productos), blocks: [], avisos: [] }
}

export function patchDemoArrivalLine(id, body = {}, productos = []) {
  const llegada = cargarUna(id)
  if (llegada.status !== 'BORRADOR') throw new Error('La llegada ya está confirmada: solo se puede completar el IMEI faltante.')
  const linea = llegada.lines.find((item) => item.id === body.lineId)
  if (!linea) throw new Error('Línea no encontrada.')
  if ('productId' in body) { linea.productId = body.productId || null; linea.productCandidates = [] }
  if ('serial' in body) {
    const serial = String(body.serial || '').replace(/[\s-]+/g, '').toUpperCase()
    linea.serial = serial || null
    linea.serialCelda = ''
    linea.imeiConfirmado = body.confirmSerial === true && /^\d{15}$/.test(serial) && /0{3}$/.test(serial) && luhnOk(serial)
    linea.serialKind = serial ? (/^\d{15}$/.test(serial) ? 'IMEI' : 'SERIE') : 'NINGUNO'
    if (serial && linea.destination === 'FALTA_IMEI' && !('destination' in body)) linea.destination = 'STOCK'
  }
  if ('destination' in body) linea.destination = body.destination
  if ('destinationBranchId' in body) linea.destinationBranchId = body.destinationBranchId || null
  if ('customerId' in body) linea.customerId = body.customerId || null
  if ('orderId' in body) linea.orderId = body.orderId || null
  if ('note' in body) linea.note = body.note || null
  recalcular(llegada, productos)
  guardarUna(llegada)
  return vista(llegada, productos)
}

export function confirmDemoArrival(id, productos = []) {
  const llegada = cargarUna(id)
  if (llegada.status === 'CONFIRMADA') return { ...vista(llegada, productos), repetida: true }
  recalcular(llegada, productos)
  if (llegada.summary.errores > 0) throw new Error('Hay filas con errores: corregilas antes de confirmar.')
  llegada.status = 'CONFIRMADA'
  llegada.confirmedAt = new Date().toISOString()
  guardarUna(llegada)
  return { ...vista(llegada, productos), repetida: false }
}

export function completeDemoArrivalSerial(lineId, serial, confirmSerial, productos = []) {
  const llegada = leerLlegadas().find((item) => item.lines.some((linea) => linea.id === lineId))
  if (!llegada) throw new Error('Línea no encontrada.')
  const linea = llegada.lines.find((item) => item.id === lineId)
  const limpio = String(serial || '').replace(/[\s-]+/g, '').toUpperCase()
  if (!limpio) throw new Error('Indicá el IMEI o la serie.')
  if (/^\d{15}$/.test(limpio) && (!luhnOk(limpio) || (/0{3}$/.test(limpio) && confirmSerial !== true))) throw new Error('IMEI inválido: revisalo.')
  linea.serial = limpio
  linea.serialKind = /^\d{15}$/.test(limpio) ? 'IMEI' : 'SERIE'
  linea.destination = 'STOCK'
  linea.unitId = `demo-unidad-${limpio}`
  linea.issues = linea.issues.filter((issue) => issue.code !== 'FALTA_IMEI')
  llegada.summary = resumir(llegada.lines, llegada.currency)
  guardarUna(llegada)
  return vista(llegada, productos)
}

export const listDemoArrivals = () => ({ arrivals: leerLlegadas().map(({ lines, ...resto }) => ({ ...resto, lineCount: lines.length })) })
