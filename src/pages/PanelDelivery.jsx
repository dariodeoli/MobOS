import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSesion } from '@/lib/sesion'
import { useLive } from '@/hooks/useLive'
import { useAutoRefrescar } from '@/hooks/useAutoRefrescar'
import AppShell from '@/components/app/AppShell'
import Icon from '@/components/shared/Icon'
import { ConfirmDialog, Eyebrow } from '@/components/ui'
import DriverOrders from '@/components/delivery/DriverOrders'
import DriverSettlements from '@/components/delivery/DriverSettlements'

// Panel de reparto: login propio, solo los pedidos asignados, pre-cobro en la
// calle y rendición en la tienda. Vive aparte de /pos: el repartidor no ve
// ventas, cobros de mostrador ni datos de la tienda.
const DELIVERY_NAV = [
  {
    titulo: 'Mi reparto',
    items: [
      ['repartos', 'Mis repartos', 'truck'],
      ['rendiciones', 'Rendiciones', 'receipt'],
    ],
  },
]

const DELIVERY_BOTTOM = [
  ['repartos', 'Repartos', 'truck'],
  ['rendiciones', 'Rendir', 'receipt'],
]

const LABELS = { repartos: 'Mis repartos', rendiciones: 'Rendiciones' }

export default function PanelDelivery() {
  useLive()
  useAutoRefrescar()
  const { usuario, empresa, sesion, esDemo, salir } = useSesion()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [salirAbierto, setSalirAbierto] = useState(false)
  const [saliendo, setSaliendo] = useState(false)
  const vista = pathname.split('/')[2] || 'repartos'
  // Sin permiso de reparto la sesión no pertenece a este panel: vuelve a su
  // lugar (la autoridad real la aplica el backend en cada endpoint).
  const esRepartidor = esDemo ? false : usuario?.role === 'REPARTIDOR'

  useEffect(() => {
    if (!esRepartidor) navigate('/pos/cargar', { replace: true })
  }, [esRepartidor, navigate])

  async function confirmarSalir() {
    setSaliendo(true)
    try { await salir() } finally { setSaliendo(false) }
  }

  return (
    <>
      <AppShell
        title={LABELS[vista] || 'Mis repartos'}
        nav={DELIVERY_NAV}
        bottomNav={DELIVERY_BOTTOM}
        onOpenMenuLabel="Menú"
        active={vista}
        onNavigate={id => navigate(`/delivery/${id}`)}
        empresa={empresa}
        esDemo={esDemo}
        sesionNombre={sesion?.nombre}
        esOwner={false}
        roleLabel="Repartidor"
        perfilEmpresa={null}
        onLogout={() => setSalirAbierto(true)}
        headerActions={vista !== 'rendiciones' && (
          <button
            type="button"
            onClick={() => navigate('/delivery/rendiciones')}
            className="inline-flex h-[34px] shrink-0 items-center gap-2 rounded-[9px] bg-fono px-3.5 text-[13px] font-semibold text-onbrand transition hover:bg-fono-dark"
          >
            <Icon name="receipt" className="h-[15px] w-[15px]" />
            <span className="hidden sm:inline">Rendir</span>
          </button>
        )}
      >
        <main className="flex-1 bg-gradient-to-b from-paper to-paper p-4 md:p-8">
          <div className="mx-auto max-w-6xl space-y-5">
            <div>
              <Eyebrow>{empresa?.nombre || 'Mi tienda'}</Eyebrow>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">
                {sesion?.nombre ? `Hola, ${sesion.nombre}` : 'Reparto del día'}
              </h2>
              <p className="mt-1 text-sm text-mute">
                Solo ves los pedidos que te asigna la tienda. Cargá el cobro en la calle y rendilo al volver.
              </p>
            </div>
            {vista === 'rendiciones' ? <DriverSettlements /> : <DriverOrders />}
          </div>
        </main>
      </AppShell>

      <ConfirmDialog
        open={salirAbierto}
        onCancel={() => setSalirAbierto(false)}
        onConfirm={confirmarSalir}
        title="¿Cerrar sesión?"
        description="Vas a salir del panel de reparto. Los cobros sin rendir siguen guardados en tus pedidos."
        confirmLabel="Salir"
        variant="danger"
        busy={saliendo}
      />
    </>
  )
}
