import { useSesion } from '@/lib/sesion'
import { Card, Badge } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import PaymentAccounts from './PaymentAccounts'

export default function Config() {
  const { sesion, empresa, sucursal } = useSesion()
  const esDueno = sesion?.esPropietario

  return (
    <div className="space-y-4">
      {esDueno && <PaymentAccounts />}

      <Card className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-fono/10 p-2 text-fono"><Icon name="user" className="h-5 w-5" /></div>
          <div>
            <h2 className="font-semibold">Sesión activa</h2>
            <p className="mt-0.5 text-sm text-mute">{sesion?.correo || sesion?.nombre || 'Usuario de MobOS'}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge color="blue">{empresa?.nombre || 'Mi empresa'}</Badge>
          {sucursal?.nombre && <Badge color="slate">{sucursal.nombre}</Badge>}
          {sesion?.rol && <Badge color="slate">{sesion.rol}</Badge>}
        </div>
      </Card>

      {esDueno && (
        <Card className="space-y-2">
          <h2 className="font-semibold">Equipo y sucursales</h2>
          <p className="text-sm text-mute">
            La gestión de usuarios, PIN, roles, horarios y sucursales se está consolidando en la API propia de MobOS.
            No hay datos ni accesos alternativos en el navegador.
          </p>
        </Card>
      )}
    </div>
  )
}
