import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { useSesion } from '@/lib/sesion'
import { formatGs, formatGsInput, errorMonto, parseGsInput } from '@/utils/moneda'
import { getDemoCash, getDemoCashExpected, openDemoCash, closeDemoCash } from '@/lib/demoCash'
import { listVentas } from '@/lib/storage'
import { fechaHora } from '@/utils/fecha'
import {
  Aviso,
  Badge,
  Button,
  Card,
  Drawer,
  FormField,
  Input,
  Label,
  Modal,
  Money,
  MoneyInput,
  Select,
  Skeleton,
  Textarea,
} from '@/components/ui'
import NumericKeypad from '@/components/shared/NumericKeypad'
import AuditoriaMedios from './AuditoriaMedios'
import AuditoriaEfectivo from './AuditoriaEfectivo'
import VentasPorCaja from './VentasPorCaja'
import {
  DENOMINACIONES,
  MODO_DETALLADO,
  MODO_RAPIDO,
  desglosePayload,
  normalizarCantidad,
  resumenConteo,
} from '@/lib/cajaConteo'
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
import { CELDA_DATO, CELDA_ENCABEZADO, CELDA_IDENTIDAD, CELDA_NUMERO } from '@/components/shared/tabla'
import { temaV2Activo } from '@/lib/temaV2'
import { cn } from '@/lib/utils'
import { GRILLA_DOS_COLUMNAS, PIE_ACCIONES_REVERSO } from '@/components/shared/formulario'

// Batch compacto v2: repuestos/proveedores y taller, en grillas densas.
const GRID_PROVEEDORES = 'grid min-w-[52rem] grid-cols-[minmax(11rem,1.3fr)_minmax(13rem,1.4fr)_8rem_minmax(10rem,auto)] items-center gap-x-2'
const GRID_TALLER = 'grid min-w-[50rem] grid-cols-[minmax(11rem,1.3fr)_minmax(13rem,1.3fr)_8rem_minmax(6.5rem,auto)] items-center gap-x-2'

// Denominaciones del arqueo en guaraníes: las mismas que acepta el backend y
// el total contado se deriva de acá cuando hay desglose. Viven en
// `src/lib/cajaConteo.js` para compartir el modo rápido/detallado con tests.

// Condiciones de pago de las compras de repuestos/insumos (#250 · #83): mismas
// etiquetas que `backend/lib/supplier-payables.ts`.
const CONDICION_PROVEEDOR = { CONTADO: 'Contado', CREDITO: 'Crédito', CONSIGNACION: 'En consignación' }

// Fecha y hora locales en 24 h, sin segundos: mismo formato que las demás
// pantallas de control (auditoría, inventario, impresión).

