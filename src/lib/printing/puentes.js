// Modelo de puentes de impresión (sin dependencias de la app para poder
// testearlo con node --test). Un puente es una computadora con el agente;
// cada impresora puede elegir el suyo o usar el predeterminado.

export const URL_AGENTE_DEFECTO = 'http://127.0.0.1:17890'

const uuid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `puente-${Date.now()}-${Math.random().toString(16).slice(2)}`)

export const basePuente = () => ({ id: uuid(), nombre: 'Computadora puente', url: URL_AGENTE_DEFECTO, token: '', predeterminado: true })

// Stores viejos (url/token globales) migran a un puente predeterminado.
export const normalizarStore = (store) => {
  if (!store || !Array.isArray(store.impresoras)) return null
  if (Array.isArray(store.bridges) && store.bridges.length) return store
  const puente = { ...basePuente(), url: String(store.agentUrl || URL_AGENTE_DEFECTO), token: String(store.agentToken || '') }
  return { ...store, bridges: [puente] }
}

// Puente de una impresora: el suyo si existe, si no el predeterminado.
export const puenteDe = (store, impresora = null) => {
  const lista = Array.isArray(store?.bridges) ? store.bridges : []
  const elegido = lista.find((puente) => puente.id && puente.id === impresora?.bridgeId)
    || lista.find((puente) => puente.predeterminado)
    || lista[0]
  return elegido || { id: '', nombre: 'Computadora puente', url: store?.agentUrl || URL_AGENTE_DEFECTO, token: store?.agentToken || '' }
}

// Deja un solo predeterminado y descarta puentes sin dirección.
export const normalizarPuentes = (bridges) => {
  const lista = (Array.isArray(bridges) ? bridges : []).filter((puente) => String(puente?.url || '').trim())
  let yaHay = false
  lista.forEach((puente) => {
    if (puente.predeterminado) { if (yaHay) puente.predeterminado = false; yaHay = true }
  })
  if (!yaHay && lista.length) lista[0].predeterminado = true
  return lista
}
