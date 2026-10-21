import { useCallback, useEffect, useState } from 'react'
import { Aviso, Badge, Button, Card, Select, useToast } from '@/components/ui'
import { ConfirmDialog } from '@/components/shared/popupKit'
import Avatar from '@/components/shared/Avatar'
import Icon from '@/components/shared/Icon'
import { printingApi } from '@/lib/api/printing'
import { useSesion } from '@/lib/sesion'
import { sistemaDemo } from '@/lib/demo/sistema.js'
import { colorTrabajo, etiquetaTrabajo } from '@/lib/printing/estadoImpresoras'
import { fechaHora as fmt } from '@/utils/fecha'

const TIPOS = {
  comprobante: 'Comprobante',
  'nota-entrega': 'Nota de entrega',
  'recibo-interno': 'Recibo interno',
  proforma: 'Proforma',
  remision: 'Remisión',
  'cierre-caja': 'Cierre de caja',
  'resumen-dia': 'Resumen del día',
  'liquidacion-comision': 'Liquidación de comisión',
  'etiquetas-stock': 'Etiquetas de unidades',
  'etiquetas-lote': 'Etiquetas del lote',
  'etiqueta-ubicacion': 'Etiqueta de ubicación',
  'informe-dispositivo': 'Informe de dispositivo',
  'certificado-phonecheck': 'Certificado de inspección',
  'constancia-preparacion': 'Constancia de preparación',
  prueba: 'Ticket de prueba',
  'prueba-corta': 'Prueba de corte',
}
const tipoTrabajo = (kind) => TIPOS[kind] || String(kind || '').replace(/-/g, ' ') || 'Impresión'

