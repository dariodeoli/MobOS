import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { API_URL } from '@/lib/api/client'
import { gs } from '@/utils/calculos'
import Icon from '@/components/shared/Icon'
import { Aviso } from '@/components/ui'
import { ROTULO_SECCION } from '@/components/shared/tabla'
import { cn } from '@/lib/utils'

// Carrito público de un borrador (#154): sin sesión, con el enlace privado que
// comparte el vendedor. Muestra lo mismo que el comprobante digital (productos,
// precios, descuentos, total y condiciones) y un botón de checkout con el monto
// que abre WhatsApp de la tienda para cerrar la compra.
const TIPO_ENTREGA = { Delivery: 'Delivery', Encomienda: 'Envío por encomienda', 'Retiro en tienda': 'Retiro en tienda', 'Retiro en otra sucursal': 'Retiro en otra sucursal', 'Envío entre sucursales': 'Envío entre sucursales' }

export default function CarritoPublico() {
  const { token } = useParams()
  const [carrito, setCarrito] = useState(null)
  const [error, setError] = useState('')
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    let active = true
    setError('')
    setCarrito(null)
    fetch(`${API_URL}/api/suspended-sales/public/${encodeURIComponent(token || '')}`)
      .then(async (response) => {
        const payload = await response.json().catch(() => null)
        if (!response.ok) throw new Error(payload?.message || payload?.error || 'Carrito no encontrado.')
        if (active) setCarrito(payload)
      })
      .catch((cause) => { if (active) setError(cause?.message || 'No se pudo cargar el carrito.') })
    return () => { active = false }
  }, [token])

  async function copiarEnlace() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch { /* sin portapapeles */ }
  }

  return (
    <main className="min-h-screen bg-ink-950 px-4 py-10 text-fore">
      <div className="mx-auto max-w-xl">
        <header className="mb-6 text-center">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-fono-light">Carrito de compra</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">{carrito?.company?.name || 'Tu carrito'}</h1>
          {carrito?.branch && <p className="mt-1 text-xs text-mute">{carrito.branch}{carrito.company?.city ? ` · ${carrito.company.city}` : ''}</p>}
          {carrito?.customerName && <p className="mt-2 text-sm text-mute">Preparado para {carrito.customerName}</p>}
          {carrito?.label && <p className="mt-1 text-xs text-mute">{carrito.label}</p>}
        </header>

        {error && <Aviso tono="error" className="px-4 py-3 text-sm rounded-xl text-center">{error}</Aviso>}

        {carrito && (
          <div className="space-y-4">
            <section className="overflow-hidden rounded-2xl border border-ink-600 bg-ink-900">
              <h2 className={cn('border-b border-ink-600 px-5 py-3', ROTULO_SECCION)}>Productos</h2>
              <div className="divide-y divide-ink-600">
                {carrito.items.map((item, index) => (
                  <div key={index} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.description}</p>
                      <p className="mt-0.5 text-xs text-mute">
                        {item.quantity} × {gs(item.unitPricePyg)}
                        {item.discountPyg > 0 ? ` · descuento − ${gs(item.discountPyg)}` : ''}
                        {item.available === false ? ' · ' : ''}
                      </p>
                      {item.available === false && <p className="mt-1 text-xs font-semibold text-warn">Sin stock en este momento: lo confirmamos al cerrar</p>}
                    </div>
                    <span className="shrink-0 tabular-nums">{gs(item.totalPyg)}</span>
                  </div>
                ))}
                {!carrito.items.length && <p className="px-5 py-6 text-center text-sm text-mute">El carrito está vacío.</p>}
              </div>
            </section>

            <section className="rounded-2xl border border-ink-600 bg-ink-900 px-5 py-4 text-sm">
              <div className="flex items-center justify-between text-mute"><span>Subtotal</span><span className="tabular-nums">{gs(carrito.subtotalPyg)}</span></div>
              {carrito.discountPyg > 0 && <div className="mt-1 flex items-center justify-between text-warn"><span>Descuento</span><span className="tabular-nums">− {gs(carrito.discountPyg)}</span></div>}
              {carrito.deliveryPyg > 0 && <div className="mt-1 flex items-center justify-between text-mute"><span>{TIPO_ENTREGA[carrito.deliveryType] || 'Entrega'}</span><span className="tabular-nums">{gs(carrito.deliveryPyg)}</span></div>}
              <div className="mt-2 flex items-baseline justify-between border-t border-ink-600 pt-2">
                <span className={ROTULO_SECCION}>Total</span>
                <span className="text-2xl font-extrabold tracking-tight tabular-nums">{gs(carrito.totalPyg)}</span>
              </div>
            </section>

            {(carrito.deliveryType || carrito.notes) && (
              <section className="rounded-2xl border border-ink-600 bg-ink-900 px-5 py-4 text-sm text-mute">
                {carrito.deliveryType && <p>Entrega: {TIPO_ENTREGA[carrito.deliveryType] || carrito.deliveryType}</p>}
                {carrito.notes && <p className="mt-1">{carrito.notes}</p>}
              </section>
            )}

            {carrito.expiresAt && new Date(carrito.expiresAt) > new Date() && (
              <p className="text-center text-xs text-mute">
                Enlace válido hasta {new Date(carrito.expiresAt).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' })}.
              </p>
            )}

            {carrito.checkoutUrl ? (
              <a
                href={carrito.checkoutUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-ok px-4 text-base font-bold text-black transition hover:brightness-110"
              >
                <Icon name="cart" className="h-5 w-5" />
                Checkout — {gs(carrito.totalPyg)}
              </a>
            ) : (
              <button
                type="button"
                onClick={copiarEnlace}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-ok px-4 text-base font-bold text-black transition hover:brightness-110"
              >
                <Icon name="check" className="h-5 w-5" />
                {copiado ? 'Enlace copiado' : `Checkout — ${gs(carrito.totalPyg)}`}
              </button>
            )}

            <p className="pt-1 text-center text-[11px] text-mute">{carrito.conditions}</p>
            <p className="text-center text-[11px] text-mute">Documento no fiscal · Generado por MobOS</p>
          </div>
        )}
      </div>
    </main>
  )
}
