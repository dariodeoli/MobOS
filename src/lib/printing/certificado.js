// Checklist PhoneCheck y etiqueta Certificado (#240): datos de la inspección
// para el informe y la constancia imprimible.
//
// Fuente de verdad del puntaje/grado: lo que persista la inspección (INV) o lo
// que calcule la UI (DSN). Este módulo consume, en este orden:
//   1. el payload público de INV (`informePublicoInspection`: grado, puntaje,
//      items, controles, batería, cosmético, aviso) — manda si viene;
//   2. `unit.inspection` con el vocabulario de INV (`items` por clave con
//      { estado, nota }: OK=1 · observación=0,5 · falla=0 · no aplica no cuenta;
//      A ≥ 90, B ≥ 75);
//   3. `unit.inspection` con el vocabulario de la UI de DSN
//      (`src/lib/inspeccionChecklist.js`: `items` por id con 'pasa'|'falla'|'na',
//      `notas`, `bateriaSalud`): puntaje = pasa/aplicables; una falla en un ítem
//      clave o batería < 85 % baja a C; con fallas no clave es B; todo pasa es A.
// Si la inspección ya trae `grado`/`puntaje` persistidos, esos mandan siempre.
//
// El QR de la etiqueta SIEMPRE es una URL de la app (regla de docs/IMPRESION.md):
// el código compacto `CERT|…` de INV viaja como código de barras/texto, nunca
// como QR. Si INV/DSN pasan `enlace`, ese manda.
import { qrUnidad } from './qr.js'
import { modeloDe } from './etiquetaUnidad.js'
import { resumenImei } from '../imeiComprobante.js'
// Rótulos canónicos (#240): los del checklist y los locks viven en un solo
// objeto compartido (`src/lib/estadoEquipo.js` vía `phonecheck.js`) para que el
// papel lea igual que la ficha y el informe publicado.
import { INSPECCION_ESTADOS, INSPECCION_ITEMS } from '../phonecheck.js'
import { ESTADOS_LOCK, GRADOS_CONDICION, LOCKS_DISPOSITIVO } from '../estadoEquipo.js'

export const AVISO_BLACKLIST = 'iCloud/US Block clean no equivalen a blacklist mundial.'

// Ítems del checklist: el catálogo canónico de INV (`phonecheck.js`).
export const ITEMS_PHONECHECK = INSPECCION_ITEMS

// Espejo del catálogo de la UI de DSN (`src/lib/inspeccionChecklist.js`, rama
// `slot/diseno`): ids → rótulo y sección para imprimir la inspección cuando
// llega con ese vocabulario. Cuando el módulo esté en main se importa y este
// espejo queda solo como respaldo.
export const ITEMS_DSN = [
  { seccion: 'Pantalla', id: 'tactil', label: 'Táctil y multitouch' },
  { seccion: 'Pantalla', id: 'imagen', label: 'Imagen: manchas o líneas' },
  { seccion: 'Pantalla', id: 'brillo', label: 'Brillo y True Tone' },
  { seccion: 'Cámaras', id: 'trasera', label: 'Cámara trasera y flash' },
  { seccion: 'Cámaras', id: 'frontal', label: 'Cámara frontal' },
  { seccion: 'Cámaras', id: 'video', label: 'Grabación de video' },
  { seccion: 'Face ID / Touch ID', id: 'biometria', label: 'Reconocimiento funcionando' },
  { seccion: 'Audio', id: 'altavoz', label: 'Altavoz y auricular' },
  { seccion: 'Audio', id: 'microfono', label: 'Micrófonos' },
  { seccion: 'Audio', id: 'vibracion', label: 'Vibración' },
  { seccion: 'Sensores', id: 'proximidad', label: 'Proximidad y luz' },
  { seccion: 'Sensores', id: 'giroscopio', label: 'Giroscopio y acelerómetro' },
  { seccion: 'Sensores', id: 'brujula', label: 'Brújula y GPS' },
  { seccion: 'Botones', id: 'encendido', label: 'Encendido y volumen' },
  { seccion: 'Botones', id: 'silencioso', label: 'Silencioso / acción' },
  { seccion: 'Conectividad', id: 'wifi', label: 'WiFi y Bluetooth' },
  { seccion: 'Conectividad', id: 'senal', label: 'Señal celular y SIM' },
  { seccion: 'Conectividad', id: 'carga', label: 'Puerto de carga' },
  { seccion: 'Carga y batería', id: 'bateria', label: 'Salud de batería' },
  { seccion: 'Carga y batería', id: 'carga_rapida', label: 'Carga y cable' },
  { seccion: 'Carcasa', id: 'carcasa', label: 'Carcasa y marco' },
  { seccion: 'Carcasa', id: 'tapa', label: 'Tapa y sellado' },
  { seccion: 'Carcasa', id: 'camaras_lente', label: 'Lentes de cámara' },
]
// Ítems críticos de DSN: una falla acá baja el grado a C.
export const PIEZAS_CLAVE_DSN = ['tactil', 'imagen', 'biometria', 'bateria', 'senal', 'trasera', 'carga']
const ESTADO_DSN = { pasa: 'ok', falla: 'falla', na: 'na' }

