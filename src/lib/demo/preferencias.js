// Preferencias de la tienda en la demo (mismo contrato que
// `GET/PUT /api/tenant/preferences`): archivado automático de pedidos y saldo
// a favor en el portal. Viven en la memoria de la pestaña y vuelven a los
// valores de fábrica al salir de la demo.
import { guardarDemo, leerDemo } from '../demoStorage.js'

const KEY = 'mobos:demo-preferencias:v1'

export const PREFERENCIAS_DEMO = Object.freeze({
  orders: Object.freeze({ autoArchivePrepared: false }),
  portal: Object.freeze({ showStoreCredit: true }),
})

const copia = (prefs) => ({ orders: { ...prefs.orders }, portal: { ...prefs.portal } })

export function getDemoPreferencias() {
  try {
    const guardado = JSON.parse(leerDemo(KEY))
    if (guardado && typeof guardado === 'object') {
      return {
        orders: { ...PREFERENCIAS_DEMO.orders, ...(guardado.orders || {}) },
        portal: { ...PREFERENCIAS_DEMO.portal, ...(guardado.portal || {}) },
      }
    }
  } catch { /* dato dañado: valores de fábrica */ }
  return copia(PREFERENCIAS_DEMO)
}

/** Aplica un cambio parcial ({ orders } o { portal }) con booleanos y devuelve todo. */
export function setDemoPreferencias(cambios = {}) {
  const actual = getDemoPreferencias()
  const siguiente = copia(actual)
  if (typeof cambios?.orders?.autoArchivePrepared === 'boolean') siguiente.orders.autoArchivePrepared = cambios.orders.autoArchivePrepared
  if (typeof cambios?.portal?.showStoreCredit === 'boolean') siguiente.portal.showStoreCredit = cambios.portal.showStoreCredit
  guardarDemo(KEY, JSON.stringify(siguiente))
  return siguiente
}
