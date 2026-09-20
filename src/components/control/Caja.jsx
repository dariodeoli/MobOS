import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { useSesion } from '@/lib/sesion'
import { formatGsInput, parseGsInput } from '@/utils/moneda'
import { getDemoCash, getDemoCashExpected, openDemoCash, closeDemoCash } from '@/lib/demoCash'
import { listVentas } from '@/lib/storage'
import { Button, Card, Eyebrow, Input, Label, Modal, Money, MoneyInput, Skeleton } from '@/components/ui'
import AuditoriaMedios from './AuditoriaMedios'
import AttachmentList from '@/components/shared/AttachmentList'
import Cronologia from '@/components/shared/Cronologia'
import Icon from '@/components/shared/Icon'
import ReportePreview from '@/components/shared/ReportePreview'
import { buildCierreCajaHtml } from '@/components/shared/OrderReceipt'
import { cobrosDeAuditoria, cobrosDePagos, armarCierreCaja } from '@/utils/reporteCaja'
import { ticketCierreCaja } from '@/lib/printing/reportes'
import { imprimirDocumento } from '@/lib/printing/agent'
import { descargarCsv } from '@/utils/descargarCsv'

// Denominaciones del arqueo en guaraníes: son las mismas que acepta el backend
// y el total contado se deriva de acá cuando hay desglose.
const DENOMINACIONES = [
  { valor: 100000, tipo: 'Billete' },
  { valor: 50000, tipo: 'Billete' },
  { valor: 20000, tipo: 'Billete' },
  { valor: 10000, tipo: 'Billete' },
  { valor: 5000, tipo: 'Billete' },
  { valor: 2000, tipo: 'Billete' },
  { valor: 1000, tipo: 'Moneda' },
  { valor: 500, tipo: 'Moneda' },
  { valor: 100, tipo: 'Moneda' },
]

const fechaHora = value =>
  value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString('es-PY') : '—'

function desgloseItems(cantidades) {
  return DENOMINACIONES.map(({ valor }) => ({
    valor,
    cantidad: Number(cantidades[valor] || 0),
  })).filter(item => item.cantidad > 0)
}

function totalArqueo(cantidades) {
  return desgloseItems(cantidades).reduce((total, item) => total + item.valor * item.cantidad, 0)
}

function desglosePayload(cantidades) {
  const payload = {}
  for (const item of desgloseItems(cantidades)) payload[String(item.valor)] = item.cantidad
  return payload
}

// Grilla compartida por el cierre propio y el cierre de otro turno (admin):
// cada fila suma su subtotal y el total se calcula en vivo.
function ArqueoDenominaciones({ cantidades, onCambiar, id }) {
  const total = totalArqueo(cantidades)
  return (
    <div className="space-y-2">
      <div className="hidden grid-cols-[1.4fr_6.5rem_1fr] items-center gap-2 px-3 text-[11px] font-medium uppercase tracking-wider text-mute sm:grid">
        <span>Denominación</span>
        <span className="text-center">Cantidad</span>
        <span className="text-right">Subtotal</span>
      </div>
      {DENOMINACIONES.map(({ valor, tipo }) => {
        const cantidad = Number(cantidades[valor] || 0)
        return (
          <div
            key={valor}
            className="grid grid-cols-[1.4fr_6.5rem_1fr] items-center gap-2 rounded-lg border border-ink-600 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold tabular-nums">
                <Money value={valor} />
              </p>
              <p className="text-[11px] text-mute">{tipo}</p>
            </div>
            <Input
              id={`${id}-${valor}`}
              inputMode="numeric"
              maxLength={7}
              value={cantidades[valor] ?? ''}
              onChange={event =>
                onCambiar(valor, event.target.value.replace(/\D/g, '').slice(0, 7))
              }
              placeholder="0"
              aria-label={`Cantidad de ${tipo.toLowerCase()}s de ${valor.toLocaleString('es-PY')} guaraníes`}
              className="h-9 text-center tabular-nums"
            />
            <p className="text-right text-sm tabular-nums text-mute">
              <Money value={cantidad * valor} />
            </p>
          </div>
        )
      })}
      <div className="flex items-center justify-between rounded-lg bg-fono/10 px-3 py-2 text-sm">
        <span className="font-semibold">Total del arqueo</span>
        <strong className="tabular-nums">
          <Money value={total} />
        </strong>
      </div>
    </div>
  )
}

