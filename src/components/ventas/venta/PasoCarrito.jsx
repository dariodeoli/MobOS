import { Button, Input, Label, MoneyInput } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import ListaVenta from './ListaVenta'
import AutorizacionDescuento from './AutorizacionDescuento'
import AutorizacionBloque from './AutorizacionBloque'

export default function PasoCarrito({
  visible,
  items,
  productos,
  familias,
  esDemo,
  guardando,
  puedeDescontar,
  precioDe,
  precioListaDe,
  totalCarrito,
  quitarItem,
  editarItem,
  onImei,
  descuento,
  setDescuento,
  montoDescuento,
  customer,
  onAuthDescuento,
  montoPrecioBajo,
  productoBajoId,
  onAuthPrecio,
  tieneCupon,
  f,
  setF,
  onAtras,
  onSiguiente,
}) {
  return (
    <div className={visible ? 'contents' : 'hidden'}>
      {visible && <ListaVenta
        items={items}
        productos={productos}
        familias={familias}
        esDemo={esDemo}
        guardando={guardando}
        puedeDescontar={puedeDescontar}
        precioDe={precioDe}
        precioListaDe={precioListaDe}
        totalCarrito={totalCarrito}
        quitarItem={quitarItem}
        editarItem={editarItem}
        onImei={onImei}
      />}

      {/* Descuento extra */}
      <div>
        <Label htmlFor="descuento-extra-gs">Descuento extra (Gs)</Label>
        <MoneyInput id="descuento-extra-gs"
          value={descuento}
          onValueChange={setDescuento}
          placeholder="0"
        />
        {!puedeDescontar && (
          <p className="mt-1 text-xs text-mute">
            El descuento necesita autorización de gerencia: pedila acá y seguí cuando esté aprobada.
          </p>
        )}
        {tieneCupon && (
          <p className="mt-1 text-xs text-fono-light">
            Esta venta tiene cupón: el descuento extra debe quedar en cero.
          </p>
        )}
      </div>

      {!esDemo && !puedeDescontar && montoDescuento > 0 && (
        <AutorizacionDescuento
          monto={montoDescuento}
          customerId={customer?.id || null}
          onSelect={onAuthDescuento}
          bloqueado={guardando}
        />
      )}

      {!esDemo && !puedeDescontar && montoPrecioBajo > 0 && (
        <AutorizacionBloque
          kind="BELOW_LIST_PRICE"
          titulo="Precio por debajo de lista"
          descripcion="El precio manual de una línea está por debajo del precio de lista: gerencia tiene que autorizarlo."
          requestedValue={{ discountPyg: montoPrecioBajo, ...(productoBajoId ? { productId: productoBajoId } : {}) }}
          entity={productoBajoId ? 'PRODUCT' : undefined}
          entityId={productoBajoId || undefined}
          customerId={customer?.id || null}
          monto={montoPrecioBajo}
          onSelect={onAuthPrecio}
          bloqueado={guardando}
        />
      )}

      {/* Fecha */}
      <div>
        <Label htmlFor="fecha">Fecha</Label>
        <Input id="fecha"
          type="date"
          value={f.fecha}
          onChange={e => setF(s => ({ ...s, fecha: e.target.value, fechaManual: true }))}
        />
      </div>

      <div className="flex justify-between gap-2 md:col-span-2">
        <Button type="button" variant="ghost" onClick={onAtras} className="min-h-11">
          Atrás
        </Button>
        <Button type="button" onClick={onSiguiente} className="min-h-11">
          Ir a cobrar <Icon name="chevron" className="ml-2 h-4 w-4 -rotate-90" />
        </Button>
      </div>
    </div>
  )
}
