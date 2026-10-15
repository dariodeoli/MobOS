import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api/client'
import { useSesion } from '@/lib/sesion'
import { CONFIG_VACIA, normalizarConfig, preferenciaEfectiva } from '@/lib/stockDisplay'

// Presentación del Stock (#448): colores por condición/depósito y orden por
// defecto. La empresa guarda la suya (GET/PUT /api/tenant/stock-display; en la
// demo, en este navegador) y cada usuario puede pisar el orden con la suya
// (se recuerda en su navegador). Un solo estado compartido por todas las listas.
const CLAVE_DEMO = 'mobos:demo-stock-display'
const clavePropia = (usuarioId) => `mobos:inventario:pref-display:${usuarioId || 'anon'}`

let cache = { empresa: null, cargando: false }
const oyentes = new Set()
const avisar = () => oyentes.forEach((fn) => fn())

const leerLocal = (clave) => {
  try { return normalizarConfig(JSON.parse(localStorage.getItem(clave) || 'null')) } catch { return CONFIG_VACIA }
}
const escribirLocal = (clave, valor) => {
  try { localStorage.setItem(clave, JSON.stringify(valor)) } catch { /* sin storage: queda solo en memoria */ }
}

/** Solo para pruebas: vuelve al estado inicial. */
export function reiniciarStockDisplay() {
  cache = { empresa: null, cargando: false }
  avisar()
}

export function useStockDisplay() {
  const { esDemo, usuario, sesion } = useSesion()
  const usuarioId = usuario?.id || sesion?.usuarioId || ''
  const [, forzar] = useState(0)
  const [propia, setPropia] = useState(() => leerLocal(clavePropia(usuarioId)))

  useEffect(() => {
    const fn = () => forzar((n) => n + 1)
    oyentes.add(fn)
    return () => { oyentes.delete(fn) }
  }, [])
  useEffect(() => { setPropia(leerLocal(clavePropia(usuarioId))) }, [usuarioId])

  useEffect(() => {
    if (cache.empresa || cache.cargando) return
    if (esDemo) {
      cache = { empresa: leerLocal(CLAVE_DEMO), cargando: false }
      avisar()
      return
    }
    cache = { ...cache, cargando: true }
    api.get('/api/tenant/stock-display')
      .then((datos) => { cache = { empresa: normalizarConfig(datos), cargando: false } })
      .catch((causa) => {
        console.error('[stock] no se pudo leer la presentación del stock', causa)
        cache = { empresa: CONFIG_VACIA, cargando: false }
      })
      .finally(avisar)
  }, [esDemo])

  const empresa = cache.empresa || CONFIG_VACIA
  const preferencia = useMemo(() => preferenciaEfectiva(empresa, propia), [empresa, propia])

  const guardarEmpresa = useCallback(async (siguiente) => {
    const limpio = normalizarConfig(siguiente)
    if (esDemo) escribirLocal(CLAVE_DEMO, limpio)
    else await api.put('/api/tenant/stock-display', limpio)
    cache = { empresa: limpio, cargando: false }
    avisar()
    return limpio
  }, [esDemo])

  const guardarPropia = useCallback((siguiente) => {
    const limpio = normalizarConfig({ ...siguiente, colores: {} })
    escribirLocal(clavePropia(usuarioId), limpio)
    setPropia(limpio)
  }, [usuarioId])

  return { empresa, propia, preferencia, colores: empresa, guardarEmpresa, guardarPropia, cargado: Boolean(cache.empresa) }
}
