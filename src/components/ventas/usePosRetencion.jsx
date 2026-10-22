import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { resources } from '@/lib/api'
import { deviceId } from '@/lib/deviceId'
import { obtenerCartId, soltarCartId } from '@/lib/posCart'
import { LATIDO_MS, debeLatir, desfaseReloj, diferenciaDeRetencion, segundosRestantes, serialesDelCarrito, vencimientoLocal } from '@/lib/posRetencion'
import { liberarAlSalir } from '@/lib/posRetencionApi'
import { registrarLiberadorDeRetenciones } from '@/lib/posRetencionRegistro'

// Retención de IMEI del carrito: estado, latido y liberación. Un solo lugar
// para el chip «Apartado · m:ss», el picker y los cierres del carrito.
// El contador usa el reloj del servidor (desfase medido en cada respuesta).
export const RetencionContext = createContext(null)
export const useRetencion = () => useContext(RetencionContext)

const esSinConexion = error => error?.code === 'NETWORK_ERROR' || error?.code === 'REQUEST_TIMEOUT'
const registrar = (contexto, error) => console.error(`[retencion] ${contexto}:`, error)

export function usePosRetencion({ items, empresaId, sucursalId, usuarioId, esDemo = false, onConflicto, onVencio }) {
  const [nonce, setNonce] = useState(0)
  // `nonce` fuerza un cartId nuevo cuando el carrito se cierra (venta, vaciado o suspensión).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cartId = useMemo(() => obtenerCartId(empresaId, sucursalId, usuarioId), [empresaId, sucursalId, usuarioId, nonce])
  const [holds, setHolds] = useState({}) // serial → { venceLocal: ms (reloj local), capped }
  const [perdidas, setPerdidas] = useState({}) // serial → { motivo: 'vencido' | 'tomada', mensaje }
  const [ahora, setAhora] = useState(() => Date.now())
  const [enLinea, setEnLinea] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false))
  const holdsRef = useRef(holds); holdsRef.current = holds
  const perdidasRef = useRef(perdidas); perdidasRef.current = perdidas
  const cartIdRef = useRef(cartId); cartIdRef.current = cartId
  const actividad = useRef(Date.now())
  const ultimoLatido = useRef(Date.now())
  const avisadas = useRef(new Set())
  const callbacks = useRef({ onConflicto, onVencio }); callbacks.current = { onConflicto, onVencio }
  const dispositivo = useMemo(() => deviceId(), [])

  const aplicar = useCallback((respuesta, { capped = false } = {}) => {
    const desfase = desfaseReloj(respuesta?.serverNow)
    setHolds(actual => {
      const siguiente = { ...actual }
      for (const unidad of respuesta?.held || []) {
        siguiente[unidad.serial] = { venceLocal: vencimientoLocal(unidad.reservedUntil, desfase), capped: Boolean(unidad.capped ?? capped) }
        avisadas.current.delete(unidad.serial)
      }
      return siguiente
    })
    setPerdidas(actual => {
      const siguiente = { ...actual }
      for (const unidad of respuesta?.held || []) delete siguiente[unidad.serial]
      return siguiente
    })
  }, [])

  /** Retiene un IMEI. Lanza con el mensaje del servidor («Retenida por Ana · 3:42») si no se puede. */
  const retener = useCallback(async serial => {
    if (!navigator.onLine) { setEnLinea(false); return { offline: true } }
    try {
      const respuesta = await resources.inventoryHolds.hold({ cartId: cartIdRef.current, deviceId: dispositivo, serials: [serial] })
      setEnLinea(true)
      aplicar(respuesta)
      return { ok: true }
    } catch (error) {
      if (esSinConexion(error)) { setEnLinea(false); return { offline: true } }
      throw error
    }
  }, [aplicar, dispositivo])

  const quitarLocal = useCallback(seriales => {
    setHolds(actual => { const siguiente = { ...actual }; for (const serial of seriales) delete siguiente[serial]; return siguiente })
    setPerdidas(actual => { const siguiente = { ...actual }; for (const serial of seriales) delete siguiente[serial]; return siguiente })
  }, [])

  /** Libera IMEI concretos (quitar línea, cambiar de equipo). Idempotente. */
  const liberar = useCallback(async seriales => {
    const lista = (Array.isArray(seriales) ? seriales : [seriales]).filter(Boolean)
    if (!lista.length) return
    quitarLocal(lista)
    try { await resources.inventoryHolds.release({ cartId: cartIdRef.current, serials: lista }) } catch (error) { registrar('liberar', error) }
  }, [quitarLocal])

  /** Libera un IMEI retenido por OTRO vendedor (solo gerencia: el servidor lo exige). */
  const liberarAjena = useCallback(async serial => {
    await resources.inventoryHolds.release({ serials: [serial] })
  }, [])

  /** Vaciar el carrito, cambiar de sucursal o suspender: suelta todo lo del carrito. */
  const liberarTodo = useCallback(async () => {
    const anterior = cartIdRef.current
    quitarLocal(Object.keys(holdsRef.current))
    try { await resources.inventoryHolds.release({ cartId: anterior }) } catch (error) { registrar('liberar todo', error) }
    soltarCartId(empresaId, sucursalId, usuarioId)
    setNonce(n => n + 1)
  }, [empresaId, sucursalId, usuarioId, quitarLocal])

  /** La venta se guardó: el servidor ya convirtió las retenciones; solo se olvida el carrito. */
  const olvidar = useCallback(() => {
    quitarLocal(Object.keys(holdsRef.current))
    soltarCartId(empresaId, sucursalId, usuarioId)
    setNonce(n => n + 1)
  }, [empresaId, sucursalId, usuarioId, quitarLocal])

  /** «Renovar» tras vencer: reintenta y explica si ya lo tomó otro. */
  const renovar = useCallback(async serial => {
    try {
      const resultado = await retener(serial)
      if (resultado.offline) return { ok: false, mensaje: 'Sin conexión: el equipo no queda retenido.' }
      return { ok: true }
    } catch (error) {
      const mensaje = error?.message || 'Ya no está disponible.'
      setPerdidas(actual => ({ ...actual, [serial]: { motivo: 'tomada', mensaje } }))
      return { ok: false, mensaje }
    }
  }, [retener])

  // Reconciliar: lo que el carrito tiene y no está retenido se retiene (al abrir el POS con
  // un carrito guardado o al retomar una venta suspendida); lo retenido que ya no está en el
  // carrito (quitar línea, cambiar de equipo) se libera.
  const serialesKey = serialesDelCarrito(items).join('|')
  useEffect(() => {
    if (!empresaId) return undefined
    const { retener: faltan, liberar: sobran } = diferenciaDeRetencion(serialesKey ? serialesKey.split('|') : [], Object.keys(holdsRef.current))
    const pendientes = faltan.filter(serial => !perdidasRef.current[serial])
    if (sobran.length) void liberar(sobran)
    if (!pendientes.length || !navigator.onLine) return undefined
    let vigente = true
    ;(async () => {
      for (const serial of pendientes) {
        if (!vigente) return
        try { await retener(serial) } catch (error) {
          if (!vigente) return
          const mensaje = error?.message || 'Ese IMEI ya no está disponible, elegí otro.'
          setPerdidas(actual => ({ ...actual, [serial]: { motivo: 'tomada', mensaje } }))
          callbacks.current.onConflicto?.(serial, mensaje)
        }
      }
    })()
    return () => { vigente = false }
  }, [serialesKey, empresaId, enLinea, retener, liberar])

  // Cambio de sucursal: se suelta lo de la sucursal anterior (el carrito es otro).
  const sucursalPrevia = useRef(sucursalId)
  const holdsPrevios = useRef(holds)
  holdsPrevios.current = holds
  useEffect(() => {
    if (sucursalPrevia.current === sucursalId) return
    const seriales = Object.keys(holdsPrevios.current)
    sucursalPrevia.current = sucursalId
    if (seriales.length) {
      quitarLocal(seriales)
      resources.inventoryHolds.release({ serials: seriales }).catch(error => registrar('cambio de sucursal', error))
    }
  }, [sucursalId, quitarLocal])

  // Actividad del vendedor y estado de la red.
  useEffect(() => {
    const marcar = () => { actividad.current = Date.now() }
    const eventos = ['pointerdown', 'keydown', 'touchstart', 'scroll']
    eventos.forEach(nombre => window.addEventListener(nombre, marcar, { passive: true, capture: true }))
    const enLineaOn = () => setEnLinea(true)
    const enLineaOff = () => setEnLinea(false)
    window.addEventListener('online', enLineaOn)
    window.addEventListener('offline', enLineaOff)
    return () => {
      eventos.forEach(nombre => window.removeEventListener(nombre, marcar, { capture: true }))
      window.removeEventListener('online', enLineaOn)
      window.removeEventListener('offline', enLineaOff)
    }
  }, [])

  const cantidad = Object.keys(holds).length

  // Contador: un tick por segundo, solo mientras haya algo retenido.
  useEffect(() => {
    if (!cantidad) return undefined
    const id = setInterval(() => setAhora(Date.now()), 1000)
    setAhora(Date.now())
    return () => clearInterval(id)
  }, [cantidad])

  // Aviso único al vencer cada apartado.
  useEffect(() => {
    for (const [serial, estado] of Object.entries(holds)) {
      if (segundosRestantes(estado.venceLocal, ahora) <= 0 && !avisadas.current.has(serial)) {
        avisadas.current.add(serial)
        callbacks.current.onVencio?.(serial)
      }
    }
  }, [ahora, holds])

  // Latido cada 60 s: solo con la pestaña visible y actividad reciente (tope de 60 min en el servidor).
  const latir = useCallback(async () => {
    const seriales = Object.keys(holdsRef.current)
    if (!debeLatir({ visible: document.visibilityState === 'visible', ultimaActividadMs: actividad.current, retenciones: seriales.length, enLinea: navigator.onLine })) return
    ultimoLatido.current = Date.now()
    try {
      const respuesta = await resources.inventoryHolds.renew({ cartId: cartIdRef.current, serials: seriales })
      aplicar(respuesta)
      const perdidos = respuesta?.lost || []
      if (perdidos.length) {
        setHolds(actual => { const siguiente = { ...actual }; for (const serial of perdidos) delete siguiente[serial]; return siguiente })
        setPerdidas(actual => { const siguiente = { ...actual }; for (const serial of perdidos) siguiente[serial] = { motivo: 'vencido', mensaje: 'El apartado venció.' }; return siguiente })
      }
    } catch (error) {
      if (esSinConexion(error)) setEnLinea(false)
      else registrar('latido', error)
    }
  }, [aplicar])
  useEffect(() => {
    if (!cantidad) return undefined
    const id = setInterval(latir, LATIDO_MS)
    const alVolver = () => { if (document.visibilityState === 'visible' && Date.now() - ultimoLatido.current > 30_000) void latir() }
    document.addEventListener('visibilitychange', alVolver)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', alVolver) }
  }, [cantidad > 0, latir]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cerrar la pestaña o la sesión: se suelta lo retenido (el TTL cubre lo que se escape).
  useEffect(() => {
    if (esDemo) return undefined
    const salir = () => { if (Object.keys(holdsRef.current).length) liberarAlSalir(cartIdRef.current) }
    window.addEventListener('pagehide', salir)
    const desregistrar = registrarLiberadorDeRetenciones(salir)
    return () => { window.removeEventListener('pagehide', salir); desregistrar() }
  }, [esDemo])

  const segundos = useCallback(serial => {
    const estado = holdsRef.current[serial]
    return estado ? segundosRestantes(estado.venceLocal, Date.now()) : null
  }, [])

  return useMemo(() => ({
    cartId, holds, perdidas, ahora, enLinea, cantidad,
    retener, liberar, liberarAjena, liberarTodo, olvidar, renovar, segundos,
  }), [cartId, holds, perdidas, ahora, enLinea, cantidad, retener, liberar, liberarAjena, liberarTodo, olvidar, renovar, segundos])
}
