import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge, Card, Money, Skeleton } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import AccesoRequerido from '@/components/shared/AccesoRequerido'
import LoadingScreen from '@/components/app/LoadingScreen'
import { useSesion } from '@/lib/sesion'
import { resources } from '@/lib/api'

const CONDICION = { NEW: 'Nuevo', USED: 'Seminuevo', REFURBISHED: 'Reacondicionado' }
const ESTADO = {
  AVAILABLE: { label: 'Disponible', color: 'green' },
  RESERVED: { label: 'Reservada', color: 'orange' },
  SOLD: { label: 'Vendida', color: 'red' },
  DEFECTIVE: { label: 'En revisión', color: 'slate' },
  IN_TRANSIT: { label: 'En tránsito', color: 'blue' },
}

const Dato = ({ etiqueta, children }) => (
  <div className="rounded-xl bg-ink-800/60 p-3 text-sm">
    <p className="text-xs text-mute">{etiqueta}</p>
    <div className="mt-1 font-semibold">{children}</div>
  </div>
)

function FichaUnidad({ unidad, serial, puedeVerInventario }) {
  const estado = ESTADO[unidad.status] || { label: unidad.status || 'Sin estado', color: 'slate' }
  const producto = unidad.product || {}
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-ink-600 bg-ink-900 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-mute">Unidad</p>
            <h1 className="mt-1 truncate text-2xl font-bold tracking-tight">{producto.name || 'Producto'}</h1>
          </div>
          <Badge color={estado.color}>{estado.label}</Badge>
        </div>
        <p className="mt-2 break-all font-mono text-xs text-mute">{serial}</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Dato etiqueta="IMEI / Serial"><span className="break-all font-mono text-xs">{serial}</span></Dato>
          <Dato etiqueta="Condición">{CONDICION[unidad.condition] || unidad.condition || '—'}</Dato>
          <Dato etiqueta="SKU"><span className="font-mono text-xs">{producto.sku || '—'}</span></Dato>
          <Dato etiqueta="Precio de venta"><Money value={producto.pricePyg ?? 0} /></Dato>
          <Dato etiqueta="Sucursal">{unidad.branch?.name || '—'}</Dato>
          <Dato etiqueta="Ubicación">{unidad.location?.name || 'Sin ubicación'}</Dato>
          {unidad.batteryHealth != null && <Dato etiqueta="Batería">{unidad.batteryHealth}%</Dato>}
          <Dato etiqueta="Garantía">
            {Number(producto.warrantyDays || 0) > 0 ? `${producto.warrantyDays} días` : 'Sin garantía cargada'}
          </Dato>
        </div>
        {unidad.lastVerifiedAt && (
          <p className="mt-4 flex items-center gap-2 text-xs text-mute">
            <Icon name="check" className="h-4 w-4 text-ok" />
            Última verificación física: {new Date(unidad.lastVerifiedAt).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' })}
          </p>
        )}
      </section>
      <div className="text-center">
        <Link
          to={puedeVerInventario ? `/inventario/unidades?q=${encodeURIComponent(serial)}` : '/pos/cargar'}
          className="inline-flex h-11 items-center justify-center rounded-lg bg-fono px-5 text-sm font-semibold text-onbrand transition hover:bg-fono-light"
        >
          {puedeVerInventario ? 'Ver en el inventario' : 'Ir a la app'}
        </Link>
      </div>
    </div>
  )
}

// Página de una unidad física: el QR de la etiqueta abre acá. Sin sesión no se
// filtra nada: solo el aviso y el login con retorno.
export default function UnidadPublica() {
  const { serial = '' } = useParams()
  const { estado, sesion } = useSesion()
  const [unidad, setUnidad] = useState(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const dentro = estado === 'dentro'

  useEffect(() => {
    if (!dentro) return undefined
    let vigente = true
    setCargando(true)
    setError('')
    const buscado = String(serial).trim().toUpperCase()
    resources.inventoryUnits.list(serial)
      .then((filas) => {
        if (!vigente) return
        const encontrada = (filas || []).find((fila) => String(fila.serial || '').trim().toUpperCase() === buscado)
        setUnidad(encontrada || null)
      })
      .catch((causa) => { if (vigente) setError(causa?.message || 'No se pudo buscar la unidad.') })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [dentro, serial])

  let contenido
  if (estado === 'cargando') {
    contenido = <LoadingScreen mensaje="Verificando tu sesión…" />
  } else if (!dentro) {
    contenido = (
      <AccesoRequerido
        titulo="Este código pertenece a una unidad de MobOS"
        descripcion="Iniciá sesión para ver el producto, el estado y la garantía de esta unidad."
        destino={`/u/${encodeURIComponent(serial)}`}
      />
    )
  } else if (cargando) {
    contenido = <Card><Skeleton className="h-6 w-2/3" /><Skeleton className="mt-3 h-24 w-full" /></Card>
  } else if (error) {
    contenido = <Card className="text-center text-sm text-bad">{error}</Card>
  } else if (!unidad) {
    contenido = (
      <Card className="text-center">
        <Icon name="search" className="mx-auto h-6 w-6 text-mute" />
        <h1 className="mt-3 font-semibold">No encontramos esta unidad</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-mute">
          El serial <span className="font-mono">{serial}</span> no está en el inventario de tu tienda. Puede ser de otra
          sucursal o haberse dado de baja.
        </p>
      </Card>
    )
  } else {
    contenido = <FichaUnidad unidad={unidad} serial={serial} puedeVerInventario={Boolean(sesion?.esPropietario)} />
  }

  return (
    <main className="min-h-screen bg-ink-950 px-4 py-10 text-fore">
      <div className="mx-auto max-w-xl">
        <header className="mb-6 text-center">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-fono-light">Unidad MobOS</p>
        </header>
        {contenido}
      </div>
    </main>
  )
}