export default function ColaImpresionEmpresa() {
  const toast = useToast()
  const { sesion, usuario, esDemo } = useSesion()
  const [trabajos, setTrabajos] = useState(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(true)
  const [seleccion, setSeleccion] = useState([])
  const [filtroImpresora, setFiltroImpresora] = useState('')
  const [cancelando, setCancelando] = useState(false)
  const [confirmacion, setConfirmacion] = useState(null)
  const puedeCancelar = Boolean(sesion?.esPropietario || usuario?.role === 'ADMIN' || usuario?.role === 'GERENTE')

  const actualizar = useCallback(async () => {
    setCargando(true)
    setError('')
    try {
      const lista = esDemo ? sistemaDemo().trabajos : (await printingApi.trabajos({ limit: 50 }))?.jobs || []
      setTrabajos(lista)
    } catch (cause) {
      setError(cause?.message || 'No se pudo cargar la cola de impresión.')
    } finally {
      setCargando(false)
    }
  }, [esDemo])

  useEffect(() => { actualizar() }, [actualizar])

  const monitoreables = (trabajos || []).filter((trabajo) => ['PENDIENTE', 'INCIERTO'].includes(trabajo.state))
  const visibles = filtroImpresora ? monitoreables.filter((trabajo) => (trabajo.printerName || trabajo.destination) === filtroImpresora) : monitoreables
  const pendientesVisibles = visibles.filter((trabajo) => trabajo.state === 'PENDIENTE')
  const impresoras = [...new Set(monitoreables.map((trabajo) => trabajo.printerName || trabajo.destination).filter(Boolean))]
  const seleccionados = seleccion.filter((id) => pendientesVisibles.some((trabajo) => trabajo.id === id))
  const alternar = (id) => setSeleccion((actual) => actual.includes(id) ? actual.filter((valor) => valor !== id) : [...actual, id])

  async function cancelar(filtros) {
    if (cancelando) return
    setCancelando(true)
    try {
      if (esDemo) {
        const ids = Array.isArray(filtros?.ids) ? filtros.ids : []
        setTrabajos((actual) => (actual || []).filter((trabajo) => !ids.includes(trabajo.id)))
        toast.success(ids.length === 1 ? 'Trabajo cancelado (demo)' : `${ids.length} trabajos cancelados (demo)`, 'Dato ficticio: no salen cuando el puente reconecte.')
      } else {
        const resultado = await printingApi.cancelarLote(filtros)
        const total = Number(resultado?.total || 0)
        toast.success(total === 1 ? 'Trabajo cancelado' : `${total} trabajos cancelados`, total ? 'No van a salir cuando el puente reconecte.' : 'No había pendientes para cancelar.')
        await actualizar()
      }
    } catch (cause) {
      toast.error('No se pudo cancelar', cause?.message || '')
    } finally {
      setCancelando(false)
      setConfirmacion(null)
      setSeleccion([])
    }
  }

  return (
    <Card className="space-y-3" data-testid="cola-impresion-empresa">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Icon name="printer" className="h-4 w-4 text-mute" />Cola de impresión de la empresa</h2>
          <p className="mt-1 text-sm text-mute">Trabajos remotos, usuario e impresora. Solo se cancelan trabajos que siguen esperando; los que el puente ya tomó no se alteran.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {impresoras.length > 1 && (
            <Select aria-label="Filtrar la cola por impresora" className="w-48" value={filtroImpresora} onChange={(event) => { setFiltroImpresora(event.target.value); setSeleccion([]) }}>
              <option value="">Todas las impresoras</option>
              {impresoras.map((nombre) => <option key={nombre} value={nombre}>{nombre}</option>)}
            </Select>
          )}
          <Button type="button" variant="outline" onClick={actualizar} disabled={cargando} title={cargando ? 'Se habilita al terminar la comprobación en curso.' : 'Volver a consultar la cola.'}><Icon name="refresh" className="h-3.5 w-3.5" />Actualizar</Button>
        </div>
      </div>

      {error && <Aviso tono="error" role="alert">{error}</Aviso>}
      {cargando && !trabajos && <p role="status" className="text-sm text-mute">Cargando cola…</p>}
      {!cargando && !error && trabajos?.length === 0 && <p className="text-sm text-mute">No hay trabajos de impresión registrados.</p>}

      {visibles.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs uppercase tracking-wider text-mute">{pendientesVisibles.length} pendiente(s){visibles.some((trabajo) => trabajo.state === 'INCIERTO') ? ` · ${visibles.filter((trabajo) => trabajo.state === 'INCIERTO').length} incierto(s)` : ''}{filtroImpresora ? ` · ${filtroImpresora}` : ''}</p>
            {puedeCancelar && <span className="flex flex-wrap items-center gap-2">
              {seleccionados.length > 0 && <Button type="button" variant="outline" className="border-bad/40 text-bad hover:bg-bad/10" onClick={() => setConfirmacion({ titulo: `Cancelar ${seleccionados.length} trabajo(s)`, descripcion: 'Los seleccionados no van a salir cuando el puente reconecte. Queda registrado quién los canceló.', filtros: { ids: seleccionados } })}>Cancelar seleccionados ({seleccionados.length})</Button>}
              {pendientesVisibles.length > 0 && <Button type="button" variant="outline" className="border-bad/40 text-bad hover:bg-bad/10" onClick={() => setConfirmacion({ titulo: `Cancelar ${pendientesVisibles.length} pendiente(s)`, descripcion: `${filtroImpresora ? `Todos los pendientes de ${filtroImpresora}` : 'Todos los pendientes de la cola'} no van a salir cuando el puente reconecte.`, filtros: { ids: pendientesVisibles.map((trabajo) => trabajo.id) } })}>Cancelar todos los pendientes</Button>}
            </span>}
          </div>
          <ul className="divide-y divide-ink-600/60">
            {visibles.map((trabajo) => (
              <li key={trabajo.id} className="flex flex-wrap items-center gap-3 py-2">
                {puedeCancelar && trabajo.state === 'PENDIENTE' && <label className="inline-flex min-h-11 min-w-11 items-center justify-center"><input type="checkbox" aria-label={`Seleccionar ${tipoTrabajo(trabajo.kind)}${trabajo.reference ? ` de ${trabajo.reference}` : ''}`} checked={seleccion.includes(trabajo.id)} onChange={() => alternar(trabajo.id)} className="h-4 w-4 accent-bad" /></label>}
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium"><span className="break-words">{tipoTrabajo(trabajo.kind)}</span>{trabajo.reference && <span className="text-xs font-normal text-mute">{trabajo.reference}</span>}<Badge color={colorTrabajo(trabajo.state)}>{etiquetaTrabajo(trabajo.state)}</Badge></p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-mute"><span className="inline-flex items-center gap-1.5"><Avatar user={{ id: trabajo.requestedByUserId || `job-${trabajo.id}`, name: trabajo.requestedByName || 'Sin usuario' }} size="xs" />{trabajo.requestedByName || 'Sin usuario'}</span><span aria-hidden="true">·</span><span className="break-words" title={[trabajo.printerName || trabajo.destination, trabajo.bridgeName].filter(Boolean).join(' · ')}>{trabajo.printerName || trabajo.destination || 'sin impresora'}{trabajo.bridgeName ? ` · ${trabajo.bridgeName}` : ''}</span><span aria-hidden="true">·</span><span>encolado {fmt(trabajo.enqueuedAt || trabajo.createdAt)}</span>{Number(trabajo.attempts) > 0 && <span>· {trabajo.attempts} intento(s)</span>}</p>
                  {trabajo.error && <p className="mt-0.5 break-words text-xs text-bad" title={trabajo.error}>{trabajo.error}</p>}
                </div>
                {puedeCancelar && trabajo.state === 'PENDIENTE' && <Button type="button" variant="outline" className="border-bad/40 text-bad hover:bg-bad/10" onClick={() => setConfirmacion({ titulo: 'Cancelar trabajo', descripcion: `El ${tipoTrabajo(trabajo.kind).toLowerCase()}${trabajo.reference ? ` de ${trabajo.reference}` : ''} no va a salir cuando el puente reconecte. Queda registrado quién los canceló.`, filtros: { ids: [trabajo.id] } })}>Cancelar</Button>}
              </li>
            ))}
          </ul>
        </>
      )}

      <ConfirmDialog open={Boolean(confirmacion)} title={confirmacion?.titulo || 'Cancelar trabajos'} description={confirmacion?.descripcion || ''} confirmLabel="Cancelar trabajos" variant="danger" busy={cancelando} onCancel={() => setConfirmacion(null)} onConfirm={() => cancelar(confirmacion?.filtros || {})} />
    </Card>
  )
}
