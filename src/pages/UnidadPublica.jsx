import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge, Card, Money, Skeleton } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import AccesoRequerido from '@/components/shared/AccesoRequerido'
import LoadingScreen from '@/components/app/LoadingScreen'
import { useSesion } from '@/lib/sesion'
import { resources } from '@/lib/api'
import { fechaHora } from '@/utils/fecha'
import { enmascararImei } from '@/lib/imeiComprobante'
import { qrDataUrl } from '@/lib/qr'
import MedidorBateria from '@/components/shared/MedidorBateria'
import { ROTULO_SECCION } from '@/components/shared/tabla'
import { etiquetaCondicionUnidad } from '@/utils/inventario'
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
  const [qr, setQr] = useState('')
  useEffect(() => {
    const url = typeof window !== 'undefined' ? `${window.location.origin}/u/${encodeURIComponent(serial)}` : ''
    if (url) qrDataUrl(url, { ancho: 200 }).then(setQr)
  }, [serial])
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-ink-600 bg-ink-900 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className={ROTULO_SECCION}>Unidad</p>
            <h1 className="mt-1 truncate text-2xl font-bold tracking-tight">{producto.name || 'Producto'}</h1>
          </div>
          <Badge color={estado.color}>{estado.label}</Badge>
        </div>
        <p className="mt-2 break-all font-mono text-xs text-mute">{serial}</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Dato etiqueta="IMEI / Serial"><span className="break-all font-mono text-xs">{serial}</span></Dato>
          <Dato etiqueta="Condición">{etiquetaCondicionUnidad(unidad)}</Dato>
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
            Verificado por {unidad.lastVerifiedBy?.name || 'el equipo'} · {fechaHora(unidad.lastVerifiedAt)}
            {Number(unidad.verificationCount || 0) > 1 ? ` · ${unidad.verificationCount} veces` : ''}
            {unidad.verifiedByCode ? ` · código ${unidad.verifiedByCode}` : ''}
          </p>
        )}
      </section>

      {/* Informe del dispositivo (#240): grado, batería, locks, reparaciones y QR. */}
      <section className="rounded-2xl border border-ink-600 bg-ink-900 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className={ROTULO_SECCION}>Informe del dispositivo</p>
            <p className="mt-1 text-xs text-mute">
              Estado, batería y bloqueos de esta unidad. El grado de inspección y el informe público se completan con el
              checklist de INV (#240).
            </p>
          </div>
          {qr && <img src={qr} alt="QR del informe" className="h-24 w-24 rounded-xl bg-white p-1.5" />}
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Dato etiqueta="IMEI / Serial"><span className="break-all font-mono text-xs">{enmascararImei(serial)}</span></Dato>
          <Dato etiqueta="Grado de condición">{etiquetaCondicionUnidad(unidad)}</Dato>
          <MedidorBateria porcentaje={unidad.batteryHealth} etiqueta="Batería" />
          <Dato etiqueta="Ciclos de batería">Pendiente (INV #240)</Dato>
          <Dato etiqueta="iCloud / Find My">Sin verificar</Dato>
          <Dato etiqueta="Lista negra">Sin verificar</Dato>
          <Dato etiqueta="SIM lock / MDM">Sin verificar</Dato>
          <Dato etiqueta="Reparaciones">Sin registros en la unidad</Dato>
        </div>

        <p className="mt-4 text-[11px] leading-5 text-mute">
          Los estados de bloqueo salen de la consulta de IMEI de la ficha (fuente y hora incluidas) y quedan «Sin verificar»
          cuando no hay consulta confirmada: nunca se informa «limpio» sin dato.
        </p>
        {typeof window !== 'undefined' && (
          <button type="button" onClick={() => window.print()} className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg border border-ink-500 px-4 text-sm font-semibold transition hover:border-fono">
            <Icon name="printer" className="h-4 w-4" />Imprimir informe
          </button>
        )}
      </section>
      <div className="text-center">
        <Link
          to={puedeVerInventario ? `/inventario/unidades?q=${encodeURIComponent(serial)}` : '/ventas'}
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
