import { useEffect, useState } from 'react'
import { Badge, Button, ConfirmDialog, EmptyState, Skeleton, useToast } from '@/components/ui'
import SegmentedField from '@/components/shared/SegmentedField'
import Icon from '@/components/shared/Icon'
import { api } from '@/lib/api/client'
import { getDemoServicio, saveDemoServicio, siguienteNumeroDemo } from '@/lib/demoServicio'
import { getDemoWarranties, saveDemoWarranties } from '@/lib/demoWarranties'
import { useSesion } from '@/lib/sesion'
import { cn } from '@/lib/utils'
import { CELDA_DATO, CELDA_IDENTIDAD_GRANDE } from '@/components/shared/tabla'
import { temaV2Activo } from '@/lib/temaV2'
import { ESTADO_GARANTIA, ESTADO_GARANTIA_BADGE, SIGUIENTE_GARANTIA } from '@/lib/estadosPedido'
import { SIGUIENTE_SERVICIO, etiquetaServicio } from '@/lib/estadosServicio'
import Garantias from './Garantias'
import ServicioTecnico from './ServicioTecnico'
import TableroServicioGarantias from './TableroServicioGarantias'

// Sección «Taller» (#224/#251): una garantía puede ingresar al taller, así que
// viven juntas como una sola sección con pestañas internas. La pestaña Todo
// lista ambos orígenes con su badge y permite convertir una garantía en orden
// de servicio conservando el historial; las otras pestañas son las pantallas
// de detalle de siempre y el tablero por etapas (#215).
const TABS = [['todo', 'Todo'], ['tablero', 'Tablero'], ['servicio', 'Servicio'], ['garantias', 'Garantías']]
const ESTADO_SERVICIO = { RECIBIDO: 'Recibido', DIAGNOSTICO: 'Diagnóstico', CON_TECNICO: 'Con técnico', ESPERANDO_REPUESTO: 'Esperando repuesto', REPARADO: 'Reparado', LISTO: 'Listo para retirar', ENTREGADO: 'Entregado', CANCELADO: 'Cancelado' }
const GRID = 'grid min-w-[58rem] grid-cols-[6.5rem_minmax(0,1.4fr)_minmax(0,1.2fr)_7.5rem_6rem_11rem] items-center gap-x-2'
const CELDA = 'truncate text-[10px] font-bold uppercase tracking-wider text-mute'
const fecha = (valor) => (valor && !Number.isNaN(Date.parse(valor)) ? new Date(valor).toLocaleDateString('es-PY') : '—')

