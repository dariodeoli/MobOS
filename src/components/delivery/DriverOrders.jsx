import { useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { api } from '@/lib/api/client'
import { Aviso, Badge, Button, Input, Modal, Money, MoneyInput, Select, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'
import { codigoPedido } from '@/utils/pedido'
import { useSellerData, SellerFeedback } from '@/components/ventas/SellerData'
import { deliveryFields, ENTREGA_LABELS, entregable, SIN_DATOS } from './datos'

const TONO_ESTADO = (fulfillment) => fulfillment === 'DELIVERED' ? 'green'
  : fulfillment === 'IN_TRANSIT' ? 'blue'
    : fulfillment === 'READY_FOR_PICKUP' ? 'orange'
      : 'slate'

function FilaMonto({ label, value, tono = '' }) {
  return (
    <p className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-mute">{label}</span>
      <span className={cn('text-sm font-semibold tabular-nums', tono)}><Money value={value} /></span>
    </p>
  )
}

function PedidoReparto({ row, onCobrar, onEstado, busy }) {
  const pendiente = row.pendiente > 0
  return (
    <article data-testid="reparto-pedido" data-pedido={row.number} className="rounded-2xl border border-fore/10 bg-ink-800/40 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-sm font-bold text-fono-light">{codigoPedido(row.number)}</span>
        <div className="flex flex-wrap items-center gap-2">
          {/* Pre-cobro: el total ya está cubierto en la calle, aunque la
              tienda todavía no verificó la rendición. */}
          {row.pendiente === 0 && row.cobrado > 0 && <Badge color="orange">Pre-pagado · sin rendir</Badge>}
          <Badge color={TONO_ESTADO(row.fulfillment)}>{ENTREGA_LABELS[row.fulfillment] || row.fulfillment}</Badge>
        </div>
      </header>
      <div className="mt-3 space-y-1">
        <p className="text-sm font-semibold" data-testid="reparto-cliente">{row.cliente}</p>
        {row.direccion && (
          <p className="flex items-start gap-1.5 text-xs text-mute">
            <Icon name="store" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{row.direccion}{row.direccionNotas ? ` · ${row.direccionNotas}` : ''}</span>
          </p>
        )}
        {row.telefono && (
          <p className="flex items-center gap-1.5 text-xs">
            <Icon name="phone" className="h-3.5 w-3.5 shrink-0 text-mute" />
            <a href={`tel:+${row.telefono}`} className="text-fono-light hover:underline">{row.telefonoVisible || `+${row.telefono}`}</a>
          </p>
        )}
        {row.articulos.length > 0 && <p className="text-xs text-mute">{row.articulos.join(' · ')}</p>}
        {row.deliveryNotes && <p className="text-xs text-mute">Entrega: {row.deliveryNotes}</p>}
      </div>
      <div className="mt-3 space-y-1 rounded-xl border border-fore/10 bg-ink-700/30 p-3">
        <FilaMonto label="Total" value={row.total} />
        <FilaMonto label="Confirmado en tienda" value={row.confirmado} />
        {row.cobrado > 0 && <FilaMonto label="Cobrado en la calle (sin rendir)" value={row.cobrado} tono="text-warn" />}
        <FilaMonto label="Falta cobrar" value={row.pendiente} tono={pendiente ? 'text-bad' : 'text-ok'} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {entregable(row.fulfillment) && (
          <Button type="button" variant="outline" disabled={busy} onClick={() => onEstado(row, 'IN_TRANSIT')}>
            <Icon name="truck" className="h-4 w-4" />En camino
          </Button>
        )}
        {entregable(row.fulfillment) && (
          <Button type="button" disabled={busy} onClick={() => onEstado(row, 'DELIVERED')}>
            <Icon name="check" className="h-4 w-4" />Marcar entregado
          </Button>
        )}
        {pendiente && (
          <Button type="button" variant="outline" disabled={busy} onClick={() => onCobrar(row)} data-testid="reparto-cobrar">
            <Icon name="money" className="h-4 w-4" />Registrar cobro
          </Button>
        )}
      </div>
    </article>
  )
}

export default function DriverOrders() {
  const { esDemo } = useSesion()
  const toast = useToast()
  const [estado, setEstado] = useState('activos')
  const [cobro, setCobro] = useState(null)
  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState('CASH')
  const [referencia, setReferencia] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const data = useSellerData(`/api/delivery/orders?estado=${estado}`, deliveryFields, SIN_DATOS, esDemo, { limit: 50 })
  const [ocupado, setOcupado] = useState('')

  function abrirCobro(row) {
    setCobro(row); setMonto(row.pendiente); setMetodo('CASH'); setReferencia(''); setError('')
  }

  async function registrarCobro() {
    if (!cobro || enviando) return
    const montoNumero = Number(monto)
    if (!Number.isSafeInteger(montoNumero) || montoNumero <= 0) { setError('Ingresá un monto mayor a cero.'); return }
    if (montoNumero > cobro.pendiente) { setError(`El cobro supera el saldo (falta ${cobro.pendiente.toLocaleString('es-PY')} Gs).`); return }
    setEnviando(true); setError('')
    try {
      await api.post(`/api/delivery/orders/${encodeURIComponent(cobro.id)}/collections`, {
        amountPyg: montoNumero,
        method: metodo,
        ...(referencia.trim() ? { reference: referencia.trim() } : {}),
      }, { headers: { 'Idempotency-Key': `delivery-${cobro.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` } })
      toast.success('Cobro registrado', 'Queda pendiente de rendir en la tienda.')
      setCobro(null)
      data.refresh()
    } catch (cause) {
      setError(cause?.message || 'No se pudo registrar el cobro.')
    } finally { setEnviando(false) }
  }

  async function cambiarEstado(row, fulfillmentStatus) {
    if (ocupado) return
    setOcupado(row.id)
    try {
      await api.post(`/api/delivery/orders/${encodeURIComponent(row.id)}/status`, { fulfillmentStatus })
      toast.success('Reparto actualizado', `${codigoPedido(row.number)}: ${ENTREGA_LABELS[fulfillmentStatus]}.`)
      data.refresh()
    } catch (cause) {
      toast.error('No se pudo actualizar', cause?.message || 'Intentá de nuevo.')
    } finally { setOcupado('') }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-xl border border-ink-600 bg-ink-800 p-1">
          {[['activos', 'A entregar'], ['entregados', 'Entregados']].map(([id, label]) => (
            <button key={id} type="button" onClick={() => setEstado(id)} className={cn('rounded-lg px-2.5 py-1.5 text-xs font-semibold transition', estado === id ? 'bg-fono/15 text-fono-light' : 'text-mute hover:text-fore')}>{label}</button>
          ))}
        </div>
        <button type="button" onClick={data.refresh} disabled={data.loading} className="ml-auto rounded-lg border border-ink-500 px-3 py-2 text-xs font-semibold text-mute transition hover:border-fono hover:text-fore">Actualizar</button>
      </div>
      <SellerFeedback {...data} empty={!data.rows.length} />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.rows.map(row => <PedidoReparto key={row.id} row={row} onCobrar={abrirCobro} onEstado={cambiarEstado} busy={ocupado === row.id} />)}
      </div>

<<<<<<< HEAD
      <Modal open={Boolean(cobro)} onClose={() => !enviando && setCobro(null)} title="Registrar cobro en la calle" size="corto">
=======
      <Modal open={Boolean(cobro)} onClose={() => !enviando && setCobro(null)} title="Registrar cobro en la calle" size="sm">
>>>>>>> origin/slot/diseno
        {cobro && (
          <div className="space-y-4">
            <p className="text-sm text-mute">
              {codigoPedido(cobro.number)} · {cobro.cliente}. Falta cobrar <strong className="text-fore"><Money value={cobro.pendiente} /></strong>.
            </p>
            <div>
              <label htmlFor="delivery-monto" className="block text-sm font-semibold">Monto cobrado</label>
              <MoneyInput id="delivery-monto" autoFocus className="mt-2 w-full" value={monto} onValueChange={setMonto} aria-describedby="delivery-monto-help" />
              <p id="delivery-monto-help" className="mt-1 text-xs text-mute">Podés cobrar el total o una parte.</p>
            </div>
            <div>
              <label htmlFor="delivery-metodo" className="block text-sm font-semibold">Medio</label>
              <Select id="delivery-metodo" className="mt-2 w-full" value={metodo} onChange={event => setMetodo(event.target.value)}>
                <option value="CASH">Efectivo</option>
                <option value="TRANSFER">Transferencia</option>
              </Select>
            </div>
            {metodo === 'TRANSFER' && (
              <div>
                <label htmlFor="delivery-referencia" className="block text-sm font-semibold">Referencia (opcional)</label>
                <Input id="delivery-referencia" className="mt-2 w-full" value={referencia} onChange={event => setReferencia(event.target.value)} placeholder="N.º de operación o banco" maxLength={200} />
              </div>
            )}
            {error && <Aviso tono="error">{error}</Aviso>}
            <p className="rounded-xl border border-warn/25 bg-warn/10 px-3 py-2 text-xs text-warn">
              El cobro queda pendiente hasta que la tienda verifique tu rendición.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" disabled={enviando} onClick={() => setCobro(null)}>Cancelar</Button>
              <Button type="button" disabled={enviando} onClick={registrarCobro} data-testid="reparto-cobro-confirmar">{enviando ? 'Registrando…' : 'Registrar cobro'}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