// Grilla guiada del arqueo (#311): dos columnas con el valor y el subtotal a la
// vista, y la cantidad se carga con los botones ± o tipeando (entrada tipo
// calculadora). El total se calcula en vivo y queda fijo en el resumen del
// cierre para que no haya dos montos compitiendo.
function ArqueoDenominaciones({ cantidades, onCambiar, id }) {
  const total = resumenConteo({ modo: MODO_DETALLADO, cantidades }).contado
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {DENOMINACIONES.map(({ valor, tipo }) => {
          const cantidad = Number(cantidades[valor] || 0)
          const articulo = tipo === 'Billete' ? 'billete' : 'moneda'
          const etiqueta = `${articulo} de ${formatGs(valor)}`
          return (
            <div key={valor} className="rounded-xl border border-ink-600 p-2.5" data-testid={`denominacion-${valor}`}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="min-w-0 text-sm font-semibold tabular-nums">
                  <span className="whitespace-nowrap">
                    <Money value={valor} />
                  </span>
                  <span className="ml-1 text-[11px] font-normal text-mute">{tipo}</span>
                </p>
                <p className="shrink-0 text-[11px] tabular-nums text-mute" data-testid={`subtotal-${valor}`}>
                  <Money value={cantidad * valor} />
                </p>
              </div>
              <div className="mt-2 flex items-stretch gap-1">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-11 shrink-0 px-0 text-lg"
                  aria-label={`Quitar un ${etiqueta}`}
                  disabled={cantidad <= 0}
                  onClick={() => onCambiar(valor, normalizarCantidad(cantidad - 1))}
                >
                  −
                </Button>
                <Input
                  id={`${id}-${valor}`}
                  inputMode="numeric"
                  maxLength={7}
                  value={cantidades[valor] ?? ''}
                  onChange={event =>
                    onCambiar(valor, normalizarCantidad(event.target.value.replace(/\D/g, '')))
                  }
                  placeholder="0"
                  aria-label={`Cantidad de ${tipo.toLowerCase()}s de ${formatGs(valor)}`}
                  className="h-11 min-w-0 text-center tabular-nums"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-11 shrink-0 px-0 text-lg"
                  aria-label={`Agregar un ${etiqueta}`}
                  onClick={() => onCambiar(valor, normalizarCantidad(cantidad + 1))}
                >
                  +
                </Button>
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-between rounded-lg bg-fono/10 px-3 py-2 text-sm">
        <span className="font-semibold">Total del arqueo</span>
        <strong className="tabular-nums" data-testid={`total-${id}`}>
          <Money value={total} />
        </strong>
      </div>
    </div>
  )
}

// Panel del cierre guiado (#311): elige el modo (rápido por total o detallado
// por denominación), carga el conteo y muestra el resumen fijo —contado,
// esperado y diferencia— antes de confirmar. Es el único lugar donde se cierra.
function ConteoCierre({ id, quickId, modo, onModo, cantidades, onCantidad, totalRapido, onTotalRapido, esperado }) {
  const resumen = resumenConteo({ modo, cantidades, totalRapido, esperado })
  const colorDiferencia = !resumen.hayConteo ? 'text-mute' : resumen.diferencia === 0 ? 'text-ok' : 'text-warn'
  return (
    <div className="space-y-4">
      <div role="group" aria-label="Modo de conteo" className="grid grid-cols-2 gap-1 rounded-xl border border-ink-600 p-1">
        <button
          type="button"
          aria-pressed={modo === MODO_RAPIDO}
          onClick={() => onModo(MODO_RAPIDO)}
          className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${modo === MODO_RAPIDO ? 'bg-fono/15 text-fono-light' : 'text-mute hover:text-fore'}`}
        >
          Total rápido
        </button>
        <button
          type="button"
          aria-pressed={modo === MODO_DETALLADO}
          onClick={() => onModo(MODO_DETALLADO)}
          className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${modo === MODO_DETALLADO ? 'bg-fono/15 text-fono-light' : 'text-mute hover:text-fore'}`}
        >
          Por denominación
        </button>
      </div>
      <p className="text-sm text-mute">
        1. Contá el efectivo físico · 2. Compará con el esperado · 3. Confirmá el
        cierre. Solo guaraníes: no incluyas dólares, transferencias ni tarjetas.
      </p>
      {modo === MODO_RAPIDO ? (
        <div>
          <Label htmlFor={quickId}>Total contado (Gs)</Label>
          <MoneyInput
            id={quickId}
            value={totalRapido}
            onValueChange={valor => onTotalRapido(valor === '' ? '' : formatGsInput(valor))}
            placeholder="0"
            className="h-12 text-lg tabular-nums"
          />
          <NumericKeypad
            className="mt-2 grid grid-cols-3 gap-2"
            ariaLabel="Teclado del total contado"
            value={String(totalRapido ?? '').replace(/\D/g, '')}
            onChange={valor => onTotalRapido(valor ? formatGsInput(valor) : '')}
          />
          <p className="mt-1.5 text-xs text-mute">Escribí el total del efectivo o cargalo con el teclado.</p>
        </div>
      ) : (
        <ArqueoDenominaciones id={id} cantidades={cantidades} onCambiar={onCantidad} />
      )}
      <div
        className="sticky bottom-0 z-10 -mx-4 border-t border-ink-600 bg-ink-800/95 px-4 pb-3 pt-3 backdrop-blur sm:-mx-5 sm:px-5"
        data-testid="resumen-conteo"
      >
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <span className="text-mute">
            Contado
            <strong className="mt-0.5 block tabular-nums text-fore">
              {resumen.hayConteo ? <Money value={resumen.contado} /> : '—'}
            </strong>
          </span>
          <span className="text-mute">
            Esperado
            <strong className="mt-0.5 block tabular-nums text-fore">
              <Money value={resumen.esperado} />
            </strong>
          </span>
          <span className="text-mute">
            Diferencia
            <strong className={`mt-0.5 block tabular-nums ${colorDiferencia}`}>
              {resumen.hayConteo ? <Money value={resumen.diferencia} /> : '—'}
            </strong>
          </span>
        </div>
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
  // Vista previa v2 (#241): las tarjetas neutras de la caja usan el tile de
  // consola (los números ya llevan el tamaño grande del scope).
  const v2 = temaV2Activo()
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
  const [reporteOpen, setReporteOpen] = useState(false)
  // #311: el cierre es guiado —modo rápido o por denominación— dentro de un
  // cajón; la página ya no muestra el conteo abierto ni compite con otros
  // formularios. `modoConteo` decide qué monto vale (rápido o detallado).
  const [conteoOpen, setConteoOpen] = useState(false)
  const [modoConteo, setModoConteo] = useState(MODO_RAPIDO)
  const [bancoOpen, setBancoOpen] = useState(false)
  const [cobros, setCobros] = useState([])
  const [extractoTexto, setExtractoTexto] = useState('')
  const [extractoAnalizando, setExtractoAnalizando] = useState(false)
  const [extractoResultado, setExtractoResultado] = useState(null)
  const [extractoError, setExtractoError] = useState('')
  const [extractoAviso, setExtractoAviso] = useState('')
  const [conciliando, setConciliando] = useState('')
  const [conciliadas, setConciliadas] = useState({})
  // Repuestos y proveedores (#250 · #83): alta de la compra y acciones de pago
  // (baja el pendiente y deja el movimiento en Caja) y consumo (la consignación
  // pasa a pagarse recién cuando el taller la usa).
  const PROVEEDOR_VACIO = { supplierName: '', concept: '', condition: 'CREDITO', amountPyg: '', dueAt: '', accountId: '', reference: '' }
  const [proveedorOpen, setProveedorOpen] = useState(false)
  const [proveedorForm, setProveedorForm] = useState(PROVEEDOR_VACIO)
  const [proveedorError, setProveedorError] = useState('')
  const [proveedorBusy, setProveedorBusy] = useState(false)
  const [proveedorAccion, setProveedorAccion] = useState(null)
  const [proveedorMonto, setProveedorMonto] = useState('')
  const [proveedorCuenta, setProveedorCuenta] = useState('')

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

  // Repuestos y proveedores (#250 · #83) y repuestos del taller (#250 · FIN).
  const proveedores = finance?.supplierPayables || null
  const taller = finance?.workshopParts || null
  async function registrarCompraProveedor(evento) {
    evento.preventDefault()
    if (proveedorBusy) return
    setProveedorBusy(true); setProveedorError('')
    try {
      await api.post(`/api/finance${sucursal?.id ? `?branchId=${encodeURIComponent(sucursal.id)}` : ''}`, {
        action: 'supplierPayable',
        supplierName: proveedorForm.supplierName.trim(),
        concept: proveedorForm.concept.trim(),
        condition: proveedorForm.condition,
        amountPyg: parseGsInput(proveedorForm.amountPyg),
        dueAt: proveedorForm.condition === 'CREDITO' ? proveedorForm.dueAt : undefined,
        accountId: proveedorForm.accountId || undefined,
        reference: proveedorForm.reference.trim() || undefined,
      })
      setProveedorOpen(false)
      setProveedorForm(PROVEEDOR_VACIO)
      await load({ silencioso: true })
    } catch (err) { setProveedorError(err?.message || 'No se pudo registrar la compra.') } finally { setProveedorBusy(false) }
  }

  async function confirmarAccionProveedor(evento) {
    evento.preventDefault()
    if (proveedorBusy || !proveedorAccion) return
    setProveedorBusy(true); setProveedorError('')
    try {
      const url = `/api/finance${sucursal?.id ? `?branchId=${encodeURIComponent(sucursal.id)}` : ''}`
      // Repuesto del taller: deuda total (sin monto a mano) y egreso opcional.
      const cuerpo = proveedorAccion.tipo === 'pagar-taller'
        ? { action: 'workshopPartPayment', id: proveedorAccion.fila.id, ...(proveedorCuenta ? { accountId: proveedorCuenta } : {}) }
        : {
          action: proveedorAccion.tipo === 'pagar' ? 'supplierPayment' : 'supplierConsumption',
          id: proveedorAccion.fila.id,
          amountPyg: parseGsInput(proveedorMonto),
          ...(proveedorAccion.tipo === 'pagar' && proveedorCuenta ? { accountId: proveedorCuenta } : {}),
        }
      await api.post(url, cuerpo)
      setProveedorAccion(null); setProveedorMonto(''); setProveedorCuenta('')
      await load({ silencioso: true })
    } catch (err) { setProveedorError(err?.message || 'No se pudo completar la acción.') } finally { setProveedorBusy(false) }
  }

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

  // #311: el monto que vale sale del modo activo del cierre guiado. El resumen
  // fijo del cajón y la tarjeta de la página usan el mismo número.
  const resumen = resumenConteo({ modo: modoConteo, cantidades: arqueo, totalRapido: counted, esperado: expected })
  const contado = resumen.contado
  const hayConteo = resumen.hayConteo
  const sinConteo = abierta && !hayConteo
  const resumenAjeno = resumenConteo({ modo: modoConteo, cantidades: arqueoAjeno, totalRapido: contadoAjeno, esperado: expected })
  const contadoAjenoTotal = resumenAjeno.contado
  const difference =
    turno?.status === 'CLOSED'
      ? Number(turno.countedPyg ?? 0) - Number(turno.expectedPyg ?? 0)
      : abierta && hayConteo
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
    setReporteOpen(true)
  }
  async function abrir() {
    const errorInicial = errorMonto(parseGsInput(opening))
    if (errorInicial) { setError(errorInicial); return }
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
    if (!resumen.hayConteo) { setError('Cargá el total contado o el detalle por denominación.'); return }
    const errorContado = errorMonto(contado)
    if (errorContado) { setError(errorContado); return }
    setSaving(true)
    setError('')
    const desglose = modoConteo === MODO_DETALLADO ? desglosePayload(arqueo) : null
    try {
      if (esDemo) closeDemoCash(contado, expected, notes, desglose)
      else
        await api.post(`/api/cash?branchId=${encodeURIComponent(sucursal?.id || '')}`, {
          action: 'close',
          ...(desglose ? { countedBreakdown: desglose } : { countedPyg: parseGsInput(counted) }),
          notes,
        })
      // Cierre guiado: al confirmar, el cajón se cierra y el conteo se limpia.
      setConteoOpen(false)
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
    if (!resumenAjeno.hayConteo) { setError('Cargá el total contado o el detalle por denominación.'); return }
    const errorContado = errorMonto(contadoAjenoTotal)
    if (errorContado) { setError(errorContado); return }
    setSaving(true)
    setError('')
    const desglose = modoConteo === MODO_DETALLADO ? desglosePayload(arqueoAjeno) : null
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
        <Aviso tono="error" className="p-3">
          {error}
        </Aviso>
      )}
      <Card className="grid gap-4 sm:grid-cols-3" data-testid="caja-resumen">
        <div>
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
        </div>
        <div>
          <Label>Saldo esperado</Label>
          <strong className="text-xl tabular-nums">
            <Money value={expected} />
          </strong>
          <p className="mt-2 text-xs text-mute">Apertura + efectivo confirmado en Gs.</p>
        </div>
        <div>
          <Label>Diferencia</Label>
          <strong
            data-testid="caja-diferencia"
            className={`text-xl tabular-nums ${sinConteo ? 'text-mute' : difference === 0 ? 'text-ok' : 'text-warn'}`}
          >
            {sinConteo ? '—' : <Money value={difference} />}
          </strong>
          <p className="mt-2 text-xs text-mute">{sinConteo ? 'Se calcula al cierre' : 'Contado − esperado'}</p>
        </div>
      </Card>
      {finance && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card className={v2 ? 'v2-tile' : undefined}>
            <Label>Por cobrar</Label>
            <strong>
              <Money value={finance.receivables?.totalPyg || 0} />
            </strong>
          </Card>
          <Card className={v2 ? 'v2-tile' : undefined}>
            <Label>Por pagar</Label>
            <strong data-testid="caja-por-pagar">
              <Money value={(finance.payables?.totalPyg || 0) + (proveedores?.totalPyg || 0) + (taller?.totalPyg || 0)} />
            </strong>
            {((proveedores?.totalPyg || 0) > 0 || (taller?.totalPyg || 0) > 0) && (
              <p className="mt-1 text-xs text-mute">incluye repuestos a crédito, consumo y taller</p>
            )}
          </Card>
          <Card className={v2 ? 'v2-tile' : undefined}>
            <Label>Margen real</Label>
            <strong>
              <Money value={finance.margin?.profitPyg || 0} />
            </strong>
            <p className="mt-1 text-xs text-mute">
              {finance.margin?.marginPct ?? '—'}% · seguro y extras incluidos
            </p>
          </Card>
          <Card className={v2 ? 'v2-tile' : undefined}>
            <Label>Cheques pendientes</Label>
            <strong>
              {finance.movements?.filter(m => m.kind === 'CHEQUE' && m.status === 'PENDING')
                .length || 0}
            </strong>
          </Card>
        </div>
      )}
      {proveedores && (
        <Card className="space-y-3" data-testid="proveedores-repuestos">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-bold">Repuestos y proveedores</h3>
              <p className="mt-1 text-sm text-mute">
                Compras de repuestos e insumos: <b className="text-fore">contado</b> (pagada al recibir), <b className="text-fore">crédito</b> con vencimiento y <b className="text-fore">consignación/depósito</b> del proveedor, que no impacta en Finanzas hasta el consumo.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={() => { setProveedorError(''); setProveedorForm(PROVEEDOR_VACIO); setProveedorOpen(true) }}>Registrar compra</Button>
          </div>
          <div className={`${GRILLA_DOS_COLUMNAS} lg:grid-cols-4`}>
            <div className={cn('rounded-xl border border-ink-600 p-3', v2 && 'v2-tile')}>
              <Label>Por pagar</Label>
              <strong className={cn('tabular-nums', v2 ? 'v2-numero text-2xl' : 'text-lg')} data-testid="proveedores-por-pagar"><Money value={proveedores.totalPyg} /></strong>
            </div>
            <div className={cn('rounded-xl border border-ink-600 p-3', v2 && 'v2-tile')}>
              <Label>Vencidas</Label>
              <strong className={cn('tabular-nums text-bad', v2 ? 'v2-numero text-2xl' : 'text-lg')} data-testid="proveedores-vencidas"><Money value={proveedores.vencidasPyg} /></strong>
            </div>
            <div className={cn('rounded-xl border border-ink-600 p-3', v2 && 'v2-tile')}>
              <Label>Por vencer (7 días)</Label>
              <strong className={cn('tabular-nums text-warn', v2 ? 'v2-numero text-2xl' : 'text-lg')} data-testid="proveedores-por-vencer"><Money value={proveedores.porVencerPyg} /></strong>
            </div>
            <div className={cn('rounded-xl border border-ink-600 p-3', v2 && 'v2-tile')}>
              <Label>En depósito del proveedor</Label>
              <strong className={cn('tabular-nums', v2 ? 'v2-numero text-2xl' : 'text-lg')} data-testid="proveedores-deposito"><Money value={proveedores.depositoPyg} /></strong>
              <p className="mt-1 text-[11px] text-mute">Sin impacto hasta el consumo</p>
            </div>
          </div>
          {proveedores.rows.length === 0 ? (
            <p className="text-sm text-mute">Sin compras de repuestos registradas.</p>
          ) : (
            <div className="overflow-x-auto" data-testid="proveedores-tabla">
              <div className={cn(GRID_PROVEEDORES, 'px-3.5 pb-2 pt-1')}>
                <span className={CELDA_ENCABEZADO}>Proveedor</span>
                <span className={CELDA_ENCABEZADO}>Concepto</span>
                <span className={cn(CELDA_ENCABEZADO, 'text-right')}>Pendiente</span>
                <span className={cn(CELDA_ENCABEZADO, 'text-right')}>Acciones</span>
              </div>
              <div className="space-y-1">
              {proveedores.rows.map(fila => (
                <div key={fila.id} className={cn(GRID_PROVEEDORES, 'rounded-xl border border-ink-600 bg-ink-800/40 px-3.5 py-2', v2 && 'v2-tile')} data-testid={`proveedor-${fila.id}`}>
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className={CELDA_IDENTIDAD} title={fila.supplierName}>{fila.supplierName}</span>
                    <Badge color={fila.condition === 'CREDITO' ? 'orange' : fila.condition === 'CONSIGNACION' ? 'blue' : 'slate'}>{CONDICION_PROVEEDOR[fila.condition] || fila.condition}</Badge>
                    {fila.vencimiento === 'VENCIDA' && <Badge color="red">Vencida</Badge>}
                    {fila.vencimiento === 'POR_VENCER' && <Badge color="orange">Por vencer</Badge>}
                  </span>
                  <span className={cn(CELDA_DATO, 'tabular-nums')} title={`${fila.concept} · comprado ${formatGs(fila.amountPyg)}${fila.dueAt ? ` · vence ${fechaHora(fila.dueAt)}` : ''}${fila.depositoPyg > 0 ? ` · en depósito ${formatGs(fila.depositoPyg)}` : ''}`}>
                    {fila.concept} · comprado {formatGs(fila.amountPyg)}
                    {fila.dueAt ? ` · vence ${fechaHora(fila.dueAt)}` : ''}
                    {fila.depositoPyg > 0 ? ` · en depósito ${formatGs(fila.depositoPyg)}` : ''}
                  </span>
                  <strong className={cn(CELDA_NUMERO, 'font-semibold text-fore')} data-testid={`proveedor-pendiente-${fila.id}`}><Money value={fila.pendientePyg} /></strong>
                  <span className="flex flex-wrap items-center justify-end gap-2">
                    {fila.pendientePyg > 0 && <Button type="button" variant="outline" className="h-8 px-2 text-xs" onClick={() => { setProveedorError(''); setProveedorAccion({ tipo: 'pagar', fila }); setProveedorMonto(''); setProveedorCuenta('') }}>Pagar</Button>}
                    {fila.depositoPyg > 0 && <Button type="button" variant="outline" className="h-8 px-2 text-xs" onClick={() => { setProveedorError(''); setProveedorAccion({ tipo: 'consumir', fila }); setProveedorMonto('') }}>Consumir</Button>}
                  </span>
                </div>
              ))}
              </div>
            </div>
          )}
          {taller && taller.rows.length > 0 && (
            <div className="mt-4 space-y-3 border-t border-ink-600 pt-4" data-testid="taller-repuestos">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="text-sm font-bold">Repuestos del taller</h4>
                  <p className="mt-0.5 text-xs text-mute">Crédito y consignación consumida; pagar registra el egreso en la cuenta elegida.</p>
                </div>
                <div className="flex gap-5 text-right">
                  <div>
                    <Label>Por pagar</Label>
                    <strong className="tabular-nums" data-testid="taller-por-pagar"><Money value={taller.totalPyg} /></strong>
                  </div>
                  <div>
                    <Label>Vencidas</Label>
                    <strong className="tabular-nums text-bad" data-testid="taller-vencidas"><Money value={taller.vencidasPyg} /></strong>
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto" data-testid="taller-tabla">
                <div className={cn(GRID_TALLER, 'px-3.5 pb-2 pt-1')}>
                  <span className={CELDA_ENCABEZADO}>Repuesto</span>
                  <span className={CELDA_ENCABEZADO}>Detalle</span>
                  <span className={cn(CELDA_ENCABEZADO, 'text-right')}>Deuda</span>
                  <span className={cn(CELDA_ENCABEZADO, 'text-right')}>Acciones</span>
                </div>
                <div className="space-y-1">
                {taller.rows.map(parte => (
                  <div key={parte.id} className={cn(GRID_TALLER, 'rounded-xl border border-ink-600 bg-ink-800/40 px-3.5 py-2', v2 && 'v2-tile')} data-testid={`taller-parte-${parte.id}`}>
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className={CELDA_IDENTIDAD} title={parte.name}>{parte.name}</span>
                      <Badge color={parte.paymentMode === 'CREDITO' ? 'orange' : 'blue'}>{parte.paymentMode === 'CREDITO' ? 'Crédito' : 'Consignación'}</Badge>
                      {parte.vencimiento === 'VENCIDA' && <Badge color="red">Vencida</Badge>}
                      {parte.vencimiento === 'POR_VENCER' && <Badge color="orange">Por vencer</Badge>}
                    </span>
                    <span className={cn(CELDA_DATO, 'tabular-nums')} title={`${parte.code}${parte.supplierName ? ` · ${parte.supplierName}` : ''}${parte.dueAt ? ` · vence ${fechaHora(parte.dueAt)}` : ''}`}>
                      {parte.code}
                      {parte.supplierName ? ` · ${parte.supplierName}` : ''}
                      {parte.dueAt ? ` · vence ${fechaHora(parte.dueAt)}` : ''}
                    </span>
                    <strong className={cn(CELDA_NUMERO, 'font-semibold text-fore')} data-testid={`taller-deuda-${parte.id}`}><Money value={parte.deudaPyg} /></strong>
                    <span className="flex flex-wrap items-center justify-end gap-2">
                      <Button type="button" variant="outline" className="h-8 px-2 text-xs" onClick={() => { setProveedorError(''); setProveedorAccion({ tipo: 'pagar-taller', fila: parte }); setProveedorMonto(''); setProveedorCuenta('') }}>Pagar</Button>
                    </span>
                  </div>
                ))}
                </div>
              </div>
            </div>
          )}
        </Card>
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
        <Card className="space-y-4" data-testid="cierre-caja-tarjeta">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-bold">Cerrar caja</h3>
              <p className="mt-1 text-sm text-mute">
                El cierre es guiado: contá el efectivo —total rápido o por denominación—, compará
                con el esperado y confirmá. No incluyas dólares, transferencias ni tarjetas.
              </p>
              <p className="mt-2 text-xs text-mute">
                Abierto {fechaHora(turno?.openedAt)} · esperado{' '}
                <b className="text-fore">
                  <Money value={expected} />
                </b>
              </p>
            </div>
            <Button type="button" onClick={() => { setError(''); setConteoOpen(true) }}>
              Contar y cerrar
            </Button>
          </div>
        </Card>
      )}
      {puedeConciliar && (
        <Card className="space-y-3" data-testid="conciliacion-bancaria">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-bold">Conciliación bancaria</h3>
              <p className="mt-1 text-sm text-mute">
                Importá el extracto del banco (CSV con fecha, monto y referencia/descripción) y
                confirmá las coincidencias contra los cobros confirmados del sistema.
              </p>
              {extractoResultado && (
                <p className="mt-1 text-xs text-mute">
                  Último análisis: {extractoResultado.resumen.filas} movimiento(s) ·{' '}
                  {conciliadasExtracto} conciliada(s) · {pendientesExtracto} pendiente(s).
                </p>
              )}
            </div>
            <Button type="button" variant="outline" onClick={() => setBancoOpen(true)}>
              Importar extracto
            </Button>
          </div>
        </Card>
      )}
      <Drawer open={bancoOpen} onClose={() => setBancoOpen(false)} title="Conciliación bancaria">
        <div className="space-y-4">
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
                <Aviso tono="error">
                  {extractoError}
                </Aviso>
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
                            <p className={CELDA_DATO}>
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
      </Drawer>
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
            className="min-h-11 w-full px-3 text-xs md:h-9 md:min-h-0"
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
      <Drawer
        open={conteoOpen}
        onClose={() => !saving && setConteoOpen(false)}
        title="Cerrar caja"
      >
        <ConteoCierre
          id="arqueo"
          quickId="counted"
          modo={modoConteo}
          onModo={setModoConteo}
          cantidades={arqueo}
          onCantidad={(valor, cantidad) =>
            setArqueo(current => ({ ...current, [valor]: cantidad }))
          }
          totalRapido={counted}
          onTotalRapido={setCounted}
          esperado={expected}
        />
        <div className="mt-4">
          <Label htmlFor="close-notes">Nota de cierre (opcional)</Label>
          <Input
            id="close-notes"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Observación opcional"
          />
        </div>
        {error && (
          <Aviso tono="error" className="mt-3">
            {error}
          </Aviso>
        )}
        <Button
          type="button"
          variant="success"
          className="mt-4 w-full"
          onClick={cerrar}
          disabled={saving || !resumen.hayConteo}
        >
          {saving ? 'Cerrando…' : <>Cerrar caja · <Money value={contado} /></>}
        </Button>
      </Drawer>
      <Drawer
        open={Boolean(turnoAjeno)}
        onClose={() => !saving && setTurnoAjeno(null)}
        title={`Cerrar turno de ${turnoAjeno?.openedByName || 'otra persona'}`}
      >
        <p className="text-sm text-mute">
          Turno abierto {fechaHora(turnoAjeno?.openedAt)} con fondo de{' '}
          <Money value={turnoAjeno?.openingPyg} />.
        </p>
        <div className="mt-4">
          <ConteoCierre
            id="arqueo-ajeno"
            quickId="counted-ajeno"
            modo={modoConteo}
            onModo={setModoConteo}
            cantidades={arqueoAjeno}
            onCantidad={(valor, cantidad) =>
              setArqueoAjeno(current => ({ ...current, [valor]: cantidad }))
            }
            totalRapido={contadoAjeno}
            onTotalRapido={setContadoAjeno}
            esperado={expected}
          />
        </div>
        <div className="mt-4">
          <Label htmlFor="close-ajeno-notes">Nota de cierre (opcional)</Label>
          <Input
            id="close-ajeno-notes"
            value={notasAjeno}
            onChange={e => setNotasAjeno(e.target.value)}
            placeholder="Observación opcional"
          />
        </div>
        {error && (
          <Aviso tono="error" className="mt-3">
            {error}
          </Aviso>
        )}
        <div className={cn(PIE_ACCIONES_REVERSO, 'mt-4')}>
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
            disabled={saving || !resumenAjeno.hayConteo}
          >
            Cerrar turno · <Money value={contadoAjenoTotal} />
          </Button>
        </div>
      </Drawer>
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
      <Drawer open={proveedorOpen} onClose={() => !proveedorBusy && setProveedorOpen(false)} title="Registrar compra de repuestos">
        <form onSubmit={registrarCompraProveedor} className="space-y-3">
          <FormField label="Proveedor" htmlFor="prov-proveedor">
            <Input id="prov-proveedor" required maxLength={200} value={proveedorForm.supplierName} onChange={evento => setProveedorForm(actual => ({ ...actual, supplierName: evento.target.value }))} placeholder="Ej.: Depósito 2" />
          </FormField>
          <FormField label="Qué se compró" htmlFor="prov-concepto">
            <Input id="prov-concepto" required maxLength={200} value={proveedorForm.concept} onChange={evento => setProveedorForm(actual => ({ ...actual, concept: evento.target.value }))} placeholder="Ej.: 10 baterías iPhone 13" />
          </FormField>
          <div className={GRILLA_DOS_COLUMNAS}>
            <FormField label="Condición de pago" htmlFor="prov-condicion">
              <Select id="prov-condicion" value={proveedorForm.condition} onChange={evento => setProveedorForm(actual => ({ ...actual, condition: evento.target.value }))}>
                <option value="CONTADO">Contado (pagada al recibir)</option>
                <option value="CREDITO">Crédito (con vencimiento)</option>
                <option value="CONSIGNACION">Consignación/depósito (se paga al consumir)</option>
              </Select>
            </FormField>
            <FormField label="Monto (Gs)" htmlFor="prov-monto">
              <MoneyInput id="prov-monto" value={proveedorForm.amountPyg} onValueChange={valor => setProveedorForm(actual => ({ ...actual, amountPyg: valor }))} placeholder="0" />
            </FormField>
            {proveedorForm.condition === 'CREDITO' && (
              <FormField label="Vencimiento" htmlFor="prov-vence">
                <Input id="prov-vence" type="date" required value={proveedorForm.dueAt} onChange={evento => setProveedorForm(actual => ({ ...actual, dueAt: evento.target.value }))} />
              </FormField>
            )}
            <FormField label={proveedorForm.condition === 'CONTADO' ? 'Cuenta de salida (opcional)' : 'Cuenta para el pago (opcional)'} htmlFor="prov-cuenta">
              <Select id="prov-cuenta" value={proveedorForm.accountId} onChange={evento => setProveedorForm(actual => ({ ...actual, accountId: evento.target.value }))}>
                <option value="">Sin movimiento de caja</option>
                {(finance?.accounts || []).map(cuenta => <option key={cuenta.id} value={cuenta.id}>{cuenta.name} · {cuenta.currency}</option>)}
              </Select>
            </FormField>
          </div>
          <FormField label="Referencia (opcional)" htmlFor="prov-ref">
            <Input id="prov-ref" maxLength={200} value={proveedorForm.reference} onChange={evento => setProveedorForm(actual => ({ ...actual, reference: evento.target.value }))} placeholder="Factura o remito del proveedor" />
          </FormField>
          {proveedorError && <Aviso tono="error">{proveedorError}</Aviso>}
          <div className={PIE_ACCIONES_REVERSO}>
            <Button type="button" variant="ghost" disabled={proveedorBusy} onClick={() => setProveedorOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={proveedorBusy || !proveedorForm.supplierName.trim() || !proveedorForm.concept.trim() || !proveedorForm.amountPyg || (proveedorForm.condition === 'CREDITO' && !proveedorForm.dueAt)}>{proveedorBusy ? 'Guardando…' : 'Registrar compra'}</Button>
          </div>
        </form>
      </Drawer>
      <Drawer open={Boolean(proveedorAccion)} onClose={() => !proveedorBusy && setProveedorAccion(null)} title={proveedorAccion?.tipo === 'pagar-taller' ? 'Pagar repuesto del taller' : proveedorAccion?.tipo === 'pagar' ? 'Pagar al proveedor' : 'Registrar consumo'}>
        <form onSubmit={confirmarAccionProveedor} className="space-y-3">
          <p className="text-sm text-mute">
            {proveedorAccion?.tipo === 'pagar-taller'
              ? <>{proveedorAccion?.fila.name} · {proveedorAccion?.fila.code}. Deuda <b className="text-fore">{formatGs(proveedorAccion?.fila.deudaPyg || 0)}</b> (pago total).</>
              : <>{proveedorAccion?.fila.supplierName} · {proveedorAccion?.fila.concept}.{' '}
                {proveedorAccion?.tipo === 'pagar'
                  ? `Pendiente ${formatGs(proveedorAccion?.fila.pendientePyg || 0)}.`
                  : `En depósito ${formatGs(proveedorAccion?.fila.depositoPyg || 0)}: lo consumido pasa a pagarse.`}</>}
          </p>
          {proveedorAccion?.tipo !== 'pagar-taller' && (
            <FormField label="Monto (Gs)" htmlFor="prov-accion-monto">
              <MoneyInput id="prov-accion-monto" value={proveedorMonto} onValueChange={setProveedorMonto} placeholder="0" />
            </FormField>
          )}
          {proveedorAccion?.tipo !== 'consumir' && (
            <FormField label="Cuenta de salida (opcional)" htmlFor="prov-accion-cuenta">
              <Select id="prov-accion-cuenta" value={proveedorCuenta} onChange={evento => setProveedorCuenta(evento.target.value)}>
                <option value="">Solo registrar el pago</option>
                {(finance?.accounts || []).map(cuenta => <option key={cuenta.id} value={cuenta.id}>{cuenta.name} · {cuenta.currency}</option>)}
              </Select>
            </FormField>
          )}
          {proveedorError && <Aviso tono="error">{proveedorError}</Aviso>}
          <div className={PIE_ACCIONES_REVERSO}>
            <Button type="button" variant="ghost" disabled={proveedorBusy} onClick={() => setProveedorAccion(null)}>Cancelar</Button>
            <Button type="submit" disabled={proveedorBusy || (proveedorAccion?.tipo !== 'pagar-taller' && !proveedorMonto)}>{proveedorBusy ? 'Guardando…' : proveedorAccion?.tipo === 'consumir' ? 'Registrar consumo' : 'Registrar pago'}</Button>
          </div>
        </form>
      </Drawer>
      <ReportePreview
        open={reporteOpen}
        onClose={() => setReporteOpen(false)}
        titulo="Cierre de caja"
        construir={(format) => buildCierreCajaHtml(cierre, { format })}
        directo={({ ancho }) => imprimirDocumento(ticketCierreCaja(cierre, { ancho }), { tipo: 'cierre-caja' })}
      />
      <AuditoriaMedios />
      <AuditoriaEfectivo />
      <VentasPorCaja />
    </div>
  )
}
