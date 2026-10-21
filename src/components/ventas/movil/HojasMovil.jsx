import { Button, Label, MoneyInput, Select, Textarea } from '@/components/ui'
import BottomSheet from '@/components/shared/BottomSheet'
import CheckAnimado from '@/components/shared/CheckAnimado'
import Icon from '@/components/shared/Icon'
import { ENTREGA } from '@/lib/catalog'
import { LIMITE_MONTO_VENTAS } from '@/utils/moneda'
import { capitalizarPrimera } from '@/utils/texto'
import { gs } from '@/utils/calculos'
import { clasificarPendientes } from './posMovil'

// Hojas del POS en celular (#429). Cada una envuelve UNA pieza que ya existe
// (carrito, cliente, entrega, nota) en una hoja inferior; ninguna duplica
// lógica de venta.

// Carrito: cliente arriba, el carrito de siempre (PasoCarrito) y «Cobrar» fijo.
export function HojaCarrito({ open, onClose, cliente, onCliente, total, cantidad, onCobrar, children }) {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Carrito"
      testId="hoja-carrito"
      footer={
        <Button
          type="button"
          data-testid="carrito-cobrar"
          className="min-h-14 w-full text-base"
          disabled={cantidad <= 0}
          onClick={onCobrar}
        >
          <span className="flex w-full items-center justify-between gap-3">
            <span className="font-bold">Cobrar</span>
            <span className="v2-numero tabular-nums">{gs(total)}</span>
          </span>
        </Button>
      }
    >
      <button
        type="button"
        data-testid="carrito-cliente"
        onClick={onCliente}
        className="mb-3 flex min-h-14 w-full items-center gap-3 rounded-2xl border border-info/35 bg-info/[.05] px-3 text-left"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-info/15 text-info-text">
          <Icon name="user" className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-mute">Cliente</span>
          <span className="block truncate text-sm font-bold">{cliente || 'Agregar cliente'}</span>
        </span>
        <Icon name="chevron" className="h-4 w-4 shrink-0 -rotate-90 text-mute" />
      </button>
      {children}
    </BottomSheet>
  )
}

// Cliente: la ficha de siempre (buscar, elegir, editar contacto y direcciones).
export function HojaCliente({ open, onClose, children }) {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Cliente"
      testId="hoja-cliente"
      footer={<Button type="button" className="min-h-12 w-full" onClick={onClose}>Listo</Button>}
    >
      {children}
    </BottomSheet>
  )
}

// Envío: tipo de entrega y costo (mismas reglas que el cobro de escritorio:
// el monto solo existe con Delivery o encomienda).
export function HojaEnvio({ open, onClose, f, setF }) {
  const cobraEnvio = f.entrega === 'Delivery' || f.entrega === 'Encomienda'
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Agregar envío"
      testId="hoja-envio"
      footer={<Button type="button" className="min-h-12 w-full" onClick={onClose}>Listo</Button>}
    >
      <div className="space-y-3">
        <div>
          <Label htmlFor="movil-entrega">Entrega</Label>
          <Select
            id="movil-entrega"
            value={f.entrega}
            onChange={event => {
              const entrega = event.target.value
              setF(actual => ({ ...actual, entrega, ...(entrega === 'Delivery' || entrega === 'Encomienda' ? {} : { montoDelivery: '' }) }))
            }}
          >
            {ENTREGA.map(x => (
              <option key={x} value={x}>{x === 'Encomienda' ? 'Envío por encomienda' : x}</option>
            ))}
          </Select>
        </div>
        {cobraEnvio && (
          <div>
            <Label htmlFor="movil-monto-entrega">{f.entrega === 'Encomienda' ? 'Costo de la encomienda (₲)' : 'Costo del envío (₲)'}</Label>
            <MoneyInput
              id="movil-monto-entrega"
              max={LIMITE_MONTO_VENTAS}
              value={f.montoDelivery}
              onValueChange={v => setF(s => ({ ...s, montoDelivery: v }))}
              placeholder="0"
              className="w-full"
            />
          </div>
        )}
      </div>
    </BottomSheet>
  )
}

export function HojaNota({ open, onClose, f, setF }) {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Agregar nota"
      testId="hoja-nota"
      footer={<Button type="button" className="min-h-12 w-full" onClick={onClose}>Listo</Button>}
    >
      <Label htmlFor="movil-observacion">Observación</Label>
      <Textarea
        id="movil-observacion"
        rows={4}
        autoFocus
        value={f.observacion}
        onChange={event => setF(current => ({ ...current, observacion: capitalizarPrimera(event.target.value) }))}
        placeholder="Notas, color, envío vía encomienda, etc."
        autoCapitalize="sentences"
      />
    </BottomSheet>
  )
}

