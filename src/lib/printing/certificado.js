// Checklist PhoneCheck y etiqueta Certificado (#240): datos de la inspección
// para el informe y la constancia imprimible.
//
// Fuente de verdad del puntaje/grado: INV (`src/lib/phonecheck.js` +
// `docs/PHONECHECK-INFORME.md`). Este módulo consume su payload público
// (`informePublicoInspection`: grado, puntaje, items, controles, batería,
// cosmético, aviso) y, cuando todavía no está, arma lo mismo desde
// `unit.inspection` (objeto por clave o lista) con las mismas reglas:
//   OK=1 · observación=0,5 · falla=0 · no aplica no cuenta; A ≥ 90, B ≥ 75.
//
// El QR de la etiqueta SIEMPRE es una URL de la app (regla de docs/IMPRESION.md):
// el código compacto `CERT|…` de INV viaja como código de barras/texto, nunca
// como QR. Si INV/DSN pasan `enlace`, ese manda.
import { qrUnidad } from './qr.js'
import { modeloDe } from './etiquetaUnidad.js'
import { resumenImei } from '../imeiComprobante.js'

export const AVISO_BLACKLIST = 'iCloud/US Block clean no equivalen a blacklist mundial.'

// Fallback de rótulos cuando la inspección viene cruda (sin el payload de INV).
export const ITEMS_PHONECHECK = [
  { clave: 'pantalla', grupo: 'Pantalla', label: 'Pantalla / táctil' },
  { clave: 'camaras', grupo: 'Pantalla', label: 'Cámaras' },
  { clave: 'faceId', grupo: 'Biometría', label: 'Face ID / Touch ID' },
  { clave: 'audio', grupo: 'Audio', label: 'Altavoces y micrófono' },
  { clave: 'sensores', grupo: 'Sensores', label: 'Sensores' },
  { clave: 'botones', grupo: 'Controles', label: 'Botones y vibración' },
  { clave: 'conexiones', grupo: 'Conectividad', label: 'WiFi / BT / GPS' },
  { clave: 'carga', grupo: 'Energía', label: 'Carga y puerto' },
  { clave: 'bateria', grupo: 'Energía', label: 'Batería' },
  { clave: 'carcasa', grupo: 'Carcasa', label: 'Carcasa y chasis' },
]

const ESTADOS = { ok: 'OK', observacion: 'Con observación', falla: 'Falla', na: 'No aplica' }
const ESTADOS_CORTOS = { ok: 'OK', observacion: 'Obs.', falla: 'Falla', na: 'N/A' }
const PUNTAJES = { ok: 1, observacion: 0.5, falla: 0 }

const texto = (valor) => String(valor ?? '').trim()

/** Fecha y hora cortas de un documento ('' si no hay dato válido). */
export function fechaHoraDocumento(valor) {
  const fecha = valor ? new Date(valor) : null
  if (!fecha || Number.isNaN(fecha.getTime())) return ''
  return fecha.toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' })
}

/** Fecha corta de un documento ('' si no hay dato válido). */
export function fechaCortaDocumento(valor) {
  const fecha = valor ? new Date(valor) : null
  if (!fecha || Number.isNaN(fecha.getTime())) return ''
  return fecha.toLocaleDateString('es-PY')
}

/** Rótulo largo del estado de un ítem. */
export const estadoChecklist = (estado) => ESTADOS[String(estado || '')] || ''
/** Rótulo corto (para la columna de la derecha en el rollo). */
export const estadoChecklistCorto = (estado) => ESTADOS_CORTOS[String(estado || '')] || '—'
/** Un ítem cuenta como conforme con OK o «no aplica». */
export const itemConforme = (estado) => ['ok', 'na'].includes(String(estado || ''))