/** ¿La inspección viene con el vocabulario de DSN (estados como texto)? */
export const esChecklistDSN = (inspection = {}) => {
  const items = inspection?.items
  if (!items || Array.isArray(items) || typeof items !== 'object') return false
  return Object.values(items).some((valor) => typeof valor === 'string' && ['pasa', 'falla', 'na', ''].includes(valor))
}

const ESTADOS = {
  ok: INSPECCION_ESTADOS.ok.label,
  observacion: INSPECCION_ESTADOS.observacion.label,
  falla: INSPECCION_ESTADOS.falla.label,
  na: INSPECCION_ESTADOS.na.label,
}
// Cortos para la columna derecha del rollo (el rótulo largo no entra en 58 mm).
const ESTADOS_CORTOS = { ok: 'Bien', observacion: 'Obs.', falla: 'Falla', na: 'N/A' }
// Estado del semáforo de un control (lock) con las etiquetas compartidas.
const ESTADOS_CONTROL = { libre: ESTADOS_LOCK.libre.etiqueta, activo: ESTADOS_LOCK.activo.etiqueta, 'sin-dato': ESTADOS_LOCK.desconocido.etiqueta }
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
/** Rótulo del estado de un control del semáforo (Libre / Activo / Sin dato). */
export const estadoControl = (estado) => ESTADOS_CONTROL[String(estado || '')] || ''

/** Un ítem cuenta como conforme con OK o «no aplica». */
export const itemConforme = (estado) => ['ok', 'na'].includes(String(estado || ''))

