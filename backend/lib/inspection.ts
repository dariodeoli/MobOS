// #240 PhoneCheck: normalización de la inspección de una unidad.
//
// La ficha (INV) manda el checklist por clave — `{ pantalla: { estado, nota } }`
// — y la impresión/exportaciones históricas lo esperan como lista. Acá queda
// una sola forma persistida (objeto por clave: la que leen la ficha, el informe
// y el certificado), la lista derivada para el informe impreso, y el
// puntaje/grado calculados con la misma regla que muestra la UI:
// OK=1 · observación=0,5 · falla=0 · N/A no cuenta; A ≥ 90, B ≥ 75.

export type InspectionItem = { estado?: string; nota?: string }
export type InspectionItems = Record<string, InspectionItem>
export type InspectionListItem = { clave: string; estado: string; nota: string }

const ESTADOS: Record<string, number | null> = { ok: 1, observacion: 0.5, falla: 0, na: null }

// Rótulos del checklist (mismo catálogo que la ficha: src/lib/phonecheck.js).
// El informe público y el certificado necesitan el nombre legible de cada clave.
export const ETIQUETAS_ITEMS: Record<string, string> = {
  pantalla: 'Pantalla / táctil',
  camaras: 'Cámaras (frontal y traseras)',
  faceId: 'Face ID / Touch ID',
  audio: 'Altavoces y micrófono',
  sensores: 'Sensores',
  botones: 'Botones y vibración',
  conexiones: 'WiFi / Bluetooth / GPS',
  carga: 'Carga y puerto',
  bateria: 'Batería',
  carcasa: 'Carcasa y chasis',
}

/** Un ítem cuenta como conforme con OK o «no aplica» (igual que la UI). */
export function itemConforme(estado: unknown): boolean {
  return ['ok', 'na'].includes(String(estado || ''))
}

/**
 * Checklist listo para el informe público: ítems marcados con su rótulo, el
 * resumen de conformes y las notas **solo de los ítems no OK** (contrato de
 * privacidad del informe: el resto viaja sin texto).
 */
export function checklistPublico(items: InspectionItems): { puntaje: number | null; aprobados: number; evaluados: number; items: { label: string; estado: string; nota: string }[] } | null {
  const marcados = itemsLista(items).filter((item) => item.estado)
  if (!marcados.length) return null
  const { puntaje } = resumenInspection(items)
  return {
    puntaje,
    aprobados: marcados.filter((item) => itemConforme(item.estado)).length,
    evaluados: marcados.length,
    items: marcados.map((item) => ({
      label: ETIQUETAS_ITEMS[item.clave] || item.clave,
      estado: item.estado,
      nota: itemConforme(item.estado) ? '' : item.nota,
    })),
  }
}

function limpiarItem(fila: unknown): InspectionItem {
  const valor = fila && typeof fila === 'object' && !Array.isArray(fila) ? (fila as Record<string, unknown>) : {}
  const item: InspectionItem = {}
  if (valor.estado !== undefined && valor.estado !== null) item.estado = String(valor.estado)
  if (valor.nota !== undefined && valor.nota !== null) item.nota = String(valor.nota)
  return item
}

/** Acepta el checklist por clave (UI) o la lista histórica y devuelve el objeto persistido. */
export function normalizarInspectionItems(valor: unknown): InspectionItems {
  const items: InspectionItems = {}
  if (Array.isArray(valor)) {
    for (const fila of valor) {
      if (!fila || typeof fila !== 'object') continue
      const clave = String((fila as Record<string, unknown>).clave || '').trim()
      if (!clave) continue
      items[clave] = limpiarItem(fila)
    }
    return items
  }
  if (valor && typeof valor === 'object') {
    for (const [clave, fila] of Object.entries(valor as Record<string, unknown>)) {
      const nombre = String(clave).trim()
      if (!nombre) continue
      items[nombre] = limpiarItem(fila)
    }
  }
  return items
}

/** Lista con la que el informe impreso recorre el checklist (incluye la clave). */
export function itemsLista(items: InspectionItems): InspectionListItem[] {
  return Object.entries(items).map(([clave, fila]) => ({ clave, estado: fila.estado || '', nota: fila.nota || '' }))
}

/** Puntaje 0-100 del checklist (null si no hay ítems aplicables). */
export function puntajeInspection(items: InspectionItems): number | null {
  let suma = 0
  let cuenta = 0
  for (const fila of Object.values(items)) {
    const valor = ESTADOS[String(fila?.estado || '')]
    if (valor === null || valor === undefined) continue
    suma += valor
    cuenta += 1
  }
  if (!cuenta) return null
  return Math.round((suma / cuenta) * 100)
}

/** Grado A/B/C a partir del puntaje (A ≥ 90, B ≥ 75, C el resto). */
export function gradoInspection(puntaje: number | null): 'A' | 'B' | 'C' | null {
  if (puntaje === null || puntaje === undefined) return null
  if (puntaje >= 90) return 'A'
  if (puntaje >= 75) return 'B'
  return 'C'
}

export function resumenInspection(items: InspectionItems): { puntaje: number | null; grado: 'A' | 'B' | 'C' | null } {
  const puntaje = puntajeInspection(items)
  return { puntaje, grado: gradoInspection(puntaje) }
}
