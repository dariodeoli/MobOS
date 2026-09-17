import { useState } from 'react'
import { Badge, Button, Input, MoneyInput, Select } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import PercentField from '@/components/shared/PercentField'
import { api } from '@/lib/api/client'
import { quoteDemoPromotion } from '@/lib/demoPromotions'
import { gs } from '@/utils/calculos'
import { serialEnmascarado } from '@/utils/serial'

// Fila editable de la venta: cantidad, precio de venta, color/variante, IMEI,
// descuento de línea y cupón en un solo lugar. El total se recalcula en el
// padre a partir de estos campos.
export default function FilaVenta({
  item,
  producto,
  variantes = [],
  puedeDescontar,
  esDemo,
  guardando,
  precioDe,
  onEditar,
  onQuitar,
  onImei,
}) {
  const [cuponAbierto, setCuponAbierto] = useState(Boolean(item.couponCode))
  const [cupon, setCupon] = useState('')
  const [cuponBusy, setCuponBusy] = useState(false)
  const [cuponError, setCuponError] = useState('')

  const cantidad = Math.max(1, Number(item.quantity) || 1)
  const precio = Number(item.precio) || 0
  const lista = Number(producto?.precioVenta) || 0
  const descuentoLinea =
    Number(item.descuentoPct || 0) > 0
      ? Math.round((precio * cantidad * Number(item.descuentoPct)) / 100)
      : Math.min(Number(String(item.descuento || '').replace(/\D/g, '')) || 0, precio * cantidad)
  const ahorroLista = lista > precio ? (lista - precio) * cantidad : 0
  const total = precio * cantidad - descuentoLinea

  async function aplicarCupon() {
    const code = cupon.trim()
    if (!code || !producto || cuponBusy) return
    setCuponBusy(true); setCuponError('')
    try {
      const quote = esDemo
        ? quoteDemoPromotion(producto, cantidad, code)
        : await api.post('/api/promotions/quote', { productId: producto.id, quantity: cantidad, couponCode: code })
      onEditar({ precio: Number(quote.unitPricePyg) || 0, couponCode: quote.couponCode })
      setCupon('')
    } catch (cause) {
      setCuponError(cause?.message || 'No se pudo aplicar el cupón.')
    } finally {
      setCuponBusy(false)
    }
  }

  function cambiarVariante(productoId) {
    const variante = variantes.find(option => option.id === productoId)
    if (!variante) return
    onEditar({
      productoId: variante.id,
      nombre: variante.nombre,
      precio: precioDe ? precioDe(variante) : Number(variante.precioVenta) || 0,
      serials: [],
      couponCode: null,
    })
  }

  return (
    <div className="px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <b className="truncate text-sm">{item.nombre}</b>
            {item.couponCode && <Badge color="green">Cupón {item.couponCode}</Badge>}
            {item.serials?.length > 0 && (
              <Badge color="blue">IMEI {serialEnmascarado(item.serials[0])}</Badge>
            )}
            {item.sobrePedido && <Badge color="orange">Sobre pedido</Badge>}
            {item.soldWithoutInsurance && <Badge color="slate">Sin seguro</Badge>}
          </div>
          <p className="mt-1 text-[11px] text-mute">
            {lista > 0 ? <>Precio de lista {gs(lista)}</> : 'Sin precio de lista: definí el precio de venta'}
            {ahorroLista > 0 && <span className="ml-2 font-semibold text-warn">descuento − {gs(ahorroLista)}</span>}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          {variantes.length > 1 && (
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-mute">Color</span>
              <Select
                aria-label={`Color de ${item.nombre}`}
                className="h-9 w-40"
                value={item.productoId}
                disabled={guardando}
                onChange={event => cambiarVariante(event.target.value)}
              >
                {variantes.map(variante => (
                  <option key={variante.id} value={variante.id}>{variante.color || variante.nombre}</option>
                ))}
              </Select>
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-mute">Cantidad</span>
            <Input
              aria-label={`Cantidad de ${item.nombre}`}
              className="h-9 w-16 text-center tabular-nums"
              inputMode="numeric"
              maxLength={4}
              disabled={guardando}
              value={String(cantidad)}
              onChange={event => onEditar({ quantity: Number(event.target.value.replace(/\D/g, '') || 1) })}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-mute">Precio de venta</span>
            <MoneyInput
              aria-label={`Precio de venta de ${item.nombre}`}
              className="h-9 w-40"
              disabled={guardando}
              value={Number(item.precio) || 0}
              onValueChange={value => onEditar({ precio: value === '' ? 0 : Number(value) })}
            />
          </label>
          <div className="w-28 text-right">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-mute">Total</span>
            <span className="block h-9 truncate pt-1.5 text-sm font-extrabold tabular-nums text-fono-light">{gs(total)}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-9 px-3 text-xs"
            disabled={guardando}
            onClick={onImei}
          >
            {item.serials?.length ? 'Cambiar IMEI' : 'Elegir IMEI'}
          </Button>
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-lg text-mute transition hover:bg-bad/10 hover:text-bad"
            title="Quitar producto"
            aria-label={`Quitar ${item.nombre}`}
            disabled={guardando}
            onClick={onQuitar}
          >
            <Icon name="trash" className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-mute">
        {puedeDescontar && (
          <span className="flex items-center gap-2">
            Descuento línea:
            <PercentField
              aria-label={`Descuento % de ${item.nombre}`}
              value={item.descuentoPct || ''}
              onChange={value => onEditar({ descuentoPct: value, descuento: '' })}
              placeholder="%"
              className="h-8 w-16 px-2 py-1 text-xs"
            />
            <MoneyInput
              aria-label={`Descuento fijo de ${item.nombre}`}
              value={item.descuento || ''}
              onValueChange={value => onEditar({ descuento: value === '' ? '' : String(value), descuentoPct: '' })}
              placeholder="Gs 0"
              className="h-8 w-32"
            />
          </span>
        )}
        <button
          type="button"
          className="font-semibold text-fono-light hover:underline"
          onClick={() => setCuponAbierto(open => !open)}
        >
          {item.couponCode ? 'Cambiar cupón' : 'Aplicar cupón'}
        </button>
        {item.couponCode && (
          <button
            type="button"
            className="text-mute hover:text-bad"
            onClick={() => onEditar({ couponCode: null, precio: lista || precio })}
          >
            Quitar cupón
          </button>
        )}
        {cuponAbierto && (
          <span className="flex flex-wrap items-center gap-2">
            <Input
              aria-label={`Código de cupón de ${item.nombre}`}
              className="h-8 w-40"
              maxLength={40}
              value={cupon}
              onChange={event => setCupon(event.target.value)}
              placeholder="Código del cupón"
            />
            <Button type="button" variant="outline" className="h-8 px-3 text-xs" disabled={cuponBusy || !cupon.trim()} onClick={aplicarCupon}>
              {cuponBusy ? 'Validando…' : 'Aplicar'}
            </Button>
          </span>
        )}
        {cuponError && <span role="alert" className="text-bad">{cuponError}</span>}
      </div>
    </div>
  )
}
