import { useCallback, useEffect, useState } from 'react'
import { codigoPedido } from '@/utils/pedido'
import { api } from '@/lib/api/client'
import { useSesion } from '@/lib/sesion'
import { cuotasDemo, historialCuotaDemo, marcarAvisoDemo } from '@/lib/demo/cobranza'
import Cronologia from '@/components/shared/Cronologia'
import { listVentas, ventaDesdeApi } from '@/lib/storage'
import { gs } from '@/utils/calculos'
import { agruparCuotas, diasDeAtraso, resumenCuotas } from '@/lib/cobranzas'
import { copiarAlPortapapeles } from '@/utils/portapapeles'
import { telefonoVisible } from '@/utils/telefono'
import { fechaDia as fecha } from '@/utils/fecha'
import { Aviso, Badge, Button, EmptyState, Stat, useToast } from '@/components/ui'
import Popup from '@/components/shared/Popup'
import StatGrid from '@/components/shared/StatGrid'
import BarraGestion from '@/components/shared/BarraGestion'
import Icon from '@/components/shared/Icon'
import PagosPedido from '@/components/ventas/PagosPedido'
import AvisarPorCorreo from '@/components/shared/AvisarPorCorreo'
import { plantillaDeCuota } from '@/lib/avisos'
import { cn } from '@/lib/utils'
import './finanzasTactil.css'
import { ROTULO_SECCION } from '@/components/shared/tabla'

// Cobranzas: cuotas de planes de crédito vencidas y próximas, con los días de
// mora y el recargo configurado. El aviso por WhatsApp respeta la plantilla de
// cobranzas, se marca una sola vez por cuota (el servidor lo audita) y deja el
// enlace wa.me listo para enviar.

