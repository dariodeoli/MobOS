import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { clientePlantillas, identidadPlantillas } from '@/lib/api/printTemplates'
export default function usePlantillasEmpresa(kind = '') {
  const { usuario, empresa, sucursal, esDemo } = useSesion()
  const contexto = {
    empresaId: empresa?.id || usuario?.tenantId,
    userId: usuario?.id,
    sucursalId: sucursal?.id || null,
    role: usuario?.role,
    permissions: usuario?.permissions || [],
  }
  const signature = identidadPlantillas(contexto),
    current = useRef(contexto),
    mounted = useRef(true),
    generation = useRef(0),
    lock = useRef(null)
  current.current = contexto
  const lifecycle = useMemo(() => Symbol(`${signature}:${esDemo}`), [signature, esDemo])
  const binding = useRef(lifecycle)
  binding.current = lifecycle
  const client = useMemo(() => {
    const [empresaId, userId, sucursalId, role, permissions] = JSON.parse(signature)
    return clientePlantillas(
      { empresaId, userId, sucursalId, role, permissions },
      {
        demo: esDemo,
        actual: () => (mounted.current && binding.current === lifecycle ? current.current : null),
      },
    )
  }, [signature, esDemo, lifecycle])
  const [state, setState] = useState({
    templates: [],
    presets: [],
    effective: {},
    loading: true,
    busy: false,
    error: '',
    notice: '',
    scope: signature,
  })
  const valid = useCallback(
    () =>
      mounted.current &&
      binding.current === lifecycle &&
      identidadPlantillas(current.current) === signature,
    [signature, lifecycle],
  )
  const load = useCallback(async () => {
    const request = ++generation.current
    if (valid()) setState(s => ({ ...s, loading: true, error: '' }))
    try {
      const [list, defaults] = await Promise.all([client.list(kind), client.defaults()])
      if (valid() && request === generation.current)
        setState(s => ({ ...s, ...list, effective: defaults.effective || {}, loading: false }))
    } catch (error) {
      if (valid() && request === generation.current && error.code !== 'CONTEXT_CHANGED')
        setState(s => ({ ...s, loading: false, error: error.message }))
    }
  }, [client, kind, valid])
  useEffect(() => {
    mounted.current = true
    lock.current = null
    setState({
      templates: [],
      presets: [],
      effective: {},
      loading: true,
      busy: false,
      error: '',
      notice: '',
      scope: signature,
    })
    void load()
    const counter = generation
    return () => {
      mounted.current = false
      counter.current++
    }
  }, [load, signature])
  const mutate = async (method, args, notice) => {
    if (lock.current || !valid()) return null
    const marker = Symbol('mutation')
    lock.current = marker
    setState(s => ({ ...s, busy: true, error: '', notice: '', scope: signature }))
    try {
      const result = await client[method](...args)
      if (!valid()) return null
      setState(s => ({ ...s, notice }))
      await load()
      // El diseño predeterminado de cotización, remito y ticket se recarga en la sesión.
      window.dispatchEvent(new Event('mobos:print-templates-updated'))
      return result
    } catch (error) {
      if (valid() && error.code !== 'CONTEXT_CHANGED')
        setState(s => ({
          ...s,
          error:
            error.status === 409
              ? 'Otra sesión cambió la plantilla. Cerrá el editor y actualizá antes de guardar.'
              : error.message,
        }))
      return null
    } finally {
      if (lock.current === marker) {
        lock.current = null
        if (valid()) setState(s => ({ ...s, busy: false }))
      }
    }
  }
  const visible =
    state.scope === signature
      ? state
      : {
          templates: [],
          presets: [],
          effective: {},
          loading: true,
          busy: false,
          error: '',
          notice: '',
        }
  return {
    ...visible,
    contexto,
    signature,
    esDemo,
    puedeEditar: contexto.role === 'ADMIN',
    recargar: load,
    mutate,
  }
}
