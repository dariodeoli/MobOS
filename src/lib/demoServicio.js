// Datos ficticios del modo demo para Servicio Técnico (#194). Viven en el
// navegador: la demo muestra casos en distintos estados del pipeline, catálogo
// y checklists sin llamar al API real.
import { leerDemo, guardarDemo } from './demoStorage.js'
import { ORDENES_TALLER_DEMO } from './demo/taller.js'

const KEY = 'mobos:demo-servicio'

const SEED = {
  rows: [
    ...ORDENES_TALLER_DEMO,
  ],
  servicios: [
    { id: 'demo-serv-1', name: 'Cambio de batería', deviceType: 'iPhone', suggestedPricePyg: 250000, isActive: true },
    { id: 'demo-serv-2', name: 'Cambio de pantalla', deviceType: 'iPhone', suggestedPricePyg: 450000, isActive: true },
    { id: 'demo-serv-3', name: 'Limpieza interna', deviceType: 'Otros', suggestedPricePyg: 80000, isActive: true },
  ],
  checklists: {},
}


export function getDemoServicio() {
  try {
    const stored = JSON.parse(leerDemo(KEY) || 'null')
    if (stored && typeof stored === 'object') return { ...SEED, ...stored }
  } catch { /* datos corruptos: se vuelve al seed */ }
  return SEED
}

export function saveDemoServicio(parcial) {
  const actual = getDemoServicio()
  const siguiente = { ...actual, ...parcial }
  guardarDemo(KEY, JSON.stringify(siguiente))
  return siguiente
}

export function siguienteNumeroDemo(rows) {
  const numeros = rows.map((row) => Number(String(row.serviceNumber || '').replace(/\D/g, '')) || 0)
  return `OS-#${String(Math.max(0, ...numeros) + 1).padStart(4, '0')}`
}
