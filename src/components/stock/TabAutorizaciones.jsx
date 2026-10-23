import { resolverAutorizacionStockDemo } from '@/lib/autorizacionesStock'
import BandejaAutorizaciones from '@/components/inventory/BandejaAutorizaciones'

export default function TabAutorizaciones({ ctx }) {
  const { authStock, units, removedUnits, products, branches, canViewAlerts, sesion, esDemo, cargarAutorizacionesStock, setAuthStock } = ctx
  return (
    <div className="mt-4">
        {/* #331: la bandeja de stock vive dentro de Inventario; resuelve con
            los mismos endpoints y deja intacta la semántica de un solo uso. */}
        <BandejaAutorizaciones
          rows={authStock.rows}
          loading={authStock.loading}
          error={authStock.error}
          unidades={[...units, ...removedUnits]}
          productos={products}
          sucursales={branches}
          puedeResolver={canViewAlerts}
          esPropietario={Boolean(sesion?.esPropietario)}
          usuarioId={sesion?.vendedorId || ''}
          esDemo={esDemo}
          onReload={cargarAutorizacionesStock}
          onDemoResolve={(id, cambios) => { resolverAutorizacionStockDemo(id, cambios); setAuthStock((actuales) => ({ ...actuales, rows: actuales.rows.map((row) => (row.id === id ? { ...row, ...cambios } : row)) })) }}
        />
      </div>
  )
}
