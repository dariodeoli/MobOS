import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { listVentas } from '@/lib/storage'
import { getDemoCash } from '@/lib/demoCash'
import { construirDemoAuditoriaEfectivo, guardarMarcaDemo, leerMarcasDemo } from '@/lib/demoAuditoria'
import { inicializarBorradores } from '@/lib/auditoriaEfectivo'
import { useSesion } from '@/lib/sesion'
import { formatGs } from '@/utils/moneda'
import { fechaCorta, fechaHora } from '@/utils/fecha'
import { cn } from '@/lib/utils'
import { Aviso, Badge, Button, Card, EmptyState, Input, Select } from '@/components/ui'
import { CELDA_DATO, CELDA_ENCABEZADO, ROTULO_DATO } from '@/components/shared/tabla'
import { GRILLA_DOS_COLUMNAS_COMPACTA } from '@/components/shared/formulario'
// Auditoría de efectivo (#161): efectivo inicial y recibido por sesión, cada
// operación (pedido, cliente, fecha/hora, monto, vendedor y nota) con su marca
// verificada/pendiente/con diferencia y observación, sobre un rango de fechas.

const ESTADOS = {
  VERIFIED: { label: 'Verificado', color: 'green' },
  PENDING: { label: 'Pendiente', color: 'yellow' },
  DIFFERENCE: { label: 'Con diferencia', color: 'red' },
}

const diaISO = (fecha) => {
  try { return fecha.toLocaleDateString('sv') } catch { return '' }
}

