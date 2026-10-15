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
import './finanzasTactil.css'
import { Aviso, Button, Card, EmptyState, Input, Select } from '@/components/ui'
import { ROTULO_DATO } from '@/components/shared/tabla'
import { GRILLA_DOS_COLUMNAS_COMPACTA } from '@/components/shared/formulario'
import ListaDensa from '@/components/shared/ListaDensa'
import { usePaginaLista } from '@/components/shared/usePaginaLista'
import Toolbar from '@/components/shared/Toolbar'
import EstadoSelect from '@/components/shared/EstadoSelect'
// Auditoría de efectivo (#161): efectivo inicial y recibido por sesión, cada
// operación (pedido, cliente, fecha/hora, monto, vendedor y nota) con su marca
// verificada/pendiente/con diferencia y observación, sobre un rango de fechas.

// Estados de la marca (etiqueta y tono en `lib/estados.js`, dominio `auditoria`).
const ESTADOS_MARCA = ['VERIFIED', 'PENDING', 'DIFFERENCE']
const claveDe = (operacion) => `${operacion.kind}:${operacion.id}`
const tituloDe = (operacion) => (operacion.kind === 'PAYMENT' ? (operacion.pedido || 'Cobro en efectivo') : operacion.nota || 'Movimiento de caja')

function Identidad({ operacion }) {
  const detalle = [operacion.kind === 'PAYMENT' ? operacion.cliente : operacion.nota, operacion.notaAuditoria, operacion.auditadoPor ? `auditó ${operacion.auditadoPor}` : ''].filter(Boolean).join(' · ')
  return (
    <span className="block min-w-0">
      <b className="block truncate text-[13px]" title={tituloDe(operacion)}>{tituloDe(operacion)}</b>
      <span className="mt-0.5 block truncate text-[11px] text-mute" title={detalle || undefined}>{detalle || '—'}</span>
    </span>
  )
}

