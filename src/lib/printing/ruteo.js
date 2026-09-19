// Router local↔remoto de impresión, sin dependencias de la app para poder
// testearlo con node --test (mismo criterio que puentes.js). Local primero:
// solo imprime por 127.0.0.1 la computadora que tiene el agente y la impresora
// asignada a su puente; cualquier otro dispositivo encola remoto.
import { URL_AGENTE_DEFECTO, puenteDe } from './puentes.js'

const LOOPBACK_RE = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/i

export const esLoopback = (url) => LOOPBACK_RE.test(String(url || '').trim())

// URL efectiva del puente de una impresora: la suya si la tiene; si el espejo
// del backend no trae URL (el agente abre la conexión saliente), la del agente
// de esta computadora.
export function urlDePuente(store, impresora) {
  const puente = puenteDe(store, impresora)
  return String(puente?.url || store?.agentUrl || URL_AGENTE_DEFECTO)
}

/**
 * Decide el camino de un trabajo. Local solo cuando ESTE dispositivo tiene el
 * agente (loopback responde) y la impresora pertenece a su puente; en cualquier
 * otro dispositivo, o si la impresora es de otro puente, va remoto.
 */
export function resolverCamino(store, impresora, { disponible = false } = {}) {
  if (!disponible) return { camino: 'remoto', motivo: 'sin-agente-local' }
  const localBridgeId = String(store?.localBridgeId || '')
  const bridgeId = String(impresora?.bridgeId || '')
  if (localBridgeId && bridgeId && bridgeId !== localBridgeId) return { camino: 'remoto', motivo: 'otro-puente' }
  if (!esLoopback(urlDePuente(store, impresora))) return { camino: 'remoto', motivo: 'puente-no-local' }
  return { camino: 'local', motivo: 'agente-local' }
}

// El respaldo HTML (diálogo del navegador) solo corresponde cuando el fallo
// fue CLARO: nada se envió ni quedó encolado. Tras un resultado incierto,
// encolado o remoto, abrir el diálogo duplicaría el ticket.
const MOTIVOS_RESPALDO = ['fallo', 'sin-impresora', 'agente-no-disponible']

export const puedeCaerAlDialogo = (resultado) => !resultado?.ok && MOTIVOS_RESPALDO.includes(resultado?.motivo)
