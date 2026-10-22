import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { isDemoRuntime } from '@/lib/demoMode'
import { POLITICA_POR_DEFECTO, normalizarPolitica } from './comprobantePos.js'

// Política de verificación de pagos de la empresa, para el cobro del POS. Se
// pide una vez y se reutiliza un minuto (el cobro y el celular la comparten).
// Si no se puede leer queda `null`: el cobro no pide nada y es el servidor quien
// decide el estado del pago de todas formas.
const VIGENCIA_MS = 60_000
let cache = { valor: undefined, hasta: 0, promesa: null }

export function olvidarPoliticaVerificacion() {
  cache = { valor: undefined, hasta: 0, promesa: null }
}

export function cargarPoliticaVerificacion() {
  if (isDemoRuntime) return Promise.resolve(POLITICA_POR_DEFECTO)
  if (cache.valor !== undefined && Date.now() < cache.hasta) return Promise.resolve(cache.valor)
  if (cache.promesa) return cache.promesa
  const promesa = api.get('/api/payments/verification/policy')
    .then(raw => normalizarPolitica(raw))
    .catch(error => { console.error('[pos] no se pudo leer la política de verificación de pagos', error); return null })
    .then(valor => {
      cache = { valor, hasta: valor ? Date.now() + VIGENCIA_MS : 0, promesa: null }
      return valor
    })
  cache = { ...cache, promesa }
  return promesa
}

/** Política vigente (o null mientras carga / si no se pudo leer). */
export function usePoliticaVerificacion() {
  const [politica, setPolitica] = useState(() => (isDemoRuntime ? POLITICA_POR_DEFECTO : cache.valor ?? null))
  useEffect(() => {
    let vivo = true
    cargarPoliticaVerificacion().then(valor => { if (vivo) setPolitica(valor) })
    return () => { vivo = false }
  }, [])
  return politica
}
