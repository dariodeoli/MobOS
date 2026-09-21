import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge, Card, Money, Skeleton } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import AccesoRequerido from '@/components/shared/AccesoRequerido'
import LoadingScreen from '@/components/app/LoadingScreen'
import { useSesion } from '@/lib/sesion'
import { resources } from '@/lib/api'

const CONDICION = { NEW: 'Nuevo', USED: 'Seminuevo', REFURBISHED: 'Reacondicionado' }

const Dato = ({ etiqueta, children }) => (
  <div className="rounded-xl bg-ink-800/60 p-3 text-sm">
    <p className="text-xs text-mute">{etiqueta}</p>
    <div className="mt-1 font-semibold">{children}</div>
  </div>
)

function FichaProducto({ producto }) {
  const stock = Number(producto.stock || 0)
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-ink-600 bg-ink-900 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-mute">Producto</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">{producto.name}</h1>
          </div>
          <Badge color={stock > 0 ? 'green' : 'red'}>{stock > 0 ? `${stock} en stock` : 'Sin stock'}</Badge>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Dato etiqueta="SKU"><span className="font-mono text-xs">{producto.sku || '—'}</span></Dato>
          <Dato etiqueta="Categoría">{producto.category || 'Sin categoría'}</Dato>
          <Dato etiqueta="Precio de venta"><Money value={producto.pricePyg ?? 0} /></Dato>
          {Number(producto.wholesalePricePyg || 0) > 0 && <Dato etiqueta="Precio mayorista"><Money value={producto.wholesalePricePyg} /></Dato>}
          <Dato etiqueta="Condición">{CONDICION[producto.condition] || producto.condition || '—'}</Dato>
          <Dato etiqueta="Garantía">
            {Number(producto.warrantyDays || 0) > 0 ? `${producto.warrantyDays} días` : 'Sin garantía cargada'}
          </Dato>
        </div>
      </section>
      <div className="text-center">
        <Link
          to={`/productos?q=${encodeURIComponent(producto.sku || producto.id || '')}`}
          className="inline-flex h-11 items-center justify-center rounded-lg bg-fono px-5 text-sm font-semibold text-onbrand transition hover:bg-fono-light"
        >
          Ver en el catálogo
        </Link>
      </div>
    </div>
  )
}

// Página de un producto: el QR de la etiqueta de precio abre acá. Sin sesión
// no se filtra nada: solo el aviso y el login con retorno.
export default function ProductoPublico() {
  const { sku = '' } = useParams()
  const { estado } = useSesion()
  const [producto, setProducto] = useState(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const dentro = estado === 'dentro'

  useEffect(() => {
    if (!dentro) return undefined
    let vigente = true
    setCargando(true)
    setError('')
    const buscado = String(sku).trim().toLowerCase()
    resources.products.list(sku)
      .then((filas) => {
        if (!vigente) return
        const encontrado = (filas || []).find((fila) => String(fila.sku || '').trim().toLowerCase() === buscado
          || String(fila.id || '') === String(sku).trim())
        setProducto(encontrado || null)
      })
      .catch((causa) => { if (vigente) setError(causa?.message || 'No se pudo buscar el producto.') })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [dentro, sku])

  let contenido
  if (estado === 'cargando') {
    contenido = <LoadingScreen mensaje="Verificando tu sesión…" />
  } else if (!dentro) {
    contenido = (
      <AccesoRequerido
        titulo="Este código pertenece a un producto de MobOS"
        descripcion="Iniciá sesión para ver el precio, el stock y la garantía de este producto."
        destino={`/producto/${encodeURIComponent(sku)}`}
      />
    )
  } else if (cargando) {
    contenido = <Card><Skeleton className="h-6 w-2/3" /><Skeleton className="mt-3 h-24 w-full" /></Card>
  } else if (error) {
    contenido = <Card className="text-center text-sm text-bad">{error}</Card>
  } else if (!producto) {
    contenido = (
      <Card className="text-center">
        <Icon name="search" className="mx-auto h-6 w-6 text-mute" />
        <h1 className="mt-3 font-semibold">No encontramos este producto</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-mute">
          El SKU <span className="font-mono">{sku}</span> no está en el catálogo de tu tienda. Puede haberse dado de baja
          o pertenecer a otra sucursal.
        </p>
      </Card>
    )
  } else {
    contenido = <FichaProducto producto={producto} />
  }

  return (
    <main className="min-h-screen bg-ink-950 px-4 py-10 text-fore">
      <div className="mx-auto max-w-xl">
        <header className="mb-6 text-center">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-fono-light">Producto MobOS</p>
        </header>
        {contenido}
      </div>
    </main>
  )
}
