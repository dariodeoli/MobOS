import { useCallback, useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { api } from '@/lib/api/client'
import { Aviso, Badge, Button, Input, Money, MoneyInput, Select, useToast } from '@/components/ui'
import Popup from '@/components/shared/Popup'
import Icon from '@/components/shared/Icon'
import ListaDensa from '@/components/shared/ListaDensa'
import WhatsAppMenu from '@/components/shared/WhatsAppMenu'
import AvisarPorCorreo from '@/components/shared/AvisarPorCorreo'
import { plantillaDeEntrega } from '@/lib/avisos'
import { usePaginaLista } from '@/components/shared/usePaginaLista'
import { ChipsReparto } from './ChipsReparto'
import './entregasF3.css'
import '@/components/shared/operacionRediseno.css'
import { codigoPedido } from '@/utils/pedido'
import { montoTexto } from '@/utils/moneda'
import { useSellerData, SellerFeedback } from '@/components/ventas/SellerData'
import { deliveryFields, ENTREGA_LABELS, entregable } from './datos'
import { cambiarEstadoRepartoDemo, listDemoDeliveryOrdersDelRepartidor, registrarCobroRepartoDemo } from '@/lib/demo/delivery.js'

const TONO_ESTADO = (fulfillment) => fulfillment === 'DELIVERED' ? 'green'
  : fulfillment === 'IN_TRANSIT' ? 'blue'
    : fulfillment === 'READY_FOR_PICKUP' ? 'orange'
      : 'slate'

// Variables de la plantilla para un reparto (mismas claves que los pedidos).
const contextoAviso = (row) => ({
  cliente: row.cliente || 'cliente',
  nombre: row.cliente || 'cliente',
  pedido: codigoPedido(row.number),
  total: montoTexto(row.total),
  saldo_pendiente: montoTexto(row.pendiente),
  producto: (row.articulos?.[0] || '').replace(/^\d+×\s*/, ''),
})

function FilaMonto({ label, value, tono = '' }) {
  return (
    <span>
      {label}
      <strong className={tono}><Money value={value} /></strong>
    </span>
  )
}

function PedidoReparto({ row, onCobrar, onEstado, busy }) {
  const pendiente = row.pendiente > 0
  return (
    <article data-testid="reparto-pedido" data-pedido={row.number} className="entregas-f3-order">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-sm font-semibold">{codigoPedido(row.number)}</span>
        <div className="flex flex-wrap items-center gap-2">
          {/* Pre-cobro: el total ya está cubierto en la calle, aunque la
              tienda todavía no verificó la rendición. */}
          {row.pendiente === 0 && row.cobrado > 0 && <Badge color="orange">Pre-pagado · sin rendir</Badge>}
          <Badge color={TONO_ESTADO(row.fulfillment)}>{ENTREGA_LABELS[row.fulfillment] || row.fulfillment}</Badge>
        </div>
      </header>
      <h2 className="entregas-f3-name" data-testid="reparto-cliente">{row.cliente}</h2>
      {row.direccion && (
        <p className="entregas-f3-address">
          <span className="text-mute">Dirección: </span>
          {row.direccion}{row.direccionNotas ? ` · ${row.direccionNotas}` : ''}
        </p>
      )}
      {row.telefono && (
        <p className="entregas-f3-address">
          <Icon name="phone" className="mr-1.5 inline h-3.5 w-3.5 text-mute" />
          <a href={`tel:+${row.telefono}`} className="entregas-f3-tel">{row.telefonoVisible || `+${row.telefono}`}</a>
        </p>
      )}
      {row.articulos.length > 0 && <p className="entregas-f3-items">{row.articulos.join(' · ')}</p>}
      {row.deliveryNotes && <p className="entregas-f3-items">Entrega: {row.deliveryNotes}</p>}
      <div className="entregas-f3-amounts">
        <FilaMonto label="Total" value={row.total} />
        <FilaMonto label="Confirmado en tienda" value={row.confirmado} />
        {row.cobrado > 0 && <FilaMonto label="Cobrado en la calle (sin rendir)" value={row.cobrado} tono="text-warn" />}
        <FilaMonto label="Falta cobrar" value={row.pendiente} tono={pendiente ? 'text-bad' : 'text-ok'} />
      </div>
      <div className="entregas-f3-actions">
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
        {/* Avisar al cliente con la plantilla del estado del reparto; no envía solo. */}
        {row.telefonoCliente && (
          <WhatsAppMenu
            telefono={row.telefonoCliente}
            countryCode={row.codigoPais}
            category="ORDERS"
            preferKey={plantillaDeEntrega(row.fulfillment === 'PROCESSING' ? 'IN_TRANSIT' : row.fulfillment)}
            contexto={contextoAviso(row)}
            title={row.cliente}
            disabled={busy}
          />
        )}
        <AvisarPorCorreo email={row.email} category="ORDERS" evento={plantillaDeEntrega(row.fulfillment === 'PROCESSING' ? 'IN_TRANSIT' : row.fulfillment)} contexto={contextoAviso(row)} title={row.cliente} disabled={busy} />
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
  // #324: en demo los repartos salen de la fixture local (solo los asignados).
  const demoRead = useCallback(() => listDemoDeliveryOrdersDelRepartidor({ estado }), [estado])
  const data = useSellerData(`/api/delivery/orders?estado=${estado}`, deliveryFields, demoRead, esDemo, { limit: 50 })
  const pagina = usePaginaLista(data.rows, { tamano: 10, modo: 'mas' })
  const [ocupado, setOcupado] = useState('')

  function abrirCobro(row) {
    setCobro(row); setMonto(row.pendiente); setMetodo('CASH'); setReferencia(''); setError('')
  }

  async function registrarCobro() {
    if (!cobro || enviando) return
    const montoNumero = Number(monto)
    if (!Number.isSafeInteger(montoNumero) || montoNumero <= 0) { setError('Ingresá un monto mayor a cero.'); return }
    if (montoNumero > cobro.pendiente) { setError(`El cobro supera el saldo (falta ${montoTexto(cobro.pendiente)}).`); return }
    setEnviando(true); setError('')
    try {
      if (esDemo) {
        registrarCobroRepartoDemo(cobro.id, { amountPyg: montoNumero, method: metodo, reference: referencia.trim() })
      } else {
        await api.post(`/api/delivery/orders/${encodeURIComponent(cobro.id)}/collections`, {
          amountPyg: montoNumero,
          method: metodo,
          ...(referencia.trim() ? { reference: referencia.trim() } : {}),
        }, { headers: { 'Idempotency-Key': `delivery-${cobro.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` } })
      }
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
      if (esDemo) cambiarEstadoRepartoDemo(row.id, fulfillmentStatus)
      else await api.post(`/api/delivery/orders/${encodeURIComponent(row.id)}/status`, { fulfillmentStatus })
      toast.success('Reparto actualizado', `${codigoPedido(row.number)}: ${ENTREGA_LABELS[fulfillmentStatus]}.`)
      data.refresh()
    } catch (cause) {
      toast.error('No se pudo actualizar', cause?.message || 'Intentá de nuevo.')
    } finally { setOcupado('') }
  }

  return (
    <div className="op-rd entregas-f3-assignments">
      <div className="entregas-f3-filters">
        <ChipsReparto flat value={estado} onChange={setEstado} items={[['activos', 'A entregar'], ['entregados', 'Entregados']]} />
        <button type="button" onClick={data.refresh} disabled={data.loading} className="entregas-f3-refresh">Actualizar</button>
      </div>
      <SellerFeedback {...data} empty={!data.rows.length} />
      <ListaDensa
        lista={pagina}
        claseFilas="entregas-f3-grid"
        etiquetaPie="Más repartos"
        unidad="repartos"
        renderFila={row => <PedidoReparto key={row.id} row={row} onCobrar={abrirCobro} onEstado={cambiarEstado} busy={ocupado === row.id} />}
      />

      <Popup
        open={Boolean(cobro)}
        onClose={() => !enviando && setCobro(null)}
        busy={enviando}
        title="Registrar cobro en la calle"
        acciones={{
          secundaria: { label: 'Cancelar', disabled: enviando, onClick: () => setCobro(null) },
          primaria: { label: enviando ? 'Registrando…' : 'Registrar cobro', disabled: enviando, onClick: registrarCobro, 'data-testid': 'reparto-cobro-confirmar' },
        }}
      >
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
          </div>
        )}
      </Popup>
    </div>
  )
}
