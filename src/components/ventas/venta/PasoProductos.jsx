import { Button, Input, MoneyInput, Select } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import ProductCombobox from '@/components/shared/ProductCombobox'
import CheckoutCustomer from '../CheckoutCustomer'
import { gs, num } from '@/utils/calculos'
import { useSesion } from '@/lib/sesion'
import EncabezadoBloque from './EncabezadoBloque'

// La venta en una sola pantalla: para quién es y qué se vende. El cliente
// primero (define la lista de precios) y después el catálogo, que agrega al
// carrito con un clic.
export default function PasoProductos({
  sesion,
  esDemo,
  customer,
  setCustomer,
  billingTo,
  setBillingTo,
  setF,
  productos,
  nuevoProd,
  setNuevoProd,
  nombreProd,
  setNombreProd,
  nuevoDetalles,
  setNuevoDetalles,
  colorInput,
  setColorInput,
  coloresNuevos,
  setColoresNuevos,
  agregarColor,
  puedeCrearProducto,
  crearProducto,
  creandoProd,
  cancelarNuevoProd,
  setBusquedaProducto,
  combos,
  agregarCombo,
  noticeCombo,
  familiasVisibles,
  agregarProducto,
  nombreLista = '',
  guardando,
  setNuevoVend,
  setErrorVend,
  setPinVend,
}) {
  const { perfilEmpresa } = useSesion()
  const nombreVendedor =
    sesion?.rol === 'dueno' && perfilEmpresa?.name ? perfilEmpresa.name : sesion?.nombre
  const puedeAgregarVendedor = esDemo || sesion?.rol === 'dueno'

  return (
    <>
      <section className="rounded-2xl border border-ink-600 bg-ink-800 p-3.5">
        <EncabezadoBloque
          titulo="Cliente"
          descripcion="Buscá la ficha por nombre, teléfono, CI o RUC; si no existe, se crea al confirmar."
          extra={
            <div className="shrink-0 text-right text-xs text-mute">
              <span className="block">
                Vendedor: <strong className="text-fore">{nombreVendedor || 'Ingresá con tu PIN'}</strong>
              </span>
              <span className="block text-[11px]">Asignado automáticamente a tu sesión.</span>
              {puedeAgregarVendedor && (
                <button
                  type="button"
                  className="mt-1 text-xs font-bold text-fono hover:underline"
                  onClick={() => {
                    setNuevoVend(true)
                    setErrorVend('')
                    setPinVend('')
                  }}
                >
                  ＋ Agregar vendedor
                </button>
              )}
            </div>
          }
        />
        <CheckoutCustomer
          esDemo={esDemo}
          value={customer}
          onChange={c => {
            setCustomer(c)
            setF(current => ({ ...current, cliente: c?.name ?? '' }))
          }}
          billingTo={billingTo}
          onBillingChange={setBillingTo}
          nombreLista={nombreLista}
        />
      </section>

      <section className="rounded-2xl border border-fono/20 bg-fono/[.04] p-3.5">
        <EncabezadoBloque
          titulo="Productos"
          descripcion="Buscá por nombre, modelo o variante y hacé clic para sumarlo a la venta."
          extra={<span className="shrink-0 text-xs font-medium text-fono-light">{productos.length} disponibles</span>}
        />
        {nuevoProd ? (
          <div className="space-y-3 rounded-2xl border border-fono/25 bg-gradient-to-br from-fono/[.07] to-transparent p-4">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-fono/15 text-fono-light">
                <Icon name="plus" className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-bold">Nuevo producto</p>
                <p className="text-[11px] text-mute">Se guarda en el catálogo y entra a esta venta.</p>
              </div>
            </div>
            <Input
              autoFocus
              value={nombreProd}
              onChange={e => setNombreProd(e.target.value)}
              placeholder="Nombre base (ej: Protector 17 Air)"
              autoCapitalize="words"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-mute">
                Categoría
                <Select
                  className="mt-1"
                  value={nuevoDetalles.categoria}
                  onChange={e => setNuevoDetalles(d => ({ ...d, categoria: e.target.value }))}
                >
                  {['Accesorios', 'Celulares', 'iPad', 'Apple Watch', 'Mac', 'Otros'].map(c => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </label>
              <div className="text-xs text-mute">
                Condición
                <div className="mt-1 flex gap-1 rounded-xl border border-ink-600 bg-ink-800 p-1">
                  {[
                    ['NEW', 'Nuevo'],
                    ['USED', 'Seminuevo'],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setNuevoDetalles(d => ({ ...d, condicion: value }))}
                      className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition ${
                        nuevoDetalles.condicion === value
                          ? 'bg-fono/15 text-fono-light'
                          : 'text-mute hover:text-fore'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block text-xs text-mute">
                Precio de venta (Gs) *
                <MoneyInput
                  className="mt-1"
                  value={nuevoDetalles.precio}
                  onValueChange={v =>
                    setNuevoDetalles(d => ({ ...d, precio: v === '' ? '' : String(v) }))
                  }
                  placeholder="0"
                />
              </label>
              <label className="block text-xs text-mute">
                Precio mayorista (Gs)
                <MoneyInput
                  className="mt-1"
                  value={nuevoDetalles.mayorista}
                  onValueChange={v =>
                    setNuevoDetalles(d => ({ ...d, mayorista: v === '' ? '' : String(v) }))
                  }
                  placeholder="Opcional"
                />
              </label>
              <label className="block text-xs text-mute">
                Costo (Gs)
                <MoneyInput
                  className="mt-1"
                  value={nuevoDetalles.costo}
                  onValueChange={v =>
                    setNuevoDetalles(d => ({ ...d, costo: v === '' ? '' : String(v) }))
                  }
                  placeholder="Opcional"
                />
              </label>
            </div>
            <div>
              <div className="mb-1 text-[11px] font-bold uppercase text-mute">
                Colores (opcional)
              </div>
              <div className="flex gap-2">
                <Input
                  value={colorInput}
                  onChange={e => setColorInput(e.target.value)}
                  placeholder="Ej: Azul"
                  autoCapitalize="words"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      agregarColor()
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={agregarColor}>
                  + Color
                </Button>
              </div>
              {coloresNuevos.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {coloresNuevos.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColoresNuevos(s => s.filter(x => x !== c))}
                      className="rounded-full bg-fono/10 px-2.5 py-1 text-xs font-bold text-fono transition hover:bg-bad/15 hover:text-bad"
                      title="Quitar"
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-1 text-[11px] text-mute">
                Sin colores: un solo producto. Con colores: una variante por color; el color se
                cambia en la fila de la venta.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={crearProducto}
                disabled={creandoProd || !nombreProd.trim()}
                className="flex-1"
              >
                {creandoProd ? 'Creando…' : `Crear${coloresNuevos.length > 0 ? ` (${coloresNuevos.length} colores)` : ''}`}
              </Button>
              <Button
                type="button"
                variant="ghost"
                aria-label="Cancelar producto nuevo"
                onClick={cancelarNuevoProd}
                disabled={creandoProd}
              >
                <Icon name="close" className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <>
            {puedeCrearProducto && (
              <div className="mb-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setNuevoProd(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-fono/30 px-2.5 py-1.5 text-xs font-semibold text-fono-light transition hover:bg-fono/10"
                >
                  <Icon name="plus" className="h-3.5 w-3.5" /> Nuevo producto
                </button>
              </div>
            )}
            <div className="relative mb-2">
              <ProductCombobox
                products={productos}
                placeholder="Buscar producto…"
                onQueryChange={next => setBusquedaProducto(next)}
                onSelect={producto => {
                  setBusquedaProducto('')
                  agregarProducto(producto)
                }}
                onCreate={text => {
                  if (puedeCrearProducto) {
                    setNombreProd(text)
                    setNuevoProd(true)
                  }
                  return Promise.resolve(null)
                }}
                className="pl-9"
              />
              <Icon
                name="search"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute"
              />
            </div>
            <div
              className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2"
              aria-label="Resultados de productos"
            >
              {!esDemo && combos.length > 0 && (
                <div className="sm:col-span-2 mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-fono/25 bg-fono/[.05] p-2.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-mute">
                    Combos
                  </span>
                  {combos.map(combo => (
                    <button
                      key={combo.id}
                      type="button"
                      onClick={() => agregarCombo(combo)}
                      className="rounded-lg border border-fono/40 bg-ink-800 px-2.5 py-1.5 text-xs font-semibold text-fono-light transition hover:bg-fono/10"
                      title={(combo.items || [])
                        .map(item => productos.find(p => p.id === item.productId)?.nombre || '')
                        .filter(Boolean)
                        .join(' + ')}
                    >
                      {combo.name} · {gs(combo.pricePyg)}
                    </button>
                  ))}
                </div>
              )}
              {noticeCombo && (
                <p
                  role="status"
                  className="col-span-2 mb-2 rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-xs text-ok"
                >
                  {noticeCombo}
                </p>
              )}
              {familiasVisibles.map(fam => {
                const p = fam.items[0]
                return (
                  <button
                    type="button"
                    key={fam.base}
                    disabled={guardando}
                    onClick={() => agregarProducto(p)}
                    className="flex min-h-20 items-center gap-3 rounded-xl border border-ink-600 p-3 text-left transition hover:border-fono focus-visible:outline focus-visible:outline-fono"
                  >
                    {p.imagen || p.imageUrl ? (
                      <img
                        src={p.imagen || p.imageUrl}
                        alt=""
                        loading="lazy"
                        className="h-12 w-12 rounded-lg object-cover"
                      />
                    ) : (
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-fono/10 text-fono-light">
                        <Icon name="box" className="h-6 w-6" />
                      </span>
                    )}
                    <span className="min-w-0">
                      <strong className="block truncate text-sm">{fam.base}</strong>
                      <span className="block text-xs text-mute">
                        {fam.items.length > 1 ? fam.items.length + ' variantes · desde ' : ''}
                        {gs(Math.min(...fam.items.map(item => num(item.precioVenta))))}
                      </span>
                    </span>
                  </button>
                )
              })}
              {!familiasVisibles.length && (
                <p className="p-3 text-sm text-mute">
                  No encontramos productos. Probá otro nombre.
                </p>
              )}
            </div>
          </>
        )}
      </section>
    </>
  )
}
