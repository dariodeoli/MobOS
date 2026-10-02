import { useEffect, useState } from 'react'
import { Select, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { BLOQUEOS_MINUTOS } from '@/lib/preferencias'
import { activarWebPush, desactivarWebPush, estadoWebPush, webPushSoportado } from '@/lib/webPush'
import { api } from '@/lib/api'

const ETIQUETA_MINUTOS = {
  1: '1 minuto',
  5: '5 minutos',
  10: '10 minutos',
  15: '15 minutos',
  30: '30 minutos',
}

// Preferencias del dispositivo (Configuración → Sistema): minutos de bloqueo por
// inactividad y aviso de novedades. Se aplican al instante y quedan guardadas.
// El tema no vive acá: está en la barra superior y en el menú (#228).
export function PreferenciasContenido({ preferencias, onCambiar }) {
  return (
    <div className="space-y-5">
      <section>
        <label htmlFor="pref-bloqueo" className="text-sm font-semibold">Bloqueo por inactividad</label>
        <p className="mt-1 text-xs text-mute">La pantalla se bloquea sola después de este tiempo sin actividad.</p>
        <Select
          id="pref-bloqueo"
          className="mt-2 w-full"
          value={String(preferencias.bloqueoMinutos)}
          onChange={event => onCambiar({ bloqueoMinutos: Number(event.target.value) })}
        >
          {BLOQUEOS_MINUTOS.map(minutos => (
            <option key={minutos} value={minutos}>{ETIQUETA_MINUTOS[minutos] || `${minutos} minutos`}</option>
          ))}
        </Select>
      </section>

      <section>
        <label className="flex items-start gap-3 rounded-xl border border-ink-600 p-3">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={preferencias.notificaciones}
            onChange={event => onCambiar({ notificaciones: event.target.checked })}
          />
          <span>
            <span className="block text-sm font-semibold">Notificaciones</span>
            <span className="block text-xs text-mute">Mostrar el aviso de novedades: pedidos, aprobaciones, comentarios y menciones.</span>
          </span>
        </label>
      </section>

      <AvisosDelNavegador />
    </div>
  )
}

// A1 (#279) · Avisos del navegador: se activan con permiso explícito y el
// horario silencioso queda guardado por dispositivo en el panel. Sin claves
// VAPID la instalación lo explica y no se ofrece la suscripción.
function AvisosDelNavegador() {
  const toast = useToast()
  const [estado, setEstado] = useState({ soportado: webPushSoportado(), permiso: 'default', suscripto: false, configurado: true, cargando: true })
  const [horas, setHoras] = useState({ desde: 22, hasta: 7 })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let vigente = true
    ;(async () => {
      try {
        const clave = await api.get('/api/push/clave')
        const actual = await estadoWebPush()
        if (vigente) setEstado({ ...actual, configurado: Boolean(clave?.configurado), cargando: false })
      } catch {
        if (vigente) setEstado((actual) => ({ ...actual, cargando: false }))
      }
    })()
    return () => { vigente = false }
  }, [])

  async function alternar(activar) {
    if (busy) return
    setBusy(true)
    try {
      if (activar) {
        const resultado = await activarWebPush({ silencioDesde: horas.desde * 60, silencioHasta: horas.hasta * 60 })
        if (!resultado.ok) {
          const mensajes = {
            'no-soportado': 'Este navegador no admite avisos del sistema.',
            'sin-configurar': 'El envío de avisos no está configurado en esta instalación.',
            denegado: 'El navegador bloqueó el permiso: habilitalo desde el candado de la barra de direcciones.',
            'sin-permiso': 'No se otorgó el permiso de avisos.',
          }
          toast.error('No se pudieron activar los avisos', mensajes[resultado.motivo] || 'Probá de nuevo.')
        } else {
          toast.success('Avisos activados', 'Este dispositivo va a recibir novedades de MobOS.')
        }
      } else {
        await desactivarWebPush()
        toast.success('Avisos desactivados', 'Este dispositivo deja de recibir avisos.')
      }
      const actual = await estadoWebPush()
      setEstado((previo) => ({ ...previo, ...actual }))
    } finally {
      setBusy(false)
    }
  }

  const detalle = !estado.soportado
    ? 'Este navegador no admite avisos del sistema.'
    : !estado.configurado
      ? 'El envío de avisos no está configurado en esta instalación.'
      : estado.permiso === 'denied'
        ? 'El navegador bloqueó el permiso: habilitalo desde el candado de la barra de direcciones.'
        : 'Novedades (menciones, cotizaciones, recepción y pedidos) aunque la app esté cerrada.'

  return (
    <section>
      <label className="flex items-start gap-3 rounded-xl border border-ink-600 p-3">
        <input
          type="checkbox"
          className="mt-0.5"
          data-testid="pref-avisos"
          checked={Boolean(estado.suscripto)}
          disabled={busy || !estado.soportado || !estado.configurado || estado.permiso === 'denied'}
          onChange={(evento) => alternar(evento.target.checked)}
        />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-semibold"><Icon name="megaphone" className="h-3.5 w-3.5 text-mute" />Avisos del navegador</span>
          <span className="block text-xs text-mute" data-testid="pref-avisos-detalle">{estado.cargando ? 'Revisando el estado…' : detalle}</span>
        </span>
      </label>
      {estado.suscripto && (
        <div className="mt-2 flex flex-wrap items-center gap-3 rounded-xl border border-ink-600 p-3 text-xs text-mute">
          <span className="font-semibold text-fore">Horario silencioso</span>
          <label className="flex items-center gap-1.5">Desde
            <Select aria-label="Silencio desde" className="h-8 w-20" value={String(horas.desde)} onChange={(evento) => setHoras((previo) => ({ ...previo, desde: Number(evento.target.value) }))}>
              {Array.from({ length: 24 }, (_, hora) => <option key={hora} value={hora}>{String(hora).padStart(2, '0')}:00</option>)}
            </Select>
          </label>
          <label className="flex items-center gap-1.5">Hasta
            <Select aria-label="Silencio hasta" className="h-8 w-20" value={String(horas.hasta)} onChange={(evento) => setHoras((previo) => ({ ...previo, hasta: Number(evento.target.value) }))}>
              {Array.from({ length: 24 }, (_, hora) => <option key={hora} value={hora}>{String(hora).padStart(2, '0')}:00</option>)}
            </Select>
          </label>
          <button type="button" className="font-semibold text-fono-light underline" disabled={busy} onClick={() => alternar(true)}>Guardar horario</button>
        </div>
      )}
    </section>
  )
}
