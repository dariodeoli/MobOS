// Valores de toma por modelo, capacidad y condición: grilla de edición masiva,
// CSV de importación/exportación y rangos del cotizador. Puro y testeable; el
// catálogo de modelos vive en backend/lib/catalogo-apple.mjs (único origen).
import { CATALOGO_APPLE, modeloApple, normalizarCapacidad, normalizarClaveModelo } from '../../backend/lib/catalogo-apple.mjs'
import { parseDelimited } from '../utils/csv.js'

export const CONDICIONES_TOMA = Object.freeze([['USED', 'Seminuevo'], ['NEW', 'Nuevo'], ['REFURBISHED', 'Reacondicionado']])
export const ETIQUETA_CONDICION = Object.freeze(Object.fromEntries(CONDICIONES_TOMA))
const CONDICION_POR_TEXTO = Object.freeze({
  new: 'NEW', nuevo: 'NEW', used: 'USED', seminuevo: 'USED', usado: 'USED', refurbished: 'REFURBISHED', reacondicionado: 'REFURBISHED',
})

export const claveValor = (modelo, capacidad, condicion) => `${normalizarClaveModelo(modelo)}|${String(capacidad || '')}|${condicion}`

const entero = (valor) => {
  const texto = String(valor ?? '').replace(/gs\.?/gi, '').replace(/[\s.]/g, '').replace(/,/g, '')
  if (!/^\d+$/.test(texto)) return null
  const numero = Number(texto)
  return Number.isSafeInteger(numero) ? numero : null
}

/** Índice de valores existentes por modelo, capacidad y condición. */
export function indexarValores(valuaciones) {
  const mapa = new Map()
  for (const fila of Array.isArray(valuaciones) ? valuaciones : []) mapa.set(claveValor(fila.model, fila.storage || '', fila.condition), fila)
  return mapa
}

/**
 * Filas de la grilla: una por modelo del catálogo × capacidad, con el valor que
 * ya existe para la condición elegida. `familia` y `texto` filtran.
 */
export function filasGrilla(valuaciones, { condicion = 'USED', familia = '', texto = '' } = {}) {
  const indice = indexarValores(valuaciones)
  const palabras = normalizarClaveModelo(texto).split(' ').filter(Boolean)
  const filas = []
  for (const modelo of CATALOGO_APPLE) {
    if (familia && modelo.familia !== familia) continue
    const nombre = normalizarClaveModelo(`${modelo.familia} ${modelo.nombre}`).replace(/[()]/g, '')
    if (palabras.length && !palabras.every((palabra) => nombre.split(' ').some((parte) => parte.startsWith(palabra)))) continue
    const capacidades = modelo.capacidades.length ? modelo.capacidades : ['']
    for (const capacidad of capacidades) {
      const actual = indice.get(claveValor(modelo.nombre, capacidad, condicion)) || null
      filas.push({
        clave: claveValor(modelo.nombre, capacidad, condicion), model: modelo.nombre, storage: capacidad, familia: modelo.familia, condition: condicion, actual,
        base: actual ? String(actual.baseValuePyg) : '', max: actual?.maxValuePyg != null ? String(actual.maxValuePyg) : '',
      })
    }
  }
  return filas
}

/**
 * Lo que hay que guardar: solo las celdas editadas que difieren de lo existente.
 * Base vacía sobre un valor existente lo desactiva (conserva el historial);
 * base vacía sin valor previo se ignora. Devuelve { rows, errores }.
 */