/** Los ítems del checklist normalizados ([{clave, grupo, label, estado, nota}]). */
export function itemsChecklist(inspection = {}) {
  const bruto = inspection?.items
  // Lista ya normalizada por INV (`payloadInformeInspection`): sus rótulos mandan.
  if (Array.isArray(bruto) && bruto.some((fila) => fila && (fila.label || fila.grupo))) {
    return bruto.filter(Boolean).map((fila) => ({
      clave: texto(fila.clave),
      grupo: texto(fila.grupo),
      label: texto(fila.label) || texto(fila.clave),
      estado: texto(fila.estado) || null,
      nota: texto(fila.nota),
    }))
  }
  // Objeto por clave (UI de INV) o lista simple ({clave, estado, nota}).
  const porClave = Array.isArray(bruto)
    ? Object.fromEntries(bruto.filter(Boolean).map((fila) => [texto(fila.clave), fila]))
    : (bruto && typeof bruto === 'object' ? bruto : {})
  return ITEMS_PHONECHECK.map((item) => {
    const fila = porClave[item.clave] || {}
    return {
      clave: item.clave,
      grupo: texto(fila.grupo) || item.grupo,
      label: texto(fila.label) || item.label,
      estado: texto(fila.estado) || null,
      nota: texto(fila.nota),
    }
  })
}

/** Puntaje 0-100 (mismas reglas que INV). `null` si no hay ítems evaluados. */
export function puntajeChecklist(items = []) {
  let suma = 0
  let cuenta = 0
  for (const item of items) {
    const valor = PUNTAJES[String(item?.estado || '')]
    if (valor === undefined) continue
    suma += valor
    cuenta += 1
  }
  return cuenta ? Math.round((suma / cuenta) * 100) : null
}

/** Grado A/B/C por puntaje (A ≥ 90, B ≥ 75). */
export function gradoChecklist(puntaje) {
  if (puntaje === null || puntaje === undefined || !Number.isFinite(Number(puntaje))) return null
  const valor = Number(puntaje)
  return valor >= 90 ? 'A' : valor >= 75 ? 'B' : 'C'
}

// Valores que significan «no hay dato»: no son una falla, son un pendiente.
const SIN_DATO_CONTROL = /^(sin dato|sin datos|no verificado|sin verificar|desconocido|n\/a|—|-)$/i

/** Un control del semáforo: ok, falla o sin dato (honesto, nunca inventa). */
const control = (label, valor, estaOk) => {
  const limpio = texto(valor)
  if (!limpio) return null
  const sinDato = SIN_DATO_CONTROL.test(limpio)
  const ok = sinDato ? false : Boolean(estaOk(limpio))
  return { label, ok, estado: sinDato ? 'sin-dato' : ok ? 'ok' : 'falla', valor: limpio }
}

/** Controles (iCloud/MDM/ESN/Carrier) desde la consulta IMEI, como los chips de INV. */
export function controlesDeVerificacion(consulta = null) {
  if (!consulta) return []
  const campos = resumenImei(consulta).campos || []
  const porClave = Object.fromEntries(campos.map((campo) => [texto(campo.etiqueta).toLowerCase(), texto(campo.valor)]))
  const buscar = (clave) => Object.entries(porClave).find(([etiqueta]) => etiqueta.includes(clave))?.[1] || ''
  return [
    control('iCloud', buscar('icloud') || buscar('find my'), (valor) => /off|apagad|libre/i.test(valor)),
    control('MDM', buscar('mdm'), (valor) => /apagad|off|inactiv|no activ/i.test(valor)),
    control('ESN/Blacklist', buscar('blacklist'), (valor) => !/reportad|blocked/i.test(valor)),
    control('Carrier/SIM', buscar('sim'), (valor) => /unlock|libre/i.test(valor)),
  ].filter(Boolean)
}

/**
 * Datos del checklist de una unidad: usa el payload de INV si viene, si no la
 * inspección cruda (`unit.inspection`) + la última consulta IMEI.
 */
