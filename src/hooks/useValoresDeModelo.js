import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { listarValuacionesDemo } from '@/lib/demo/valuaciones'
import { normalizarModelo } from '@/utils/tradeInCheckout'

/**
 * Valores de toma de un modelo (todas las capacidades y condiciones) de la
 * empresa, o los de la demo. Se consulta con retraso mientras se escribe.
 * `estado`: idle | buscando | listo | error.
 */
export function useValoresDeModelo(modelo, { demo = false, activo = true } = {}) {
  const [valores, setValores] = useState([])
  const [estado, setEstado] = useState('idle')
  useEffect(() => {
    const nombre = String(modelo || '').trim()
    const clave = normalizarModelo(nombre)
    if (!activo || clave.length < 2) { setValores([]); setEstado('idle'); return undefined }
    if (demo) {
      setValores(listarValuacionesDemo().filter((fila) => fila.modelKey.includes(clave)))
      setEstado('listo')
      return undefined
    }
    const controller = new AbortController()
    setEstado('buscando')
    const timer = setTimeout(() => {
      api.get(`/api/device-valuations?${new URLSearchParams({ model: nombre })}`, { signal: controller.signal })
        .then((rows) => { setValores(Array.isArray(rows) ? rows : []); setEstado('listo') })
        .catch((error) => {
          if (error?.code === 'REQUEST_ABORTED') return
          setValores([]); setEstado('error')
        })
    }, 350)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [modelo, demo, activo])
  return { valores, estado }
}