export function cambiosDeGrilla(filas, ediciones) {
  const rows = []
  const errores = []
  for (const fila of filas) {
    const editada = ediciones[fila.clave]
    if (!editada) continue
    const base = String(editada.base ?? fila.base ?? '').trim()
    const max = String(editada.max ?? fila.max ?? '').trim()
    const previoBase = fila.actual ? String(fila.actual.baseValuePyg) : ''
    const previoMax = fila.actual?.maxValuePyg != null ? String(fila.actual.maxValuePyg) : ''
    const etiqueta = `${fila.model}${fila.storage ? ` ${fila.storage}` : ''}`
    if (!base) {
      if (fila.actual && fila.actual.isActive !== false) rows.push({ model: fila.model, storage: fila.storage, condition: fila.condition, baseValuePyg: Number(previoBase), maxValuePyg: previoMax ? Number(previoMax) : null, isActive: false })
      continue
    }
    const valorBase = entero(base)
    const valorMax = max ? entero(max) : null
    if (valorBase === null || valorBase <= 0) { errores.push(`${etiqueta}: el valor base debe ser un entero positivo.`); continue }
    if (max && (valorMax === null || valorMax < valorBase)) { errores.push(`${etiqueta}: el máximo no puede ser menor que el base.`); continue }
    if (fila.actual && fila.actual.isActive !== false && base === previoBase && (max || '') === previoMax) continue
    rows.push({ model: fila.model, storage: fila.storage, condition: fila.condition, baseValuePyg: valorBase, maxValuePyg: valorMax, isActive: true })
  }
  return { rows, errores }
}

// ---- CSV ----
const ENCABEZADO_CSV = ['Modelo', 'Capacidad', 'Condición', 'Valor base', 'Valor máximo', 'Activo']
const celdaCsv = (valor) => `"${String(valor ?? '').replace(/"/g, '""')}"`

/** CSV de los valores cargados (montos completos en guaraníes, sin separadores de miles). */
export function csvValores(valuaciones) {
  const filas = (Array.isArray(valuaciones) ? valuaciones : []).map((fila) => [
    fila.model, fila.storage || '', ETIQUETA_CONDICION[fila.condition] || fila.condition, fila.baseValuePyg, fila.maxValuePyg ?? '', fila.isActive === false ? 'No' : 'Sí',
  ].map(celdaCsv).join(','))
  return [ENCABEZADO_CSV.map(celdaCsv).join(','), ...filas].join('\r\n')
}

/** Plantilla descargable: todos los modelos y capacidades del catálogo sin valores. */
export function csvPlantilla() {
  const filas = []
  for (const modelo of CATALOGO_APPLE.filter((item) => item.familia === 'iPhone')) {
    for (const capacidad of modelo.capacidades) filas.push([modelo.nombre, capacidad, 'Seminuevo', '', '', 'Sí'].map(celdaCsv).join(','))
  }
  return [ENCABEZADO_CSV.map(celdaCsv).join(','), ...filas].join('\r\n')
}

const norm = (texto) => normalizarClaveModelo(texto)

/**
 * Lee un CSV (coma, punto y coma o tabulación) y devuelve las filas para el
 * lote más los errores por línea. Filas sin valor base se omiten. No guarda nada.
 */
