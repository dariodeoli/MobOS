import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api/client'
import { listVentas, ventaDesdeApi } from '@/lib/storage'
import { gs } from '@/utils/calculos'
import { agruparCuotas, diasDeAtraso, resumenCuotas } from '@/lib/cobranzas'
import { copiarAlPortapapeles } from '@/utils/portapapeles'
import { telefonoVisible } from '@/utils/telefono'
import { fechaDia as fecha } from '@/utils/fecha'
import { Aviso, Badge, Button, Card, EmptyState, Modal, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import PagosPedido from '@/components/ventas/PagosPedido'
import { cn } from '@/lib/utils'
import { ROTULO_SECCION } from '@/components/shared/tabla'

// Cobranzas: cuotas de planes de crédito vencidas y próximas, con los días de
// mora y el recargo configurado. El aviso por WhatsApp respeta la plantilla de
// cobranzas, se marca una sola vez por cuota (el servidor lo audita) y deja el
// enlace wa.me listo para enviar.

export default function Cobranzas() {
  const toast = useToast()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [enviando, setEnviando] = useState('')
  const [pedido, setPedido] = useState(null)
  const [detalle, setDetalle] = useState(null)

  const cargar = useCallback(async () => {
    setError('')
    try { setData(await api.get('/api/collections/reminders')) } catch (cause) { setError(cause?.message || 'No se pudieron cargar las cuotas.'); setData({ rows: [] }) }
  }, [])
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
      const resultado = await api.post('/api/collections/reminders', { paymentId: row.id, ...(row.avisadoEn ? { force: true } : {}) })
      setAviso(`Recordatorio de ${row.customerName || 'el cliente'} registrado y auditado.`)
      await cargar()
      if (resultado?.whatsappUrl && !row.whatsappUrl) window.open(resultado.whatsappUrl, '_blank', 'noopener,noreferrer')
    } catch (cause) { setError(cause?.message || 'No se pudo registrar el recordatorio.') } finally { setEnviando('') }
  }

  const Fila = ({ row }) => {
    const vencida = row.tipo === 'VENCIDA'
    return (
      <article data-testid="cuota-fila" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-600 p-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <b className="text-sm">{row.customerName || 'Cliente'}</b>
            <span className="font-mono text-[11px] text-mute">{row.orderNumber || ''}</span>
            <Badge color={vencida ? 'red' : 'orange'}>{vencida ? `Vencida · ${diasDeAtraso(row.dueAt)}d` : 'Próxima'}</Badge>
            {row.avisadoEn && <Badge color="green">Avisado {fecha(row.avisadoEn)}</Badge>}
          </div>
          <p className="mt-1 text-xs text-mute">
            {row.reference || 'Cuota'} · vence {fecha(row.dueAt)} · saldo <b className="text-fore">{gs(row.saldoPendientePyg)}</b>
            {row.recargoPyg > 0 && <> · recargo {gs(row.recargoPyg)}</>}
          </p>
          <p className="mt-0.5 text-[11px] text-mute">
            {row.phone ? `Tel. ${telefonoVisible(row.phone, row.countryCode)}` : 'Sin teléfono cargado'}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button type="button" variant="outline" className="h-8 px-2 text-xs" onClick={() => setDetalle(row)}>Ver mensaje</Button>
          {row.whatsappUrl
            ? <button type="button" disabled={Boolean(enviando)} onClick={() => recordar(row)} className={cn('rounded-lg bg-ok px-3 py-2 text-xs font-semibold text-black transition disabled:opacity-50')}>{enviando === row.id ? 'Registrando…' : row.avisadoEn ? 'Reenviar WhatsApp' : 'WhatsApp'}</button>
            : <span className="text-xs text-mute">Sin WhatsApp</span>}
          <Button type="button" variant="outline" className="h-8 px-2 text-xs" onClick={() => abrirPedido(row)}>Abrir pedido</Button>
        </div>
      </article>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-bold">Cobranzas por WhatsApp</h2>
            <p className="mt-1 text-sm text-mute">Recordá las cuotas vencidas y próximas con la plantilla de <b className="text-fore">Cobranzas</b>. Cada cuota se avisa una sola vez por WhatsApp y queda en la cronología del cliente y del pedido. La plantilla se edita en <a className="text-fono-light underline" href="/plantillas">Plantillas de WhatsApp</a>.</p>
            <p className="mt-1 text-xs text-mute">{moraPct > 0 ? `Recargo por mora configurado: ${moraPct}% por día (tope 20%).` : 'Sin recargo por mora configurado: solo se informan los días de atraso.'}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge color={resumen.pendientePyg > 0 ? 'orange' : 'green'}>Pendiente total {gs(resumen.pendientePyg)}</Badge>
            {resumen.recargoPyg > 0 && <Badge color="red">Recargo {gs(resumen.recargoPyg)}</Badge>}
            <Button type="button" variant="outline" className="h-8 px-2 text-xs" onClick={cargar}>Actualizar</Button>
          </div>
        </div>
        {resumen.sinTelefono > 0 && <p className="mt-2 text-xs text-warn">{resumen.sinTelefono} cuota(s) sin teléfono: no se puede armar el enlace de WhatsApp.</p>}
        {aviso && <Aviso tono="ok" className="p-3 mt-3">{aviso}</Aviso>}
        {error && <Aviso tono="error" className="p-3 mt-3">{error}</Aviso>}
      </Card>
      {data !== null && rows.length === 0 && <Card><EmptyState compact icon="check" title="Sin cuotas pendientes" description="Los planes de crédito aparecerán acá con su vencimiento y su mora." /></Card>}
      {vencidas.length > 0 && <section><h3 className="text-xs font-bold uppercase tracking-wider text-bad">Vencidas ({vencidas.length})</h3><div className="mt-2 space-y-2">{vencidas.map((row) => <Fila key={row.id} row={row} />)}</div></section>}
      {proximas.length > 0 && <section><h3 className={ROTULO_SECCION}>Próximas ({proximas.length})</h3><div className="mt-2 space-y-2">{proximas.map((row) => <Fila key={row.id} row={row} />)}</div></section>}
      {detalle && (
<<<<<<< HEAD
        <Modal open onClose={() => setDetalle(null)} title={`Mensaje para ${detalle.customerName || 'el cliente'}`} size="formulario">
=======
        <Modal open onClose={() => setDetalle(null)} title={`Mensaje para ${detalle.customerName || 'el cliente'}`}>
>>>>>>> origin/slot/diseno
          <div className="space-y-3">
            <p className="whitespace-pre-wrap rounded-xl border border-ink-600 bg-ink-800/50 p-3 text-sm">{detalle.message}</p>
            <p className="break-all text-xs text-mute">{detalle.whatsappUrl || 'El cliente no tiene teléfono cargado: no hay enlace.'}</p>
            {detalle.whatsappUrl && <button type="button" className="rounded-lg border border-ink-500 px-3 py-2 text-xs font-semibold" onClick={async () => { if (await copiarAlPortapapeles(detalle.whatsappUrl)) toast.success('Enlace copiado.'); else toast.error('No se pudo copiar el enlace.') }}><Icon name="copy" className="mr-1 inline h-3 w-3" />Copiar enlace</button>}
            <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setDetalle(null)}>Cerrar</Button><Button type="button" disabled={!detalle.whatsappUrl || Boolean(enviando)} onClick={() => { const row = detalle; setDetalle(null); recordar(row) }}>Abrir WhatsApp</Button></div>
          </div>
        </Modal>
      )}
      {pedido && <PagosPedido venta={pedido} onClose={() => setPedido(null)} />}
    </div>
  )
}
