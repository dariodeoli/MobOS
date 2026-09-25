import { sinCostoUnitario } from '../utils/inventario.js'
import { locksDeVerificacion } from './phonecheck.js'

// Modo taller/rack (#240 §4): agrupa las unidades activas por el flujo de
// preparación y arma las acciones en serie (verificar/imprimir). La UI vive en
// `components/inventory/TallerRack.jsx`.
//
// Estados:
// - `por-verificar`: todavía sin verificación (no pasó por ficha ni inspección).
// - `verificado`: verificado pero todavía no apto para publicar (sin costo o
//   con grado B/C de la inspección #240 §1-2).
// - `listo`: verificado y con costo cargado. Con inspección de INV, además
//   exige grado A (puntaje >= 90), que es el contrato de `inspection.grado`.
//
// La inspección viaja en `unit.inspection` (INV, #240): `{ puntaje, grado,
// bateriaSalud, ... }`. Si no está (deploy sin esa migración), el rack funciona
// con la verificación y el costo que ya existen.

export const ORDEN_RACK = ['por-verificar', 'verificado', 'listo']

export const ETIQUETA_RACK = {
  'por-verificar': 'Por verificar',
  verificado: 'Verificado',
  listo: 'Listo para vender',
}

export const TONO_RACK = {
  'por-verificar': 'slate',
  verificado: 'blue',
  listo: 'green',
}

export function gradoDe(unit) {
  const grado = unit?.inspection?.grado
  return grado === 'A' || grado === 'B' || grado === 'C' ? grado : null
}

export function puntajeDe(unit) {
  const puntaje = Number(unit?.inspection?.puntaje)
  return Number.isFinite(puntaje) ? puntaje : null
}

export function bateriaDe(unit) {
  // El checklist canónico persiste `bateriaPct`; `bateriaSalud` es del piloto.
  const valor = Number(unit?.inspection?.bateriaSalud ?? unit?.inspection?.bateriaPct)
  return Number.isFinite(valor) && valor > 0 ? Math.min(100, Math.round(valor)) : null
}

/** Pasó por verificación (ficha) o por la inspección de INV. */
export function verificada(unit) {
  if (puntajeDe(unit) !== null) return true
  if (gradoDe(unit)) return true
  if (unit?.lastVerifiedAt) return true
  return Number(unit?.verificationCount || 0) > 0
}

export function conCosto(unit) {
  return !sinCostoUnitario(unit)
}

/**
 * Estado de la unidad dentro del rack. Con inspección (#240) el grado manda:
 * A + costo = listo; B/C o sin costo = verificado. Sin inspección, la
 * verificación + costo alcanzan (comportamiento actual del inventario).
 */
export function estadoEnRack(unit) {
  if (!verificada(unit)) return 'por-verificar'
  const grado = gradoDe(unit)
  if (grado) return grado === 'A' && conCosto(unit) ? 'listo' : 'verificado'
  return conCosto(unit) ? 'listo' : 'verificado'
}

/** Agrupa las unidades por estado, conservando el orden de entrada. */
export function agruparRack(unidades = []) {
  const grupos = { 'por-verificar': [], verificado: [], listo: [] }
  for (const unidad of unidades) grupos[estadoEnRack(unidad)].push(unidad)
  return grupos
}

/** Cuántas de `unidades` necesitan verificación (para la acción en serie). */
export function sinVerificar(unidades = []) {
  return unidades.filter((unidad) => !verificada(unidad))
}

// Estaciones del rack: la vista completa o una sola estación (útil en móvil y
// con lotes grandes). Los ids coinciden con los estados.
export const ESTACIONES = [
  { id: 'todas', label: 'Todas' },
  { id: 'por-verificar', label: ETIQUETA_RACK['por-verificar'] },
  { id: 'verificado', label: ETIQUETA_RACK.verificado },
  { id: 'listo', label: ETIQUETA_RACK.listo },
]

/**
 * «x de y» del checklist de la inspección (#240): pasan, fallan y porcentaje.
 * Lo comparten el rack y el tablero operativo.
 */
export function checklistDe(unit) {
  const items = Object.values(unit?.inspection?.items || {})
  if (!items.length) return null
  const pasan = items.filter((fila) => fila?.estado === 'pasa').length
  const fallan = items.filter((fila) => fila?.estado === 'falla').length
  return {
    pasan,
    fallan,
    revisados: pasan + fallan,
    total: items.length,
    porcentaje: Math.round((pasan / items.length) * 100),
  }
}

/**
 * Chips de locks del equipo (iCloud/Find My, MDM, ESN/blacklist y carrier) desde
 * la verificación guardada en la inspección. Sin datos devuelve `null`: la UI
 * muestra el estado honesto («sin verificar»), nunca «libre» de arriba.
 */
export function locksDe(unit) {
  const crudo = unit?.inspection?.verificacion || unit?.inspection?.verificacionImei || unit?.imeiVerification || null
  if (!crudo) return null
  const verificacion = crudo?.campos || crudo?.normalized ? crudo : (crudo?.data || {})
  const chips = locksDeVerificacion(verificacion)
  if (!chips.length) return null
  return chips.map((chip) => ({ clave: chip.clave, estado: chip.ok ? 'libre' : 'activo', detalle: `${chip.label}: ${chip.valor}` }))
}

export function normalizarBusqueda(valor) {
  return String(valor || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

/** Filtros del rack: búsqueda por IMEI/modelo y ubicación (vacío = todo). */
export function filtrarRack(unidades = [], { busqueda = '', ubicacionId = '' } = {}) {
  const termino = normalizarBusqueda(busqueda)
  return unidades.filter((unidad) => {
    if (ubicacionId && unidad.locationId !== ubicacionId) return false
    if (!termino) return true
    return [unidad.serial, unidad.product?.name, unidad.product?.nombre]
      .some((valor) => normalizarBusqueda(valor).includes(termino))
  })
}