export default function ServicioGarantias({ vistaInicial = 'servicio' }) {
  // Vista previa v2 (#241 lote E): resumen en tiles del listado unificado.
  const v2 = temaV2Activo()
  const toast = useToast()
  const { esDemo } = useSesion()
  const [vista, setVista] = useState(TABS.some(([id]) => id === vistaInicial) ? vistaInicial : 'servicio')
  const [filas, setFilas] = useState(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [confirmar, setConfirmar] = useState(null)
  const [convirtiendo, setConvirtiendo] = useState(false)
  const [procesandoId, setProcesandoId] = useState(null)

  useEffect(() => { if (TABS.some(([id]) => id === vistaInicial)) setVista(vistaInicial) }, [vistaInicial])

  useEffect(() => {
    if (vista !== 'todo' && vista !== 'tablero') return undefined
    let vivo = true
    setFilas(null); setError('')
    const armar = (servicios, garantias) => {
      const deServicio = servicios.map((order) => ({
        key: `servicio-${order.id}`,
        tipo: 'SERVICIO',
        id: order.id,
        // Con garantía de origen: la orden nació de un caso (#224).
        desdeGarantia: order.warranty?.id ? order.warranty : (order.warrantyCaseId ? { id: order.warrantyCaseId } : null),
        codigo: order.serviceNumber || '',
        cliente: order.customerName || 'Sin cliente',
        equipo: order.device || '',
        serial: order.serial || '',
        estado: ESTADO_SERVICIO[order.status] || order.status || '',
        estadoCodigo: order.status || '',
        estadoTono: order.status === 'ENTREGADO' ? 'green' : order.status === 'CANCELADO' ? 'red' : 'slate',
        createdAt: order.createdAt || order.receivedAt,
      }))
      const deGarantia = garantias.map((item) => ({
        key: `garantia-${item.id}`,
        tipo: 'GARANTIA',
        id: item.id,
        customerId: item.customerId || null,
        detalle: item.description || '',
        statusOriginal: item.status || '',
        // Si ya está en el taller, conserva el vínculo y lo muestra.
        enServicio: item.serviceOrderNumber || '',
        codigo: item.serviceOrderNumber || '',
        cliente: item.customerName || 'Sin cliente',
        equipo: item.description || '',
        serial: item.serial || '',
        estado: ESTADO_GARANTIA_BADGE[item.status]?.label || item.status || '',
        estadoCodigo: item.status || '',
        estadoTono: item.status === 'DELIVERED' ? 'green' : item.status === 'READY' ? 'orange' : 'slate',
        createdAt: item.createdAt,
      }))
      return [...deServicio, ...deGarantia].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    }
    // Demo: la misma lista con los datos de este navegador (#194/#224).
    if (esDemo) {
      setFilas(armar(getDemoServicio().rows || [], getDemoWarranties()))
      return () => { vivo = false }
    }
    Promise.all([
      api.get('/api/service-orders'),
      api.get('/api/warranties?kind=SERVICE'),
      api.get('/api/warranties?kind=COVERAGE'),
    ]).then(([servicios, garantiasServicio, garantiasCobertura]) => {
      if (!vivo) return
      setFilas(armar(
        Array.isArray(servicios) ? servicios : [],
        [...(Array.isArray(garantiasServicio) ? garantiasServicio : []), ...(Array.isArray(garantiasCobertura) ? garantiasCobertura : [])],
      ))
    }).catch((cause) => { if (vivo) { setError(cause?.message || 'No se pudieron cargar los registros.'); setFilas([]) } })
    return () => { vivo = false }
  }, [vista, revision, esDemo])

  // Conversión garantía → servicio: la orden copia los datos del caso, queda
  // vinculada y el historial de la garantía se conserva.
  async function convertir() {
    if (!confirmar || convirtiendo) return
    setConvirtiendo(true)
    try {
      if (esDemo) {
        // Demo: la conversión vive solo en este navegador, igual que el resto
        // de los datos de demo (#194).
        const servicio = getDemoServicio()
        const numero = siguienteNumeroDemo(servicio.rows || [])
        const nueva = {
          id: `demo-os-${Date.now()}`,
          serviceNumber: numero,
          customerName: confirmar.cliente,
          customerId: confirmar.customerId,
          customerPhone: '',
          customerCountryCode: '+595',
          device: confirmar.equipo || 'Equipo del caso',
          serial: confirmar.serial,
          serviceName: 'Garantía en taller',
          reportedIssue: confirmar.detalle,
          diagnosis: '',
          technicianName: '',
          status: 'RECIBIDO',
          pricePyg: 0, costPyg: 0, partsPyg: 0, laborPyg: 0, otherCostPyg: 0,
          receivedAt: new Date().toISOString(),
          checklist: {},
          warrantyCaseId: confirmar.id,
        }
        saveDemoServicio({ rows: [nueva, ...(servicio.rows || [])] })
        saveDemoWarranties(getDemoWarranties().map((item) => (item.id === confirmar.id ? { ...item, serviceOrderId: nueva.id, serviceOrderNumber: numero } : item)))
        toast.success(`Garantía en servicio · ${numero}`, 'La orden quedó vinculada y el historial se conserva en este navegador.')
      } else {
        const orden = await api.post('/api/service-orders', { warrantyCaseId: confirmar.id })
        toast.success(`Garantía en servicio${orden?.serviceNumber ? ` · ${orden.serviceNumber}` : ''}`, 'La orden quedó vinculada y el historial se conserva.')
      }
      setConfirmar(null)
      setRevision((valor) => valor + 1)
    } catch (cause) {
      toast.error('No se pudo pasar a servicio', cause?.message)
    } finally { setConvirtiendo(false) }
  }

  // Avance de etapa desde el tablero (#215/#241): la tarjeta pasa a la etapa
  // siguiente de su propio pipeline (taller o garantía) y la lista se recarga.
  async function avanzarFila(fila) {
    const siguiente = fila.tipo === 'SERVICIO' ? SIGUIENTE_SERVICIO[fila.estadoCodigo] : SIGUIENTE_GARANTIA[fila.estadoCodigo]
    if (!siguiente || procesandoId) return
    setProcesandoId(fila.key)
    try {
      if (esDemo) {
        if (fila.tipo === 'SERVICIO') saveDemoServicio({ rows: getDemoServicio().rows.map((actual) => (actual.id === fila.id ? { ...actual, status: siguiente } : actual)) })
        else saveDemoWarranties(getDemoWarranties().map((actual) => (actual.id === fila.id ? { ...actual, status: siguiente, updatedAt: new Date().toISOString() } : actual)))
      } else if (fila.tipo === 'SERVICIO') {
        await api.patch('/api/service-orders', { id: fila.id, status: siguiente })
      } else {
        await api.patch('/api/warranties', { id: fila.id, status: siguiente })
      }
      const etiqueta = fila.tipo === 'SERVICIO' ? etiquetaServicio(siguiente) : ESTADO_GARANTIA[siguiente]
      toast.success(`${fila.equipo || fila.codigo}: ${etiqueta}.`)
      setRevision((valor) => valor + 1)
    } catch (cause) {
      toast.error(cause?.message || 'No se pudo avanzar la etapa.')
    } finally { setProcesandoId(null) }
  }

  return (
    <div className="space-y-4" data-testid="servicio-garantias">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedField value={vista} onChange={setVista} ariaLabel="Ver taller o garantías" options={TABS} />
      </div>

      {vista === 'servicio' && <ServicioTecnico />}
      {vista === 'garantias' && <Garantias />}

      {vista === 'tablero' && (
        <TableroServicioGarantias
          filas={filas}
          error={error}
          onReintentar={() => setRevision((valor) => valor + 1)}
          onAvanzar={avanzarFila}
          procesandoId={procesandoId}
        />
      )}

      {vista === 'todo' && (
        <div className="space-y-3">
          <p className="text-sm text-mute">Órdenes del taller y garantías en una sola lista, con su tipo a la vista. Una garantía puede pasar al taller conservando su historial.</p>
          {v2 && filas && filas.length > 0 && (
            <div data-testid="resumen-servicio-garantias" className="grid grid-cols-2 divide-ink-600 rounded-xl border border-ink-600 bg-ink-800/60 text-center sm:grid-cols-4 sm:divide-x">
              <div className="p-3"><p className="text-[11px] uppercase tracking-wider text-mute">Registros</p><p className="v2-numero mt-1 text-lg font-semibold tabular-nums sm:text-2xl">{filas.length}</p><p className="text-[11px] text-mute">en la lista</p></div>
              <div className="p-3"><p className="text-[11px] uppercase tracking-wider text-mute">En taller</p><p className={cn('v2-numero mt-1 text-lg font-semibold tabular-nums', filas.some((fila) => fila.tipo === 'SERVICIO' && !['Entregado', 'Cancelado'].includes(fila.estado)) ? 'text-fore' : 'text-mute')}>{filas.filter((fila) => fila.tipo === 'SERVICIO' && !['Entregado', 'Cancelado'].includes(fila.estado)).length}</p><p className="text-[11px] text-mute">órdenes activas</p></div>
              <div className="p-3"><p className="text-[11px] uppercase tracking-wider text-mute">Garantías</p><p className={cn('v2-numero mt-1 text-lg font-semibold tabular-nums', filas.some((fila) => fila.tipo === 'GARANTIA' && fila.estado !== 'Entregado') ? 'text-fore' : 'text-mute')}>{filas.filter((fila) => fila.tipo === 'GARANTIA' && fila.estado !== 'Entregado').length}</p><p className="text-[11px] text-mute">casos abiertos</p></div>
              <div className="p-3"><p className="text-[11px] uppercase tracking-wider text-mute">Desde garantía</p><p className={cn('v2-numero mt-1 text-lg font-semibold tabular-nums', filas.some((fila) => fila.desdeGarantia) ? 'text-ok' : 'text-mute')}>{filas.filter((fila) => fila.desdeGarantia).length}</p><p className="text-[11px] text-mute">pasaron al taller</p></div>
            </div>
          )}
          {filas === null && <div className="space-y-2" aria-busy="true"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>}
          {filas !== null && error && <EmptyState compact icon="alert" title="No se pudieron cargar los registros" description={error} action={<Button onClick={() => setRevision((valor) => valor + 1)}>Reintentar</Button>} />}
          {filas !== null && !error && !filas.length && <EmptyState compact icon="wrench" title="Sin registros" description="Cargá una garantía o una orden de servicio para verlas acá." />}
          {filas !== null && !error && filas.length > 0 && (
            <div className="overflow-x-auto" data-testid="servicio-garantias-tabla">
              <div className={cn(GRID, 'px-3.5 pb-2 pt-1')}>
                <span className={CELDA}>Tipo</span>
                <span className={CELDA}>Cliente</span>
                <span className={CELDA}>Equipo</span>
                <span className={CELDA}>Estado</span>
                <span className={CELDA}>Fecha</span>
                <span className={cn(CELDA, 'text-right')}>Acciones</span>
              </div>
              <div className="space-y-1">
                {filas.map((fila) => (
                  <div key={fila.key} data-testid="servicio-garantia-fila" data-tipo={fila.tipo} className={cn(GRID, 'rounded-xl border border-ink-600 bg-ink-800/40 px-3.5 py-2 transition hover:border-fono/40')}>
                    <span className="min-w-0">
                      {fila.tipo === 'GARANTIA' ? (
                        <Badge color="blue" className="w-fit whitespace-nowrap px-1.5 py-0.5 text-[10px]"><Icon name="shield" className="h-3 w-3" />Garantía</Badge>
                      ) : (
                        <Badge color="slate" className="w-fit whitespace-nowrap px-1.5 py-0.5 text-[10px]"><Icon name="wrench" className="h-3 w-3" />Servicio</Badge>
                      )}
                      {fila.desdeGarantia && <span className="mt-1 block text-[10px] text-mute">Desde garantía</span>}
                      {fila.enServicio && <span className="mt-1 block text-[10px] font-semibold text-ok">En servicio</span>}
                    </span>
                    <span className={CELDA_IDENTIDAD_GRANDE} title={fila.cliente}>{fila.cliente}</span>
                    <span className={cn('min-w-0', CELDA_DATO)} title={[fila.equipo, fila.serial].filter(Boolean).join(' · ')}>{fila.equipo || '—'}{fila.serial ? ` · ${fila.serial}` : ''}</span>
                    <span className={CELDA_DATO}>{fila.estado || '—'}</span>
                    <span className={CELDA_DATO}>{fecha(fila.createdAt)}</span>
                    <span className="flex items-center justify-end gap-2">
                      {fila.codigo && <span className="truncate text-[11px] font-semibold text-fono-light tabular-nums" title={fila.codigo}>{fila.codigo}</span>}
                      {fila.tipo === 'GARANTIA' && !fila.enServicio && (
                        <button type="button" className="whitespace-nowrap text-xs font-semibold text-ok transition hover:underline" onClick={() => setConfirmar(fila)}>Pasar a servicio</button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmar)}
        onCancel={() => { if (!convirtiendo) setConfirmar(null) }}
        onConfirm={convertir}
        title="Pasar la garantía a servicio"
        description={`Se crea una orden de servicio para ${confirmar?.cliente || 'el cliente'} con los datos del caso (equipo, serial y diagnóstico). La garantía conserva su historial y queda marcada “En servicio”.`}
        confirmLabel="Pasar a servicio"
        busy={convirtiendo}
      />
    </div>
  )
}