/** Los ítems del checklist normalizados ([{clave, grupo, label, estado, nota}]). */
export function itemsChecklist(inspection = {}) {
  const bruto = inspection?.items
  // Vocabulario de DSN: items por id con 'pasa' | 'falla' | 'na' y `notas` aparte.
  if (esChecklistDSN(inspection)) {
    const notas = inspection?.notas && typeof inspection.notas === 'object' ? inspection.notas : {}
    return ITEMS_DSN.map((item) => ({
      clave: item.id,
      grupo: item.seccion,
      label: item.label,
      estado: ESTADO_DSN[texto(bruto[item.id])] || null,
      nota: texto(notas[item.id]),
    }))
  }
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

/**
 * Resumen con las reglas de la UI de DSN: puntaje = pasa/aplicables; sin la
 * inspección completa no hay grado; una falla en un ítem clave o batería < 85 %
 * baja a C; con fallas no clave es B; todo pasa es A.
 */
export function resumenChecklistDSN(items = [], { bateriaSalud = null } = {}) {
  const revisados = items.filter((item) => ['ok', 'falla', 'na'].includes(String(item?.estado || '')))
  const aplicables = revisados.filter((item) => item.estado !== 'na')
  const pasan = revisados.filter((item) => item.estado === 'ok').length
  const fallan = revisados.filter((item) => item.estado === 'falla')
  const porcentaje = aplicables.length ? Math.round((pasan / aplicables.length) * 100) : 0
  const salud = Number(bateriaSalud)
  const saludOk = Number.isFinite(salud) && salud > 0 ? salud >= 85 : null
  const fallaClave = fallan.some((item) => PIEZAS_CLAVE_DSN.includes(item.clave))
  const completa = revisados.length > 0 && revisados.length === items.length
  const grado = !completa ? '' : fallaClave || saludOk === false ? 'C' : fallan.length ? 'B' : 'A'
  return { porcentaje, grado, revisados: revisados.length, pasan, fallan: fallan.length }
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
const control = (clave, valor, estaOk) => {
  const limpio = texto(valor)
  if (!limpio) return null
  const sinDato = SIN_DATO_CONTROL.test(limpio)
  const ok = sinDato ? false : Boolean(estaOk(limpio))
  return { clave, label: LOCKS_DISPOSITIVO[clave] || clave, ok, estado: sinDato ? 'sin-dato' : ok ? 'libre' : 'activo', valor: limpio }
}

/** Controles (iCloud/MDM/ESN/Carrier) desde la consulta IMEI, como los chips de INV. */
export function controlesDeVerificacion(consulta = null) {
  if (!consulta) return []
  const campos = resumenImei(consulta).campos || []
  const porClave = Object.fromEntries(campos.map((campo) => [texto(campo.etiqueta).toLowerCase(), texto(campo.valor)]))
  const buscar = (clave) => Object.entries(porClave).find(([etiqueta]) => etiqueta.includes(clave))?.[1] || ''
  return [
    control('icloud', buscar('icloud') || buscar('find my'), (valor) => /off|apagad|libre/i.test(valor)),
    control('mdm', buscar('mdm'), (valor) => /apagad|off|inactiv|no activ/i.test(valor)),
    control('esn', buscar('blacklist'), (valor) => !/reportad|blocked/i.test(valor)),
    control('carrier', buscar('sim'), (valor) => /unlock|libre/i.test(valor)),
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
  const items = itemsChecklist({ items: publico ? publico.items : cruda.items, notas: cruda.notas })
  // Sin payload, si el vocabulario es el de DSN se puntúa con sus reglas.
  const dsn = !publico && esChecklistDSN(cruda)
  const bateriaSalud = fuente.bateria && typeof fuente.bateria === 'object' ? fuente.bateria.porcentaje : null
  const resumenDSN = dsn ? resumenChecklistDSN(items, { bateriaSalud: bateriaSalud ?? fuente.bateriaSalud ?? unit.batteryHealth }) : null
  const puntaje = Number.isFinite(Number(fuente.puntaje)) ? Number(fuente.puntaje) : (resumenDSN ? resumenDSN.porcentaje : puntajeChecklist(items))
  const grado = texto(fuente.grado) || (resumenDSN ? resumenDSN.grado : gradoChecklist(puntaje)) || ''
  const evaluados = items.filter((item) => item.estado && item.estado !== 'na')
  const noOk = items.filter((item) => ['observacion', 'falla'].includes(String(item.estado || '')))
  const bateria = fuente.bateria && typeof fuente.bateria === 'object'
    ? { porcentaje: fuente.bateria.porcentaje ?? null, ciclos: fuente.bateria.ciclos ?? null }
    : { porcentaje: fuente.bateriaPct ?? fuente.bateriaSalud ?? unit.batteryHealth ?? null, ciclos: fuente.bateriaCiclos ?? null }
  const controles = Array.isArray(publico?.controles) && publico.controles.length
    ? publico.controles.map((fila) => ({ clave: texto(fila.clave), label: texto(fila.label), ok: Boolean(fila.ok), estado: fila.ok ? 'libre' : 'activo', valor: texto(fila.valor) }))
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
    gradoDescripcion: GRADOS_CONDICION[checklist.grado]?.descripcion || '',
    puntaje: checklist.puntaje,
    hay: checklist.hay,
    // Con la inspección incompleta no hay grado: el héroe dice «pendiente».
    completa: Boolean(checklist.grado),
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