export function leerCsvValores(texto) {
  const tabla = parseDelimited(String(texto || '').replace(/^﻿/, ''))
  if (tabla.length < 2) return { rows: [], errores: ['El archivo no tiene filas para importar.'], omitidas: 0 }
  const encabezado = tabla[0].map(norm)
  const columna = (...nombres) => encabezado.findIndex((valor) => nombres.some((nombre) => valor === nombre))
  const col = {
    modelo: columna('modelo', 'model'), capacidad: columna('capacidad', 'storage'), condicion: columna('condicion', 'condition'),
    base: columna('valor base', 'base', 'basevaluepyg'), max: columna('valor maximo', 'maximo', 'max', 'maxvaluepyg'), activo: columna('activo', 'active', 'isactive'),
  }
  if (col.modelo < 0 || col.base < 0) return { rows: [], errores: ['El archivo necesita las columnas «Modelo» y «Valor base».'], omitidas: 0 }
  const rows = []
  const errores = []
  let omitidas = 0
  const vistos = new Set()
  tabla.slice(1).forEach((celdas, indice) => {
    const linea = indice + 2
    const dato = (columnaIndice) => (columnaIndice >= 0 ? String(celdas[columnaIndice] ?? '').trim() : '')
    const model = dato(col.modelo).replace(/\s+/g, ' ')
    if (!model) { omitidas += 1; return }
    const baseTexto = dato(col.base)
    if (!baseTexto) { omitidas += 1; return }
    const catalogo = modeloApple(model)
    const capacidadTexto = dato(col.capacidad)
    const storage = catalogo ? normalizarCapacidad(capacidadTexto) : capacidadTexto
    if (catalogo && !(catalogo.capacidades.length ? catalogo.capacidades.includes(storage) : !storage)) { errores.push(`Línea ${linea}: ${catalogo.nombre} no viene en ${capacidadTexto || 'esa capacidad'}.`); return }
    const condicion = CONDICION_POR_TEXTO[norm(dato(col.condicion) || 'seminuevo')]
    if (!condicion) { errores.push(`Línea ${linea}: condición «${dato(col.condicion)}» no reconocida (Nuevo, Seminuevo o Reacondicionado).`); return }
    const base = entero(baseTexto)
    if (base === null || base <= 0) { errores.push(`Línea ${linea}: el valor base «${baseTexto}» no es un monto válido.`); return }
    const maxTexto = dato(col.max)
    const max = maxTexto ? entero(maxTexto) : null
    if (maxTexto && (max === null || max < base)) { errores.push(`Línea ${linea}: el valor máximo debe ser un monto mayor o igual al base.`); return }
    const activoTexto = norm(dato(col.activo))
    const clave = claveValor(catalogo?.nombre || model, storage, condicion)
    if (vistos.has(clave)) { errores.push(`Línea ${linea}: ${model} ${storage} repetido en el archivo.`); return }
    vistos.add(clave)
    rows.push({ model: catalogo?.nombre || model, storage, condition: condicion, baseValuePyg: base, maxValuePyg: max, isActive: !['no', 'false', '0', 'inactivo'].includes(activoTexto) })
  })
  return { rows, errores, omitidas }
}

/** De un CSV leído, solo lo que cambia respecto de lo cargado (para el resumen antes de guardar). */
export function filasQueCambian(rows, valuaciones) {
  const indice = indexarValores(valuaciones)
  return rows.filter((fila) => {
    const actual = indice.get(claveValor(fila.model, fila.storage, fila.condition))
    return !actual || Number(actual.baseValuePyg) !== fila.baseValuePyg || (actual.maxValuePyg ?? null) !== fila.maxValuePyg || (actual.isActive !== false) !== fila.isActive
  })
}

// ---- Cotizador ----
/**
 * Capacidades del modelo con el rango de valor por condición. Solo cuenta lo
 * activo; sin valor cargado la capacidad queda sin rango (nunca se inventa).
 */
export function rangosPorCapacidad(valuaciones, modelo) {
  const catalogo = modeloApple(modelo)
  const nombre = catalogo?.nombre || modelo
  const clave = normalizarClaveModelo(nombre)
  const activos = (Array.isArray(valuaciones) ? valuaciones : []).filter((fila) => fila && fila.isActive !== false && (fila.modelKey || normalizarClaveModelo(fila.model)) === clave)
  const capacidades = catalogo ? (catalogo.capacidades.length ? [...catalogo.capacidades] : ['']) : [...new Set(activos.map((fila) => fila.storage || ''))]
  return capacidades.map((storage) => {
    const condiciones = {}
    for (const fila of activos) {
      if ((fila.storage || '') !== storage) continue
      condiciones[fila.condition] = { base: Number(fila.baseValuePyg), max: fila.maxValuePyg != null ? Number(fila.maxValuePyg) : null }
    }
    return { storage, condiciones }
  })
}

/** Rango legible de un valor de toma: «Gs 5.600.000 – Gs 6.200.000» o solo el base. */
export function textoRango(rango, formato) {
  if (!rango) return ''
  return rango.max && rango.max !== rango.base ? `${formato(rango.base)} – ${formato(rango.max)}` : formato(rango.base)
}
