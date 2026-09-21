import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { useSesion } from '@/lib/sesion'
import { formatGsInput, parseGsInput } from '@/utils/moneda'
import { getDemoCash, getDemoCashExpected, openDemoCash, closeDemoCash } from '@/lib/demoCash'
import { listVentas } from '@/lib/storage'
import {
  Badge,
  Button,
  Card,
  Input,
  Label,
  Modal,
  Money,
  MoneyInput,
  Skeleton,
  Textarea,
} from '@/components/ui'
import AuditoriaMedios from './AuditoriaMedios'
import AuditoriaEfectivo from './AuditoriaEfectivo'
import AttachmentList from '@/components/shared/AttachmentList'
import Cronologia from '@/components/shared/Cronologia'
import Icon from '@/components/shared/Icon'
import ReportePreview from '@/components/shared/ReportePreview'
import { buildCierreCajaHtml } from '@/components/shared/OrderReceipt'
import { cobrosDeAuditoria, cobrosDePagos, armarCierreCaja } from '@/utils/reporteCaja'
import { ticketCierreCaja } from '@/lib/printing/reportes'
import { imprimirDocumento } from '@/lib/printing/agent'
import { descargarCsv } from '@/utils/descargarCsv'
import { parseDelimited } from '@/utils/csv'

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

// Fecha y hora locales en 24 h, sin segundos: mismo formato que las demás
// pantallas de control (auditoría, inventario, impresión).
const fechaHora = value => {
  const fecha = value ? new Date(value) : null
  if (!fecha || Number.isNaN(fecha.getTime())) return '—'
  return fecha.toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short', hour12: false })
}

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

// ── Conciliación bancaria por extracto ───────────────────────────────
// El CSV se parsea acá con el helper compartido (src/utils/csv.js) y solo se
// envían filas ya normalizadas al backend, que sugiere coincidencias.
const CLAVES_FECHA = ['fecha', 'date']
const CLAVES_MONTO = ['monto', 'importe', 'amount', 'credito', 'haber']
const CLAVES_REFERENCIA = [
  'referencia',
  'reference',
  'comprobante',
  'documento',
  'operacion',
  'nro',
]
const CLAVES_DESCRIPCION = [
  'descripcion',
  'description',
  'detalle',
  'concepto',
  'glosa',
  'movimiento',
]

