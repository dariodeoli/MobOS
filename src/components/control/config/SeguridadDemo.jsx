import { useState } from 'react'
import { Badge, Button, Card, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { fechaHora } from '@/utils/fecha'

// Seguridad de la cuenta en la demo: sesiones ficticias que se pueden cerrar
// (solo en esta pestaña). Las contraseñas y los accesos reales se administran
// en la tienda real; acá nada se guarda ni se envía.
const haceHoras = (horas) => new Date(Date.now() - horas * 3600000).toISOString()
const SESIONES = () => [
  { id: 'demo-sesion-1', dispositivo: 'Chrome en Mac · Asunción', ultima: haceHoras(0.1), actual: true },
  { id: 'demo-sesion-2', dispositivo: 'Safari en iPhone 15 Pro · Asunción', ultima: haceHoras(2), actual: false },
  { id: 'demo-sesion-3', dispositivo: 'Chrome en Windows (caja) · Asunción', ultima: haceHoras(26), actual: false },
]

export default function SeguridadDemo() {
  const toast = useToast()
  const [sesiones, setSesiones] = useState(SESIONES)
  function cerrar(sesion) {
    setSesiones((actuales) => actuales.filter((item) => item.id !== sesion.id))
    toast.success('Sesión cerrada', `${sesion.dispositivo} dejó de tener acceso (ejemplo de la demo).`)
  }
  return (
    <Card className="space-y-3" data-testid="seguridad-demo">
      <div>
        <h2 className="font-semibold">Sesiones activas</h2>
        <p className="mt-1 text-sm text-mute">Cada dispositivo se puede cerrar de forma remota. En la demo son ejemplos: la contraseña y los accesos reales se administran en la tienda real.</p>
      </div>
      {sesiones.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ink-600 p-4 text-center text-sm text-mute">No quedan otras sesiones abiertas en esta demo. Recargá la página para volver a verlas.</p>
      ) : (
        <ul className="divide-y divide-ink-600 rounded-xl border border-ink-600">
          {sesiones.map((sesion) => (
            <li key={sesion.id} data-testid="sesion-demo" className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="flex min-w-0 items-center gap-3">
                <Icon name="shield" className="h-4 w-4 shrink-0 text-ok" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">{sesion.dispositivo}{sesion.actual && <Badge color="green">Este dispositivo</Badge>}</p>
                  <p className="text-xs text-mute">Última actividad: {fechaHora(sesion.ultima)}</p>
                </div>
              </div>
              {!sesion.actual && <Button type="button" variant="outline" className="min-h-11 text-bad lg:min-h-0" onClick={() => cerrar(sesion)}>Cerrar sesión</Button>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
