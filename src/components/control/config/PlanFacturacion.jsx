import { useEffect, useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { api } from '@/lib/api/client'
import { EmptyState } from '@/components/ui'
import { GrupoConfig, FilaConfig } from './FilasConfig'

// #422 · Plan y facturación. El backend todavía no expone planes, facturas ni
// el cobro del servicio (la política de precios de `lib/billing` es solo una
// propuesta sin inscripción), así que esta pantalla muestra lo real —el uso
// actual de la empresa— y un estado vacío honesto en lugar de inventar un plan.
// Cuando existan los endpoints, el plan, la próxima factura y el historial se
// suman acá como filas del mismo patrón.
export default function PlanFacturacion() {
  const { esDemo } = useSesion()
  const [uso, setUso] = useState(null)

  useEffect(() => {
    if (esDemo) return undefined
    let vivo = true
    Promise.all([api.get('/api/branches'), api.get('/api/users')])
      .then(([sucursales, usuarios]) => {
        if (!vivo) return
        setUso({
          sucursales: (Array.isArray(sucursales) ? sucursales : []).filter((s) => s.isActive).length,
          usuarios: (Array.isArray(usuarios) ? usuarios : []).filter((u) => u.status === 'ACTIVE').length,
        })
      })
      .catch((cause) => console.error('[config] no se pudo leer el uso de la empresa', cause))
    return () => { vivo = false }
  }, [esDemo])

  return (
    <div className="space-y-4" data-testid="plan-pantalla">
      <GrupoConfig titulo="Uso actual" descripcion="Lo que tu empresa está usando hoy." anchor="plan">
        <FilaConfig icono="building" titulo="Sucursales activas" valor={uso ? String(uso.sucursales) : '—'} testId="fila-uso-sucursales" />
        <FilaConfig icono="users" titulo="Usuarios activos" valor={uso ? String(uso.usuarios) : '—'} testId="fila-uso-usuarios" />
      </GrupoConfig>
      <GrupoConfig titulo="Plan y facturación" anchor="facturacion">
        <div className="p-4">
          <EmptyState
            compact
            icon="receipt"
            title="La facturación del servicio todavía no está activa"
            description="Cuando se habilite vas a ver acá tu plan con sus límites, la próxima factura, el método de pago y las facturas anteriores."
          />
        </div>
      </GrupoConfig>
    </div>
  )
}
