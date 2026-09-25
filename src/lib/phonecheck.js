// PhoneCheck (#240): checklist de inspección por unidad + grado de condición.
// Lógica pura y testeable; la UI y el backend comparten estas reglas.
// Las etiquetas del semáforo salen del objeto compartido (#240); acá solo
// vive el peso de cada estado para el puntaje del checklist.
import { ESTADOS_ITEM } from './estadoEquipo.js'

export const INSPECCION_ESTADOS = {
  ok: { label: ESTADOS_ITEM.ok.etiqueta, tone: 'green', puntaje: 1 },
  observacion: { label: ESTADOS_ITEM.aviso.etiqueta, tone: 'orange', puntaje: 0.5 },
  falla: { label: ESTADOS_ITEM.falla.etiqueta, tone: 'red', puntaje: 0 },
  na: { label: 'No aplica', tone: 'slate', puntaje: null },
}

export const INSPECCION_ITEMS = [
  { grupo: 'Pantalla', clave: 'pantalla', label: 'Pantalla / táctil', ayuda: 'Rayones, manchas, respuesta táctil.' },
  { grupo: 'Pantalla', clave: 'camaras', label: 'Cámaras (frontal y traseras)', ayuda: 'Enfoque, lente, flash.' },
  { grupo: 'Biometría', clave: 'faceId', label: 'Face ID / Touch ID', ayuda: 'Reconocimiento configurado y funcionando.' },
  { grupo: 'Audio', clave: 'audio', label: 'Altavoces y micrófono', ayuda: 'Llamada, altavoz, grabación.' },
  { grupo: 'Sensores', clave: 'sensores', label: 'Sensores', ayuda: 'Proximidad, luz, giroscopio.' },
  { grupo: 'Controles', clave: 'botones', label: 'Botones y vibración', ayuda: 'Encendido, volumen, silencio.' },
  { grupo: 'Conectividad', clave: 'conexiones', label: 'WiFi / Bluetooth / GPS', ayuda: 'Asocia redes y ubica.' },
  { grupo: 'Energía', clave: 'carga', label: 'Carga y puerto', ayuda: 'Carga por cable e inalámbrica.' },
  { grupo: 'Energía', clave: 'bateria', label: 'Batería', ayuda: 'Salud y ciclos.' },
  { grupo: 'Carcasa', clave: 'carcasa', label: 'Carcasa y chasis', ayuda: 'Golpes, doblez, humedad.' },
]

export const COSMETICOS = ['impecable', 'buen estado', 'marcas de uso', 'golpes visibles']

/** Puntaje 0-100: OK=1, observación=0,5, falla=0; «no aplica» no cuenta. */
export function puntajeInspection(inspection = {}) {
  const items = inspection.items || {}
  let suma = 0
  let cuenta = 0
  for (const item of INSPECCION_ITEMS) {
    const estado = items[item.clave]?.estado
    const valor = INSPECCION_ESTADOS[estado]?.puntaje
    if (valor === null || valor === undefined) continue
    suma += valor
    cuenta += 1
  }
  if (!cuenta) return null
  return Math.round((suma / cuenta) * 100)
}

/** Grado A/B/C a partir del puntaje (A ≥ 90, B ≥ 75, C el resto). */
export function gradoInspection(puntaje) {
  if (puntaje === null || puntaje === undefined) return null
  if (puntaje >= 90) return 'A'
  if (puntaje >= 75) return 'B'
  return 'C'
}

/** Cálculo completo (lo usan UI, route y demo). */
export function resumenInspection(inspection = {}) {
  const puntaje = puntajeInspection(inspection)
  return { puntaje, grado: gradoInspection(puntaje) }
}

// ── #241 paso 6: ficha completa — inspección oficial vs borrador y locks reales

/** Campos del checklist que definen si hay cambios sin guardar. */
const CAMPOS_INSPECCION = ['items', 'cosmetico', 'nota', 'bateriaPct', 'bateriaCiclos', 'repuestosNoOem', 'repuestosNoOemNota', 'costoRepuestosPyg']

/** Huella estable de una inspección (compara el borrador en pantalla con lo guardado). */
export function huellaInspeccion(inspection = {}) {
  const items = inspection?.items || {}
  const normalizado = { items: {} }
  for (const clave of Object.keys(items).sort()) {
    normalizado.items[clave] = { estado: items[clave]?.estado || '', nota: String(items[clave]?.nota || '').trim() }
  }
  for (const campo of CAMPOS_INSPECCION) {
    if (campo === 'items') continue
    if (campo === 'costoRepuestosPyg') {
      const valor = Number(inspection?.[campo])
      normalizado[campo] = Number.isSafeInteger(valor) && valor > 0 ? valor : null
      continue
    }
    normalizado[campo] = String(inspection?.[campo] ?? '')
  }
  return JSON.stringify(normalizado)
}