// Producto sin stock al cobrar: «Vender igual» solo con permiso y nunca para
// equipos con IMEI (hay que elegir la unidad exacta).
export function HojaSinStock({ open, onClose, pendientes, permiso, onVenderIgual, onElegirUnidad }) {
  const { sinStock, conImei, puedeVenderIgual } = clasificarPendientes(pendientes, permiso)
  const total = pendientes.length
  // Equipos con IMEI y ninguna unidad disponible: no hay nada que elegir ni vender.
  const sinUnidades = conImei.filter(p => !(p.unidades > 0))
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={total === 1 ? 'El artículo no tiene stock' : 'Hay artículos sin stock'}
      testId="hoja-sin-stock"
      footer={
        <div className="grid gap-2">
          {sinStock.length > 0 && puedeVenderIgual && (
            <Button type="button" data-testid="sin-stock-vender-igual" className="min-h-14 w-full text-base" onClick={onVenderIgual}>
              Vender igual
            </Button>
          )}
          <Button type="button" variant="outline" data-testid="sin-stock-volver" className="min-h-12 w-full" onClick={onClose}>
            Volver
          </Button>
        </div>
      }
    >
      <ul className="space-y-2">
        {pendientes.map(p => (
          <li key={p.key} className="rounded-2xl border border-warn/40 bg-warn/[.06] p-3" data-testid={`sin-stock-${p.key}`}>
            <p className="truncate text-sm font-bold">{p.nombre}</p>
            <p className="text-xs text-mute">
              {p.motivo === 'imei'
                ? p.unidades > 0
                  ? 'Equipo con IMEI: elegí la unidad exacta antes de cobrar.'
                  : 'No hay unidades disponibles de este equipo. Quitalo del carrito para cobrar.'
                : `Pedís más de lo que hay${p.stock != null ? ` (stock ${p.stock})` : ''}.`}
            </p>
            {p.motivo === 'imei' && p.unidades > 0 && (
              <Button type="button" variant="outline" className="mt-2 min-h-11 w-full" onClick={() => onElegirUnidad(p.key)}>
                Elegir unidad{p.unidades > 1 ? ` (${p.unidades})` : ''}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {conImei.length > sinUnidades.length && (
        <p className="mt-3 text-xs text-mute">Los equipos con IMEI no se pueden vender sin elegir la unidad.</p>
      )}
    </BottomSheet>
  )
}

// Después de cobrar: vuelto, recibo y «Listo».
export function HojaExito({ open, onClose, titulo, total, vuelto, whatsapp, onImprimir, onVerPedido, cliente = '', nota = '', onVerCliente, esDemo, creditoPendiente = false, pregunta = null }) {
  const fila = 'flex min-h-14 w-full items-center gap-3 rounded-2xl border border-ink-600 bg-ink-800 px-4 text-left text-base font-semibold transition active:scale-[.99]'
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Venta registrada"
      size="full"
      testId="hoja-exito"
      footer={<Button type="button" data-testid="exito-listo" className="min-h-14 w-full text-base" onClick={onClose}>Nueva venta</Button>}
    >
      <div className="space-y-4">
        <div className="pos-exito-hero space-y-2 rounded-2xl border border-ok/35 bg-ok/[.06] px-4 py-6 text-center">
          <CheckAnimado size={48} className="mx-auto" />
          {titulo && <p className="text-lg font-extrabold">{titulo}</p>}
          {total > 0 && <p className="v2-numero text-2xl font-extrabold tabular-nums" data-testid="exito-total">{gs(total)}</p>}
          {esDemo && <p className="text-xs font-semibold text-mute">Modo demo: la venta queda guardada solo en este navegador.</p>}
        </div>
        {vuelto > 0 && (
          <div role="status" data-testid="exito-vuelto" className="pos-exito-vuelto rounded-2xl bg-ok px-4 py-4 text-center text-xl font-extrabold text-on-ok">
            Vuelto: <span className="tabular-nums">{gs(vuelto)}</span>
          </div>
        )}
        {(cliente || nota) && (
          <div className="rounded-2xl border border-ink-600 bg-ink-800 px-4 py-2 text-sm" data-testid="exito-resumen">
            {cliente && <div className="flex min-h-11 items-center justify-between gap-2">
              <span className="min-w-0"><span className="block text-xs text-mute">Cliente</span><b className="break-words" data-testid="exito-cliente">{cliente}</b></span>
              {onVerCliente && <button type="button" className="min-h-11 shrink-0 rounded-lg px-2 font-semibold text-fono-light" onClick={onVerCliente} data-testid="exito-ver-cliente">Ver cliente</button>}
            </div>}
            {nota && <p className="border-t border-ink-600 py-2" data-testid="exito-nota"><span className="block text-xs text-mute">Nota</span><span className="whitespace-pre-wrap break-words">{nota}</span></p>}
          </div>
        )}
        {creditoPendiente && (
          <div role="status" data-testid="exito-credito-pendiente" className="rounded-2xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm font-semibold text-warn-text">
            Pendiente de autorización de crédito: el cliente superaría su crédito. No se entrega hasta que un administrador o gerente lo autorice.
          </div>
        )}
        {pregunta}
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-mute">Enviar o imprimir el recibo</p>
          <div className="pos-exito-acciones grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
          {whatsapp && (
            <a className={fila} href={whatsapp} target="_blank" rel="noopener noreferrer" data-testid="exito-whatsapp">
              <Icon name="send" className="h-5 w-5 text-ok" /> WhatsApp
            </a>
          )}
          <button type="button" className={fila} onClick={onImprimir} data-testid="exito-imprimir">
            <Icon name="printer" className="h-5 w-5 text-fono-light" /> Comprobante / imprimir
          </button>
          </div>
          <button type="button" className={fila} onClick={onVerPedido} data-testid="exito-ver-pedido">
            <Icon name="receipt" className="h-5 w-5 text-fono-light" /> Ver pedido
          </button>
          <p className="text-xs text-mute">En Ver pedido podés enviar el comprobante por correo, gestionar al cliente y editar la nota.</p>
        </div>
      </div>
    </BottomSheet>
  )
}