export default function Caja() {
  const { esDemo, sucursal, sesion: usuarioSesion, empresa } = useSesion()
  const [cash, setCash] = useState(null)
  const [finance, setFinance] = useState(null)
  const [opening, setOpening] = useState('500000')
  const [counted, setCounted] = useState('')
  const [notes, setNotes] = useState('')
  const [arqueo, setArqueo] = useState({})
  const [turnoAjeno, setTurnoAjeno] = useState(null)
  const [arqueoAjeno, setArqueoAjeno] = useState({})
  const [contadoAjeno, setContadoAjeno] = useState('')
  const [notasAjeno, setNotasAjeno] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [cronologia, setCronologia] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [cierreOpen, setCierreOpen] = useState(false)
  const [cobros, setCobros] = useState([])

  const load = useCallback(
    async ({ silencioso = false } = {}) => {
      if (!silencioso) setLoading(true)
      setError('')
      try {
        if (esDemo) setCash(getDemoCash())
        else {
          const branch = sucursal?.id ? `?branchId=${encodeURIComponent(sucursal.id)}` : ''
          const [cashData, financeData] = await Promise.all([
            api.get(`/api/cash${branch}`),
            api.get(`/api/finance${branch}`),
          ])
          setCash(cashData)
          setFinance(financeData)
        }
      } catch (err) {
        setError(err?.message || 'No se pudo cargar la caja.')
      } finally {
        setLoading(false)
      }
    },
    [esDemo, sucursal?.id],
  )
  useEffect(() => {
    load()
  }, [load])

  // El turno que muestra la pantalla: el mío si tengo uno abierto; si no, el
  // último de la sucursal (contrato de GET /api/cash). `cash.session` puede ser
  // null y el fallback cubre la forma plana del demo o de un backend viejo.
  const turno = cash?.session ?? (cash?.status ? cash : null)
  const esMio = shift =>
    Boolean(shift?.openedById) && shift.openedById === usuarioSesion?.vendedorId
  const abierta = turno?.status === 'OPEN' && esMio(turno)
  const otrosTurnos = (cash?.openSessions || []).filter(shift => !esMio(shift))
  const puedeCerrarAjenos =
    !esDemo &&
    Boolean(
      usuarioSesion?.esPropietario || ['ADMIN', 'GERENTE', 'dueno'].includes(usuarioSesion?.rol),
    )
  const nombreTurno = shift =>
    esMio(shift)
      ? usuarioSesion?.nombre || 'Vos'
      : cash?.openSessions?.find(open => open.id === shift?.id)?.openedByName || 'Otra persona'

  const expected = useMemo(() => {
    if (!esDemo) return Number(turno?.expectedPyg ?? turno?.openingPyg ?? 0)
    // Adaptar al helper histórico sin cambiar los pagos persistidos.
    const sales = listVentas().map(sale => ({
      ...sale,
      pagos: (sale.pagos || [])
        .filter(payment => {
          const method =
            payment.method ?? (payment.medioPago === 'DINERO' ? 'CASH' : payment.medioPago)
          const currency =
            payment.currency ??
            payment.accountSnapshot?.currency ??
            (payment.accountId ? null : 'PYG')
          return method === 'CASH' && currency === 'PYG'
        })
        .map(payment => ({
          ...payment,
          medioPago: 'DINERO',
          monto: payment.amountPyg ?? payment.monto,
        })),
    }))
    return getDemoCashExpected(turno || undefined, new Date(), sales)
  }, [esDemo, turno])

  const hayArqueo = desgloseItems(arqueo).length > 0
  const contado = hayArqueo ? totalArqueo(arqueo) : parseGsInput(counted)
  const hayArqueoAjeno = desgloseItems(arqueoAjeno).length > 0
  const contadoAjenoTotal = hayArqueoAjeno ? totalArqueo(arqueoAjeno) : parseGsInput(contadoAjeno)
  const difference =
    turno?.status === 'CLOSED'
      ? Number(turno.countedPyg ?? 0) - Number(turno.expectedPyg ?? 0)
      : abierta
        ? contado - expected
        : 0

  // Arma el cierre con los mismos números de la pantalla y suma los cobros por
  // medio de pago del día de la sesión (auditoría de caja; en demo, los pagos
  // locales). Si la auditoría falla, el cierre sale sin el desglose.
  const cierre = useMemo(() => armarCierreCaja({
    cash: turno,
    movimientos: turno?.movements || cash?.movements || finance?.movements || [],
    cobros,
    empresa: empresa?.nombre || '',
    sucursal: sucursal?.nombre || '',
    usuario: usuarioSesion?.nombre || '',
  }), [turno, cash, finance, cobros, empresa, sucursal, usuarioSesion])
  async function abrirCierre() {
    setError('')
    const desde = turno?.openedAt ? new Date(turno.openedAt).getTime() : 0
    const hasta = turno?.closedAt ? new Date(turno.closedAt).getTime() : Date.now()
    try {
      if (esDemo) {
        const pagos = listVentas().flatMap(venta => venta.pagos || []).filter(pago => { const cuando = new Date(pago.fecha || 0).getTime(); return cuando >= desde && cuando <= hasta })
        setCobros(cobrosDePagos(pagos))
      } else {
        const date = (turno?.openedAt ? new Date(turno.openedAt) : new Date()).toLocaleDateString('sv')
        const params = new URLSearchParams()
        if (sucursal?.id) params.set('branchId', sucursal.id)
        params.set('date', date)
        const data = await api.get(`/api/cash/audit?${params}`)
        setCobros(cobrosDeAuditoria(data?.methods))
      }
    } catch { setCobros([]) }
    setCierreOpen(true)
  }
  async function abrir() {
    setSaving(true)
    setError('')
    try {
      if (esDemo) openDemoCash(parseGsInput(opening), notes)
      else
        await api.post(`/api/cash?branchId=${encodeURIComponent(sucursal?.id || '')}`, {
          action: 'open',
          openingPyg: parseGsInput(opening),
          notes,
        })
      setNotes('')
      await load({ silencioso: true })
    } catch (err) {
      setError(err?.message || 'No se pudo abrir la caja.')
    } finally {
      setSaving(false)
    }
  }
  async function cerrar() {
    setSaving(true)
    setError('')
    const desglose = hayArqueo ? desglosePayload(arqueo) : null
    try {
      if (esDemo) closeDemoCash(contado, expected, notes, desglose)
      else
        await api.post(`/api/cash?branchId=${encodeURIComponent(sucursal?.id || '')}`, {
          action: 'close',
          ...(desglose ? { countedBreakdown: desglose } : { countedPyg: parseGsInput(counted) }),
          notes,
        })
      setCounted('')
      setArqueo({})
      setNotes('')
      await load({ silencioso: true })
    } catch (err) {
      setError(err?.message || 'No se pudo cerrar la caja.')
    } finally {
      setSaving(false)
    }
  }
  function abrirCierreAjeno(shift) {
    setTurnoAjeno(shift)
    setArqueoAjeno({})
    setContadoAjeno('')
    setNotasAjeno('')
    setError('')
  }
  async function cerrarTurnoAjeno() {
    if (!turnoAjeno) return
    setSaving(true)
    setError('')
    const desglose = hayArqueoAjeno ? desglosePayload(arqueoAjeno) : null
    try {
      await api.post(`/api/cash?branchId=${encodeURIComponent(sucursal?.id || '')}`, {
        action: 'close',
        sessionId: turnoAjeno.id,
        ...(desglose ? { countedBreakdown: desglose } : { countedPyg: parseGsInput(contadoAjeno) }),
        notes: notasAjeno,
      })
      setTurnoAjeno(null)
      await load({ silencioso: true })
    } catch (err) {
      setError(err?.message || 'No se pudo cerrar el turno.')
    } finally {
      setSaving(false)
    }
  }
  async function exportarMovimientos() {
    if (esDemo || !cash?.openedAt) return
    setExportando(true)
    setError('')
    try {
      await descargarCsv(
        'cash-movements',
        { branchId: sucursal?.id, desde: cash.openedAt, hasta: cash.closedAt || undefined },
        'mobos-caja-movimientos.csv',
      )
    } catch (err) {
      setError(err?.message || 'No se pudo exportar el CSV.')
    } finally {
      setExportando(false)
    }
  }
  if (loading)
    return (
      <div className="space-y-6">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      </div>
    )
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-mute">
          Apertura física en Gs., saldos, pendientes, cheques y margen con costos congelados.
        </p>
      </div>
      {error && (
        <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 p-3 text-sm text-bad">
          {error}
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className={abierta ? 'border-ok/25 bg-gradient-to-br from-ok/10 to-transparent' : ''}>
          <Label>Estado</Label>
          <strong className={`flex items-center gap-2 ${abierta ? 'text-ok' : 'text-mute'}`}>
            <span className={`h-2 w-2 rounded-full ${abierta ? 'bg-ok' : 'bg-mute'}`} />
            {abierta ? 'Abierta' : 'Cerrada'}
          </strong>
          <p className="mt-2 text-xs text-mute">
            {turno?.openedAt
              ? `${turno.status === 'OPEN' ? `Turno de ${nombreTurno(turno)}` : 'Último turno'} · ${fechaHora(turno.openedAt)}`
              : 'Sin apertura'}
          </p>
        </Card>
        <Card>
          <Label>Saldo esperado</Label>
          <strong className="text-xl tabular-nums">
            <Money value={expected} />
          </strong>
          <p className="mt-2 text-xs text-mute">Apertura + efectivo confirmado en Gs</p>
        </Card>
        <Card
          className={
            difference === 0 ? '' : 'border-warn/25 bg-gradient-to-br from-warn/10 to-transparent'
          }
        >
          <Label>Diferencia</Label>
          <strong className={`text-xl tabular-nums ${difference === 0 ? 'text-ok' : 'text-warn'}`}>
            <Money value={difference} />
          </strong>
          <p className="mt-2 text-xs text-mute">Se calcula al cierre</p>
        </Card>
      </div>
      {finance && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <Label>Por cobrar</Label>
            <strong>
              <Money value={finance.receivables?.totalPyg || 0} />
            </strong>
          </Card>
          <Card>
            <Label>Por pagar</Label>
            <strong>
              <Money value={finance.payables?.totalPyg || 0} />
            </strong>
          </Card>
          <Card>
            <Label>Margen real</Label>
            <strong>
              <Money value={finance.margin?.profitPyg || 0} />
            </strong>
            <p className="mt-1 text-xs text-mute">
              {finance.margin?.marginPct ?? '—'}% · seguro y extras incluidos
            </p>
          </Card>
          <Card>
            <Label>Cheques pendientes</Label>
            <strong>
              {finance.movements?.filter(m => m.kind === 'CHEQUE' && m.status === 'PENDING')
                .length || 0}
            </strong>
          </Card>
        </div>
      )}
      {!abierta ? (
        <Card>
          <h3 className="font-bold">Abrir caja</h3>
          <p className="mt-1 text-sm text-mute">
            Registrá el fondo inicial de tu turno en esta sucursal. Cada persona maneja su propia
            caja.
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="opening">Fondo inicial (Gs)</Label>
              <MoneyInput
                id="opening"
                value={opening}
                onValueChange={setOpening}
                placeholder="500.000"
              />
            </div>
            <div>
              <Label htmlFor="opening-notes">Nota</Label>
              <Input
                id="opening-notes"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Turno mañana"
              />
            </div>
          </div>
          <Button className="mt-5" onClick={abrir} disabled={saving}>
            Abrir caja
          </Button>
        </Card>
      ) : (
        <Card>
          <h3 className="font-bold">Cerrar caja</h3>
          <p className="mt-1 text-sm text-mute">
            Contá el efectivo físico por denominación o ingresá el total. No incluyas dólares,
            transferencias ni tarjetas.
          </p>
          <div className="mt-5 space-y-5">
            <ArqueoDenominaciones
              id="arqueo"
              cantidades={arqueo}
              onCambiar={(valor, cantidad) =>
                setArqueo(current => ({ ...current, [valor]: cantidad }))
              }
            />
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="counted">
                  Total contado (Gs){hayArqueo ? ' · calculado del arqueo' : ''}
                </Label>
                <Input
                  id="counted"
                  inputMode="numeric"
                  value={hayArqueo ? formatGsInput(contado) : formatGsInput(counted)}
                  readOnly={hayArqueo}
                  onChange={e => setCounted(formatGsInput(e.target.value))}
                  placeholder="0"
                  className="tabular-nums read-only:opacity-60"
                />
                <p className="mt-1.5 text-xs text-mute">
                  {hayArqueo
                    ? 'Se calcula sumando las denominaciones cargadas.'
                    : 'Sin desglose: escribí el total contado.'}
                </p>
              </div>
              <div>
                <Label htmlFor="close-notes">Nota de cierre</Label>
                <Input
                  id="close-notes"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Observación opcional"
                />
              </div>
            </div>
            <p
              className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2 text-sm ${
                contado - expected === 0 ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'
              }`}
            >
              <span>
                Contado{' '}
                <strong className="tabular-nums">
                  <Money value={contado} />
                </strong>
              </span>
              <span>
                Esperado{' '}
                <strong className="tabular-nums">
                  <Money value={expected} />
                </strong>
              </span>
              <span>
                Diferencia{' '}
                <strong className="tabular-nums">
                  <Money value={contado - expected} />
                </strong>
              </span>
            </p>
            <Button
              variant="success"
              onClick={cerrar}
              disabled={saving || (!hayArqueo && !counted)}
            >
              Cerrar caja · <Money value={contado} />
            </Button>
          </div>
        </Card>
      )}
      {otrosTurnos.length > 0 && (
        <Card>
          <h3 className="font-bold">Turnos abiertos en la sucursal</h3>
          <p className="mt-1 text-sm text-mute">
            Cada persona maneja su propio turno. Solo administración o gerencia pueden cerrar el
            turno de otra persona.
          </p>
          <div className="mt-4 space-y-2">
            {otrosTurnos.map(shift => (
              <article
                key={shift.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-600 p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{shift.openedByName || 'Otra persona'}</p>
                  <p className="mt-0.5 text-xs text-mute">
                    Abierto {fechaHora(shift.openedAt)} · Fondo <Money value={shift.openingPyg} />
                  </p>
                </div>
                {puedeCerrarAjenos && (
                  <Button variant="outline" onClick={() => abrirCierreAjeno(shift)}>
                    Cerrar turno
                  </Button>
                )}
              </article>
            ))}
          </div>
        </Card>
      )}
      {!esDemo && cash?.id && (
        <Card className="space-y-3">
          <AttachmentList
            entity="CASH_SESSION"
            entityId={cash.id}
            puedeSubir={turno?.status === 'CLOSED'}
            titulo="Foto del arqueo"
          />
          <Button
            type="button"
            variant="outline"
            className="h-9 w-full px-3 text-xs"
            disabled={exportando}
            onClick={exportarMovimientos}
          >
            <Icon name="download" className="h-4 w-4" />
            Exportar CSV
          </Button>
          {turno?.status === 'CLOSED' && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={abrirCierre}
            >
              <Icon name="printer" className="h-4 w-4" />
              Imprimir cierre
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => setCronologia(true)}
          >
            Cronología de la sesión
          </Button>
        </Card>
      )}
      <Modal
        open={Boolean(turnoAjeno)}
        onClose={() => setTurnoAjeno(null)}
        title={`Cerrar turno de ${turnoAjeno?.openedByName || 'otra persona'}`}
      >
        <div className="space-y-4">
          <p className="text-sm text-mute">
            Turno abierto {fechaHora(turnoAjeno?.openedAt)} con fondo de{' '}
            <Money value={turnoAjeno?.openingPyg} />. Contá el efectivo físico por denominación o
            ingresá el total antes de cerrarlo.
          </p>
          <ArqueoDenominaciones
            id="arqueo-ajeno"
            cantidades={arqueoAjeno}
            onCambiar={(valor, cantidad) =>
              setArqueoAjeno(current => ({ ...current, [valor]: cantidad }))
            }
          />
          <div>
            <Label htmlFor="counted-ajeno">
              Total contado (Gs){hayArqueoAjeno ? ' · calculado del arqueo' : ''}
            </Label>
            <Input
              id="counted-ajeno"
              inputMode="numeric"
              value={
                hayArqueoAjeno ? formatGsInput(contadoAjenoTotal) : formatGsInput(contadoAjeno)
              }
              readOnly={hayArqueoAjeno}
              onChange={e => setContadoAjeno(formatGsInput(e.target.value))}
              placeholder="0"
              className="tabular-nums read-only:opacity-60"
            />
            <p className="mt-1.5 text-xs text-mute">
              {hayArqueoAjeno
                ? 'Se calcula sumando las denominaciones cargadas.'
                : 'Sin desglose: escribí el total contado.'}
            </p>
          </div>
          <div>
            <Label htmlFor="close-ajeno-notes">Nota de cierre</Label>
            <Input
              id="close-ajeno-notes"
              value={notasAjeno}
              onChange={e => setNotasAjeno(e.target.value)}
              placeholder="Observación opcional"
            />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setTurnoAjeno(null)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="success"
              onClick={cerrarTurnoAjeno}
              disabled={saving || (!hayArqueoAjeno && !contadoAjeno)}
            >
              Cerrar turno · <Money value={contadoAjenoTotal} />
            </Button>
          </div>
        </div>
      </Modal>
      <Modal
        open={cronologia}
        onClose={() => setCronologia(false)}
        title="Cronología de la sesión de caja"
      >
        {cash?.id && (
          <Cronologia
            endpoint={`/api/cash/sessions/${cash.id}/history`}
            active={cronologia}
            vacio="Sin actividad"
            descripcionVacio="La apertura, los movimientos, el cierre y el arqueo de esta sesión aparecerán acá."
          />
        )}
      </Modal>
      <ReportePreview
        open={cierreOpen}
        onClose={() => setCierreOpen(false)}
        titulo="Cierre de caja"
        construir={(format) => buildCierreCajaHtml(cierre, { format })}
        directo={({ ancho }) => imprimirDocumento(ticketCierreCaja(cierre, { ancho }), { tipo: 'cierre-caja' })}
      />
      <AuditoriaMedios />
    </div>
  )
}
