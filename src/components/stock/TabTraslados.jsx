import { cn } from '@/lib/utils'
import { CELDA_DATO, CELDA_IDENTIDAD, ROTULO_DATO } from '@/components/shared/tabla'
import { etiquetaDespacho, etiquetaEta } from '@/lib/traslados'
import { Badge, Button, EmptyState, Input } from '@/components/ui'
import { printTransferReceipt } from '@/components/shared/OrderReceipt'
import { usePantallaAngosta } from '@/hooks/usePantallaAngosta'
import { GRID_TRASLADOS, fechaReserva } from './stockHelpers'
import { imprimirRemision, printLabels } from './impresionStock'

// Traslados entre sucursales. Desde lg una grilla que ocupa todo el ancho (sin
// scroll horizontal, encabezados completos que pueden pasar a dos líneas); por
// debajo, una tarjeta por lote con las acciones a 44 px.
const ENCABEZADO = cn(ROTULO_DATO, 'whitespace-normal leading-tight')
const diaCorto = (valor) => new Date(valor).toLocaleDateString('es-PY', { day: '2-digit', month: 'short' }).replace('.', '')

export default function TabTraslados({ ctx }) {
  const { transfers, busy, setEtaPara, unidadesDeTransferencia, avisarImpresion, toast, setReceiveBatch, prepararRemitoQr, cotizarEnvio, abrirEtiquetaAex, seguirGuia, guiaPara, guardarGuia, setGuiaPara } = ctx
  const tabla = !usePantallaAngosta('(min-width: 1024px)')

  const datosDe = (item) => ({
    lineas: item.lines?.map(line => `${line.quantity} × ${line.sourceProduct?.name || line.sourceProduct?.nombre || 'Producto'}`).join(' · ') || 'Sin líneas',
    cantidad: (item.lines || []).reduce((suma, line) => suma + Number(line.quantity || 0), 0),
    eta: etiquetaEta(item.eta, item.receivedAt),
    despacho: etiquetaDespacho(item),
    ruta: `${item.sourceBranch?.name} → ${item.destinationBranch?.name}`,
  })

  const botonEta = (item, eta, touch) => (!item.receivedAt
    ? <button type="button" disabled={busy} title={eta ? `${eta.detalle} · clic para ajustarla` : 'Cargar la ETA del lote'} onClick={() => setEtaPara({ id: item.id, eta: item.eta ? String(item.eta).slice(0, 10) : '' })} className={cn('rounded border border-dashed border-ink-500 px-1 py-0.5 text-[11px] transition hover:border-fono/40 hover:text-fore disabled:opacity-50', touch && 'min-h-11 px-2', eta?.vencida ? 'font-semibold text-bad' : 'text-mute')}>{eta ? eta.texto : 'fijar ETA'}</button>
    : (eta ? <span>{eta.texto}</span> : '—'))

  const estado = (item) => (
    <Badge color={item.receivedAt ? 'green' : 'blue'} className="w-fit whitespace-nowrap px-1.5 py-0.5 text-[10px]" title={item.receivedAt ? `Recibido el ${new Date(item.receivedAt).toLocaleDateString('es-PY')}` : 'Todavía no llegó a destino'}>{item.receivedAt ? 'Recibido' : 'En camino'}</Badge>
  )

  const acciones = (item, touch) => {
    const boton = cn('text-xs', touch ? 'min-h-11 px-3' : 'h-8 px-2')
    return (
      <>
        <Button type="button" variant="outline" className={boton} title="Reimprimir las etiquetas de todas las unidades del lote" onClick={() => { const delLote = unidadesDeTransferencia(item); if (delLote.length) printLabels(delLote).then(avisarImpresion); else toast.error('No se encontraron las unidades del lote para imprimir.') }}>Etiquetas</Button>
        <Button type="button" variant="outline" className={boton} title="Recibir todo el lote y elegir depósito destino" onClick={() => setReceiveBatch({ transfer: item, locationId: '', busy: false })}>Recibir lote</Button>
        <Button type="button" variant="outline" className={boton} onClick={() => prepararRemitoQr(item)}>Enlace/QR</Button>
        <Button type="button" variant="outline" className={boton} onClick={() => printTransferReceipt(item, { format: 'a4' })}>Remito</Button>
        <Button type="button" variant="outline" className={boton} title="Remisión interna con firma de entrega y recepción" onClick={() => imprimirRemision(item).then(resultado => avisarImpresion(resultado, 'Remisión'))}>Remisión</Button>
        {!item.aexGuide && <Button type="button" variant="outline" className={boton} onClick={() => cotizarEnvio(item)}>Enviar por AEX</Button>}
        {item.aexGuide
          ? <><Button type="button" variant="outline" className={boton} onClick={() => abrirEtiquetaAex(item)}>Etiqueta AEX</Button><Button type="button" variant="outline" className={boton} onClick={() => seguirGuia(item)}>Seguimiento</Button></>
          : guiaPara?.id === item.id
            ? <form onSubmit={guardarGuia} className="flex flex-wrap items-center gap-1"><Input className={cn('w-40', touch ? 'min-h-11' : 'h-8')} aria-label="Guía AEX" value={guiaPara.guia} onChange={event => setGuiaPara(current => ({ ...current, guia: event.target.value }))} placeholder="A003526979" /><Button type="submit" className={boton} disabled={busy}>Guardar</Button><Button type="button" variant="ghost" className={boton} onClick={() => setGuiaPara(null)}>Cancelar</Button></form>
            : <Button type="button" variant="outline" className={boton} disabled={busy} onClick={() => setGuiaPara({ id: item.id, guia: '' })}>Agregar guía</Button>}
      </>
    )
  }

  const vacio = !transfers.length && <EmptyState compact icon="box" title="Todavía no hay transferencias." />

  if (!tabla) {
    return (
      <div className="space-y-2" data-testid="traslados-tabla">
        {transfers.map(item => {
          const { lineas, cantidad, eta, despacho, ruta } = datosDe(item)
          return (
            <article key={item.id} data-testid="traslado-fila" className="space-y-2 rounded-xl border border-ink-600 bg-ink-800/40 p-3">
              <div className="flex items-start justify-between gap-2">
                <b className="min-w-0 text-[13px] leading-tight [overflow-wrap:anywhere]">{ruta}</b>
                {estado(item)}
              </div>
              <p className="text-xs text-mute [overflow-wrap:anywhere]">{lineas}{item.notes ? <span className="text-mute"> · {item.notes}</span> : null} · <span className="tabular-nums font-semibold text-fore">{cantidad}</span> {cantidad === 1 ? 'equipo' : 'equipos'}</p>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-mute">
                <div><dt className={ROTULO_DATO}>Enviado</dt><dd>{diaCorto(item.createdAt)}</dd></div>
                <div><dt className={ROTULO_DATO}>{item.receivedAt ? 'Llegada' : 'ETA'}</dt><dd>{item.receivedAt ? fechaReserva(item.receivedAt) : botonEta(item, eta, true)}</dd></div>
                <div><dt className={ENCABEZADO}>Despachó / Recibió</dt><dd title={despacho.detalle}>{despacho.texto}</dd></div>
                <div><dt className={ROTULO_DATO}>Guía AEX</dt><dd className="font-mono text-[11px] text-fono-light [overflow-wrap:anywhere]">{item.aexGuide || '—'}</dd></div>
              </dl>
              <div className="flex flex-wrap items-center gap-1.5">{acciones(item, true)}</div>
            </article>
          )
        })}
        {vacio}
      </div>
    )
  }

  return (
    <div data-testid="traslados-tabla">
      <div className={cn(GRID_TRASLADOS, 'border border-transparent px-3.5 pb-2 pt-1')}>
        <span className={ENCABEZADO}>Ruta</span>
        <span className={ENCABEZADO}>Líneas</span>
        <span className={ENCABEZADO} title="Cantidad de equipos del lote">Cant.</span>
        <span className={ENCABEZADO} title="Día de envío y llegada (o ETA)">Enviado / ETA</span>
        <span className={ENCABEZADO}>Estado</span>
        <span className={ENCABEZADO} title="Quién despachó el lote y quién lo recibió">Despachó / Recibió</span>
        <span className={ENCABEZADO}>Guía AEX</span>
      </div>
      <div className="space-y-1">
        {transfers.map(item => {
          const { lineas, cantidad, eta, despacho, ruta } = datosDe(item)
          return (
            <div key={item.id} data-testid="traslado-fila" className={cn(GRID_TRASLADOS, 'rounded-xl border border-ink-600 bg-ink-800/40 px-3.5 py-2')}>
              <span className={cn(CELDA_IDENTIDAD, 'whitespace-normal [overflow-wrap:anywhere]')} title={ruta}>{item.sourceBranch?.name} → {item.destinationBranch?.name}</span>
              <span className={cn(CELDA_DATO, 'whitespace-normal [overflow-wrap:anywhere]')} title={[lineas, item.notes].filter(Boolean).join(' · ')}>{lineas}{item.notes ? <span className="text-mute"> · {item.notes}</span> : null}</span>
              <span className="text-center text-xs font-semibold tabular-nums text-fore" title="Equipos del lote">{cantidad}</span>
              <span className="min-w-0 space-y-0.5 text-xs text-mute">
                <span className="block truncate" title={`Enviado el ${new Date(item.createdAt).toLocaleDateString('es-PY')}`}>{diaCorto(item.createdAt)}</span>
                <span className="block" title={item.receivedAt ? `Llegó el ${new Date(item.receivedAt).toLocaleString('es-PY')}` : (eta ? eta.detalle : 'Cargar la ETA del lote')}>{item.receivedAt ? `Llegó ${fechaReserva(item.receivedAt)}` : botonEta(item, eta, false)}</span>
              </span>
              {estado(item)}
              <span className={cn(CELDA_DATO, 'whitespace-normal [overflow-wrap:anywhere]')} title={despacho.detalle}>{despacho.texto}</span>
              <span className="font-mono text-[11px] text-fono-light [overflow-wrap:anywhere]" title={item.aexGuide || undefined}>{item.aexGuide || '—'}</span>
              <span data-testid="traslado-acciones" className="col-span-full flex flex-wrap items-center justify-end gap-1 border-t border-ink-600/60 pt-2">{acciones(item, false)}</span>
            </div>
          )
        })}
        {vacio}
      </div>
    </div>
  )
}
