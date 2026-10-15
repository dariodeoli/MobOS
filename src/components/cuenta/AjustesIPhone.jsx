import { useCallback, useEffect, useState } from 'react'
import { Button, Card } from '@/components/ui'
import { api } from '@/lib/api'
import { activarPush, estadoPermisoPush, recordarPrevio } from '@/lib/nativo/push'
import { faceIdAlAbrir, fijarFaceIdAlAbrir, nombreBiometria, tipoBiometria, verificarBiometria } from '@/lib/nativo/biometria'
import { isNativeIOS } from '@/lib/plataforma'

// Ajustes propios de la app de iPhone (Configuración › Mi cuenta): avisos push y
// «Pedir Face ID al abrir», un ajuste DEL EQUIPO (apagado por defecto) que solo
// puede encender el dueño/administrador. Con él activo se pide Face ID primero y
// después el PIN privado: Face ID nunca reemplaza al PIN. No se muestra en la web.
export default function AjustesIPhone({ puedeAjustarEquipo = false, esDemo = false }) {
  const [permiso, setPermiso] = useState('no-disponible')
  const [tipo, setTipo] = useState(null)
  const [faceId, setFaceId] = useState(() => faceIdAlAbrir())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    const [p, t] = await Promise.all([estadoPermisoPush(), tipoBiometria()])
    setPermiso(p); setTipo(t)
  }, [])
  useEffect(() => { if (isNativeIOS()) cargar() }, [cargar])

  if (!isNativeIOS()) return null
  const nombre = nombreBiometria(tipo)

  async function pedirAvisos() {
    setBusy(true)
    recordarPrevio('si')
    await activarPush(api)
    setPermiso(await estadoPermisoPush())
    setBusy(false)
  }

  // Al encender se verifica una vez: nadie se queda sin entrar por un ajuste
  // que el equipo no puede cumplir.
  async function cambiarFaceId() {
    setError('')
    if (faceId) { fijarFaceIdAlAbrir(false); setFaceId(false); return }
    setBusy(true)
    const ok = await verificarBiometria('Confirmá para activar la protección extra')
    setBusy(false)
    if (!ok) { setError(`No se pudo verificar ${nombre}. Revisá que esté configurado en Ajustes del iPhone.`); return }
    fijarFaceIdAlAbrir(true)
    setFaceId(true)
  }

  return (
    <Card className="space-y-3" data-testid="mi-cuenta-iphone">
      <div>
        <h2 className="font-semibold">Este iPhone</h2>
        <p className="mt-1 text-sm text-mute">MobOS pide tu PIN personal cada vez que se abre o vuelve de segundo plano.</p>
      </div>
      {tipo && (
        <div className="rounded-xl border border-ink-600 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">Pedir {nombre} al abrir</p>
              <p className="text-xs text-mute">
                {faceId ? `Activado en este iPhone: se pide ${nombre} y después tu PIN.` : `Protección extra: ${nombre} primero y después el PIN. No reemplaza al PIN.`}
                {!puedeAjustarEquipo && ' Solo el dueño o administrador puede cambiarlo.'}
              </p>
            </div>
            <Button type="button" variant="outline" className="min-h-11" disabled={busy || esDemo || !puedeAjustarEquipo} onClick={cambiarFaceId} data-testid="ajustes-face-id">{faceId ? 'Desactivar' : 'Activar'}</Button>
          </div>
          {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
        </div>
      )}
      <div className="rounded-xl border border-ink-600 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Avisos de pedidos y entregas</p>
            <p className="text-xs text-mute">
              {permiso === 'granted' ? 'Activados en este iPhone.' : permiso === 'denied' ? 'Desactivados. Podés habilitarlos en Ajustes › MobOS › Notificaciones.' : 'Te avisamos cuando entra un pedido o se asigna una entrega.'}
            </p>
          </div>
          {permiso === 'prompt' && <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={pedirAvisos} data-testid="ajustes-activar-push">Activar avisos</Button>}
        </div>
      </div>
    </Card>
  )
}
