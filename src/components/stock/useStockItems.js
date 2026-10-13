// Carga de la lista unificada de Stock (U3): GET /api/stock/items con cursor,
// filtros y totales. Cada cambio de filtros vuelve a la primera página;
// «Cargar más» suma la siguiente con el `nextCursor` de la última respuesta.
import { useCallback, useEffect, useRef, useState } from 'react'
import { resources } from '@/lib/api'
import { paramsStockItems } from '@/lib/stockItems'

const PAGINA = 50
const MAXIMO_RECARGA = 200
const VACIO = { items: [], totals: null, nextCursor: null, hasMore: false }

/**
 * @param {{ activo?: boolean, filtros: object, pagina?: number }} opciones
 *   `filtros` = { tipo, estado, sucursal, proveedor, q, producto, desde, hasta }
 */
export function useStockItems({ activo = true, filtros, pagina = PAGINA }) {
  const [datos, setDatos] = useState(VACIO)
  const [cargando, setCargando] = useState(Boolean(activo))
  const [cargandoMas, setCargandoMas] = useState(false)
  const [error, setError] = useState('')
  const secuencia = useRef(0)
  const filtrosRef = useRef(filtros)
  const datosRef = useRef(datos)
  filtrosRef.current = filtros
  datosRef.current = datos
  const clave = JSON.stringify(filtros)

  const pedir = useCallback(async ({ cursor = '', limit = pagina } = {}) => {
    return resources.stockItems.list(paramsStockItems(filtrosRef.current, { limit, cursor }))
  }, [pagina])

  // Primera página: al abrir la lista o al cambiar cualquier filtro.
  useEffect(() => {
    if (!activo) return undefined
    const mia = ++secuencia.current
    setCargando(true); setError('')
    pedir()
      .then((respuesta) => {
        if (mia !== secuencia.current) return
        setDatos({ items: respuesta?.items || [], totals: respuesta?.totals || null, nextCursor: respuesta?.nextCursor || null, hasMore: Boolean(respuesta?.hasMore) })
      })
      .catch((causa) => {
        if (mia !== secuencia.current) return
        console.error('[stock] no se pudo cargar la lista', causa)
        setDatos(VACIO)
        setError(causa?.message || 'No se pudo cargar el stock.')
      })
      .finally(() => { if (mia === secuencia.current) setCargando(false) })
    return () => { secuencia.current += 1 }
  }, [activo, clave, pedir])

  const cargarMas = useCallback(async () => {
    const actual = datosRef.current
    if (!actual.hasMore || !actual.nextCursor || cargandoMas) return
    const mia = ++secuencia.current
    setCargandoMas(true); setError('')
    try {
      const respuesta = await pedir({ cursor: actual.nextCursor })
      if (mia !== secuencia.current) return
      setDatos((previo) => {
        const vistos = new Set(previo.items.map((item) => item.id))
        const nuevos = (respuesta?.items || []).filter((item) => !vistos.has(item.id))
        return { items: [...previo.items, ...nuevos], totals: respuesta?.totals || previo.totals, nextCursor: respuesta?.nextCursor || null, hasMore: Boolean(respuesta?.hasMore) }
      })
    } catch (causa) {
      if (mia !== secuencia.current) return
      console.error('[stock] no se pudo cargar más', causa)
      setError(causa?.message || 'No se pudo cargar más stock.')
    } finally {
      if (mia === secuencia.current) setCargandoMas(false)
    }
  }, [cargandoMas, pedir])

  // Tras una acción (reservar, dar de baja…) vuelve a pedir lo ya cargado de una
  // sola vez (hasta 200 filas) para no perder la posición de la lista.
  const recargar = useCallback(async () => {
    if (!activo) return
    const mia = ++secuencia.current
    const limit = Math.min(MAXIMO_RECARGA, Math.max(pagina, datosRef.current.items.length))
    try {
      const respuesta = await pedir({ limit })
      if (mia !== secuencia.current) return
      setDatos({ items: respuesta?.items || [], totals: respuesta?.totals || null, nextCursor: respuesta?.nextCursor || null, hasMore: Boolean(respuesta?.hasMore) })
      setError('')
    } catch (causa) {
      if (mia !== secuencia.current) return
      console.error('[stock] no se pudo actualizar la lista', causa)
      setError(causa?.message || 'No se pudo actualizar el stock.')
    }
  }, [activo, pagina, pedir])

  return {
    items: datos.items,
    totals: datos.totals,
    total: datos.totals?.total ?? datos.items.length,
    hasMore: datos.hasMore,
    cargando,
    cargandoMas,
    error,
    cargarMas,
    recargar,
  }
}
