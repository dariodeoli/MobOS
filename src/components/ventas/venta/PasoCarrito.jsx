import { Button, Input, Label, MoneyInput } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import PercentField from '@/components/shared/PercentField'
import { gs } from '@/utils/calculos'

export default function PasoCarrito({
  visible,
  ocultarCarrito,
  items,
  puedeDescontar,
  descuentoItem,
  totalCarrito,
  quitarItem,
  editarDescuento,
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
      {/* Carrito: productos agregados al mismo cliente */}
      {!ocultarCarrito && items.length > 0 && (
        <div className="md:col-span-2 rounded-xl border border-ink-600 divide-y divide-ink-600">
          {items.map(it => (
            <div key={it.key} className="px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium truncate">
                  {it.nombre}
                  {(it.quantity || 1) > 1 && (
                    <small className="ml-2 text-fono-light">×{it.quantity}</small>
                  )}
                  {it.serials?.length > 0 && (
                    <small className="ml-2 text-fono-light">
                      IMEI ••••{it.serials[0].slice(-4)}
                    </small>
                  )}
                  {it.couponCode && (
                    <small className="ml-2 text-fono-light">Cupón {it.couponCode}</small>
                  )}
                  {it.soldWithoutInsurance && (
                    <small className="ml-2 text-warn">Sin seguro</small>
                  )}
                  {it.sobrePedido && (
                    <small className="ml-2 text-warn">Sobre pedido</small>
                  )}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-bold text-fono">
                    {descuentoItem(it) > 0 && <small className="mr-1 text-warn">−{gs(descuentoItem(it))}</small>}
                    {gs(it.precio * (it.quantity || 1) - descuentoItem(it))}
                  </span>
                  <button
                    type="button"
                    onClick={() => quitarItem(it.key)}
                    className="text-mute hover:text-bad"
                    title="Quitar"
                  >
                    <Icon name="trash" className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {puedeDescontar && (
                <div className="mt-1.5 flex items-center gap-2 text-[11px] text-mute">
                  <span>Descuento línea:</span>
                  <PercentField
                    aria-label={`Descuento % de ${it.nombre}`}
                    value={it.descuentoPct || ''}
                    onChange={value => editarDescuento(it.key, { descuentoPct: value, descuento: '' })}
                    placeholder="%"
                    className="w-14 px-2 py-1 text-xs"
                  />
                  <MoneyInput
                    aria-label={`Descuento fijo de ${it.nombre}`}
                    value={it.descuento || ''}
                    onValueChange={v => editarDescuento(it.key, { descuento: v === '' ? '' : String(v), descuentoPct: '' })}
                    placeholder="Gs 0"
                    className="w-36"
                  />
                </div>
              )}
            </div>
          ))}
          <div className="flex items-center justify-between px-3 py-1.5 bg-ink-700">
            <span className="text-xs font-bold uppercase text-mute">
              Subtotal ({items.reduce((a, it) => a + (it.quantity || 1), 0)})
            </span>
            <span className="text-sm font-extrabold">{gs(totalCarrito)}</span>
          </div>
        </div>
      )}

      {/* Estado de pago */}
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