/**
 * Inspección de la ficha: el **grado oficial** es el que quedó guardado en la
 * unidad (puntaje/grado, fecha y autor); el borrador en pantalla es provisional y
 * `sinGuardar` avisa si difiere de lo persistido. `marcados` da el «x de y» del
 * checklist.
 */
export function estadoInspeccion({ inspection = null, borrador = null } = {}) {
  const guardado = inspection && typeof inspection === 'object' ? inspection : null
  const resumenGuardado = guardado ? { puntaje: guardado.puntaje ?? resumenInspection(guardado).puntaje, grado: guardado.grado ?? resumenInspection(guardado).grado } : { puntaje: null, grado: null }
  const oficial = resumenGuardado.puntaje === null && resumenGuardado.grado === null
    ? null
    : { ...resumenGuardado, guardadoEn: guardado?.inspeccionadoAt || null, guardadoPor: guardado?.inspeccionadoPor || '' }
  const provisional = borrador ? resumenInspection(borrador) : { puntaje: null, grado: null }
  return {
    oficial,
    provisional,
    sinGuardar: Boolean(borrador) && huellaInspeccion(borrador) !== huellaInspeccion(guardado || {}),
    marcados: borrador ? INSPECCION_ITEMS.filter((item) => borrador?.items?.[item.clave]?.estado).length : 0,
    total: INSPECCION_ITEMS.length,
  }
}

/**
 * Locks listos para el objeto compartido `ChipsLocks` (estado libre/activo): lo
 * usa el tile de equipo y cualquier listado que muestre los chips del serial.
 */
export function locksParaChips(verificacion = null) {
  const resumen = resumenVerificacion(verificacion)
  if (!resumen) return []
  return resumen.chips.map((chip) => ({
    clave: chip.clave,
    estado: chip.ok ? 'libre' : 'activo',
    detalle: `${chip.label}: ${chip.valor || 'Sin dato'}${resumen.servicio ? ` · ${resumen.servicio}` : ''}${resumen.fecha ? ` · ${new Date(resumen.fecha).toLocaleString('es-PY')}` : ''}`,
  }))
}

/**
 * Verificación IMEI lista para los chips: campos normalizados y **fuente/hora**
 * (servicio y cuándo se resolvió), sea la última consulta real guardada del
 * serial o una consulta hecha en esta sesión.
 */
export function resumenVerificacion(verificacion = null) {
  if (!verificacion || typeof verificacion !== 'object') return null
  const campos = Array.isArray(verificacion.campos) ? verificacion.campos : Array.isArray(verificacion.normalized) ? verificacion.normalized : []
  if (!campos.length) return null
  return {
    estado: verificacion.status || '',
    etiqueta: verificacion.etiqueta || '',
    servicio: verificacion.serviceName || verificacion.provider || 'Verificación IMEI',
    proveedor: verificacion.provider || '',
    fecha: verificacion.resolvedAt || verificacion.requestedAt || null,
    simulado: Boolean(verificacion.simulado || verificacion.esMock),
    imeiMasked: verificacion.imeiMasked || '',
    chips: locksDeVerificacion({ ...verificacion, campos }),
  }
}

/** Costo de repuestos/arreglos cargado en la inspección (#148 §19). */
export function costoRepuestosInspection(inspection = {}) {
  const valor = Number(inspection?.costoRepuestosPyg)
  return Number.isSafeInteger(valor) && valor > 0 ? valor : 0
}

/** Chips de bloqueos a partir de la verificación IMEI (campos normalizados). */export function locksDeVerificacion(verificacion = {}) {
  const campos = Array.isArray(verificacion?.campos) ? verificacion.campos : Array.isArray(verificacion?.normalized) ? verificacion.normalized : []
  const porClave = Object.fromEntries(campos.map(campo => [campo.clave, campo.valor]))
  const chips = []
  if (porClave.findMy !== undefined) chips.push({ clave: 'icloud', label: 'iCloud', valor: porClave.findMy || '—', ok: String(porClave.findMy).toLowerCase() === 'off' })
  if (porClave.mdm !== undefined) chips.push({ clave: 'mdm', label: 'MDM', valor: porClave.mdm || '—', ok: !/on|s[ií]|activ/i.test(String(porClave.mdm || '')) })
  if (porClave.blacklist !== undefined) chips.push({ clave: 'esn', label: 'ESN/Blacklist', valor: porClave.blacklist || '—', ok: !/reportad/i.test(String(porClave.blacklist || '')) })
  if (porClave.simLock !== undefined) chips.push({ clave: 'carrier', label: 'Carrier/SIM', valor: porClave.simLock || '—', ok: /unlock|libre/i.test(String(porClave.simLock || '')) })
  return chips
}

