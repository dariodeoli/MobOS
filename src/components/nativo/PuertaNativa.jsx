import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '@/components/shared/Icon'
import ThemeLogo from '@/components/app/ThemeLogo'
import { Button } from '@/components/ui'
import { Modal } from '@/components/shared/popupKit'
import { api } from '@/lib/api'
import { useSesion } from '@/lib/sesion'
import { APP_STORE_URL, requiereActualizar, versionApp } from '@/lib/plataforma'
import { activarPush, alTocarNotificacion, estadoPermisoPush, previoRespondido, recordarPrevio } from '@/lib/nativo/push'
import { PIE_ACCIONES } from '@/components/shared/formulario'

// Capa nativa de la app de iPhone. Se monta una sola vez dentro del router y
// del proveedor de sesión y resuelve, en este orden:
//   1. «Actualizá MobOS» bloqueante si la versión instalada es menor a la
//      mínima que publica el API (GET /api/config → minVersion.ios).
//   2. Pantalla «Sin conexión» mientras no hay red y todavía no hay sesión
//      (con sesión, el modo offline del POS conserva la cola de ventas).
//   3. Toque de una notificación push → ruta interna del pedido.
//   4. Aviso previo de notificaciones, en contexto, tras el primer ingreso.

function useEnLinea() {
  const [enLinea, setEnLinea] = useState(typeof navigator === 'undefined' ? true : navigator.onLine !== false)
  useEffect(() => {
    let handle = null
    let activo = true
    const actualizar = () => setEnLinea(navigator.onLine !== false)
    window.addEventListener('online', actualizar)
    window.addEventListener('offline', actualizar)
    import('@capacitor/network').then(async ({ Network }) => {
      const estado = await Network.getStatus()
      if (activo) setEnLinea(Boolean(estado.connected))
      handle = await Network.addListener('networkStatusChange', (e) => { if (activo) setEnLinea(Boolean(e.connected)) })
    }).catch(() => { /* sin plugin: valen los eventos del navegador */ })
    return () => {
      activo = false
      window.removeEventListener('online', actualizar)
      window.removeEventListener('offline', actualizar)
      handle?.remove?.()
    }
  }, [])
  return enLinea
}

function useVersionMinima(reintento) {
  const [minima, setMinima] = useState('')
  useEffect(() => {
    let activo = true
    api.get('/api/config', { cacheMs: 0 })
      .then((config) => { if (activo) setMinima(String(config?.minVersion?.ios || '')) })
      // Sin red o sin endpoint: no se bloquea a nadie por no poder consultar.
      .catch(() => {})
    return () => { activo = false }
  }, [reintento])
  return minima
}

function PantallaCompleta({ testId, icono, titulo, children }) {
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="puerta-titulo" data-testid={testId} className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-4 bg-paper px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] text-center">
      <ThemeLogo className="h-8 w-auto" />
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-fono/10 text-fono-light"><Icon name={icono} className="h-6 w-6" /></span>
      <h1 id="puerta-titulo" className="text-xl font-bold">{titulo}</h1>
      {children}
    </div>
  )
}

export function PantallaActualizar({ minima }) {
  return (
    <PantallaCompleta testId="actualizar-app" icono="refresh" titulo="Actualizá MobOS">
      <p className="max-w-sm text-sm text-mute">
        Esta versión ({versionApp()}) ya no se puede usar{minima ? `: necesitás la ${minima} o una más nueva` : ''}. Actualizala desde la App Store para seguir trabajando.
      </p>
      <a href={APP_STORE_URL} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-fono px-6 text-base font-semibold text-white" data-testid="actualizar-app-enlace">Abrir la App Store</a>
    </PantallaCompleta>
  )
}

export function PantallaSinRed({ onReintentar }) {
  return (
    <PantallaCompleta testId="sin-conexion" icono="alert" titulo="Sin conexión">
      <p className="max-w-sm text-sm text-mute">MobOS necesita internet para abrir tu tienda. Revisá tu Wi‑Fi o tus datos móviles y volvé a intentar.</p>
      <Button type="button" className="min-h-12" onClick={onReintentar}>Reintentar</Button>
    </PantallaCompleta>
  )
}

function AvisoPush({ abierto, onActivar, onDespues }) {
  return (
    <Modal open={abierto} onClose={onDespues} title="¿Querés recibir avisos?" size="corto">
      <p className="text-sm text-mute" data-testid="aviso-push">
        Te avisamos cuando entra un pedido nuevo, cuando se asigna una entrega o cuando algo en tu tienda necesita tu atención. Podés cambiarlo cuando quieras desde Ajustes del iPhone.
      </p>
      <div className={`mt-5 ${PIE_ACCIONES}`}>
        <Button type="button" variant="ghost" className="min-h-11" onClick={onDespues}>Ahora no</Button>
        <Button type="button" className="min-h-11" onClick={onActivar} data-testid="aviso-push-activar">Activar avisos</Button>
      </div>
    </Modal>
  )
}

export default function PuertaNativa() {
  const { estado } = useSesion()
  const navigate = useNavigate()
  const enLinea = useEnLinea()
  const [reintento, setReintento] = useState(0)
  const minima = useVersionMinima(reintento)
  const [pidiendo, setPidiendo] = useState(false)

  useEffect(() => {
    let quitar = () => {}
    let activo = true
    alTocarNotificacion((ruta) => navigate(ruta)).then((fn) => { if (activo) quitar = fn; else fn() })
    return () => { activo = false; quitar() }
  }, [navigate])

  // Tras ingresar: si ya hay permiso se refresca el token del dispositivo; si
  // falta y nunca se preguntó, se muestra el aviso previo (nunca bloquea).
  useEffect(() => {
    if (estado !== 'dentro') return undefined
    let activo = true
    const t = setTimeout(async () => {
      const permiso = await estadoPermisoPush()
      if (!activo) return
      if (permiso === 'granted') activarPush(api)
      else if (permiso === 'prompt' && !previoRespondido()) setPidiendo(true)
    }, 2500)
    return () => { activo = false; clearTimeout(t) }
  }, [estado])

  const activar = useCallback(async () => {
    setPidiendo(false)
    recordarPrevio('si')
    await activarPush(api)
  }, [])
  const despues = useCallback(() => {
    setPidiendo(false)
    recordarPrevio('no')
  }, [])

  if (requiereActualizar(versionApp(), minima)) return <PantallaActualizar minima={minima} />
  if (!enLinea && estado !== 'dentro') {
    return <PantallaSinRed key={reintento} onReintentar={() => setReintento((n) => n + 1)} />
  }
  return <AvisoPush abierto={pidiendo} onActivar={activar} onDespues={despues} />
}
