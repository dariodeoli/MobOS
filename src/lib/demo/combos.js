// Demo · combos del catálogo (paquetes con precio fijo). Viven en memoria de la
// sesión: crear, activar o desactivar un combo se ve igual en el gestor y en el POS.
import { guardarDemo, leerDemo } from '../demoStorage.js'

const KEY = 'mobos:demo-combos:v1'

function leer() {
  try {
    const guardado = JSON.parse(leerDemo(KEY) || 'null')
    if (Array.isArray(guardado)) return guardado
  } catch { /* dato dañado: se vuelve a vacío */ }
  return []
}

/** GET /api/combos (`todos` incluye los inactivos). */
export function listarCombosDemo(todos = false) {
  return leer().filter((combo) => todos || combo.isActive)
}

export function crearComboDemo({ name, pricePyg, items = [] }) {
  const combo = { id: `demo-combo-${Date.now().toString(36)}`, name, pricePyg, isActive: true, items: items.map((item) => ({ productId: item.productId, quantity: item.quantity })), createdAt: new Date().toISOString() }
  guardarDemo(KEY, JSON.stringify([combo, ...leer()]))
  return combo
}

export function actualizarComboDemo({ id, ...cambios }) {
  const lista = leer()
  const i = lista.findIndex((combo) => combo.id === id)
  if (i < 0) throw new Error('El combo demo no existe.')
  lista[i] = { ...lista[i], ...cambios }
  guardarDemo(KEY, JSON.stringify(lista))
  return lista[i]
}
