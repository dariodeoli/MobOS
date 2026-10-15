// Clasificación de lo que lee el escáner o el lector (#450). Antes cualquier
// QR se trataba como «serial» y el de la hoja de prueba de la impresora decía
// «Formato inválido (mínimo 4…)». Acá cada lectura se reconoce como IMEI,
// serial, código de producto (EAN/UPC/SKU), QR de MobOS (unidad, producto,
// pedido…) o algo ajeno, y el mensaje de rechazo dice qué es.
import { leerEtiqueta } from './printing/qr.js'
import { luhnValido, normalizarSerial } from './escanerSeriales.js'

export const MSG_AJENO = 'Ese código no es un IMEI ni un producto'

/** Dígito de control GS1 (EAN-8, UPC-A, EAN-13, GTIN-14). */
export function gs1Valido(valor) {
  const digitos = String(valor ?? '')
  if (!/^\d+$/.test(digitos) || ![8, 12, 13, 14].includes(digitos.length)) return false
  let suma = 0
  for (let indice = 0; indice < digitos.length - 1; indice += 1) {
    const digito = Number(digitos[digitos.length - 2 - indice])
    suma += digito * (indice % 2 === 0 ? 3 : 1)
  }
  return (10 - (suma % 10)) % 10 === Number(digitos[digitos.length - 1])
}

const ENTIDADES = { PEDIDO: 'un pedido', UBI: 'una ubicación', PRUEBA: 'la hoja de prueba de la impresora', PROD: 'un producto' }

function coincideProducto(valor, productos) {
  const buscado = String(valor ?? '').trim().toUpperCase()
  if (!buscado) return null
  return productos.find((producto) => [producto.id, producto.sku, producto.barcode, producto.codigoBarras, producto.codigo]
    .some((campo) => campo && String(campo).trim().toUpperCase() === buscado)) || null
}

function clasificarTexto(texto, productos, origen) {
  const valor = normalizarSerial(texto)
  if (!valor) return { tipo: 'vacio', valor: '' }
  const producto = coincideProducto(valor, productos)
  if (producto) return { tipo: 'producto', valor, producto, origen }
  if (/^\d{15}$/.test(valor)) return { tipo: 'imei', valor, luhnOk: luhnValido(valor), origen }
  if (gs1Valido(valor)) return { tipo: 'barras', valor, origen }
  if (/^[A-Z0-9-]{4,}$/.test(valor)) return { tipo: 'serial', valor, origen }
  return { tipo: 'ajeno', valor, origen }
}

/**
 * `productos`: catálogo con `id`, `sku` y, si lo tiene, `barcode`/`codigoBarras`
 * (los códigos que identifican un producto y no una unidad).
 * Devuelve `{ tipo, valor, ... }` con tipo: imei | serial | producto | barras |
 * mobos | ajeno | vacio.
 */
export function clasificarCodigo(texto, { productos = [] } = {}) {
  const crudo = String(texto ?? '').trim()
  if (!crudo) return { tipo: 'vacio', valor: '' }
  const etiqueta = leerEtiqueta(crudo)
  if (etiqueta.tipo === 'UNIDAD') return { ...clasificarTexto(etiqueta.valor, productos, 'qr'), entidad: 'UNIDAD' }
  if (etiqueta.tipo === 'PROD') {
    const producto = coincideProducto(etiqueta.valor, productos)
    return producto ? { tipo: 'producto', valor: etiqueta.valor, producto, origen: 'qr' } : { tipo: 'mobos', entidad: 'PROD', valor: etiqueta.valor }
  }
  if (etiqueta.tipo) return { tipo: 'mobos', entidad: etiqueta.tipo, valor: etiqueta.valor }
  // Una URL o un texto con espacios/símbolos que no es de MobOS no es un código de equipo.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(crudo) || /[\s/?&=:%]/.test(crudo)) return { tipo: 'ajeno', valor: crudo }
  return clasificarTexto(crudo, productos, 'codigo')
}

/** Texto para la persona cuando la lectura no se puede cargar como IMEI. */
export function mensajeNoEsImei(clasificado) {
  switch (clasificado?.tipo) {
    case 'vacio': return 'No se leyó ningún código.'
    case 'mobos':
      if (clasificado.entidad === 'PRUEBA') return 'Ese QR es de la hoja de prueba de la impresora, no un IMEI ni un producto.'
      return `Ese QR es de MobOS (${ENTIDADES[clasificado.entidad] || 'otro objeto'}), no un IMEI ni un producto.`
    case 'barras': return 'Es el código de barras de un producto, no un IMEI. Escaneá el IMEI de la unidad.'
    case 'producto': return 'Es el código del producto, no de una unidad. Escaneá el IMEI.'
    default: return MSG_AJENO
  }
}

/**
 * Decide qué hacer con una lectura de la preparación de una compra o lote.
 * `cargados`: seriales ya cargados (Set o array) de toda la compra/lote;
 * `lineas`: `{ id, productId }` para elegir línea al leer el código de un
 * producto. Devuelve una acción:
 *  - `agregar` (con `serial`; `luhnForzado` si es un IMEI que no pasa Luhn y se confirmó)
 *  - `confirmar-luhn` (15 dígitos que no pasan Luhn: hay que confirmar)
 *  - `duplicado`, `linea` (se cambia de línea), `rechazar`.
 */
export function resolverLectura(texto, { cargados = [], productos = [], lineas = [], forzarLuhn = false } = {}) {
  const clasificado = clasificarCodigo(texto, { productos })
  const yaCargados = cargados instanceof Set ? cargados : new Set([...cargados].map(normalizarSerial))
  if (clasificado.tipo === 'imei' || clasificado.tipo === 'serial') {
    if (yaCargados.has(clasificado.valor)) return { accion: 'duplicado', serial: clasificado.valor, clasificado }
    if (clasificado.tipo === 'imei' && !clasificado.luhnOk && !forzarLuhn) return { accion: 'confirmar-luhn', serial: clasificado.valor, clasificado }
    return { accion: 'agregar', serial: clasificado.valor, luhnForzado: clasificado.tipo === 'imei' && !clasificado.luhnOk, clasificado }
  }
  if (clasificado.tipo === 'producto') {
    const linea = lineas.find((fila) => fila.productId === clasificado.producto.id || fila.product?.id === clasificado.producto.id)
    if (linea) return { accion: 'linea', lineId: linea.id, nombre: clasificado.producto.nombre || clasificado.producto.name || '', clasificado }
    return { accion: 'rechazar', mensaje: 'Ese producto no está en esta compra.', clasificado }
  }
  return { accion: 'rechazar', mensaje: mensajeNoEsImei(clasificado), clasificado }
}