export function datosChecklist(unit = {}, { informe = null, verificacion = null } = {}) {
  const publico = informe && typeof informe === 'object' ? informe : null
  const cruda = unit.inspection || unit.inspeccion || {}
  const fuente = publico || cruda
  const items = itemsChecklist({ items: publico ? publico.items : cruda.items })
  const puntaje = Number.isFinite(Number(fuente.puntaje)) ? Number(fuente.puntaje) : puntajeChecklist(items)
  const grado = texto(fuente.grado) || gradoChecklist(puntaje) || ''
  const evaluados = items.filter((item) => item.estado && item.estado !== 'na')
  const noOk = items.filter((item) => ['observacion', 'falla'].includes(String(item.estado || '')))
  const bateria = fuente.bateria && typeof fuente.bateria === 'object'
    ? { porcentaje: fuente.bateria.porcentaje ?? null, ciclos: fuente.bateria.ciclos ?? null }
    : { porcentaje: fuente.bateriaPct ?? unit.batteryHealth ?? null, ciclos: fuente.bateriaCiclos ?? null }
  const controles = Array.isArray(publico?.controles) && publico.controles.length
    ? publico.controles.map((fila) => ({ label: texto(fila.label), ok: Boolean(fila.ok), estado: fila.ok ? 'ok' : 'falla', valor: texto(fila.valor) }))
    : controlesDeVerificacion(verificacion)
  // El payload público de INV omite el nombre de quien inspeccionó (es dato de
  // una persona): en el papel de la tienda sale del checklist crudo.
  const verificado = publico?.verificado || cruda.inspeccionadoAt || cruda.verificado || null
  const verificadoPor = texto(publico?.verificadoPor) || texto(cruda.inspeccionadoPor || cruda.verificadoPor)
  return {
    hay: Boolean(grado || puntaje !== null || evaluados.length),
    grado: grado || '',
    puntaje,
    ok: items.filter((item) => item.estado === 'ok').length,
    evaluados: evaluados.length,
    total: items.length,
    items,
    noOk,
    cosmetico: texto(fuente.cosmetico),
    bateria,
    controles,
    repuestosNoOem: texto(fuente.repuestosNoOem),
    nota: texto(fuente.nota),
    verificado: verificado || null,
    verificadoPor,
    aviso: texto(publico?.aviso) || AVISO_BLACKLIST,
  }
}

/** Serial enmascarado por caracteres (contrato sin PII de INV): «••••7518». */
export const serialEnmascarado = (serial) => {
  const valor = texto(serial)
  if (valor.length <= 4) return valor
  return `${'•'.repeat(valor.length - 4)}${valor.slice(-4)}`
}

/** Código compacto del certificado (barras/texto), como el `CERT|…` de INV. */
export const codigoCertificado = (datos = {}) => ['CERT', datos.serialEnmascarado || '', datos.grado || 'P', datos.puntaje ?? '', datos.verificado || ''].join('|')

/**
 * Datos de la etiqueta Certificado: constancia de inspección para el comprador,
 * sin datos personales. El QR apunta al informe público (`enlace` de INV/DSN o
 * `/u/<serial>`); el código `CERT|…` va como barras.
 */
export function datosCertificado(unit = {}, { informe = null, verificacion = null, base = '', emisor = '', ahora = new Date() } = {}) {
  const publico = informe && typeof informe === 'object' ? informe : null
  const product = unit.product || {}
  const serial = texto(unit.serial)
  const checklist = datosChecklist(unit, { informe, verificacion })
  const enmascarado = texto(publico?.serial) || serialEnmascarado(serial)
  const enlace = texto(publico?.enlace) || (serial ? qrUnidad(serial, base) : '')
  const datos = {
    titulo: texto(publico?.titulo) || 'Certificado de inspección',
    grado: checklist.grado || 'P',
    puntaje: checklist.puntaje,
    hay: checklist.hay,
    ok: checklist.ok,
    evaluados: checklist.evaluados,
    total: checklist.total,
    items: checklist.items,
    noOk: checklist.noOk,
    modelo: modeloDe(product),
    producto: texto(product.name || product.nombre),
    capacidad: texto(product.capacity),
    condicion: texto(unit.condition),
    cosmetico: checklist.cosmetico,
    bateria: checklist.bateria,
    controles: checklist.controles,
    repuestosNoOem: checklist.repuestosNoOem,
    nota: checklist.nota,
    aviso: checklist.aviso,
    serial,
    // El certificado circula (comprador): el serial SIEMPRE va enmascarado.
    serialEnmascarado: enmascarado,
    identificador: texto(serial).slice(-4),
    verificado: checklist.verificado,
    verificadoPor: checklist.verificadoPor,
    fuente: publico?.fuente || null,
    sucursal: texto(unit.branch?.name),
    ubicacion: [texto(unit.location?.code), texto(unit.location?.name)].filter(Boolean).join(' · '),
    emisor: texto(emisor),
    enlace,
    enlacePublico: Boolean(texto(publico?.enlace)),
    fechaEmision: fechaHoraDocumento(ahora),
  }
  const codigo = codigoCertificado(datos)
  // El código de barras viaja en ASCII (CODE128 no acepta los puntos del
  // enmascarado); el texto conserva el formato del contrato.
  return { ...datos, codigo, codigoBarras: codigo.replace(/[^\x20-\x7E]/g, '*') }
}
