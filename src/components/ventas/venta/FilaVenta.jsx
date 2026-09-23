import { useState } from 'react'
import { Badge, ConfirmDialog, Input, MoneyInput, Select } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import PercentField from '@/components/shared/PercentField'
import { api } from '@/lib/api/client'
import { quoteDemoPromotion } from '@/lib/demoPromotions'
import { gs } from '@/utils/calculos'
import { serialEnmascarado } from '@/utils/serial'
import { LIMITE_MONTO_VENTAS, montoUsd } from '@/utils/moneda'
import { ROTULO_DATO } from '@/components/shared/tabla'
import { cn } from '@/lib/utils'
import IconoCategoria from '@/components/shared/IconoCategoria'

// Fila editable de la venta (#225, colapso máximo #243): la línea colapsada
// muestra solo lo esencial — foto/ícono, nombre, estado del IMEI y total de la
// línea (con el descuento individual visible, #148 §5) —; cantidad, precio de
// venta, variantes, descuento, cupón, stock y las acciones (quitar IMEI,
// eliminar) viven detrás del chevron.
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
  const [abierta, setAbierta] = useState(false)
  const [cuponAbierto, setCuponAbierto] = useState(Boolean(item.couponCode))
  const [cupon, setCupon] = useState('')
  const [cuponBusy, setCuponBusy] = useState(false)
  const [cuponError, setCuponError] = useState('')
  const [confirmarQuitar, setConfirmarQuitar] = useState(false)

  // Imagen/modelo/capacidad/stock de la ficha viva del producto (el nombre, el
  // precio y los seriales vienen congelados en la línea).
  const imagen = producto?.imageUrl || producto?.imagen || ''
  const modelo = producto?.model || producto?.modelo || ''
  const capacidad = producto?.capacity || producto?.capacidad || ''
  const stock = Number(producto?.stock)
  const agotado = Number.isFinite(stock) && stock <= 0 && !item.sobrePedido
  const cantidad = Math.max(1, Number(item.quantity) || 1)
  const precio = Number(item.precio) || 0
  const lista = Number(item.precioListaValor ?? producto?.precioVenta) || 0
  const descuentoLinea =
    Number(item.descuentoPct || 0) > 0
      ? Math.round((precio * cantidad * Number(item.descuentoPct)) / 100)
      : Math.min(Number(String(item.descuento || '').replace(/\D/g, '')) || 0, precio * cantidad)
  const ahorroLista = lista > precio ? (lista - precio) * cantidad : 0
  const total = precio * cantidad - descuentoLinea
  const tieneImei = (item.serials?.length || 0) > 0

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

  // Motivos por los que la línea pide confirmación antes de eliminarse (#243):
  // perder un descuento/cupón o el IMEI ya elegido no puede ser un clic solo.
  const motivosQuitar = [
    descuentoLinea > 0 || item.couponCode ? 'un descuento' : null,
    tieneImei ? 'un IMEI elegido' : null,
  ].filter(Boolean)

  function pedirQuitar() {
    if (motivosQuitar.length) setConfirmarQuitar(true)
    else onQuitar()
  }

  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-2.5">
        {imagen ? (
          <img src={imagen} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
        ) : (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-fono/10 text-fono-light">
            <IconoCategoria categoria={producto?.category || producto?.categoria || producto?.name || producto?.nombre || ''} className="h-5 w-5" />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <b className="truncate text-sm" title={item.nombre}>{item.nombre}</b>
            {/* Avisos que no pueden esperar al detalle. */}
            {item.sobrePedido && <Badge color="orange">Sobre pedido</Badge>}
            {agotado && <Badge color="red">Agotado</Badge>}
            {item.soldWithoutInsurance && <Badge color="slate">Sin seguro</Badge>}
          </div>
          {/* Segunda línea: el IMEI (se toca para elegir/cambiar) y la papelera,
              visible también colapsada (#243): si la línea tiene descuento,
              cupón o IMEI elegido, pide confirmación antes de eliminarla. */}
          <div className="mt-0.5 flex items-center justify-between gap-1">
            <button
              type="button"
              aria-label={tieneImei ? `Cambiar IMEI de ${item.nombre}` : `Elegir IMEI de ${item.nombre} (pendiente)`}
              title={tieneImei ? 'Cambiar IMEI' : 'Falta elegir IMEI'}
              disabled={guardando}
              onClick={onImei}
              className={cn(
                'flex min-w-0 items-center gap-1 truncate text-left font-mono text-[11px] transition hover:underline disabled:opacity-60',
                tieneImei ? 'text-mute' : 'font-semibold text-warn',
              )}
            >
              <Icon name="box" className={cn('h-3.5 w-3.5 shrink-0', tieneImei ? 'text-ok' : 'text-warn')} />
              <span className="truncate">
                {tieneImei
                  ? `IMEI ${abierta ? item.serials.join(' · ') : serialEnmascarado(item.serials[0])}`
                  : 'Falta elegir IMEI'}
              </span>
            </button>
            <button
              type="button"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-mute transition hover:bg-bad/10 hover:text-bad disabled:opacity-50"
              title="Eliminar línea"
              aria-label={`Eliminar ${item.nombre}`}
              disabled={guardando}
              onClick={pedirQuitar}
            >
              <Icon name="trash" className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <div className="text-right">
            <span className="v2-numero block text-sm font-extrabold tabular-nums text-fono-light">{gs(total)}</span>
            {descuentoLinea > 0 && (
              <span className="block text-[10px] font-semibold text-warn">descuento − {gs(descuentoLinea)}</span>
            )}
          </div>
          <button
            type="button"
            className="grid h-8 w-8 place-items-center rounded-lg text-mute transition hover:bg-ink-700 hover:text-fore"
            aria-expanded={abierta}
            aria-label={abierta ? `Ver menos detalle de ${item.nombre}` : `Ver detalle de ${item.nombre}`}
            title={abierta ? 'Ver menos' : 'Ver detalle'}
            onClick={() => setAbierta(value => !value)}
          >
            <Icon name="back" className={cn('h-4 w-4 transition', abierta ? 'rotate-90' : '-rotate-90')} />
          </button>
        </div>
      </div>

      {abierta && (
        <div className="mt-2.5 border-t border-ink-600/70 pt-2.5">
          {/* Origen del precio y cupón: el detalle que explica el total. */}
          {(item.couponCode || ['LIST', 'TIER', 'WHOLESALE', 'USD'].includes(item.precioOrigen)) && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {item.couponCode && <Badge color="green">Cupón {item.couponCode}</Badge>}
              {item.precioOrigen === 'LIST' && <Badge color="blue">{item.precioLista ? `Lista ${item.precioLista}` : 'Precio de lista'}</Badge>}
              {item.precioOrigen === 'TIER' && <Badge color="green">{item.precioMinQty}+ unidades</Badge>}
              {item.precioOrigen === 'WHOLESALE' && <Badge color="orange">Mayorista</Badge>}
              {item.precioOrigen === 'USD' && <Badge color="slate">{`Precio en ${montoUsd(item.precioUsd)}`}</Badge>}
            </div>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className={cn('mb-1 block', ROTULO_DATO)}>Cantidad</span>
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
              <span className={cn('mb-1 block', ROTULO_DATO)}>Precio de venta</span>
              <MoneyInput
                aria-label={`Precio de venta de ${item.nombre}`}
                max={LIMITE_MONTO_VENTAS}
                className="h-9 w-40"
                disabled={guardando}
                value={Number(item.precio) || 0}
                onValueChange={value => onEditar({ precio: value === '' ? 0 : Number(value) })}
              />
            </label>
            {variantes.length > 1 && (
              <label className="block">
                <span className={cn('mb-1 block', ROTULO_DATO)}>Color</span>
                <Select
                  aria-label={`Color de ${item.nombre}`}
                  className="h-9 w-36"
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
          </div>

          <p className="mt-2 text-[11px] text-mute">
            {lista > 0 ? <>Precio de lista {gs(lista)}</> : 'Sin precio de lista: definí el precio de venta'}
            {ahorroLista > 0 && <span className="ml-2 font-semibold text-warn">descuento − {gs(ahorroLista)}</span>}
          </p>
          {(modelo || capacidad || Number.isFinite(stock)) && (
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-mute">
              {(modelo || capacidad) && <span>{[modelo, capacidad].filter(Boolean).join(' · ')}</span>}
              {Number.isFinite(stock) && (agotado
                ? <span className="font-semibold text-bad">Agotado</span>
                : <span>{stock} en stock</span>)}
            </p>
          )}

          {puedeDescontar && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-mute">
              <span>Descuento línea:</span>
              <PercentField
                aria-label={`Descuento % de ${item.nombre}`}
                value={item.descuentoPct || ''}
                onChange={value => onEditar({ descuentoPct: value, descuento: '' })}
                placeholder="%"
                className="h-8 w-16 px-2 py-1 text-xs"
              />
              <MoneyInput
                aria-label={`Descuento fijo de ${item.nombre}`}
                max={LIMITE_MONTO_VENTAS}
                value={item.descuento || ''}
                onValueChange={value => onEditar({ descuento: value === '' ? '' : String(value), descuentoPct: '' })}
                placeholder="Gs 0"
                className="h-8 w-32"
              />
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-mute">
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
                <button
                  type="button"
                  className="rounded-lg border border-fono/40 px-3 py-1.5 text-xs font-semibold text-fono-light transition hover:bg-fono/10 disabled:opacity-50"
                  disabled={cuponBusy || !cupon.trim()}
                  onClick={aplicarCupon}
                >
                  {cuponBusy ? 'Validando…' : 'Aplicar'}
                </button>
              </span>
            )}
            {cuponError && <span role="alert" className="text-bad">{cuponError}</span>}
          </div>

          {tieneImei && (
            <div className="mt-2">
              <button
                type="button"
                className="text-[11px] text-mute hover:text-bad"
                onClick={() => onEditar({ serials: [] })}
              >
                Quitar IMEI
              </button>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmarQuitar}
        onCancel={() => setConfirmarQuitar(false)}
        onConfirm={() => {
          setConfirmarQuitar(false)
          onQuitar()
        }}
        title="¿Eliminar la línea?"
        description={`${item.nombre} tiene ${motivosQuitar.join(' y ')}: si la quitás, se pierde ese dato.`}
        confirmLabel="Eliminar línea"
        variant="danger"
      />
    </div>
  )
}