/** Payload listo para el informe (DSN/PRN): todo lo que la unidad inspeccionada muestra. */export function payloadInformeInspection({ unit = {}, inspection = {}, verificacion = null } = {}) {
  const { puntaje, grado } = resumenInspection(inspection)
  return {
    unitId: unit.id,
    serial: unit.serial || '',
    producto: unit.product?.name || unit.product?.nombre || '',
    capacidad: unit.product?.capacity || '',
    condicion: unit.condition || '',
    cosmetico: inspection.cosmetico || '',
    bateria: { porcentaje: inspection.bateriaPct ?? unit.batteryHealth ?? null, ciclos: inspection.bateriaCiclos ?? null },
    locks: locksDeVerificacion(verificacion || {}),
    repuestosNoOem: inspection.repuestosNoOem || '',
    repuestosNoOemNota: inspection.repuestosNoOemNota || '',
    items: INSPECCION_ITEMS.map(item => ({ clave: item.clave, label: item.label, grupo: item.grupo, estado: inspection.items?.[item.clave]?.estado || null, nota: inspection.items?.[item.clave]?.nota || '' })),
    puntaje,
    grado,
    nota: inspection.nota || '',
    verificado: inspection.inspeccionadoAt || null,
    verificadoPor: inspection.inspeccionadoPor || '',
    fuenteVerificacion: verificacion ? { proveedor: verificacion.provider || 'imeicheck.net', fecha: verificacion.resolvedAt || verificacion.requestedAt || null, etiqueta: verificacion.etiqueta || '' } : null,
  }
}

/** Tablero de certificaciones: grados, certificadas totales y pendientes. */
export function resumenCertificaciones(units = []) {
  const resumen = { total: units.length, A: 0, B: 0, C: 0, certificadas: 0, pendientes: 0, sinVerificacion: 0 }
  for (const unit of units) {
    const inspeccion = unit.inspection
    const grado = inspeccion?.grado
    if (grado && ['A', 'B', 'C'].includes(grado)) { resumen[grado] += 1; resumen.certificadas += 1 }
    else resumen.pendientes += 1
    if (!unit.lastVerifiedAt) resumen.sinVerificacion += 1
  }
  return resumen
}

/** Etiqueta "Certificado" (#240): grado + QR compacto que apunta al informe. */
export function certificadoPhoneCheck(unit = {}, inspection = {}, { base = '' } = {}) {
  const { puntaje, grado } = resumenInspection(inspection)
  const serial = unit.serial || ''
  const codigo = ['CERT', unit.id || '', serial, grado || 'P', puntaje ?? '', inspection.inspeccionadoAt || ''].join('|')
  return {
    titulo: 'CERTIFICADO PhoneCheck',
    grado: grado || 'P',
    puntaje,
    producto: unit.product?.name || unit.product?.nombre || '',
    serial,
    condicion: unit.condition || '',
    cosmetico: inspection.cosmetico || '',
    bateria: { porcentaje: inspection.bateriaPct ?? unit.batteryHealth ?? null, ciclos: inspection.bateriaCiclos ?? null },
    repuestosNoOem: inspection.repuestosNoOem || '',
    fecha: inspection.inspeccionadoAt || null,
    por: inspection.inspeccionadoPor || '',
    qr: { contenido: codigo, enlace: base ? `${base}/inventario/unidad/${encodeURIComponent(unit.id || '')}` : '' },
  }
}

/** Informe público (DSN/PRN): sin PII, serial enmascarado, listo para render/QR. */
export function informePublicoInspection(payload = {}, { enlace = '' } = {}) {
  const serial = String(payload.serial || '')
  const enmascarado = serial.length > 4 ? `${'•'.repeat(serial.length - 4)}${serial.slice(-4)}` : serial
  const locks = (payload.locks || []).map(lock => ({ label: lock.label, ok: Boolean(lock.ok) }))
  return {
    tipo: 'certificado-phonecheck',
    version: 1,
    titulo: 'Certificado PhoneCheck',
    grado: payload.grado || 'P',
    puntaje: payload.puntaje ?? null,
    producto: payload.producto || '',
    capacidad: payload.capacidad || '',
    condicion: payload.condicion || '',
    cosmetico: payload.cosmetico || '',
    serial: enmascarado,
    bateria: { porcentaje: payload.bateria?.porcentaje ?? null, ciclos: payload.bateria?.ciclos ?? null },
    controles: locks,
    repuestosNoOem: payload.repuestosNoOem || '',
    repuestosNoOemNota: payload.repuestosNoOemNota || '',
    items: (payload.items || []).map(item => ({ grupo: item.grupo, label: item.label, estado: item.estado, nota: item.estado && item.estado !== 'ok' ? item.nota : '' })),
    verificado: payload.verificado || null,
    fuente: payload.fuenteVerificacion || null,
    aviso: 'iCloud/US Block clean no equivalen a blacklist mundial.',
    enlace,
    qr: ['CERT', enmascarado, payload.grado || 'P', payload.puntaje ?? '', payload.verificado || ''].join('|'),
  }
}