function sinAcentos(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function columnaDe(encabezados, claves) {
  return encabezados.findIndex(celda =>
    claves.some(clave => celda === clave || celda.includes(clave)),
  )
}

function armarFecha(anio, mes, dia) {
  const y = Number(anio)
  const m = Number(mes)
  const d = Number(dia)
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null
  const fecha = new Date(Date.UTC(y, m - 1, d))
  if (fecha.getUTCFullYear() !== y || fecha.getUTCMonth() !== m - 1 || fecha.getUTCDate() !== d)
    return null
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function fechaDeExtracto(valor) {
  const texto = String(valor || '').trim()
  let partes = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(texto)
  if (partes) return armarFecha(partes[1], partes[2], partes[3])
  partes = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(texto)
  if (partes)
    return armarFecha(partes[3].length === 2 ? `20${partes[3]}` : partes[3], partes[2], partes[1])
  partes = /^(\d{4})(\d{2})(\d{2})$/.exec(texto)
  if (partes) return armarFecha(partes[1], partes[2], partes[3])
  return null
}

// Los extractos en guaraníes escriben miles con punto y, a veces, centavos con
// coma; el monto que se compara contra los cobros es siempre el entero en Gs.
function montoDeExtracto(valor) {
  let texto = String(valor || '').replace(/[^\d.,-]/g, '')
  if (!texto) return null
  const negativo = texto.startsWith('-')
  texto = texto.replace(/-/g, '')
  const ultimaComa = texto.lastIndexOf(',')
  const ultimoPunto = texto.lastIndexOf('.')
  let limpio = texto
  if (ultimaComa >= 0 && ultimoPunto >= 0) {
    limpio =
      ultimaComa > ultimoPunto
        ? texto.replace(/\./g, '').replace(',', '.')
        : texto.replace(/,/g, '')
  } else if (ultimaComa >= 0) {
    const partes = texto.split(',')
    limpio =
      partes.length > 2 || (partes[1] || '').length === 3
        ? texto.replace(/,/g, '')
        : texto.replace(',', '.')
  } else if (ultimoPunto >= 0) {
    const partes = texto.split('.')
    limpio = partes.length > 2 || (partes[1] || '').length === 3 ? texto.replace(/\./g, '') : texto
  }
  const numero = Number(limpio)
  if (!Number.isFinite(numero)) return null
  const entero = Math.round(Math.abs(numero))
  if (!Number.isSafeInteger(entero) || entero === 0) return null
  return negativo ? -entero : entero
}

function extraerFilasExtracto(texto) {
  const crudas = parseDelimited(texto)
  if (!crudas.length) return { rows: [], ignoradas: 0 }
  const encabezados = crudas[0].map(sinAcentos)
  const idxFecha = columnaDe(encabezados, CLAVES_FECHA)
  const idxMonto = columnaDe(encabezados, CLAVES_MONTO)
  const conEncabezado = idxFecha >= 0 && idxMonto >= 0
  const indiceFecha = conEncabezado ? idxFecha : 0
  const indiceMonto = conEncabezado ? idxMonto : 1
  const indiceReferencia = conEncabezado ? columnaDe(encabezados, CLAVES_REFERENCIA) : 2
  const indiceDescripcion = conEncabezado ? columnaDe(encabezados, CLAVES_DESCRIPCION) : 3
  const rows = []
  let ignoradas = 0
  for (const fila of conEncabezado ? crudas.slice(1) : crudas) {
    const date = fechaDeExtracto(fila[indiceFecha])
    const amountPyg = montoDeExtracto(fila[indiceMonto])
    if (!date || !amountPyg || amountPyg <= 0) {
      ignoradas += 1
      continue
    }
    const reference =
      indiceReferencia >= 0
        ? String(fila[indiceReferencia] ?? '')
            .trim()
            .slice(0, 300)
        : ''
    const description =
      indiceDescripcion >= 0
        ? String(fila[indiceDescripcion] ?? '')
            .trim()
            .slice(0, 300)
        : ''
    rows.push({
      date,
      amountPyg,
      ...(reference ? { reference } : {}),
      ...(description ? { description } : {}),
    })
  }
  return { rows, ignoradas }
}

function fechaCorta(iso) {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''))
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : String(iso || '—')
}

// El backend compara los días en hora de Paraguay (UTC-3): la fecha que se
// muestra sale del mismo instante para no discrepar con la coincidencia.
function fechaPagoLocal(paidAt) {
  const instante = Date.parse(paidAt)
  if (!Number.isFinite(instante)) return String(paidAt || '')
  return new Date(instante - 180 * 60000).toISOString().slice(0, 10)
}

