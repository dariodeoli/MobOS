import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { demoSessionActive, demoSessionRole } from '@/lib/demoMode'
import { enviarEvento, esEnlaceDeRegistro, moduloDeRuta, scrollMaximoPct, utmDeBusqueda } from '@/lib/trafico'

// Medición anónima del sitio público (`kind="landing"`) y de la demo
// (`kind="demo"`). No renderiza nada, no espera a nadie y no hace nada con DNT.
// Ver src/lib/trafico.js para las reglas de privacidad.
const CLAVE_INICIO_DEMO = 'mobos:trafico:demo-inicio'

function referenteExterno() {
  try {
    if (!document.referrer) return ''
    return new URL(document.referrer).origin === window.location.origin ? '' : document.referrer
  } catch { return '' }
}

function yaIniciada() {
  try { return sessionStorage.getItem(CLAVE_INICIO_DEMO) === '1' } catch { return true }
}

export default function TraficoSitio({ kind }) {
  const { pathname, search } = useLocation()
  const estado = useRef({ visibleMs: 0, desde: 0, scroll: 0, enviado: false, primera: true })

  // Tiempo visible, scroll máximo y envío de cierre (una vez por vista / sesión de demo).
  useEffect(() => {
    const s = estado.current
    s.desde = document.visibilityState === 'visible' ? Date.now() : 0
    const medirScroll = () => {
      const alto = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0)
      s.scroll = Math.max(s.scroll, scrollMaximoPct({ scrollTop: window.scrollY, altoVentana: window.innerHeight, altoDocumento: alto }))
    }
    const alOcultar = () => {
      if (document.visibilityState === 'hidden') {
        if (s.desde) { s.visibleMs += Date.now() - s.desde; s.desde = 0 }
        cerrar()
      } else if (!s.desde) {
        s.desde = Date.now()
        s.enviado = false
      }
    }
    const cerrar = () => {
      if (s.enviado) return
      if (s.desde) { s.visibleMs += Date.now() - s.desde; s.desde = Date.now() }
      const duracion = Math.round(s.visibleMs / 1000)
      if (duracion < 1) return
      s.enviado = true
      if (kind === 'landing') enviarEvento({ kind: 'landing', name: 'engage', path: pathname, durationSec: duracion, scrollPct: s.scroll })
      else if (demoSessionActive()) enviarEvento({ kind: 'demo', name: 'demo_end', role: demoSessionRole(), durationSec: duracion })
    }
    const alClic = evento => {
      const enlace = evento.target instanceof Element ? evento.target.closest('a[href]') : null
      if (!enlace || !esEnlaceDeRegistro(enlace.getAttribute('href'))) return
      enviarEvento({ kind: kind === 'demo' && demoSessionActive() ? 'demo' : 'landing', name: 'cta_registro', path: pathname })
    }
    window.addEventListener('scroll', medirScroll, { passive: true })
    document.addEventListener('visibilitychange', alOcultar)
    window.addEventListener('pagehide', cerrar)
    document.addEventListener('click', alClic, true)
    return () => {
      window.removeEventListener('scroll', medirScroll)
      document.removeEventListener('visibilitychange', alOcultar)
      window.removeEventListener('pagehide', cerrar)
      document.removeEventListener('click', alClic, true)
    }
  }, [kind, pathname])

  // Una vista por carga/cambio de ruta (landing) y el inicio + módulos de la demo.
  useEffect(() => {
    const s = estado.current
    try {
      if (kind === 'landing') {
        enviarEvento({ kind: 'landing', name: 'pageview', path: pathname, referrer: s.primera ? referenteExterno() : '', utmSource: s.primera ? utmDeBusqueda(search) : null })
      } else if (kind === 'demo' && demoSessionActive()) {
        const rol = demoSessionRole()
        if (!yaIniciada()) {
          try { sessionStorage.setItem(CLAVE_INICIO_DEMO, '1') } catch { /* sin storage */ }
          enviarEvento({ kind: 'demo', name: 'demo_start', role: rol, path: pathname })
        }
        enviarEvento({ kind: 'demo', name: 'demo_view', role: rol, module: moduloDeRuta(pathname), path: pathname })
      }
    } catch { /* la medición jamás rompe la página */ }
    s.primera = false
  }, [kind, pathname, search])

  return null
}
