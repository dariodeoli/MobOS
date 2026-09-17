import { Button, Input, Label, MoneyInput, Select, Badge } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import CheckoutCustomer from '../CheckoutCustomer'
import ProductPrice from '../ProductPrice'
import SerialUnitPicker from '@/components/inventory/SerialUnitPicker'
import { gs, num } from '@/utils/calculos'

export default function PasoProductos({
  visible,
  sesion,
  esDemo,
  customer,
  setCustomer,
  billingTo,
  setBillingTo,
  f,
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
  busquedaProducto,
  setBusquedaProducto,
  combos,
  agregarCombo,
  noticeCombo,
  familiasVisibles,
  elegirProducto,
  familiaActiva,
  itemActivo,
  setModalColor,
  precioMayorista,
  serialRequired,
  setSerialRequired,
  sobrePedido,
  setSobrePedido,
  guardando,
  gsNum,
  agregarItem,
  puedePaso2,
  siguientePaso,
  setNuevoVend,
  setErrorVend,
  setPinVend,
}) {
  return (
    <div className={visible ? 'contents' : 'hidden'}>
      <div className="md:col-span-2 rounded-xl border border-ink-600 p-3 text-sm">
        <span className="text-mute">Vendedor de esta venta</span>
        <strong className="ml-3">{sesion?.nombre || 'Ingresá con tu PIN'}</strong>
        <p className="mt-1 text-xs text-mute">Asignado automáticamente a tu sesión.</p>
        {(esDemo || sesion?.rol === 'dueno') && (
          <button
            type="button"
            className="mt-2 text-xs font-bold text-fono hover:underline"
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
      <CheckoutCustomer
        esDemo={esDemo}
        value={customer}
        onChange={c => {
          setCustomer(c)
          setF(current => ({ ...current, cliente: c.name }))
        }}
        billingTo={billingTo}
        onBillingChange={setBillingTo}
      />

      {/* Producto */}
      <div className="rounded-2xl border border-fono/20 bg-fono/[.04] p-4 md:col-span-2">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <Label>Producto</Label>
            <p className="mt-1 text-xs text-mute">Buscá por nombre, modelo o variante.</p>
          </div>
          <span className="text-xs font-medium text-fono-light">
            {productos.length} disponibles
          </span>
        </div>
        {nuevoProd ? (
          <div className="rounded-2xl border border-fono/25 bg-gradient-to-br from-fono/[.07] to-transparent p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-fono/15 text-fono-light"><Icon name="plus" className="h-4 w-4" /></span>
              <div><p className="text-sm font-bold">Nuevo producto</p><p className="text-[11px] text-mute">Se guarda en el catálogo y queda elegido para esta venta.</p></div>
            </div>
            <Input autoFocus value={nombreProd} onChange={e => setNombreProd(e.target.value)} placeholder="Nombre base (ej: Protector 17 Air)" autoCapitalize="words" />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-mute">Categoría
                <Select className="mt-1" value={nuevoDetalles.categoria} onChange={e => setNuevoDetalles(d => ({ ...d, categoria: e.target.value }))}>{['Accesorios', 'Celulares', 'iPad', 'Apple Watch', 'Mac', 'Otros'].map(c => <option key={c} value={c}>{c}</option>)}</Select>
              </label>
              <div className="text-xs text-mute">Condición
                <div className="mt-1 flex gap-1 rounded-xl border border-ink-600 bg-ink-800 p-1">{[['NEW', 'Nuevo'], ['USED', 'Seminuevo']].map(([value, label]) => <button key={value} type="button" onClick={() => setNuevoDetalles(d => ({ ...d, condicion: value }))} className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition ${nuevoDetalles.condicion === value ? 'bg-fono/15 text-fono-light' : 'text-mute hover:text-fore'}`}>{label}</button>)}</div>
              </div>
              <label className="block text-xs text-mute">Precio de venta (Gs) *<MoneyInput className="mt-1" value={nuevoDetalles.precio} onValueChange={v => setNuevoDetalles(d => ({ ...d, precio: v === '' ? '' : String(v) }))} placeholder="0" /></label>
              <label className="block text-xs text-mute">Precio mayorista (Gs)<MoneyInput className="mt-1" value={nuevoDetalles.mayorista} onValueChange={v => setNuevoDetalles(d => ({ ...d, mayorista: v === '' ? '' : String(v) }))} placeholder="Opcional" /></label>
              <label className="block text-xs text-mute">Costo (Gs)<MoneyInput className="mt-1" value={nuevoDetalles.costo} onValueChange={v => setNuevoDetalles(d => ({ ...d, costo: v === '' ? '' : String(v) }))} placeholder="Opcional" /></label>
            </div>
            <div>
              <div className="mb-1 text-[11px] font-bold uppercase text-mute">Colores (opcional)</div>
              <div className="flex gap-2">
                <Input value={colorInput} onChange={e => setColorInput(e.target.value)} placeholder="Ej: Azul" autoCapitalize="words" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarColor() } }} />
                <Button type="button" variant="outline" onClick={agregarColor}>+ Color</Button>
              </div>
              {coloresNuevos.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{coloresNuevos.map(c => <button key={c} type="button" onClick={() => setColoresNuevos(s => s.filter(x => x !== c))} className="rounded-full bg-fono/10 px-2.5 py-1 text-xs font-bold text-fono transition hover:bg-bad/15 hover:text-bad" title="Quitar">{c}</button>)}</div>}
              <p className="mt-1 text-[11px] text-mute">Sin colores: un solo producto. Con colores: una variante por color para elegir en cada venta.</p>
            </div>
            <div className="flex gap-2">
              <Button type="button" onClick={crearProducto} disabled={creandoProd || !nombreProd.trim()} className="flex-1">{creandoProd ? 'Creando…' : `Crear${coloresNuevos.length > 0 ? ` (${coloresNuevos.length} colores)` : ''}`}</Button>
              <Button type="button" variant="ghost" onClick={cancelarNuevoProd} disabled={creandoProd}><Icon name="close" className="h-4 w-4" /></Button>
            </div>
          </div>
        ) : (
          <>
            {puedeCrearProducto && <div className="mb-2 flex justify-end"><button type="button" onClick={() => setNuevoProd(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-fono/30 px-2.5 py-1.5 text-xs font-semibold text-fono-light transition hover:bg-fono/10"><Icon name="plus" className="h-3.5 w-3.5" /> Nuevo producto</button></div>}
            <div className="relative mb-2">
              <Icon
                name="search"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute"
              />
              <Input
                id="pos-busqueda-producto"
                value={busquedaProducto}
                onChange={e => setBusquedaProducto(e.target.value)}
                placeholder="Buscar producto…"
                aria-label="Buscar producto por texto"
                className="pl-9"
              />
            </div>
            <div
              className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2"
              aria-label="Resultados de productos"
            >
              {!esDemo && combos.length > 0 && <div className="sm:col-span-2 mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-fono/25 bg-fono/[.05] p-2.5"><span className="text-[11px] font-bold uppercase tracking-wider text-mute">Combos</span>{combos.map(combo => <button key={combo.id} type="button" onClick={() => agregarCombo(combo)} className="rounded-lg border border-fono/40 bg-ink-800 px-2.5 py-1.5 text-xs font-semibold text-fono-light transition hover:bg-fono/10" title={(combo.items || []).map(item => productos.find(p => p.id === item.productId)?.nombre || '').filter(Boolean).join(' + ')}>{combo.name} · {gs(combo.pricePyg)}</button>)}</div>}
            {noticeCombo && <p role="status" className="col-span-2 mb-2 rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-xs text-ok">{noticeCombo}</p>}
            {familiasVisibles.map(fam => {
                const p = fam.items[0]
                return (
                  <button
                    type="button"
                    key={fam.base}
                    onClick={() =>
                      elegirProducto({
                        target: { value: fam.items.length > 1 ? 'fam:' + fam.base : p.id },
                      })
                    }
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
                    <span>
                      <strong className="block text-sm">{fam.base}</strong>
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
            {familiaActiva && (
              <div className="flex items-center gap-2 mt-2">
                {itemActivo ? (
                  <Badge color="green"> {itemActivo.color || itemActivo.nombre}</Badge>
                ) : (
                  <Badge color="orange">Elegí un color</Badge>
                )}
                <button
                  type="button"
                  onClick={() => setModalColor(true)}
                  className="text-xs font-bold text-fono hover:underline"
                >
                  Cambiar color
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {f.productoId && (
        <ProductPrice
          key={f.productoId}
          esDemo={esDemo}
          product={productos.find(p => p.id === f.productoId)}
          price={f.precio}
          onChange={(precio, coupon = null) =>
            setF(current => ({
              ...current,
              precio,
              couponCode: typeof coupon === 'string' ? coupon : coupon?.couponCode || null,
            }))
          }
        />
      )}
      {precioMayorista && (
        <p className="md:col-span-2 -mt-2 rounded-lg border border-fono/25 bg-fono/5 px-3 py-1.5 text-xs font-semibold text-fono-light">
          Precio mayorista aplicado ({customer?.name || 'cliente mayorista'}). Ajustalo si hace falta.
        </p>
      )}
      {f.productoId && !esDemo && (
        <div className="md:col-span-2">
          <SerialUnitPicker
            product={productos.find(p => p.id === f.productoId)}
            customerName={customer.name || f.cliente}
            selectedSerials={f.serials}
            onChange={serials => setF(current => ({ ...current, serials }))}
            onRequiresSerial={setSerialRequired}
            disabled={guardando}
          />
          {serialRequired && !f.serials.length && Number(productos.find(p => p.id === f.productoId)?.stock || 0) === 0 && (
            <label className="mt-2 flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/5 p-3 text-sm text-mute">
              <input
                type="checkbox"
                checked={sobrePedido}
                onChange={e => setSobrePedido(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-warn"
              />
              <span>Vender <b className="text-fore">sin IMEI (sobre pedido)</b>: el cliente reserva sin stock; se completa el IMEI al entregar.</span>
            </label>
          )}
        </div>
      )}
      {f.productoId &&
        Number(productos.find(p => p.id === f.productoId)?.insuranceRate || 0) > 0 && (
          <label className="flex items-center gap-2 text-sm text-mute">
            <input
              type="checkbox"
              checked={f.soldWithoutInsurance}
              onChange={e => setF(s => ({ ...s, soldWithoutInsurance: e.target.checked }))}
              className="h-4 w-4 accent-fono"
            />{' '}
            Vendido sin seguro — no descontar seguro del margen
          </label>
        )}
      <div className="flex items-end">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full"
          onClick={agregarItem}
          disabled={
            !f.productoId || gsNum(f.precio) <= 0 || (serialRequired && !f.serials.length && !sobrePedido)
          }
        >
          Agregar a la lista
        </Button>
      </div>

      <div className="flex justify-end md:col-span-2">
        <Button
          type="button"
          disabled={!puedePaso2}
          onClick={siguientePaso}
          className="min-h-11 w-full sm:w-auto"
        >
          Revisar carrito <Icon name="chevron" className="ml-2 h-4 w-4 -rotate-90" />
        </Button>
      </div>
    </div>
  )
}