export default function Caja() {
  const { esDemo, sucursal, sesion: usuarioSesion, empresa, usuario } = useSesion()
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
  const [extractoTexto, setExtractoTexto] = useState('')
  const [extractoAnalizando, setExtractoAnalizando] = useState(false)
  const [extractoResultado, setExtractoResultado] = useState(null)
  const [extractoError, setExtractoError] = useState('')
  const [extractoAviso, setExtractoAviso] = useState('')
  const [conciliando, setConciliando] = useState('')
  const [conciliadas, setConciliadas] = useState({})

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
  const puedeConciliar = !esDemo && ['ADMIN', 'GERENTE', 'CAJERA'].includes(usuario?.role)
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
  async function analizarExtracto() {
    setExtractoError('')
    setExtractoAviso('')
    setExtractoResultado(null)
    setConciliadas({})
    let extraido
    try {
      extraido = extraerFilasExtracto(extractoTexto)
    } catch {
      setExtractoError('No se pudo leer el extracto. Revisá el formato.')
      return
    }
    if (!extraido.rows.length) {
      setExtractoError(
        'No se reconoció ninguna fila con fecha y monto. Se esperan columnas fecha, monto y referencia/descripción.',
      )
      return
    }
    if (extraido.rows.length > 500) {
      setExtractoError(
        'El extracto supera los 500 movimientos. Dividilo en partes y analizá de a una.',
      )
      return
    }
    setExtractoAnalizando(true)
    try {
      const resultado = await api.post('/api/payments/reconcile-import', { rows: extraido.rows })
      setExtractoResultado(resultado)
      if (extraido.ignoradas)
        setExtractoAviso(
          `Se ignoraron ${extraido.ignoradas} fila(s) sin fecha válida o con monto cero/negativo (los débitos no se concilian).`,
        )
    } catch (cause) {
      setExtractoError(cause?.message || 'No se pudo analizar el extracto.')
    } finally {
      setExtractoAnalizando(false)
    }
  }
  async function conciliarPorExtracto(indice, paymentId) {
    if (conciliando) return
    setConciliando(paymentId)
    setExtractoError('')
    try {
      await api.patch(`/api/payments/${encodeURIComponent(paymentId)}/reconciliation`, {
        state: 'VERIFIED',
        note: 'Conciliado por extracto',
      })
      setConciliadas(actual => ({ ...actual, [indice]: paymentId }))
      setExtractoAviso('Pago conciliado. La venta quedó actualizada con el cobro confirmado.')
    } catch (cause) {
      setExtractoError(cause?.message || 'No se pudo conciliar el pago.')
    } finally {
      setConciliando('')
    }
  }
  const filasExtracto = extractoResultado?.filas || []
  const conciliadasExtracto = filasExtracto.filter((fila, indice) => conciliadas[indice]).length
  const pendientesExtracto =
    filasExtracto.filter(fila => fila.matches.length > 0).length - conciliadasExtracto
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
      <p className="text-sm text-mute">
        Apertura física en Gs., saldos, pendientes, cheques y margen con costos congelados.
      </p>
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
          <p className="mt-2 text-xs text-mute">Apertura + efectivo confirmado en Gs.</p>
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
                <MoneyInput
                  id="counted"
                  value={hayArqueo ? contado : counted}
                  readOnly={hayArqueo}
                  onValueChange={value => setCounted(value === '' ? '' : formatGsInput(value))}
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
      {puedeConciliar && (
        <Card>
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <span>
                <h3 className="font-bold">Conciliación bancaria</h3>
                <p className="mt-1 text-sm text-mute">
                  Pegá el extracto del banco (CSV con fecha, monto y referencia/descripción) y
                  confirmá las coincidencias contra los cobros confirmados del sistema.
                </p>
              </span>
              <Icon
                name="chevron"
                className="h-4 w-4 shrink-0 text-mute transition group-open:rotate-180"
              />
            </summary>
            <div className="mt-4 space-y-4">
              <div>
                <Label htmlFor="extracto-csv">Extracto (CSV)</Label>
                <Textarea
                  id="extracto-csv"
                  rows={6}
                  value={extractoTexto}
                  onChange={event => setExtractoTexto(event.target.value)}
                  placeholder={
                    'Fecha;Monto;Referencia;Descripción\n2026-09-18;1.250.000;TRF-9021;Juan Pérez'
                  }
                  className="font-mono text-xs"
                />
                <p className="mt-1.5 text-xs text-mute">
                  Acepta separador coma o punto y coma, con o sin encabezados, hasta 500
                  movimientos.
                </p>
              </div>
              <Button
                type="button"
                onClick={analizarExtracto}
                disabled={extractoAnalizando || !extractoTexto.trim()}
              >
                {extractoAnalizando ? 'Analizando…' : 'Analizar extracto'}
              </Button>
              {extractoError && (
                <p
                  role="alert"
                  className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad"
                >
                  {extractoError}
                </p>
              )}
              {extractoAviso && (
                <p className="rounded-lg bg-fono/10 px-3 py-2 text-sm text-mute">{extractoAviso}</p>
              )}
              {extractoResultado && (
                <div className="space-y-2">
                  <p className="text-sm text-mute">
                    {extractoResultado.resumen.filas} movimiento(s) ·{' '}
                    {extractoResultado.resumen.conCoincidencia} con coincidencia (
                    {conciliadasExtracto} conciliada(s), {pendientesExtracto} pendiente(s)) ·{' '}
                    {extractoResultado.resumen.sinCoincidencia} sin coincidencia
                    {extractoResultado.resumen.ambiguas > 0
                      ? ` · ${extractoResultado.resumen.ambiguas} con más de un candidato`
                      : ''}
                  </p>
                  {filasExtracto.map((fila, indice) => {
                    const elegido = conciliadas[indice]
                    return (
                      <article
                        key={`${fila.row.date}-${fila.row.amountPyg}-${indice}`}
                        className={`rounded-xl border p-3 ${elegido ? 'border-ok/40 bg-ok/5' : 'border-ink-600'}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold tabular-nums">
                              {fechaCorta(fila.row.date)} · <Money value={fila.row.amountPyg} />
                            </p>
                            <p className="truncate text-xs text-mute">
                              {[fila.row.reference, fila.row.description]
                                .filter(Boolean)
                                .join(' · ') || 'Sin referencia'}
                            </p>
                          </div>
                          {elegido ? (
                            <Badge color="green">Conciliada</Badge>
                          ) : (
                            <Badge color={fila.matches.length > 1 ? 'orange' : 'slate'}>
                              {fila.matches.length === 0
                                ? 'Sin coincidencia'
                                : `${fila.matches.length} candidata(s)`}
                            </Badge>
                          )}
                        </div>
                        {fila.matches.map(match => (
                          <div
                            key={match.paymentId}
                            className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-ink-700/60 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="text-sm">
                                {match.orderNumber} · {match.customerName || 'Sin cliente'}
                              </p>
                              <p className="text-xs text-mute">
                                {fechaCorta(fechaPagoLocal(match.paidAt))}
                                {match.reference ? ` · Ref. ${match.reference}` : ''}
                                {match.alreadyReconciled ? ' · con conciliación previa' : ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge
                                color={
                                  match.matchingScore >= 85
                                    ? 'green'
                                    : match.matchingScore >= 70
                                      ? 'blue'
                                      : 'slate'
                                }
                              >
                                {match.matchingScore}%
                              </Badge>
                              {elegido ? (
                                elegido === match.paymentId && (
                                  <Badge color="green">Confirmada</Badge>
                                )
                              ) : (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-8 px-3 text-xs"
                                  disabled={Boolean(conciliando)}
                                  onClick={() => conciliarPorExtracto(indice, match.paymentId)}
                                >
                                  {conciliando === match.paymentId ? 'Conciliando…' : 'Conciliar'}
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                        {!fila.matches.length && (
                          <p className="mt-2 text-xs text-mute">
                            Ningún cobro confirmado coincide con el monto y la fecha (ventana de 3
                            días).
                          </p>
                        )}
                      </article>
                    )
                  })}
                </div>
              )}
            </div>
          </details>
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
            <MoneyInput
              id="counted-ajeno"
              value={
                hayArqueoAjeno ? contadoAjenoTotal : contadoAjeno
              }
              readOnly={hayArqueoAjeno}
              onValueChange={value => setContadoAjeno(value === '' ? '' : formatGsInput(value))}
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
      <AuditoriaEfectivo />
    </div>
  )
}
