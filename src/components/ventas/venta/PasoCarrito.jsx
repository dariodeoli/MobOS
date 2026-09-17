import { Button, Input, Label, MoneyInput } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import ListaVenta from './ListaVenta'

export default function PasoCarrito({
  visible,
  items,
  productos,
  familias,
  esDemo,
  guardando,
  puedeDescontar,
  precioDe,
  totalCarrito,
  quitarItem,
  editarItem,
  onImei,
  descuento,
  setDescuento,
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
        totalCarrito={totalCarrito}
        quitarItem={quitarItem}
        editarItem={editarItem}
        onImei={onImei}
      />}

      {/* Descuento extra */}
      <div>
        <Label>Descuento extra (Gs)</Label>
        <MoneyInput
          value={descuento}
          onValueChange={setDescuento}
          placeholder="0"
          disabled={!puedeDescontar}
        />
        {!puedeDescontar && (
          <p className="mt-1 text-xs text-mute">
            Solo administradores y gerentes pueden aplicar descuentos.
          </p>
        )}
        {tieneCupon && (
          <p className="mt-1 text-xs text-fono-light">
            Esta venta tiene cupón: el descuento extra debe quedar en cero.
          </p>
        )}
      </div>

      {/* Fecha */}
      <div>
        <Label>Fecha</Label>
        <Input
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