function Monto({ operacion, className }) {
  const saliente = operacion.direction === 'OUT'
  return <span className={cn('tabular-nums', saliente ? 'text-bad' : 'text-ok', className)}>{saliente ? '−' : '+'}{formatGs(operacion.montoPyg)}</span>
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
        const marca = guardarMarcaDemo(operacion.kind, operacion.id, { status: borrador.status, note: borrador.note || '', auditadoPor: 'Hernán Acosta', auditedAt: new Date().toISOString() })
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
  const lista = usePaginaLista(operaciones, { tamano: { compacto: 5, amplio: 15 } })

  const cambiarBorrador = (operacion, cambio) => setBorradores(current => {
    const clave = claveDe(operacion)
    const actual = current[clave] || { status: operacion.status, note: operacion.notaAuditoria }
    return { ...current, [clave]: { ...actual, ...cambio } }
  })
  const borradorDe = (operacion) => borradores[claveDe(operacion)] || { status: operacion.status, note: operacion.notaAuditoria }
  const pendienteDeGuardar = (operacion) => {
    const borrador = borradorDe(operacion)
    return borrador.status !== operacion.status || (borrador.note || '') !== (operacion.notaAuditoria || '')
  }
  // Un solo control de estado por fila: el chip ES el selector editable.
  const controlEstado = (operacion) => (
    <EstadoSelect
      dominio="auditoria"
      opciones={ESTADOS_MARCA}
      ariaLabel={`Estado de ${operacion.pedido || operacion.nota || 'la operación'}`}
      value={borradorDe(operacion).status}
      disabled={busy}
      onChange={(event) => cambiarBorrador(operacion, { status: event.target.value })}
    />
  )
  const campoObservacion = (operacion) => {
    const borrador = borradorDe(operacion)
    return <Input aria-label="Observación" className="h-11 min-w-0 text-xs lg:h-8" maxLength={500} placeholder={borrador.status === 'DIFFERENCE' ? 'Explicá la diferencia' : 'Observación (opcional)'} value={borrador.note || ''} disabled={busy} onChange={(event) => cambiarBorrador(operacion, { note: event.target.value })} />
  }
  const botonGuardar = (operacion) => (
    <Button type="button" variant={pendienteDeGuardar(operacion) ? 'primary' : 'outline'} className="h-11 shrink-0 px-3 text-xs lg:h-8 lg:px-2" disabled={busy || !pendienteDeGuardar(operacion)} onClick={() => guardar(operacion)}>Guardar</Button>
  )

  return (
    <Card className="finanzas-tactil space-y-3">
      <div>
        <h3 className="font-bold">Auditoría de efectivo</h3>
        <p className="mt-1 text-sm text-mute">Compará cada monto físico con su comprobante: marcá verificado, pendiente o con diferencia y dejá la observación.</p>
        {esDemo && <p className="mt-1 text-xs text-fono-light">Demo: cobros ficticios del rango; las marcas se guardan en este navegador.</p>}
      </div>
      <Toolbar
        plano
        label="Rango de la auditoría"
        testId="auditoria-toolbar"
        filters={(
          <>
            <label className="text-xs text-mute">Desde<Input type="date" className="mt-1" value={desde} onChange={(event) => setDesde(event.target.value)} /></label>
            <label className="text-xs text-mute">Hasta<Input type="date" className="mt-1" value={hasta} onChange={(event) => setHasta(event.target.value)} /></label>
            {sucursales.length > 1 && <label className="text-xs text-mute">Sucursal<Select className="mt-1" value={sucursalId} onChange={(event) => setSucursalId(event.target.value)}><option value="">Todas</option>{sucursales.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select></label>}
          </>
        )}
        primary={<Button type="button" variant="outline" className="min-h-11 lg:min-h-0" disabled={busy} onClick={cargar}>Auditar rango</Button>}
      />
      {error && <Aviso tono="error">{error}</Aviso>}

      <div className={cn('lg:grid-cols-4', GRILLA_DOS_COLUMNAS_COMPACTA)}>
        <div className="rounded-xl border border-ink-600 p-3"><p className={ROTULO_DATO}>Efectivo inicial</p><strong className="mt-1 block tabular-nums">{formatGs(resumen.aperturaPyg || 0)}</strong><p className="mt-0.5 text-[11px] text-mute">{data?.sesiones?.length || 0} sesión(es)</p></div>
        <div className="rounded-xl border border-ink-600 p-3"><p className={ROTULO_DATO}>Efectivo recibido</p><strong className="mt-1 block tabular-nums text-ok">{formatGs(resumen.recibidoPyg || 0)}</strong><p className="mt-0.5 text-[11px] text-mute">{resumen.operaciones || 0} operación(es)</p></div>
        <div className="rounded-xl border border-ink-600 p-3"><p className={ROTULO_DATO}>Esperado del rango</p><strong className="mt-1 block tabular-nums">{formatGs(resumen.esperadoPyg || 0)}</strong><p className="mt-0.5 text-[11px] text-mute">Inicial + recibido − salidas de todo el rango · no es el saldo del turno actual</p></div>
        <div className={cn('rounded-xl border p-3', (resumen.diferenciaPyg || 0) === 0 ? 'border-ink-600' : 'border-warn/40 bg-warn/10')}><p className={ROTULO_DATO}>Diferencias de cierre</p><strong className={cn('mt-1 block tabular-nums', (resumen.diferenciaPyg || 0) === 0 ? '' : 'text-warn')}>{formatGs(resumen.diferenciaPyg || 0)}</strong><p className="mt-0.5 text-[11px] text-mute">{resumen.verificadas || 0} verificadas · {resumen.pendientes || 0} pendientes · {resumen.conDiferencia || 0} con diferencia</p></div>
      </div>

      {!busy && !operaciones.length && <EmptyState compact icon="box" title="Sin efectivo cobrado ni movimientos en el rango" description="Probá con otro rango de fechas o esperá cobros en efectivo." />}
      <ListaDensa
        lista={lista}
        testId="auditoria-efectivo-tabla"
        etiquetaTabla="Operaciones en efectivo"
        etiquetaPie="Páginas de operaciones"
        unidad="operaciones"
        desde="xl"
        obtenerClave={(operacion) => claveDe(operacion)}
        atributosFila={() => ({ 'data-testid': 'auditoria-fila' })}
        columns={[
          { key: 'fecha', header: 'Fecha', ancho: '5.5rem', cell: (operacion) => <span title={fechaHora(operacion.fecha)}>{fechaCorta(operacion.fecha)}</span>, className: 'text-xs text-mute' },
          { key: 'operacion', header: 'Operación', ancho: 'minmax(0,1.2fr)', cell: (operacion) => <Identidad operacion={operacion} /> },
          { key: 'vendedor', header: 'Vendedor', ancho: '6rem', cell: (operacion) => operacion.vendedor || '—', className: 'text-xs text-mute' },
          { key: 'monto', header: 'Monto', ancho: '7.5rem', align: 'right', cell: (operacion) => <Monto operacion={operacion} /> },
          { key: 'estado', header: 'Estado', ancho: '8.75rem', cell: (operacion) => controlEstado(operacion) },
          { key: 'observacion', header: 'Observación', ancho: 'minmax(0,1.5fr)', cell: (operacion) => campoObservacion(operacion), className: 'overflow-visible' },
          { key: 'guardar', header: 'Guardar', sr: true, ancho: '5rem', align: 'right', cell: (operacion) => botonGuardar(operacion), className: 'overflow-visible' },
        ]}
        renderCard={(operacion) => {
          return (
            <div className="space-y-2 rounded-xl border border-ink-600 bg-ink-800/40 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Identidad operacion={operacion} />
                  <p className="mt-0.5 truncate text-[11px] text-mute" title={`${fechaCorta(operacion.fecha)}${operacion.vendedor ? ` · ${operacion.vendedor}` : ''}`}>{fechaCorta(operacion.fecha)}{operacion.vendedor ? ` · ${operacion.vendedor}` : ''}</p>
                </div>
                <Monto operacion={operacion} className="shrink-0 text-[13px] font-semibold" />
              </div>
              {controlEstado(operacion)}
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">{campoObservacion(operacion)}</div>
                {botonGuardar(operacion)}
              </div>
            </div>
          )
        }}
      />
    </Card>
  )
}
