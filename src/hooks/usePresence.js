import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { presenciaApi } from '@/lib/api/presence'
import { alcanceDeRuta, INTERVALO_LATIDO_MS, estaEnLinea } from '@/lib/presence'
import { isDemoRuntime } from '@/lib/demoMode'

// Envía el latido de esta pestaña cada 30 s (solo con la app visible) y marca
// actividad real con puntero/teclado/scroll. El alcance es la sección abierta.
export function usePresenceTracker() {
  const { pathname } = useLocation()
  const alcance = useRef(alcanceDeRuta(pathname))
  useEffect(() => { alcance.current = alcanceDeRuta(pathname) }, [pathname])
  useEffect(() => {
    // La demo pública no tiene presencia real: no late ni consulta (#192).
    if (isDemoRuntime) return undefined
    let tabId = ''
    try { tabId = crypto.randomUUID() } catch { tabId = `tab-${Date.now()}-${Math.random().toString(16).slice(2)}` }
    let ultimaActividad = -Infinity, enviando = false, detenido = false
    const tocar = () => { ultimaActividad = Date.now() }
    const latir = async () => {
      if (enviando || detenido) return
      enviando = true
      const visible = document.visibilityState === 'visible'
      try {
        await presenciaApi.latir({ tabId, scope: alcance.current, visible, active: visible && Date.now() - ultimaActividad < INTERVALO_LATIDO_MS })
      } catch {
        // La presencia es informativa: si falla, la app sigue igual.
      } finally {
        enviando = false
      }
    }
    const eventos = ['pointerdown', 'keydown', 'scroll', 'touchstart']
    eventos.forEach((evento) => window.addEventListener(evento, tocar, { passive: true }))
    const visibilidad = () => { void latir() }
    document.addEventListener('visibilitychange', visibilidad)
    void latir()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void latir() }, INTERVALO_LATIDO_MS)
    return () => {
      detenido = true
      window.clearInterval(timer)
      eventos.forEach((evento) => window.removeEventListener(evento, tocar))
      document.removeEventListener('visibilitychange', visibilidad)
    }
  }, [])
}

// Personas en línea de la empresa. Se refresca cada 30 s, no consulta con la
// pestaña oculta y filtra por la ventana de 75 s del lado del cliente.
export function usePresentes({ intervaloMs = INTERVALO_LATIDO_MS } = {}) {
  const [personas, setPersonas] = useState([])
  useEffect(() => {
    // La demo pública no comparte presencia con la empresa real (#192).
    if (isDemoRuntime) { setPersonas([]); return undefined }
    let vivo = true, cargando = false, controller
    const cargar = async () => {
      if (!vivo || cargando || document.visibilityState !== 'visible') return
      cargando = true
      controller = new AbortController()
      try {
        const data = await presenciaApi.personas()
        if (vivo) setPersonas(Array.isArray(data?.people) ? data.people.filter((persona) => estaEnLinea(persona.lastSeenAt)) : [])
      } catch {
        if (vivo) setPersonas([])
      } finally {
        cargando = false
      }
    }
    void cargar()
    const timer = window.setInterval(() => void cargar(), intervaloMs)
    document.addEventListener('visibilitychange', cargar)
    return () => { vivo = false; window.clearInterval(timer); controller?.abort(); document.removeEventListener('visibilitychange', cargar) }
  }, [intervaloMs])
  return personas
}
