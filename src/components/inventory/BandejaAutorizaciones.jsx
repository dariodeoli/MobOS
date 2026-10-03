import { useState } from 'react'
import { api } from '@/lib/api/client'
import { obligatorio } from 'owncoding-ui/utils'
import Icon from '@/components/shared/Icon'
import {
  Aviso,
  Badge,
  Button,
  Card,
  EmptyState,
  FormField,
  Modal,
  SaveActions,
  Skeleton,
  Textarea,
  useToast,
  useValidacionCampos,
} from '@/components/ui'
import { CELDA_ENCABEZADO, CELDA_IDENTIDAD, CELDA_IDENTIDAD_GRANDE, ROTULO_SECCION } from '@/components/shared/tabla'
import { fechaHora } from '@/utils/fecha'
import { cn } from '@/lib/utils'
import {
  antiguedad,
  ETIQUETA_KIND_STOCK,
  motivoDeSolicitudStock,
  partirAutorizacionesStock,
  sujetoDeSolicitudStock,
} from '@/lib/autorizacionesStock'

const HISTORIAL_CORTO = 5

const ESTADOS = {
  APPROVED: { label: 'Aprobada', color: 'green' },
  REJECTED: { label: 'Rechazada', color: 'red' },
}

// #331: bandeja de autorizaciones de stock dentro de Inventario. El dueño o
// gerencia ve los pedidos de retiro/ajuste y transferencia con su motivo,
// solicitante y antigüedad, y los resuelve reusando /api/authorizations. La
// semántica no cambia: lo aprobado se consume al ejecutarse desde la ficha de
// la unidad (o del traslado) una sola vez; acá solo se decide.
export default function BandejaAutorizaciones({
  rows = [],
  loading = false,
  error = '',
  unidades = [],
  productos = [],
  sucursales = [],
  puedeResolver = false,
  esPropietario = false,
  usuarioId = '',
  esDemo = false,
  onReload,
  onDemoResolve,
}) {
  const toast = useToast()
  const { pendientes, resueltas } = partirAutorizacionesStock(rows)
  const [aprobar, setAprobar] = useState(null)
  const [notaAprobar, setNotaAprobar] = useState('')
  const [rechazar, setRechazar] = useState(null)
  const [notaRechazar, setNotaRechazar] = useState('')
  const [busy, setBusy] = useState(false)
  // #323: el motivo del rechazo se valida junto al campo (no por toast) y el
  // cierre con texto cargado pide confirmación.
  const { errorDe, validar, limpiar } = useValidacionCampos({
    motivo: [obligatorio('Contale al vendedor por qué se rechaza.')],
  })
  const historial = resueltas.slice(0, HISTORIAL_CORTO)

  const contexto = { unidades, productos, sucursales }

  function abrirAprobar(row) {
    setNotaAprobar('')
    setAprobar(row)
  }

  function abrirRechazar(row) {
    setNotaRechazar('')
    limpiar('motivo')
    setRechazar(row)
  }

  async function confirmarAprobar() {
    if (!aprobar || busy) return
    const nota = notaAprobar.trim()
    if (esDemo) {
      onDemoResolve?.(aprobar.id, {
        status: 'APPROVED',
        resolvedBy: { name: 'Hernán Acosta' },
        resolvedAt: new Date().toISOString(),
        resolvedNote: nota,
      })
      toast.success('Solicitud aprobada', 'En la demo queda simulada: no habilita operaciones reales.')
      setAprobar(null)
      return
    }
    setBusy(true)
    try {
      // resolvedValue vacío: para STOCK_ADJUST no se hereda la existencia
      // pedida y el backend resuelve { approved: true }, igual que la bandeja
      // de Operación → Autorizaciones.
      await api.patch('/api/authorizations', {
        id: aprobar.id,
        action: 'approve',
        resolvedValue: {},
        ...(nota ? { resolvedNote: nota } : {}),
      })
      toast.success('Solicitud aprobada', 'Queda habilitada para ejecutarse una sola vez desde la ficha de la unidad.')
      setAprobar(null)
      await onReload?.()
    } catch (cause) {
      toast.error('No se pudo aprobar', cause?.message)
    } finally {
      setBusy(false)
    }
  }

  async function confirmarRechazar() {
    if (!rechazar || busy) return
    if (!validar({ motivo: notaRechazar }).valido) return
    const nota = notaRechazar.trim()
    if (esDemo) {
      onDemoResolve?.(rechazar.id, {
        status: 'REJECTED',
        resolvedBy: { name: 'Hernán Acosta' },
        resolvedAt: new Date().toISOString(),
        resolvedNote: nota,
      })
      toast.success('Solicitud rechazada', 'En la demo queda simulada.')
      setRechazar(null)
      return
    }
    setBusy(true)
    try {
      await api.patch('/api/authorizations', { id: rechazar.id, action: 'reject', resolvedNote: nota })
      toast.success('Solicitud rechazada')
      setRechazar(null)
      await onReload?.()
    } catch (cause) {
      toast.error('No se pudo rechazar', cause?.message)
    } finally {
      setBusy(false)
    }
  }

  function filaPendiente(row) {
    const sujeto = sujetoDeSolicitudStock(row, contexto)
    const motivo = motivoDeSolicitudStock(row)
    const propia = row.requestedById === usuarioId
    const puedeResolverEsta = puedeResolver && (!propia || esPropietario)
    return (
      <article
        key={row.id}
        data-testid="autorizacion-stock-pendiente"
        className="rounded-xl border border-warn/30 bg-warn/5 px-3.5 py-2.5"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge color="blue" className="whitespace-nowrap px-1.5 py-0.5 text-[10px]">
                {ETIQUETA_KIND_STOCK[row.kind] || row.kind}
              </Badge>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-warn">{sujeto.accion}</span>
            </div>
            <p className={cn(CELDA_IDENTIDAD_GRANDE, 'mt-1 min-w-0 text-fore')} title={sujeto.titulo}>{sujeto.titulo}</p>
            {(sujeto.serial || sujeto.detalle) && (
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-mute">
                {sujeto.serial && <span className="font-mono tabular-nums" data-testid="autorizacion-stock-serial">{sujeto.serial}</span>}
                {sujeto.detalle && <span className="truncate" title={sujeto.detalle}>{sujeto.detalle}</span>}
              </p>
            )}
            {motivo && <p className="mt-1 text-xs text-mute" data-testid="autorizacion-stock-motivo">Motivo: {motivo}</p>}
            <p className="mt-1 text-[11px] text-mute">
              Pidió <b className="text-fore">{row.requestedBy?.name || 'Sistema'}</b>
              <span title={fechaHora(row.createdAt)}> · {antiguedad(row.createdAt)}</span>
              {propia && <span className="ml-2 rounded border border-ink-500 px-1.5 py-0.5 text-[10px]">Tu solicitud</span>}
            </p>
          </div>
          {puedeResolverEsta && (
            <div className="flex shrink-0 items-center gap-1">
              <Button type="button" className="h-8 px-2 text-xs" onClick={() => abrirAprobar(row)}>Aprobar</Button>
              <Button type="button" variant="ghost" className="h-8 px-2 text-xs" onClick={() => abrirRechazar(row)}>Rechazar</Button>
            </div>
          )}
        </div>
      </article>
    )
  }

  function filaResuelta(row) {
    const sujeto = sujetoDeSolicitudStock(row, contexto)
    const estado = ESTADOS[row.status] || { label: row.status, color: 'slate' }
    const motivo = motivoDeSolicitudStock(row)
    return (
      <article
        key={row.id}
        data-testid="autorizacion-stock-resuelta"
        className="rounded-xl border border-ink-600 bg-ink-800/40 px-3.5 py-2"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <Badge color="blue" className="whitespace-nowrap px-1.5 py-0.5 text-[10px]">{ETIQUETA_KIND_STOCK[row.kind] || row.kind}</Badge>
            <span className={cn(CELDA_IDENTIDAD, 'min-w-0 text-fore')} title={sujeto.titulo}>{sujeto.titulo}</span>
            {sujeto.serial && <span className="truncate font-mono text-[10px] tabular-nums text-mute">{sujeto.serial}</span>}
          </div>
          <span className="flex shrink-0 items-center gap-1">
            {row.usedAt && <Badge color="slate" className="whitespace-nowrap px-1.5 py-0.5 text-[10px]">Usada</Badge>}
            <Badge color={estado.color} className="whitespace-nowrap px-1.5 py-0.5 text-[10px]">{estado.label}</Badge>
          </span>
        </div>
        <p className="mt-1 text-[11px] text-mute" title={fechaHora(row.createdAt)}>
          Pidió <b className="text-fore">{row.requestedBy?.name || 'Sistema'}</b> · {antiguedad(row.createdAt)}
          {row.resolvedBy?.name ? <> · resolvió <b className="text-fore">{row.resolvedBy.name}</b> · {antiguedad(row.resolvedAt)}</> : null}
        </p>
        {motivo && <p className="mt-0.5 truncate text-[11px] text-mute" title={motivo}>Motivo: {motivo}</p>}
        {row.resolvedNote && <p className={cn('mt-0.5 truncate text-[11px]', row.status === 'REJECTED' ? 'text-bad' : 'text-mute')} title={row.resolvedNote}>Respuesta: {row.resolvedNote}</p>}
      </article>
    )
  }

  return (
    <Card data-testid="inventario-autorizaciones">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className={ROTULO_SECCION}>Autorizaciones de stock</h3>
          <p className="mt-1 text-xs text-mute">Pedidos de retiro, ajuste y transferencia: aprobalos o rechazalos. Lo aprobado se ejecuta desde la ficha de la unidad y se consume una sola vez.</p>
        </div>
        <div className="flex items-center gap-2">
          {pendientes.length > 0 && <Badge color="orange">{pendientes.length} pendiente{pendientes.length === 1 ? '' : 's'}</Badge>}
          <Button type="button" variant="outline" className="px-3 text-xs" onClick={() => onReload?.()} disabled={loading}>
            {loading ? 'Cargando…' : 'Actualizar'}
          </Button>
        </div>
      </div>

      {error && (
        <Aviso tono="error" className="mt-3">
          {error}
          <button type="button" className="ml-2 font-semibold underline" onClick={() => onReload?.()}>Reintentar</button>
        </Aviso>
      )}

      {loading && !rows.length && (
        <div className="mt-3 space-y-2" aria-busy="true">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      )}

      {!loading && !error && !rows.length && (
        <div className="mt-3" data-testid="autorizaciones-stock-vacio">
          <EmptyState
            compact
            icon="check"
            title="Sin autorizaciones de stock"
            description="Cuando alguien pida retirar, ajustar o transferir stock, aparece acá para que lo resuelvas."
          />
        </div>
      )}

      {!error && (pendientes.length > 0 || rows.length > 0) && (
        <>
          <div className="mt-4">
            <h4 className={ROTULO_SECCION}>Pendientes</h4>
            {pendientes.length > 0
              ? <div className="mt-2 space-y-2">{pendientes.map(filaPendiente)}</div>
              : <p className="mt-2 rounded-lg border border-ok/30 bg-ok/5 px-3 py-2 text-xs text-ok" data-testid="autorizaciones-stock-sin-pendientes">No hay solicitudes pendientes: el stock está al día.</p>}
          </div>

          {historial.length > 0 && (
            <div className="mt-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h4 className={ROTULO_SECCION}>Resueltas recientes</h4>
                <span className={cn(CELDA_ENCABEZADO, 'normal-case')}>últimas {historial.length}{resueltas.length > historial.length ? ` de ${resueltas.length}` : ''}</span>
              </div>
              <div className="mt-2 space-y-1.5" data-testid="autorizaciones-stock-historial">{historial.map(filaResuelta)}</div>
            </div>
          )}
        </>
      )}

      <Modal
        open={Boolean(aprobar)}
        onClose={() => { if (!busy) setAprobar(null) }}
        dirty={Boolean(aprobar) && notaAprobar.trim() !== ''}
        busy={busy}
        title={`Aprobar ${ETIQUETA_KIND_STOCK[aprobar?.kind] || 'solicitud'}`}
        size="formulario"
      >
        {aprobar && (
          <div className="space-y-4">
            <p className="text-sm text-mute">
              {sujetoDeSolicitudStock(aprobar, contexto).titulo} · pidió {aprobar.requestedBy?.name || 'Sistema'}:{' '}
              <b className="text-fore">{sujetoDeSolicitudStock(aprobar, contexto).accion}</b>
            </p>
            <p className="rounded-lg border border-fono/30 bg-fono/5 px-3 py-2 text-xs text-fono-light">
              {aprobar.kind === 'TRANSFER'
                ? 'Al aprobar, la transferencia queda habilitada para ejecutarse una sola vez desde Traslados.'
                : 'Al aprobar, el retiro o ajuste de esa unidad queda habilitado para ejecutarse una sola vez desde la ficha de la unidad.'}
            </p>
            <FormField label="Nota de la respuesta (opcional)" htmlFor="autz-stock-nota-aprobar">
              <Textarea
                id="autz-stock-nota-aprobar"
                rows={2}
                maxLength={500}
                value={notaAprobar}
                onChange={(event) => setNotaAprobar(event.target.value)}
                placeholder="Condición acordada…"
              />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setAprobar(null)} disabled={busy}>Cancelar</Button>
              <Button type="button" onClick={confirmarAprobar} disabled={busy}>
                <Icon name="check" className="h-4 w-4" />
                {busy ? 'Guardando…' : 'Aprobar'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(rechazar)}
        onClose={() => setRechazar(null)}
        dirty={Boolean(rechazar) && notaRechazar.trim() !== ''}
        busy={busy}
        title={`Rechazar ${ETIQUETA_KIND_STOCK[rechazar?.kind] || 'solicitud'}`}
        size="formulario"
      >
        {rechazar && (
          <div className="space-y-4">
            <p className="text-sm text-mute">
              {sujetoDeSolicitudStock(rechazar, contexto).titulo} · pidió {rechazar.requestedBy?.name || 'Sistema'}:{' '}
              <b className="text-fore">{sujetoDeSolicitudStock(rechazar, contexto).accion}</b>
            </p>
            <FormField label="Motivo del rechazo" htmlFor="autz-stock-motivo-rechazo" error={errorDe('motivo')}>
              <Textarea
                id="autz-stock-motivo-rechazo"
                rows={3}
                maxLength={500}
                value={notaRechazar}
                onChange={(event) => { limpiar('motivo'); setNotaRechazar(event.target.value) }}
                placeholder="Explicá por qué no se autoriza…"
              />
            </FormField>
            <SaveActions pendiente={busy}>
              <Button type="button" variant="danger" onClick={confirmarRechazar} disabled={busy}>
                {busy ? 'Guardando…' : 'Rechazar'}
              </Button>
            </SaveActions>
          </div>
        )}
      </Modal>
    </Card>
  )
}