export default function Cobranzas() {
  const toast = useToast()
  const { esDemo } = useSesion()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [enviando, setEnviando] = useState('')
  const [pedido, setPedido] = useState(null)
  const [detalle, setDetalle] = useState(null)
  const [historialDe, setHistorialDe] = useState(null)

  const cargar = useCallback(async () => {
    setError('')
    if (esDemo) { setData(cuotasDemo()); return }
    try { setData(await api.get('/api/collections/reminders')) } catch (cause) { setError(cause?.message || 'No se pudieron cargar las cuotas.'); setData({ rows: [] }) }
  }, [esDemo])
  useEffect(() => { cargar() }, [cargar])

  const rows = data?.rows || []
  const { vencidas, proximas } = agruparCuotas(rows)
  const resumen = resumenCuotas(rows)
  const moraPct = Number(data?.moraBpPorDia || 0) / 100

  async function abrirPedido(row) {
    const venta = listVentas().find((item) => item.id === row.orderId)
    if (venta) { setPedido(venta); return }
    // La caché local solo guarda las ventas del día: si el pedido es más
    // viejo, se trae del API para poder cobrar la cuota desde acá.
    try { setPedido(ventaDesdeApi(await api.get(`/api/orders/${encodeURIComponent(row.orderId)}`))) } catch (cause) { setError(cause?.message || 'No se pudo abrir el pedido.') }
  }

  // Abre WhatsApp primero (el navegador solo permite abrir en el clic) y
  // después marca el aviso; si el registro falla, el enlace ya quedó abierto.
  async function recordar(row) {
    if (enviando) return
    setAviso('')
    if (row.whatsappUrl) window.open(row.whatsappUrl, '_blank', 'noopener,noreferrer')
    setEnviando(row.id)
    try {
      const resultado = esDemo ? marcarAvisoDemo(row.id) : await api.post('/api/collections/reminders', { paymentId: row.id, ...(row.avisadoEn ? { force: true } : {}) })
      setAviso(`Recordatorio de ${row.customerName || 'el cliente'} registrado y auditado.`)
      await cargar()
      if (resultado?.whatsappUrl && !row.whatsappUrl) window.open(resultado.whatsappUrl, '_blank', 'noopener,noreferrer')
    } catch (cause) { setError(cause?.message || 'No se pudo registrar el recordatorio.') } finally { setEnviando('') }
  }

  const Fila = ({ row }) => {
    const vencida = row.tipo === 'VENCIDA'
    return (
      <article data-testid="cuota-fila" className="gp-fila justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <b className="max-w-[14rem] truncate text-sm" title={row.customerName || 'Cliente'}>{row.customerName || 'Cliente'}</b>
          <span className="shrink-0 font-mono text-[11px] text-mute">{codigoPedido(row.orderNumber)}</span>
          <Badge color={vencida ? 'red' : 'orange'}>{vencida ? `Vencida · ${diasDeAtraso(row.dueAt)}d` : 'Próxima'}</Badge>
          {row.avisadoEn && <Badge color="green">Avisado {fecha(row.avisadoEn)}</Badge>}
          <span className="min-w-0 truncate text-xs text-mute" title={`${row.reference || 'Cuota'} · vence ${fecha(row.dueAt)}`}>
            {row.reference || 'Cuota'} · vence {fecha(row.dueAt)}
            {row.recargoPyg > 0 && <> · recargo {gs(row.recargoPyg)}</>}
            {' · '}{row.phone ? `Tel. ${telefonoVisible(row.phone, row.countryCode)}` : 'sin teléfono'}
          </span>
        </div>
        <div className="flex w-full min-w-0 max-w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
          <b className="mr-auto text-[13px] tabular-nums sm:mr-0 text-fore" data-testid="cuota-saldo">{gs(row.saldoPendientePyg)}</b>
          <Button type="button" variant="outline" className="min-h-11 px-3 text-xs lg:min-h-0 lg:h-8 lg:px-2" onClick={() => setDetalle(row)}>Ver mensaje</Button>
          {esDemo && <Button type="button" variant="outline" className="min-h-11 px-3 text-xs lg:min-h-0 lg:h-8 lg:px-2" data-testid="cuota-historial-abrir" onClick={() => setHistorialDe(row)}>Historial</Button>}
          {row.whatsappUrl
            ? <button type="button" disabled={Boolean(enviando)} onClick={() => recordar(row)} className={cn('min-h-11 rounded-lg bg-ok px-3 py-2 text-xs font-semibold text-on-ok transition disabled:opacity-50 lg:min-h-0')}>{enviando === row.id ? 'Registrando…' : row.avisadoEn ? 'Reenviar WhatsApp' : 'WhatsApp'}</button>
            : <span className="text-xs text-mute">Sin WhatsApp</span>}
          <AvisarPorCorreo
            email={row.email}
            category="COLLECTIONS"
            evento={plantillaDeCuota(vencida)}
            title={row.customerName}
            contexto={{ cliente: row.customerName || 'cliente', nombre: row.customerName || 'cliente', pedido: codigoPedido(row.orderNumber), vencimiento: fecha(row.dueAt), saldo_pendiente: gs(row.saldoPendientePyg), dias_atraso: String(diasDeAtraso(row.dueAt)), total: gs(row.totalPyg ?? row.saldoPendientePyg) }}
          />
          <Button type="button" variant="outline" className="min-h-11 px-3 text-xs lg:min-h-0 lg:h-8 lg:px-2" onClick={() => abrirPedido(row)}>Abrir pedido</Button>
        </div>
      </article>
    )
  }

  const montoDe = (filas) => filas.reduce((suma, fila) => suma + Number(fila.saldoPendientePyg || 0), 0)
  const [busqueda, setBusqueda] = useState('')
  const [tab, setTab] = useState('todas')
  const q = busqueda.trim().toLowerCase()
  const coincide = (row) => !q || [row.customerName, row.orderNumber, codigoPedido(row.orderNumber), row.reference, row.phone].filter(Boolean).join(' ').toLowerCase().includes(q)
  const vencidasVis = tab === 'proximas' ? [] : vencidas.filter(coincide)
  const proximasVis = tab === 'vencidas' ? [] : proximas.filter(coincide)
  const nada = data !== null && rows.length > 0 && vencidasVis.length === 0 && proximasVis.length === 0

  return (
    <div className="gp ventas-f3 space-y-3">
      <div className="gp-cabecera">
        <div className="min-w-0">
          <h2>Cobranzas por WhatsApp</h2>
          <p className="text-xs">Plantilla de cobranzas: <a className="text-fono-light underline" href="/plantillas">Plantillas de WhatsApp</a>. Cada cuota se avisa una sola vez.</p>
          <p className="text-xs">{moraPct > 0 ? `Recargo por mora configurado: ${moraPct}% por día (tope 20%).` : 'Sin recargo por mora configurado: solo se informan los días de atraso.'}</p>
        </div>
      </div>
      <BarraGestion
        etiqueta="Acciones de Cobranzas"
        testId="barra-cobranzas"
        buscar={busqueda}
        onBuscar={setBusqueda}
        placeholder="Cliente, pedido o cuota"
        ariaBuscar="Buscar cuotas"
        tabs={[['todas', 'Todas'], ['vencidas', 'Vencidas'], ['proximas', 'Próximas']]}
        tab={tab}
        onTab={setTab}
        etiquetaTabs="Estado de las cuotas"
        primary={<Button type="button" variant="outline" onClick={cargar}>Actualizar</Button>}
      />
      <StatGrid testId="cuotas-resumen">
        <Stat compact testId="cuotas-pendiente" label="Pendiente total" valor={gs(resumen.pendientePyg)} valorClassName="text-warn" />
        <Stat compact testId="cuotas-vencidas" label="Vencidas" valor={vencidas.length} valorClassName="text-bad" sub={gs(montoDe(vencidas))} />
        <Stat compact testId="cuotas-proximas" label="Próximas" valor={proximas.length} sub={gs(montoDe(proximas))} />
        <Stat compact testId="cuotas-recargo" label="Recargo por mora" valor={gs(resumen.recargoPyg)} valorClassName={resumen.recargoPyg > 0 ? 'text-bad' : 'text-mute'} />
      </StatGrid>
      {resumen.sinTelefono > 0 && <p className="text-xs text-warn">{resumen.sinTelefono} cuota(s) sin teléfono: no se puede armar el enlace de WhatsApp.</p>}
      {aviso && <Aviso tono="ok" className="p-3">{aviso}</Aviso>}
      {error && <Aviso tono="error" className="p-3">{error}</Aviso>}
      {data !== null && rows.length === 0 && <EmptyState compact icon="check" title="Sin cuotas pendientes" description="Los planes de crédito aparecerán acá con su vencimiento y su mora." action={<Button type="button" variant="outline" onClick={cargar}>Actualizar</Button>} />}
      {nada && <EmptyState compact icon="check" title="Ninguna cuota coincide" description="Probá otra búsqueda o cambiá el estado." action={<Button type="button" variant="outline" onClick={() => { setBusqueda(''); setTab('todas') }}>Ver todas</Button>} />}
      {vencidasVis.length > 0 && <section><h3 className="text-xs font-bold uppercase tracking-wider text-bad">Vencidas ({vencidasVis.length})</h3><div className="gp-lista mt-2">{vencidasVis.map((row) => <Fila key={row.id} row={row} />)}</div></section>}
      {proximasVis.length > 0 && <section><h3 className={ROTULO_SECCION}>Próximas ({proximasVis.length})</h3><div className="gp-lista mt-2">{proximasVis.map((row) => <Fila key={row.id} row={row} />)}</div></section>}
      {detalle && (
        <Popup open onClose={() => setDetalle(null)} title={`Mensaje para ${detalle.customerName || 'el cliente'}`} tamano="md">
          <div className="space-y-3">
            <p className="whitespace-pre-wrap rounded-xl border border-ink-600 bg-ink-800/50 p-3 text-sm">{detalle.message}</p>
            <p className="break-all text-xs text-mute">{detalle.whatsappUrl || 'El cliente no tiene teléfono cargado: no hay enlace.'}</p>
            {detalle.whatsappUrl && <button type="button" className="rounded-lg border border-ink-500 px-3 py-2 text-xs font-semibold" onClick={async () => { if (await copiarAlPortapapeles(detalle.whatsappUrl)) toast.success('Enlace copiado.'); else toast.error('No se pudo copiar el enlace.') }}><Icon name="copy" className="mr-1 inline h-3 w-3" />Copiar enlace</button>}
            <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setDetalle(null)}>Cerrar</Button><Button type="button" disabled={!detalle.whatsappUrl || Boolean(enviando)} onClick={() => { const row = detalle; setDetalle(null); recordar(row) }}>Abrir WhatsApp</Button></div>
          </div>
        </Popup>
      )}
      {historialDe && (
        <Popup open onClose={() => setHistorialDe(null)} title={`Historial · ${historialDe.reference || 'Cuota'} · ${codigoPedido(historialDe.orderNumber)}`} tamano="md" acciones={{ secundaria: { label: 'Cerrar', onClick: () => setHistorialDe(null) } }}>
          <div data-testid="cuota-historial"><Cronologia eventos={historialCuotaDemo(historialDe)} vacio="Sin movimientos" descripcionVacio="Los pagos y avisos de esta cuota aparecerán acá." /></div>
        </Popup>
      )}
      {pedido && <PagosPedido venta={pedido} onClose={() => setPedido(null)} />}
    </div>
  )
}