const hoy = () => diaISO(new Date())
const haceDias = (dias) => {
  const fecha = new Date()
  fecha.setDate(fecha.getDate() - dias)
  return diaISO(fecha)
}
export default function AuditoriaEfectivo() {
  const { esDemo, sucursal, sesion } = useSesion()
  const [desde, setDesde] = useState(() => haceDias(7))
  const [hasta, setHasta] = useState(() => hoy())
  const [sucursalId, setSucursalId] = useState('')
  const [sucursales, setSucursales] = useState([])
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [borradores, setBorradores] = useState({})

  const cargar = useCallback(async () => {
    setBusy(true); setError('')
    try {
      // En la demo la auditoría se arma con los cobros ficticios del rango y la
      // caja local (#194); las marcas quedan en este navegador.
      if (esDemo) {
        const respuesta = construirDemoAuditoriaEfectivo({ ventas: listVentas(), cash: getDemoCash(), desde, hasta, marcas: leerMarcasDemo() })
        setData(respuesta)
        setBorradores((actuales) => inicializarBorradores(respuesta.operaciones, actuales))
        return
      }
      const params = new URLSearchParams({ from: desde, to: hasta })
      const branch = sucursalId || sucursal?.id
      if (branch) params.set('branchId', branch)
      const respuesta = await api.get(`/api/cash/audit-operations?${params}`)
      setData(respuesta)
      // Un refresco no pisa lo que la persona ya escribió (#199): los
      // borradores existentes se conservan y solo se agregan los nuevos.
      setBorradores((actuales) => inicializarBorradores(respuesta.operaciones, actuales))
    } catch (cause) { setError(cause?.message || 'No se pudo cargar la auditoría de efectivo.') } finally { setBusy(false) }
  }, [desde, hasta, sucursalId, sucursal?.id, esDemo])

  useEffect(() => { cargar() }, [cargar])
  useEffect(() => {
    if (esDemo || !sesion?.esPropietario) return
    let activo = true
    api.get('/api/branches').then((rows) => { if (activo) setSucursales(Array.isArray(rows) ? rows : rows?.branches || []) }).catch(() => {})
    return () => { activo = false }
  }, [esDemo, sesion?.esPropietario])

  async function guardar(operacion) {
    const clave = `${operacion.kind}:${operacion.id}`
    const borrador = borradores[clave] || {}
    setBusy(true); setError('')
    try {
      if (esDemo) {
        const marca = guardarMarcaDemo(operacion.kind, operacion.id, { status: borrador.status, note: borrador.note || '', auditadoPor: 'Dueño demo', auditedAt: new Date().toISOString() })
        setData(current => current ? {
          ...current,
          operaciones: current.operaciones.map((fila) => fila.kind === operacion.kind && fila.id === operacion.id
            ? { ...fila, status: marca.status, notaAuditoria: marca.note || '', auditadoPor: marca.auditadoPor, auditadoAt: marca.auditedAt }
            : fila),
        } : current)
        return
      }
      const marca = await api.post('/api/cash/audit-operations', { operationKind: operacion.kind, operationId: operacion.id, status: borrador.status, note: borrador.note })
      setData(current => current ? {
        ...current,
        operaciones: current.operaciones.map((fila) => fila.kind === operacion.kind && fila.id === operacion.id
          ? { ...fila, status: marca.status, notaAuditoria: marca.note || '', auditadoPor: marca.auditadoPor || '', auditadoAt: marca.auditedAt }
          : fila),
      } : current)
    } catch (cause) { setError(cause?.message || 'No se pudo guardar la marca.') } finally { setBusy(false) }
  }

  const resumen = data?.resumen || {}
  const operaciones = data?.operaciones || []

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="font-bold">Auditoría de efectivo</h3>
          <p className="mt-1 text-sm text-mute">Compará cada monto físico con su comprobante: marcá verificado, pendiente o con diferencia y dejá la observación.</p>
          {esDemo && <p className="mt-1 text-xs text-fono-light">Demo: cobros ficticios del rango; las marcas se guardan en este navegador.</p>}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-mute">Desde<Input type="date" className="mt-1" value={desde} onChange={(event) => setDesde(event.target.value)} /></label>
          <label className="text-xs text-mute">Hasta<Input type="date" className="mt-1" value={hasta} onChange={(event) => setHasta(event.target.value)} /></label>
          {sucursales.length > 1 && <label className="text-xs text-mute">Sucursal<Select className="mt-1" value={sucursalId} onChange={(event) => setSucursalId(event.target.value)}><option value="">Todas</option>{sucursales.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select></label>}
          <Button type="button" variant="outline" disabled={busy} onClick={cargar}>Auditar rango</Button>
        </div>
      </div>
      {error && <Aviso tono="error">{error}</Aviso>}

      <div className={cn('lg:grid-cols-4', GRILLA_DOS_COLUMNAS_COMPACTA)}>
        <div className="rounded-xl border border-ink-600 p-3"><p className={ROTULO_DATO}>Efectivo inicial</p><strong className="mt-1 block tabular-nums">{formatGs(resumen.aperturaPyg || 0)}</strong><p className="mt-0.5 text-[11px] text-mute">{data?.sesiones?.length || 0} sesión(es)</p></div>
        <div className="rounded-xl border border-ink-600 p-3"><p className={ROTULO_DATO}>Efectivo recibido</p><strong className="mt-1 block tabular-nums text-ok">{formatGs(resumen.recibidoPyg || 0)}</strong><p className="mt-0.5 text-[11px] text-mute">{resumen.operaciones || 0} operación(es)</p></div>
        <div className="rounded-xl border border-ink-600 p-3"><p className={ROTULO_DATO}>Esperado en caja</p><strong className="mt-1 block tabular-nums">{formatGs(resumen.esperadoPyg || 0)}</strong><p className="mt-0.5 text-[11px] text-mute">Apertura + efectivo confirmado</p></div>
        <div className={cn('rounded-xl border p-3', (resumen.diferenciaPyg || 0) === 0 ? 'border-ink-600' : 'border-warn/40 bg-warn/10')}><p className={ROTULO_DATO}>Diferencias de cierre</p><strong className={cn('mt-1 block tabular-nums', (resumen.diferenciaPyg || 0) === 0 ? '' : 'text-warn')}>{formatGs(resumen.diferenciaPyg || 0)}</strong><p className="mt-0.5 text-[11px] text-mute">{resumen.verificadas || 0} verificadas · {resumen.pendientes || 0} pendientes · {resumen.conDiferencia || 0} con diferencia</p></div>
      </div>

      <div className="overflow-x-auto" data-testid="auditoria-efectivo-tabla">
        <div className="grid min-w-[52rem] grid-cols-[6.5rem_minmax(0,1fr)_8rem_7rem_11rem_minmax(0,1.1fr)] items-center gap-x-2 px-3.5 pb-2 pt-1">
          {['Fecha', 'Operación', 'Vendedor', 'Monto', 'Estado', 'Observación'].map((titulo) => <span key={titulo} className={CELDA_ENCABEZADO}>{titulo}</span>)}
        </div>
        <div className="space-y-1">
          {operaciones.map((operacion) => {
            const clave = `${operacion.kind}:${operacion.id}`
            const borrador = borradores[clave] || { status: operacion.status, note: operacion.notaAuditoria }
            const estado = ESTADOS[operacion.status] || ESTADOS.PENDING
            const pendienteDeGuardar = borrador.status !== operacion.status || (borrador.note || '') !== (operacion.notaAuditoria || '')
            return <div key={clave} data-testid="auditoria-fila" className="grid min-w-[52rem] grid-cols-[6.5rem_minmax(0,1fr)_8rem_7rem_11rem_minmax(0,1.1fr)] items-center gap-x-2 rounded-xl border border-ink-600 bg-ink-800/40 px-3.5 py-2">
              <span className={CELDA_DATO} title={fechaHora(operacion.fecha)}>{fechaCorta(operacion.fecha)}</span>
              <span className="min-w-0">
                <b className="block truncate text-[13px]">{operacion.kind === 'PAYMENT' ? (operacion.pedido || 'Cobro en efectivo') : operacion.nota || 'Movimiento de caja'}</b>
                <span className="mt-0.5 block truncate text-[11px] text-mute">{[operacion.kind === 'PAYMENT' ? operacion.cliente : operacion.nota, operacion.notaAuditoria, operacion.auditadoPor ? `auditó ${operacion.auditadoPor}` : ''].filter(Boolean).join(' · ') || '—'}</span>
              </span>
              <span className={CELDA_DATO}>{operacion.vendedor || '—'}</span>
              <span className={cn('truncate text-xs tabular-nums', operacion.direction === 'OUT' ? 'text-bad' : 'text-ok')}>{operacion.direction === 'OUT' ? '−' : '+'}{formatGs(operacion.montoPyg)}</span>
              <span className="flex items-center gap-1.5">
                <Badge color={estado.color} className="w-fit whitespace-nowrap">{estado.label}</Badge>
                <Select aria-label={`Estado de ${operacion.pedido || operacion.nota || 'la operación'}`} className="h-8 w-[7.5rem] text-xs" value={borrador.status} disabled={busy} onChange={(event) => setBorradores(current => ({ ...current, [clave]: { ...borrador, status: event.target.value } }))}>
                  {Object.entries(ESTADOS).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
                </Select>
              </span>
              <span className="flex min-w-0 items-center gap-1.5">
                <Input aria-label="Observación" className="h-8 min-w-0 flex-1 text-xs" maxLength={500} placeholder={borrador.status === 'DIFFERENCE' ? 'Explicá la diferencia' : 'Observación (opcional)'} value={borrador.note || ''} disabled={busy} onChange={(event) => setBorradores(current => ({ ...current, [clave]: { ...borrador, note: event.target.value } }))} />
                <Button type="button" variant={pendienteDeGuardar ? 'primary' : 'outline'} className="h-8 shrink-0 px-2 text-xs" disabled={busy || !pendienteDeGuardar} onClick={() => guardar(operacion)}>Guardar</Button>
              </span>
            </div>
          })}
          {!busy && !operaciones.length && <EmptyState compact icon="box" title="Sin efectivo cobrado ni movimientos en el rango" description="Probá con otro rango de fechas o esperá cobros en efectivo." />}
        </div>
      </div>
    </Card>
  )
}
