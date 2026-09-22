import { useEffect, useState } from 'react'
import { api } from '@/lib/api/client'
import { descargarCsvCliente } from '@/utils/descargarArchivo'
import { copiarAlPortapapeles } from '@/utils/portapapeles'
import { useSesion } from '@/lib/sesion'
import { formatGs } from '@/utils/moneda'
import { fechaDia as fecha, fechaHora } from '@/utils/fecha'
import { telefonoVisible } from '@/utils/telefono'
import { codigoPedido } from '@/utils/pedido'
import { cn } from '@/lib/utils'
import { primerNombre } from '@/lib/utils'
import { portalUrlFor, portalVitrinaUrlFor } from '@/lib/customerPortal'
import { PERIODOS_INFORME, rangoPeriodo, seccionesInforme, informeCsv, nombreArchivoInforme } from '@/lib/customerReport'
import QRCode from 'qrcode'
import SerialTexto from '@/components/shared/SerialTexto'
import CityAutocomplete from '@/components/shared/CityAutocomplete'
import WhatsAppMenu from '@/components/shared/WhatsAppMenu'
import Switch from '@/components/shared/Switch'
import ImeiVerificacionModal from './ImeiVerificacionModal'
import PercentField, { formatPercent, parsePercent } from '@/components/shared/PercentField'
import RucField from '@/components/shared/RucField'
import Icon from '@/components/shared/Icon'
import ActorAvatar from './ActorAvatar'
import { DEMO_MESSAGE_TEMPLATES } from './customerMessaging'
import { buildDemoAnalytics, buildDemoProfile, buildDemoTimeline } from '@/lib/demoClientes'
import { CELDA_DATO, CELDA_ENCABEZADO, CELDA_IDENTIDAD } from '@/components/shared/tabla'
import {
  Aviso,
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FormField,
  Input,
  Label,
  Modal,
  MoneyInput,
  CeldaMoneda,
  Select,
  Skeleton,
  Textarea,
  useToast,
} from '@/components/ui'
import { GRILLA_DOS_COLUMNAS, GRILLA_DOS_COLUMNAS_COMPACTA } from '@/components/shared/formulario'
const ORDER_STATUS = {
  PENDING: { label: 'Pendiente', color: 'orange' },
  REGISTERED: { label: 'Registrado', color: 'blue' },
  COMPLETED: { label: 'Completado', color: 'green' },
  CANCELLED: { label: 'Cancelado', color: 'red' },
}
const FULFILLMENT_STATUS = {
  PROCESSING: { label: 'Preparando', color: 'blue' },
  PENDING: { label: 'Pendiente', color: 'slate' },
  SHIPPED: { label: 'Enviado', color: 'blue' },
  IN_TRANSIT: { label: 'En camino', color: 'orange' },
  PICKED_UP: { label: 'Retirado', color: 'green' },
  PARTIAL: { label: 'Entrega parcial', color: 'orange' },
  NOT_DELIVERED: { label: 'No entregado', color: 'red' },
  READY_TO_SHIP: { label: 'Listo p/ enviar', color: 'blue' },
  READY_FOR_PICKUP: { label: 'Listo para retirar', color: 'green' },
  DELIVERED: { label: 'Entregado', color: 'slate' },
}
const WARRANTY_STATUS = {
  RECEIVED: { label: 'Recibida', color: 'orange' },
  DIAGNOSIS: { label: 'En diagnóstico', color: 'blue' },
  READY: { label: 'Lista', color: 'green' },
  DELIVERED: { label: 'Entregada', color: 'slate' },
}
const FOLLOW_UP_KINDS = {
  CALL: { label: 'Llamada', color: 'blue' },
  WHATSAPP: { label: 'WhatsApp', color: 'green' },
  VISIT: { label: 'Visita', color: 'orange' },
  OTHER: { label: 'Otro', color: 'slate' },
}
const LOYALTY_KINDS = {
  ACCRUAL: { label: 'Acumulado', color: 'green' },
  REDEMPTION: { label: 'Canjeado', color: 'orange' },
  ADJUSTMENT: { label: 'Ajuste', color: 'slate' },
}
const STATUS_BADGE = (map, value) => {
  const item = map[value]
  return item ? <Badge color={item.color}>{item.label}</Badge> : <Badge>{value || 'Sin estado'}</Badge>
}
const antiguedadTexto = (dias) => {
  const total = Number(dias || 0)
  if (!total) return '—'
  if (total < 30) return `${total} ${total === 1 ? 'día' : 'días'}`
  const meses = Math.floor(total / 30)
  if (meses < 12) return `${meses} ${meses === 1 ? 'mes' : 'meses'}`
  const anios = Math.floor(meses / 12)
  const resto = meses % 12
  return `${anios} ${anios === 1 ? 'año' : 'años'}${resto ? ` y ${resto} ${resto === 1 ? 'mes' : 'meses'}` : ''}`
}
const frecuenciaTexto = (dias) => (dias === null || dias === undefined ? '—' : dias <= 1 ? 'Todos los días' : `Cada ${dias} días`)

const AUTH_KINDS = {
  WHOLESALE: 'Mayorista',
  CREDIT: 'Crédito',
  CREDIT_DAYS: 'Días de crédito',
  DISCOUNT: 'Descuento',
}
const AUTH_STATUS = {
  PENDING: { label: 'Pendiente', color: 'orange' },
  APPROVED: { label: 'Aprobada', color: 'green' },
  REJECTED: { label: 'Rechazada', color: 'red' },
}
const RESOLVERS = ['ADMIN', 'GERENTE']
const resumenValor = (kind, value) => {
  const data = value && typeof value === 'object' ? value : {}
  if (kind === 'WHOLESALE') return 'Pasar a mayorista'
  const parts = []
  if (data.creditLimitPyg !== undefined && data.creditLimitPyg !== null) parts.push(`Límite ${formatGs(data.creditLimitPyg)}`)
  if (data.creditDays !== undefined && data.creditDays !== null) parts.push(`${data.creditDays} día${Number(data.creditDays) === 1 ? '' : 's'}`)
  if (data.discountPyg !== undefined && data.discountPyg !== null) parts.push(`Descuento ${formatGs(data.discountPyg)}`)
  if (data.maxDiscountPyg !== undefined && data.maxDiscountPyg !== null) parts.push(`Máximo ${formatGs(data.maxDiscountPyg)}`)
  return parts.join(' · ') || '—'
}
const saldoOrden = (order) => Number(order?.pendingPyg ?? order?.balancePyg ?? 0)
const pagadoOrden = (order) => Number(order?.collectedPyg ?? order?.paidPyg ?? 0)

// Grillas de las pestañas: una fila por registro, datos en columnas fijas.
const GRID_DISPOSITIVOS = 'grid min-w-[59rem] grid-cols-[minmax(8rem,1.2fr)_minmax(7rem,0.9fr)_6rem_6rem_8rem_11rem] items-center gap-x-2'
const GRID_GARANTIAS_CLI = 'grid min-w-[46rem] grid-cols-[minmax(9rem,1.5fr)_minmax(7rem,1fr)_6rem_7rem] items-center gap-x-2'
const GRID_SEGUIMIENTOS = 'grid min-w-[54rem] grid-cols-[7rem_minmax(10rem,1.8fr)_7rem_7rem_6rem_8rem] items-center gap-x-2'
const GRID_FACTURACION = 'grid min-w-[50rem] grid-cols-[minmax(10rem,1.5fr)_minmax(7rem,1fr)_minmax(8rem,1fr)_7rem_7rem] items-center gap-x-2'
const GRID_DEUDA = 'grid min-w-[34rem] grid-cols-[7rem_6rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-2'

const TABS = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'pedidos', label: 'Pedidos' },
  { key: 'cronologia', label: 'Cronología' },
  { key: 'estadisticas', label: 'Estadísticas' },
  { key: 'datos', label: 'Datos' },
]

// Un icono y un tono por tipo de evento de la cronología del cliente.
const EVENTOS = {
  customer: { icon: 'user', tono: 'bg-fono/10 text-fono-light' },
  order: { icon: 'receipt', tono: 'bg-ink-700 text-fore' },
  payment: { icon: 'money', tono: 'bg-ok/10 text-ok' },
  note: { icon: 'report', tono: 'bg-warn/10 text-warn' },
  followUp: { icon: 'clock', tono: 'bg-ink-700 text-mute' },
  warranty: { icon: 'package', tono: 'bg-fono/10 text-fono-light' },
  audit: { icon: 'edit', tono: 'bg-ink-700 text-mute' },
}
const conCodigos = (texto) => String(texto || '').replace(/MOB-(\d+)/g, 'MOB #$1')

// Texto legible por tipo de evento de la cronología del cliente.
// Lista compacta de señales (productos, modelos, meses, días) para la
// pestaña Estadísticas: pocos gráficos, mucha señal.
function Senales({ titulo, items, primario, secundario }) {
  if (!items?.length) return null
  return (
    <div className="rounded-xl border border-ink-600 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-mute">{titulo}</p>
      <ul className="mt-1 space-y-0.5 text-xs">
        {items.map((item, index) => (
          <li key={`${titulo}-${index}`} className="flex flex-wrap justify-between gap-2">
            <span className="min-w-0 truncate">{primario(item)}</span>
            <span className="text-mute">{secundario(item)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function CustomerProfile({ customer, open, onClose }) {
  const toast = useToast()
  const { usuario, esDemo } = useSesion()
  // Modo demo (#189): nada de la ficha se guarda contra el API real. Los
  // controles quedan deshabilitados y, si algo igual llega, se avisa y no se envía.
  const demoBloqueado = () => {
    if (!esDemo) return false
    toast.info('Modo demo', 'Esta acción no está disponible en la demo.')
    return true
  }
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [profile, setProfile] = useState(null)
  const [tab, setTab] = useState('resumen')
  const [analitica, setAnalitica] = useState(null)
  const [cargandoAnalitica, setCargandoAnalitica] = useState(false)
  const [solicitud, setSolicitud] = useState(null)
  const [solicitudDias, setSolicitudDias] = useState('')
  const [solicitudLimite, setSolicitudLimite] = useState('')
  const [solicitudBusy, setSolicitudBusy] = useState(false)
  const [notaInterna, setNotaInterna] = useState('')
  const [notaPublica, setNotaPublica] = useState('')
  const [guardandoNotas, setGuardandoNotas] = useState(false)
  // Informe descargable: período elegido y rango personalizado.
  const [periodoInforme, setPeriodoInforme] = useState('todo')
  const [desdeInforme, setDesdeInforme] = useState('')
  const [hastaInforme, setHastaInforme] = useState('')
  const [generandoInforme, setGenerandoInforme] = useState(false)
  // Seguro del cliente (#160) y etiquetas de la ficha.
  const [seguroForm, setSeguroForm] = useState({ enabled: false, pct: '' })
  const [guardandoSeguro, setGuardandoSeguro] = useState(false)
  // Verificación de IMEI (#203): comprobante del equipo que se abre desde la
  // pestaña Pedidos (datos de INV #193/#200).
  const [imeiDe, setImeiDe] = useState(null)
  const [tagsTexto, setTagsTexto] = useState('')
  const [guardandoTags, setGuardandoTags] = useState(false)

  useEffect(() => {
    const ficha = profile?.customer
    setSeguroForm({
      enabled: ficha?.insuranceEnabled === true,
      pct: ficha?.insuranceEnabled && ficha?.insuranceRatePct !== null && ficha?.insuranceRatePct !== undefined ? formatPercent(ficha.insuranceRatePct) : '',
    })
    setTagsTexto((ficha?.tags || []).join(', '))
  }, [profile])

  // El seguro afecta costo real y margen: lo configuran administración/gerencia.
  async function guardarSeguro(enabled = seguroForm.enabled) {
    if (demoBloqueado() || guardandoSeguro || !customer?.id) return
    const pct = parsePercent(seguroForm.pct)
    if (enabled && seguroForm.pct.trim() && (pct === null || pct < 0 || pct > 100)) {
      toast.error('Porcentaje inválido', 'El seguro debe estar entre 0 y 100 (hasta 2 decimales).')
      return
    }
    setGuardandoSeguro(true)
    try {
      await api.patch(`/api/customers/${encodeURIComponent(customer.id)}`, {
        insuranceEnabled: enabled,
        insuranceRatePct: pct,
      })
      toast.success(enabled ? 'Seguro del cliente activado.' : 'Seguro del cliente desactivado.')
      refresh()
    } catch (cause) {
      toast.error('No se pudo guardar el seguro', cause?.message)
    } finally { setGuardandoSeguro(false) }
  }

  // Adjunta el comprobante de IMEI (#203): comentario interno o nota pública.
  async function agregarComentarioImei(texto) {
    if (!customer?.id) return
    if (esDemo) {
      const nota = { id: `demo-imei-${Date.now()}`, content: texto, createdAt: new Date().toISOString(), user: { id: 'demo-user', name: 'Equipo demo' } }
      setProfile((actual) => actual ? { ...actual, notes: [nota, ...(actual.notes || [])] } : actual)
      setTimeline((actual) => [{ id: nota.id, type: 'note', action: 'Comentario del equipo', createdAt: nota.createdAt, user: nota.user, detail: texto }, ...actual])
      return
    }
    await api.post(`/api/customers/${encodeURIComponent(customer.id)}/notes`, { content: texto })
    refresh()
  }

  async function agregarNotaPublicaImei(texto) {
    if (!customer?.id) return
    if (esDemo) { setNotaPublica((actual) => [actual, texto].filter(Boolean).join('\n')); return }
    const actual = String(profile?.customer?.publicNote || notaPublica || '').trim()
    await api.patch(`/api/customers/${encodeURIComponent(customer.id)}`, { publicNote: [actual, texto].filter(Boolean).join('\n').slice(0, 2000) })
    refresh()
  }

  async function guardarTags(event) {    event.preventDefault()
    if (demoBloqueado() || guardandoTags || !customer?.id) return
    const tags = tagsTexto.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 20)
    setGuardandoTags(true)
    try {
      await api.patch(`/api/customers/${encodeURIComponent(customer.id)}`, { tags })
      toast.success('Etiquetas guardadas.')
      refresh()
    } catch (cause) {
      toast.error('No se pudieron guardar las etiquetas', cause?.message)
    } finally { setGuardandoTags(false) }
  }
  // Listas de precios disponibles para asignar a la ficha.
  const [listasPrecios, setListasPrecios] = useState([])
  const [asignandoLista, setAsignandoLista] = useState(false)
  // Edición directa de la configuración comercial (solo administración/gerencia).
  const [comercialAbierto, setComercialAbierto] = useState(false)
  const [comercialForm, setComercialForm] = useState({ pricingTier: 'RETAIL', creditHabilitado: false, creditDays: '', creditLimitPyg: '' })
  const [guardandoComercial, setGuardandoComercial] = useState(false)
  // Direcciones de la ficha (alta, edición y baja reemplazando el conjunto).
  const [direccionForm, setDireccionForm] = useState(null)
  const [direccionBusy, setDireccionBusy] = useState(false)

  const direcciones = profile?.customer?.addresses || []

  function abrirDireccion(address, index = -1) {
    setDireccionForm(address
      ? { index, label: address.label || '', address: address.address || '', city: address.city || '', department: address.department || '', country: address.country || 'Paraguay', isDefault: address.isDefault === true }
      : { index: -1, label: '', address: '', city: '', department: '', country: 'Paraguay', isDefault: direcciones.length === 0 })
  }

  async function guardarDireccion(event) {
    event.preventDefault()
    if (demoBloqueado() || !direccionForm || direccionBusy || !customer?.id) return
    const address = direccionForm.address.trim()
    if (!address) { toast.error('Dirección obligatoria', 'Ingresá el detalle de la dirección.'); return }
    const actuales = direcciones.map((item) => ({ label: item.label, address: item.address, city: item.city, department: item.department, country: item.country, isDefault: item.isDefault }))
    const nueva = { label: direccionForm.label.trim() || `Dirección ${actuales.length + 1}`, address, city: direccionForm.city.trim(), department: direccionForm.department.trim(), country: direccionForm.country.trim() || 'Paraguay', isDefault: direccionForm.isDefault }
    const lista = direccionForm.index >= 0 ? actuales.map((item, index) => (index === direccionForm.index ? nueva : item)) : [...actuales, nueva]
    const conPredeterminada = lista.map((item, index) => ({ ...item, isDefault: item.isDefault || (index === 0 && !lista.some((otra) => otra.isDefault)) }))
    setDireccionBusy(true)
    try {
      await api.patch(`/api/customers/${encodeURIComponent(customer.id)}`, { addresses: conPredeterminada })
      toast.success('Direcciones guardadas.')
      setDireccionForm(null)
      refresh()
    } catch (cause) {
      toast.error('No se pudo guardar la dirección', cause?.message)
    } finally { setDireccionBusy(false) }
  }

  async function removeDireccion() {
    if (demoBloqueado() || !pendingDelete || pendingDelete.type !== 'address' || deleteBusy || !customer?.id) return
    setDeleteBusy(true)
    try {
      const lista = direcciones
        .filter((_, index) => index !== pendingDelete.index)
        .map((item, index) => ({ label: item.label, address: item.address, city: item.city, department: item.department, country: item.country, isDefault: index === 0 ? true : item.isDefault }))
      await api.patch(`/api/customers/${encodeURIComponent(customer.id)}`, { addresses: lista })
      toast.success('Dirección eliminada.')
      setPendingDelete(null)
      refresh()
    } catch (cause) {
      toast.error('No se pudo eliminar la dirección', cause?.message)
    } finally { setDeleteBusy(false) }
  }

  function abrirComercial() {
    const ficha = profile?.customer || customer || {}
    setComercialForm({
      pricingTier: ficha.pricingTier === 'WHOLESALE' ? 'WHOLESALE' : 'RETAIL',
      creditHabilitado: Number(ficha.creditLimitPyg || 0) > 0,
      creditDays: ficha.creditDays ?? '',
      creditLimitPyg: Number(ficha.creditLimitPyg || 0) > 0 ? ficha.creditLimitPyg : '',
    })
    setComercialAbierto(true)
  }

  async function guardarComercial(event) {
    event.preventDefault()
    if (demoBloqueado() || guardandoComercial || !customer?.id) return
    const body = { pricingTier: comercialForm.pricingTier === 'WHOLESALE' ? 'WHOLESALE' : 'RETAIL' }
    if (comercialForm.creditHabilitado) {
      const limite = Number(String(comercialForm.creditLimitPyg).replace(/\D/g, ''))
      if (!Number.isSafeInteger(limite) || limite <= 0) { toast.error('Límite inválido', 'Para habilitar el crédito ingresá un límite mayor a cero.'); return }
      const dias = comercialForm.creditDays === '' ? null : Number(comercialForm.creditDays)
      if (dias !== null && (!Number.isSafeInteger(dias) || dias < 0 || dias > 365)) { toast.error('Días inválidos', 'Los días de crédito deben estar entre 0 y 365.'); return }
      body.creditLimitPyg = limite
      body.creditDays = dias
    } else {
      body.creditLimitPyg = null
      body.creditDays = null
    }
    setGuardandoComercial(true)
    try {
      await api.patch(`/api/customers/${encodeURIComponent(customer.id)}`, body)
      toast.success('Configuración comercial guardada.')
      setComercialAbierto(false)
      refresh()
    } catch (cause) {
      toast.error('No se pudo guardar la configuración', cause?.message)
    } finally { setGuardandoComercial(false) }
  }

  useEffect(() => {
    setNotaInterna(profile?.customer?.notes || customer?.notes || '')
    setNotaPublica(profile?.customer?.publicNote || customer?.publicNote || '')
  }, [profile?.customer?.notes, profile?.customer?.publicNote, customer?.notes, customer?.publicNote])

  async function pedirCambio() {
    if (demoBloqueado() || !solicitud || solicitudBusy || !customer?.id) return
    setSolicitudBusy(true)
    try {
      await api.post('/api/authorizations', {
        customerId: customer.id,
        kind: solicitud,
        ...(solicitud === 'CREDIT'
          ? { requestedValue: { creditDays: solicitudDias, creditLimitPyg: solicitudLimite } }
          : {}),
      })
      toast.success('Solicitud enviada', 'Gerencia la resuelve desde Autorizaciones.')
      setSolicitud(null); setSolicitudDias(''); setSolicitudLimite('')
    } catch (cause) { toast.error(cause?.message || 'No se pudo enviar la solicitud.') } finally { setSolicitudBusy(false) }
  }

  async function guardarNotas() {
    if (demoBloqueado() || guardandoNotas || !customer?.id) return
    setGuardandoNotas(true)
    try {
      await api.patch(`/api/customers/${encodeURIComponent(customer.id)}`, { notes: notaInterna.trim(), publicNote: notaPublica.trim() })
      toast.success('Notas guardadas.')
    } catch (cause) { toast.error(cause?.message || 'No se pudieron guardar las notas.') } finally { setGuardandoNotas(false) }
  }

  // Lista de precios de la ficha: vacía vuelve al precio por tipo de cliente.
  async function cambiarListaPrecios(value) {
    if (demoBloqueado() || guardandoLista || !customer?.id) return
    setGuardandoLista(true)
    try {
      await api.patch(`/api/customers/${encodeURIComponent(customer.id)}`, { priceListId: value || null })
      toast.success(value ? 'Lista de precios asignada.' : 'La ficha vuelve a su precio por tipo de cliente.')
      refresh()
    } catch (cause) {
      toast.error(cause?.message || 'No se pudo asignar la lista.')
    } finally {
      setGuardandoLista(false)
    }
  }

  // Portal del cliente: prepara (o regenera) el enlace del nivel elegido y su QR.
  async function prepararPortal(nivel = portalNivel, regenerate = false) {
    if (!customer?.id || portalBusy) return
    // Portal demo (#194): el token `demo-…` se resuelve en el navegador.
    if (esDemo) {
      const token = `demo-${customer.id}-${nivel}`
      setPortalNivel(nivel)
      setPortal({ token })
      setPortalMsg('Enlace de demostración: se resuelve en este navegador, sin datos reales.')
      const url = portalUrlFor(token)
      setPortalQr(url ? await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 220 }) : '')
      return
    }
    setPortalBusy(true); setPortalError(''); setPortalMsg('')
    try {
      const data = await api.post(`/api/customers/${encodeURIComponent(customer.id)}/access-token`, { level: nivel, regenerate })
      const token = data?.token || ''
      setPortalNivel(nivel)
      if (!token) {
        // Ya hay un enlace vigente y solo se guarda su hash (#172/#178): no se
        // puede volver a mostrar; se ofrece regenerarlo (invalida el anterior).
        setPortal({ token: '', reused: true })
        setPortalQr('')
        setPortalMsg('Ya hay un enlace vigente para este nivel. Por seguridad no se vuelve a mostrar: usá Regenerar si lo perdiste.')
        return
      }
      setPortal({ token })
      const url = portalUrlFor(token)
      if (url) setPortalQr(await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 220 }))
      if (regenerate) setPortalMsg('Enlace regenerado: el anterior ya no funciona.')
    } catch (cause) {
      setPortalError(cause?.message || 'No se pudo preparar el portal.')
    } finally { setPortalBusy(false); setConfirmarRegenerar(false) }
  }

  function abrirPortal() {
    setPortal({ token: '' }); setPortalNivel('rapido'); setPortalQr(''); setPortalMsg(''); setPortalError('')
    prepararPortal('rapido', false)
  }

  function cambiarNivelPortal(nivel) {
    if (nivel === portalNivel || portalBusy) return
    setPortalNivel(nivel); setPortalQr('')
    prepararPortal(nivel, false)
  }

  function copiarPortal() {
    const url = portalUrlFor(portal?.token)
    if (!url) return
    copiarAlPortapapeles(url).then((ok) => setPortalMsg(ok ? 'Enlace copiado.' : url))
  }

  useEffect(() => {
    if (tab !== 'estadisticas' || analitica || esDemo || !customer?.id) return
    let vigente = true
    setCargandoAnalitica(true)
    api.get(`/api/customers/${encodeURIComponent(customer.id)}/analytics`)
      .then(data => { if (vigente) setAnalitica(data) })
      .catch(() => { if (vigente) setAnalitica({ ordersCount: 0, totalPyg: 0, avgTicketPyg: 0, purchasesPerMonth: 0, spendPerMonthPyg: 0, frequencyDays: null, antiguedadDias: 0, byMonth: [], topProducts: [], topModels: [], topCategories: [], topMonths: [], topWeekdays: [], statement: [] }) })
      .finally(() => { if (vigente) setCargandoAnalitica(false) })
    return () => { vigente = false }
  }, [tab, analitica, esDemo, customer?.id])

  // Informe descargable: reúne todas las secciones del cliente en un CSV con el
  // período elegido. La cronología se pide completa (páginas de 100) para que
  // el informe no dependa de lo que ya está en pantalla.
  async function descargarInforme() {
    if (generandoInforme || !customer?.id) return
    setGenerandoInforme(true)
    try {
      let eventos = timeline
      if (!esDemo) {
        eventos = []
        let cursor = ''
        for (let pagina = 0; pagina < 5; pagina += 1) {
          const consulta = `/api/customers/${encodeURIComponent(customer.id)}/timeline?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
          const data = await api.get(consulta)
          eventos = [...eventos, ...(Array.isArray(data?.events) ? data.events : [])]
          cursor = data?.nextCursor || ''
          if (!cursor) break
        }
      }
      const ficha = profile?.customer || {}
      const telefono = ficha.phone || customer?.phone || ''
      const secciones = seccionesInforme({
        customer: {
          ...ficha,
          telefonoVisible: telefono ? telefonoVisible(telefono, ficha.countryCode || customer?.countryCode) : '',
          ciudad: (ficha.addresses || []).find((address) => address.city)?.city || '',
          createdByName: ficha.createdBy?.name || '',
        },
        orders,
        warranties,
        timeline: eventos,
        analytics: analitica,
        billingIdentities: profile?.billingIdentities || [],
        rango: rangoPeriodo(periodoInforme, { desde: desdeInforme, hasta: hastaInforme }),
      })
      descargarCsvCliente(nombreArchivoInforme(customer?.name || 'cliente', periodoInforme), informeCsv(secciones))
      toast.success('Informe descargado.')
    } catch (cause) {
      toast.error('No se pudo generar el informe', cause?.message)
    } finally { setGenerandoInforme(false) }
  }


  const [newNote, setNewNote] = useState('')
  const [editingNote, setEditingNote] = useState(null)
  const [noteBusy, setNoteBusy] = useState(false)
  const [followForm, setFollowForm] = useState({ kind: 'CALL', dueAt: '', note: '' })
  const [followBusy, setFollowBusy] = useState(false)
  const [followDoneId, setFollowDoneId] = useState('')
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [timeline, setTimeline] = useState([])
  const [timelineLoading, setTimelineLoading] = useState(false)
  const [timelineError, setTimelineError] = useState('')
  const [timelineRevision, setTimelineRevision] = useState(0)
  const [timelineNext, setTimelineNext] = useState(null)
  const [timelineCargandoMas, setTimelineCargandoMas] = useState(false)
  const [authorizations, setAuthorizations] = useState([])
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  // Listas de precios activas de la empresa para asignar a la ficha.
  const [listas, setListas] = useState([])
  const [guardandoLista, setGuardandoLista] = useState(false)
  const [requestKind, setRequestKind] = useState('')
  const [requestForm, setRequestForm] = useState({ creditLimitPyg: '', creditDays: '', note: '' })
  const [requestBusy, setRequestBusy] = useState(false)
  const [resolveTarget, setResolveTarget] = useState(null)
  const [resolveAction, setResolveAction] = useState('')
  const [resolveForm, setResolveForm] = useState({ creditLimitPyg: '', creditDays: '', maxDiscountPyg: '', resolvedNote: '' })
  const [resolveBusy, setResolveBusy] = useState(false)
  const [identities, setIdentities] = useState([])
  const [identitiesLoading, setIdentitiesLoading] = useState(false)
  const [identitiesError, setIdentitiesError] = useState('')
  const [identityForm, setIdentityForm] = useState(null)
  const [identityBusy, setIdentityBusy] = useState(false)
  // Portal del cliente: enlace/QR por nivel con el resumen de su cuenta.
  const [portal, setPortal] = useState(null)
  const [portalNivel, setPortalNivel] = useState('rapido')
  const [portalQr, setPortalQr] = useState('')
  const [portalBusy, setPortalBusy] = useState(false)
  const [portalMsg, setPortalMsg] = useState('')
  const [portalError, setPortalError] = useState('')
  const [confirmarRegenerar, setConfirmarRegenerar] = useState(false)
  // Fidelización: saldo de puntos, historial y canje como saldo a favor.
  const [loyalty, setLoyalty] = useState(null)
  const [loyaltyLoading, setLoyaltyLoading] = useState(false)
  const [loyaltyError, setLoyaltyError] = useState('')
  const [loyaltyRevision, setLoyaltyRevision] = useState(0)
  const [canjeAbierto, setCanjeAbierto] = useState(false)
  const [canjePuntos, setCanjePuntos] = useState('')
  const [canjeBusy, setCanjeBusy] = useState(false)

  useEffect(() => {
    if (!open || !customer?.id) return undefined
    let active = true
    setLoading(true)
    setError('')
    setTimeline([])
    setTimelineError('')
    setProfile(null)
    setNewNote('')
    setEditingNote(null)
    setFollowForm({ kind: 'CALL', dueAt: '', note: '' })
    // Modo demo (#189): la ficha se arma con los datos del navegador; no hay
    // pedidos, deuda, cronología ni portal y nada de esto pega al API real.
    if (esDemo) {
      const demoPerfil = buildDemoProfile(customer)
      setProfile(demoPerfil)
      setIdentities(demoPerfil.billingIdentities)
      setTimeline(buildDemoTimeline(customer))
      setAnalitica(buildDemoAnalytics(customer))
      setLoading(false)
      return () => { active = false }
    }
    api
      .get(`/api/customers/${customer.id}`)
      .then((data) => { if (active) { setProfile(data); setLoading(false) } })
      .catch((cause) => {
        if (active) setError(cause?.message || 'No se pudo cargar el perfil del cliente.')
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [open, customer?.id, customer, esDemo, revision])

  // Cada apertura (u otro cliente) arranca en el resumen.
  useEffect(() => {
    if (open) setTab('resumen')
  }, [open, customer?.id, setTab])

  // Solicitudes comerciales del cliente (mayorista, crédito, plazo).
  useEffect(() => {
    if (!open || !customer?.id || esDemo) return undefined
    let active = true
    setAuthLoading(true)
    setAuthError('')
    api
      .get(`/api/authorizations?customerId=${encodeURIComponent(customer.id)}`)
      .then((data) => { if (active) { setAuthorizations(Array.isArray(data) ? data : []); setAuthLoading(false) } })
      .catch((cause) => {
        if (active) setAuthError(cause?.message || 'No se pudieron cargar las solicitudes.')
        if (active) setAuthLoading(false)
      })
    return () => { active = false }
  }, [open, customer?.id, revision, esDemo])

  // Identidades de facturación: se piden al abrir la pestaña Datos.
  useEffect(() => {
    if (!open || !customer?.id || tab !== 'datos' || esDemo) return undefined
    let active = true
    setIdentitiesLoading(true)
    setIdentitiesError('')
    api
      .get(`/api/customers/${customer.id}/billing-identities`)
      .then((data) => { if (active) { setIdentities(Array.isArray(data) ? data : []); setIdentitiesLoading(false) } })
      .catch((cause) => {
        if (active) setIdentitiesError(cause?.message || 'No se pudieron cargar las identidades de facturación.')
        if (active) setIdentitiesLoading(false)
      })
    return () => { active = false }
  }, [open, customer?.id, tab, revision, esDemo])

  // Fidelización: se pide al abrir la pestaña Datos y al canjear o reintentar.
  useEffect(() => {
    if (!open || !customer?.id || tab !== 'datos' || esDemo) return undefined
    let active = true
    setLoyaltyLoading(true)
    setLoyaltyError('')
    api
      .get(`/api/customers/${customer.id}/loyalty`)
      .then((data) => { if (active) { setLoyalty(data); setLoyaltyLoading(false) } })
      .catch((cause) => {
        if (active) setLoyaltyError(cause?.message || 'No se pudo cargar la fidelización.')
        if (active) setLoyaltyLoading(false)
      })
    return () => { active = false }
  }, [open, customer?.id, tab, esDemo, loyaltyRevision])

  // Listas de precios de la empresa: se cargan al abrir la ficha para poder
  // asignar una a este cliente.
  useEffect(() => {
    if (!open || !customer?.id || esDemo) return undefined
    let active = true
    api.get('/api/price-lists').then((data) => { if (active) setListasPrecios(Array.isArray(data) ? data : []) }).catch(() => { if (active) setListasPrecios([]) })
    return () => { active = false }
  }, [open, customer?.id, esDemo])

  async function asignarLista(priceListId) {
    if (demoBloqueado() || !customer?.id || asignandoLista) return
    setAsignandoLista(true)
    try {
      await api.patch(`/api/customers/${encodeURIComponent(customer.id)}`, { priceListId: priceListId || null })
      toast.success(priceListId ? 'Lista de precios asignada.' : 'Lista de precios quitada.')
      refresh()
    } catch (cause) { toast.error(cause?.message || 'No se pudo asignar la lista.') } finally { setAsignandoLista(false) }
  }

  function abrirCanje() {
    setCanjePuntos('')
    setCanjeAbierto(true)
  }

  // Canje de puntos como saldo a favor: el backend re-chequea el saldo dentro
  // de la transacción; acá solo se valida antes de enviar.
  async function canjearPuntos(event) {
    event.preventDefault()
    if (demoBloqueado() || canjeBusy || !customer?.id) return
    const pointsPyg = Number(canjePuntos)
    if (!Number.isSafeInteger(pointsPyg) || pointsPyg <= 0) { toast.error('Puntos inválidos', 'Ingresá una cantidad entera de puntos.'); return }
    if (pointsPyg > puntos) { toast.error('Saldo insuficiente', `El cliente tiene ${formatGs(puntos)} en puntos.`); return }
    setCanjeBusy(true)
    try {
      const result = await api.post(`/api/customers/${encodeURIComponent(customer.id)}/loyalty`, { pointsPyg })
      toast.success('Puntos canjeados', `Se agregaron ${formatGs(pointsPyg)} de saldo a favor.`)
      setCanjeAbierto(false)
      setCanjePuntos('')
      setLoyalty((actual) => actual ? { ...actual, pointsPyg: Number(result?.pointsPyg ?? Math.max(0, actual.pointsPyg - pointsPyg)) } : actual)
      setLoyaltyRevision((value) => value + 1)
    } catch (cause) {
      toast.error('No se pudieron canjear los puntos', cause?.message)
    } finally { setCanjeBusy(false) }
  }

  // Cronología del cliente: se pide al abrir su pestaña y al reintentar. En
  // demo ya viene cargada con datos ficticios (#194): no se consulta el API.
  useEffect(() => {
    if (!open || !customer?.id || tab !== 'cronologia' || esDemo) return undefined
    let active = true
    setTimelineLoading(true)
    setTimelineError('')
    setTimelineNext(null)
    api
      .get(`/api/customers/${customer.id}/timeline?limit=20`)
      .then((data) => { if (active) { setTimeline(Array.isArray(data?.events) ? data.events : []); setTimelineNext(data?.nextCursor || null); setTimelineLoading(false) } })
      .catch((cause) => {
        if (active) setTimelineError(cause?.message || 'No se pudo cargar la cronología.')
        if (active) setTimelineLoading(false)
      })
    return () => { active = false }
  }, [open, customer?.id, tab, timelineRevision, esDemo])

  async function cargarMasTimeline() {
    if (timelineCargandoMas || !timelineNext || !customer?.id) return
    setTimelineCargandoMas(true)
    try {
      const data = await api.get(`/api/customers/${customer.id}/timeline?limit=20&cursor=${encodeURIComponent(timelineNext)}`)
      setTimeline((actual) => [...actual, ...(Array.isArray(data?.events) ? data.events : [])])
      setTimelineNext(data?.nextCursor || null)
    } catch (cause) {
      toast.error('No se pudo cargar más actividad', cause?.message)
    } finally { setTimelineCargandoMas(false) }
  }

  // Listas de precios activas: se piden al abrir la pestaña Datos.
  useEffect(() => {
    if (!open || tab !== 'datos' || esDemo) return undefined
    let active = true
    api
      .get('/api/price-lists')
      .then((data) => { if (active) setListas(Array.isArray(data) ? data.filter((lista) => lista.isActive) : []) })
      .catch(() => { if (active) setListas([]) })
    return () => { active = false }
  }, [open, tab, esDemo])

  const refresh = () => setRevision((value) => value + 1)
  const phone = profile?.customer?.phone || customer?.phone || ''
  const documentValue = profile?.customer?.document || customer?.document || ''
  const orders = profile?.orders || []
  const warranties = profile?.warranties || []
  const notes = profile?.notes || []
  const followUps = profile?.followUps || []
  const mayorista = (profile?.customer?.pricingTier || customer?.pricingTier) === 'WHOLESALE'
  const puedeAsignarLista = ['ADMIN', 'GERENTE'].includes(usuario?.role)
  const clienteCredito = profile?.customer?.creditLimitPyg ?? customer?.creditLimitPyg ?? 0
  const clientePlazo = profile?.customer?.creditDays ?? customer?.creditDays ?? 0
  const ultimaCompra = orders.reduce((max, order) => (order.createdAt && (!max || order.createdAt > max) ? order.createdAt : max), null)
  // Total gastado como en la lista y la analítica: las ventas canceladas no cuentan.
  const totalComprado = orders.filter((order) => order.status !== 'CANCELLED').reduce((sum, order) => sum + Number(order.totalPyg || 0), 0)
  const deuda = Number(profile?.debtPyg ?? 0)
  const garantiasActivas = warranties.filter((item) => item.status !== 'DELIVERED').length
  const pendientes = authorizations.filter((row) => row.status === 'PENDING')
  const hayPendiente = (kind) => pendientes.some((row) => row.kind === kind)
  const creditoHabilitado = Number(profile?.customer?.creditLimitPyg ?? 0) > 0
  const diasCredito = profile?.customer?.creditDays
  const listaPreciosId = profile?.customer?.priceListId || customer?.priceListId || ''
  const nombreListaPrecios = listas.find((lista) => lista.id === listaPreciosId)?.name || null
  const puedeResolver = RESOLVERS.includes(usuario?.role)
  const ordenesConSaldo = orders.filter((order) => saldoOrden(order) > 0)
  const facturaActual = Boolean(profile?.customer?.billingName || profile?.customer?.billingDocument)
  const puntos = Number(loyalty?.pointsPyg ?? 0)
  const loyaltyPct = Number(loyalty?.loyaltyPct ?? 0)
  const movimientosPuntos = loyalty?.movements || []
  const puedeCanjearPuntos = Boolean(usuario && (usuario.permissions?.includes('*') || ['ADMIN', 'GERENTE'].includes(usuario.role) || usuario.permissions?.includes('orders:manage') || usuario.permissions?.includes('payments:manage')))

  const dispositivos = orders.flatMap(order => (order.items || []).flatMap(item => (item.serials || []).map(serial => ({ serial, model: item.description, date: order.createdAt, orderNumber: order.orderNumber, warranty: warranties.find(warranty => warranty.serial === serial) || null }))))
  const ordenesActivas = orders.filter((order) => order.status === 'PENDING' || order.status === 'REGISTERED').length
  const ciudadCliente = (profile?.customer?.addresses || []).find((address) => address.city)?.city || profile?.customer?.addresses?.[0]?.city || ''
  // Ficha completa (#160): antigüedad, RUC, impuestos, dirección y seguro.
  const antiguedadDiasFicha = profile?.customer?.createdAt ? Math.max(0, Math.round((Date.now() - new Date(profile.customer.createdAt).getTime()) / 86400000)) : 0
  const rucCliente = profile?.customer?.billingDocument || ''
  const direccionPrincipal = (profile?.customer?.addresses || []).find((address) => address.isDefault) || profile?.customer?.addresses?.[0] || null
  const pagaImpuestos = profile?.customer?.taxExempt !== true
  const seguroActivo = profile?.customer?.insuranceEnabled === true
  const seguroPct = profile?.customer?.insuranceRatePct !== null && profile?.customer?.insuranceRatePct !== undefined ? formatPercent(profile.customer.insuranceRatePct) : ''
  const ultimasOrdenes = orders.slice(0, 5)
  const tabCounts = { pedidos: orders.length, cronologia: timeline.length, datos: notes.length + followUps.length }

  async function saveNote(event) {
    event.preventDefault()
    const content = newNote.trim()
    if (demoBloqueado() || !content || noteBusy) return
    setNoteBusy(true)
    try {
      if (editingNote) {
        await api.patch(`/api/customers/${customer.id}/notes`, { id: editingNote.id, content })
        toast.success('Nota actualizada')
      } else {
        await api.post(`/api/customers/${customer.id}/notes`, { content })
        toast.success('Nota guardada')
      }
      setNewNote('')
      setEditingNote(null)
      refresh()
    } catch (cause) {
      toast.error('No se pudo guardar la nota', cause?.message)
    } finally {
      setNoteBusy(false)
    }
  }

  async function removeNote() {
    if (demoBloqueado() || !pendingDelete || deleteBusy) return
    setDeleteBusy(true)
    try {
      await api.delete(`/api/customers/${customer.id}/notes`, { id: pendingDelete.id })
      toast.success('Nota eliminada')
      setPendingDelete(null)
      refresh()
    } catch (cause) {
      toast.error('No se pudo eliminar la nota', cause?.message)
    } finally {
      setDeleteBusy(false)
    }
  }

  async function saveFollowUp(event) {
    event.preventDefault()
    const note = followForm.note.trim()
    if (demoBloqueado() || !note || followBusy) return
    setFollowBusy(true)
    try {
      await api.post(`/api/customers/${customer.id}/follow-ups`, { kind: followForm.kind, note, dueAt: followForm.dueAt || undefined })
      toast.success('Seguimiento agendado')
      setFollowForm({ kind: 'CALL', dueAt: '', note: '' })
      refresh()
    } catch (cause) {
      toast.error('No se pudo agendar el seguimiento', cause?.message)
    } finally {
      setFollowBusy(false)
    }
  }

  async function markDone(item) {
    if (demoBloqueado() || item.doneAt || followDoneId) return
    setFollowDoneId(item.id)
    try {
      await api.patch(`/api/customers/${customer.id}/follow-ups`, { id: item.id, doneAt: new Date().toISOString() })
      toast.success('Seguimiento marcado como hecho')
      refresh()
    } catch (cause) {
      toast.error('No se pudo actualizar el seguimiento', cause?.message)
    } finally {
      setFollowDoneId('')
    }
  }

  async function removeFollowUp() {
    if (demoBloqueado() || !pendingDelete || deleteBusy) return
    setDeleteBusy(true)
    try {
      await api.delete(`/api/customers/${customer.id}/follow-ups`, { id: pendingDelete.id })
      toast.success('Seguimiento eliminado')
      setPendingDelete(null)
      refresh()
    } catch (cause) {
      toast.error('No se pudo eliminar el seguimiento', cause?.message)
    } finally {
      setDeleteBusy(false)
    }
  }

  function abrirSolicitud(kind) {
    setRequestForm({
      creditLimitPyg: kind === 'CREDIT' ? (profile?.customer?.creditLimitPyg ?? '') : '',
      creditDays: profile?.customer?.creditDays ?? '',
      note: '',
    })
    setRequestKind(kind)
  }

  async function enviarSolicitud(event) {
    event.preventDefault()
    if (demoBloqueado() || !requestKind || requestBusy) return
    const requestedValue = {}
    if (requestKind === 'CREDIT') {
      const limit = Number(requestForm.creditLimitPyg)
      if (!Number.isSafeInteger(limit) || limit < 0) {
        toast.error('Límite inválido', 'Ingresá el límite de crédito en guaraníes.')
        return
      }
      requestedValue.creditLimitPyg = limit
    }
    if (requestForm.creditDays !== '') {
      const days = Number(requestForm.creditDays)
      if (!Number.isSafeInteger(days) || days < 0 || days > 365) {
        toast.error('Días inválidos', 'Los días de crédito deben estar entre 0 y 365.')
        return
      }
      requestedValue.creditDays = days
    } else if (requestKind === 'CREDIT_DAYS') {
      toast.error('Días obligatorios', 'Ingresá los días de crédito solicitados.')
      return
    }
    setRequestBusy(true)
    try {
      await api.post('/api/authorizations', {
        customerId: customer.id,
        kind: requestKind,
        requestedValue,
        ...(requestForm.note.trim() ? { note: requestForm.note.trim() } : {}),
      })
      toast.success('Solicitud enviada', 'Administración la revisará y resolverá.')
      setRequestKind('')
      refresh()
    } catch (cause) {
      toast.error('No se pudo enviar la solicitud', cause?.message)
    } finally {
      setRequestBusy(false)
    }
  }

  function abrirResolver(row, action) {
    const value = row.requestedValue && typeof row.requestedValue === 'object' ? row.requestedValue : {}
    setResolveForm({ creditLimitPyg: value.creditLimitPyg ?? '', creditDays: value.creditDays ?? '', maxDiscountPyg: value.discountPyg ?? '', resolvedNote: '' })
    setResolveAction(action)
    setResolveTarget(row)
  }

  async function confirmarResolver() {
    if (demoBloqueado() || !resolveTarget || resolveBusy) return
    if (resolveAction === 'reject' && !resolveForm.resolvedNote.trim()) {
      toast.error('Motivo obligatorio', 'Contale al vendedor por qué se rechaza.')
      return
    }
    const body = {
      id: resolveTarget.id,
      action: resolveAction,
      ...(resolveForm.resolvedNote.trim() ? { resolvedNote: resolveForm.resolvedNote.trim() } : {}),
    }
    if (resolveAction === 'approve' && resolveTarget.kind !== 'WHOLESALE') {
      const resolvedValue = {}
      if (resolveTarget.kind === 'CREDIT') {
        const limit = Number(resolveForm.creditLimitPyg)
        if (!Number.isSafeInteger(limit) || limit < 0) {
          toast.error('Límite inválido', 'Ingresá el límite de crédito autorizado.')
          return
        }
        resolvedValue.creditLimitPyg = limit
      }
      if (resolveTarget.kind === 'DISCOUNT') {
        const max = Number(resolveForm.maxDiscountPyg)
        if (!Number.isSafeInteger(max) || max < 0 || max > 100000000) {
          toast.error('Monto inválido', 'El descuento máximo debe ser un entero entre 0 y 100.000.000.')
          return
        }
        resolvedValue.maxDiscountPyg = max
      }
      if (resolveForm.creditDays !== '') {
        const days = Number(resolveForm.creditDays)
        if (!Number.isSafeInteger(days) || days < 0 || days > 365) {
          toast.error('Días inválidos', 'Los días autorizados deben estar entre 0 y 365.')
          return
        }
        resolvedValue.creditDays = days
      } else if (resolveTarget.kind === 'CREDIT_DAYS') {
        toast.error('Días obligatorios', 'Ingresá los días autorizados (pueden ser menos de los pedidos).')
        return
      }
      body.resolvedValue = resolvedValue
    }
    setResolveBusy(true)
    try {
      await api.patch('/api/authorizations', body)
      toast.success(resolveAction === 'approve' ? 'Solicitud aprobada' : 'Solicitud rechazada', resolveAction === 'approve' ? 'El cliente quedó con la condición autorizada.' : undefined)
      setResolveTarget(null)
      refresh()
    } catch (cause) {
      toast.error('No se pudo resolver la solicitud', cause?.message)
    } finally {
      setResolveBusy(false)
    }
  }

  function abrirIdentidad(identity) {
    setIdentityForm(identity ? { id: identity.id, name: identity.name, document: identity.document } : { name: '', document: '' })
  }

  async function guardarIdentidad(event) {
    event.preventDefault()
    if (demoBloqueado() || !identityForm || identityBusy) return
    const name = identityForm.name.trim()
    const document = identityForm.document.trim()
    if (!name || !document) {
      toast.error('Datos incompletos', 'La razón social y el RUC son obligatorios.')
      return
    }
    setIdentityBusy(true)
    try {
      if (identityForm.id) {
        await api.patch(`/api/customers/${customer.id}/billing-identities`, { id: identityForm.id, name, document })
        toast.success('Identidad actualizada')
      } else {
        await api.post(`/api/customers/${customer.id}/billing-identities`, { name, document })
        toast.success('Identidad agregada')
      }
      setIdentityForm(null)
      refresh()
    } catch (cause) {
      toast.error('No se pudo guardar la identidad', cause?.message)
    } finally {
      setIdentityBusy(false)
    }
  }

  async function usarComoActual(identity) {
    if (demoBloqueado() || identityBusy) return
    setIdentityBusy(true)
    try {
      await api.patch(`/api/customers/${customer.id}/billing-identities`, { id: identity.id, useAsCurrent: true })
      toast.success('Facturación actualizada', `Ahora factura a ${identity.name}.`)
      refresh()
    } catch (cause) {
      toast.error('No se pudo actualizar la facturación', cause?.message)
    } finally {
      setIdentityBusy(false)
    }
  }

  async function removeBillingIdentity() {
    if (demoBloqueado() || !pendingDelete || deleteBusy) return
    setDeleteBusy(true)
    try {
      await api.delete(`/api/customers/${customer.id}/billing-identities?id=${encodeURIComponent(pendingDelete.id)}`)
      toast.success('Identidad eliminada')
      setPendingDelete(null)
      refresh()
    } catch (cause) {
      toast.error('No se pudo eliminar la identidad', cause?.message)
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={() => { if (!requestKind && !resolveTarget && !identityForm && !portal && !confirmarRegenerar) onClose() }} title={`Cliente: ${customer?.name || ''}`} size="amplio">
      {loading && (
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-10 w-2/3" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
          <Skeleton className="h-48 w-full" />
        </div>
      )}
      {!loading && error && (
        <EmptyState
          icon="alert"
          title="No se pudo abrir el perfil"
          description={error}
          action={<Button onClick={refresh}>Reintentar</Button>}
        />
      )}
      {!loading && !error && profile && (
        <div className="space-y-5">
          {esDemo && (
            <p role="status" className="rounded-xl border border-warn/30 bg-warn/5 px-3 py-2 text-xs text-warn">
              Modo demo: esta ficha usa los datos cargados en tu navegador. No hay pedidos, pagos, deuda, cronología ni portal, y las acciones están deshabilitadas.
            </p>
          )}
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-lg font-bold">{profile.customer?.name || customer?.name}</h3>
              <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-mute">
                {documentValue && <span>{documentValue}</span>}
                {(phone || profile?.customer?.phone) && <span className="tabular-nums">{telefonoVisible(phone, profile?.customer?.countryCode || customer?.countryCode)}</span>}
                {profile.customer?.email && <span className="truncate">{profile.customer.email}</span>}
                {ciudadCliente && <span className="truncate">{ciudadCliente}</span>}
              </p>
              <p className="mt-1 text-xs text-mute">
                Cliente desde {profile.customer?.createdAt ? fechaHora(profile.customer.createdAt) : '—'} · Creado por {profile.customer?.createdBy?.name || 'Sistema'}
              </p>
              {(profile.customer?.billingName || profile.customer?.billingDocument) && (
                <p className="mt-1 text-xs text-mute">
                  Factura a: <b className="text-fore">{profile.customer.billingName || 'Sin razón social'}</b>
                  {profile.customer.billingDocument ? ` · RUC ${profile.customer.billingDocument}` : ''}
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge color={mayorista ? 'orange' : 'slate'}>{mayorista ? 'Mayorista' : 'Cliente final'}</Badge>
                {profile.customer?.taxExempt && <Badge color="blue">Exento de impuestos</Badge>}
                {profile.customer?.acceptsWhatsappMarketing && <Badge color="green">WhatsApp marketing</Badge>}
                {profile.customer?.acceptsSmsMarketing && <Badge color="green">SMS marketing</Badge>}
                {profile.customer?.acceptsEmailMarketing && <Badge color="green">Email marketing</Badge>}
                {(profile.customer?.tags || []).map((tag) => <Badge key={tag} color="slate">{tag}</Badge>)}
              </div>
            </div>
            <span className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" className="h-9 px-3 text-xs" onClick={abrirPortal}>
                <Icon name="external" className="h-4 w-4" />
                Portal del cliente{esDemo ? ' (demo)' : ''}
              </Button>
              {phone && (
                <span className="inline-flex items-center gap-1 rounded-lg border border-ok/30 bg-ok/5 px-1.5 py-0.5">
                  <WhatsAppMenu
                    telefono={phone}
                    countryCode={profile.customer?.countryCode || customer?.countryCode}
                    category="CUSTOMERS"
                    storageKey="mobos:clientes:plantilla-wa"
                    title={profile.customer?.name || customer?.name}
                    plantillas={esDemo ? DEMO_MESSAGE_TEMPLATES : undefined}
                    contexto={{
                      cliente: profile.customer?.name || customer?.name || '',
                      nombre: profile.customer?.name || customer?.name || '',
                      saldo_pendiente: deuda > 0 ? formatGs(deuda) : '',
                      producto: dispositivos[0]?.model || '',
                      ultima_compra: ultimaCompra ? fecha(ultimaCompra) : '',
                    }}
                  />
                </span>
              )}
            </span>
          </header>

          {tab === 'resumen' && (
          <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <div className="rounded-xl border border-ink-600 bg-ink-800 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-mute">Total gastado</p>
              <p className="mt-1 text-lg font-semibold text-fore">{formatGs(totalComprado)}</p>
            </div>
            <div className={cn('rounded-xl border p-3', deuda > 0 ? 'border-warn/40 bg-warn/5' : 'border-ink-600 bg-ink-800')}>
              <p className="text-[11px] font-medium uppercase tracking-wider text-mute">Saldo pendiente</p>
              <div className="mt-1 flex items-center gap-2">
                <p className={cn('text-lg font-semibold', deuda > 0 ? 'text-warn' : 'text-fore')}>{formatGs(deuda)}</p>
                <Badge color={deuda > 0 ? 'red' : 'green'}>{deuda > 0 ? 'Deuda' : 'Al día'}</Badge>
              </div>
            </div>
            <div className={cn('rounded-xl border p-3', ordenesActivas > 0 ? 'border-fono/40 bg-fono/5' : 'border-ink-600 bg-ink-800')}>
              <p className="text-[11px] font-medium uppercase tracking-wider text-mute">Órdenes activas</p>
              <p className="mt-1 text-lg font-semibold text-fore">{ordenesActivas}</p>
            </div>
            <div className="rounded-xl border border-ink-600 bg-ink-800 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-mute">Pedidos</p>
              <p className="mt-1 text-lg font-semibold text-fore">{orders.length}</p>
            </div>
            <div className="rounded-xl border border-ink-600 bg-ink-800 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-mute">Última compra</p>
              <p className="mt-1 text-sm font-semibold text-fore">{ultimaCompra ? fecha(ultimaCompra) : 'Sin compras'}</p>
            </div>
            {warranties.length > 0 && (
              <div className={cn('rounded-xl border p-3', garantiasActivas > 0 ? 'border-fono/40 bg-fono/5' : 'border-ink-600 bg-ink-800')}>
                <p className="text-[11px] font-medium uppercase tracking-wider text-mute">Garantías activas</p>
                <p className="mt-1 text-lg font-semibold text-fore">{garantiasActivas}</p>
              </div>
            )}
          </div>

          <div className="grid gap-2 rounded-xl border border-ink-600 bg-ink-800 p-3 text-sm sm:grid-cols-2 lg:grid-cols-4" data-testid="perfil-datos-clave">
            <p><span className="text-mute">Antigüedad:</span> <b>{antiguedadTexto(antiguedadDiasFicha)}</b></p>
            <p><span className="text-mute">RUC:</span> <b>{rucCliente || '—'}</b></p>
            <p><span className="text-mute">Paga impuestos:</span> <b>{pagaImpuestos ? 'Sí' : 'No (exento)'}</b></p>
            <p><span className="text-mute">Seguro:</span> <b>{seguroActivo ? `Activo${seguroPct ? ` · ${seguroPct}%` : ' · % de la empresa'}` : 'Inactivo'}</b></p>
            <p className="min-w-0 truncate sm:col-span-2 lg:col-span-4" title={direccionPrincipal?.address || ''}>
              <span className="text-mute">Dirección:</span> <b>{direccionPrincipal ? `${direccionPrincipal.address}${direccionPrincipal.city ? ` · ${direccionPrincipal.city}` : ''}` : '—'}</b>
            </p>
            <p className="flex flex-wrap items-center gap-1.5 sm:col-span-2 lg:col-span-4">
              <span className="text-mute">Etiquetas:</span>
              {(profile.customer?.tags || []).length
                ? (profile.customer.tags || []).map((tag) => <Badge key={tag} color="slate" className="w-fit whitespace-nowrap px-1.5 py-0 text-[10px]">{tag}</Badge>)
                : <span className="text-mute">Sin etiquetas</span>}
            </p>
          </div>

          {orders.length > 0 && (
            <div className="rounded-xl border border-ink-600 bg-ink-800 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-medium uppercase tracking-wider text-mute">Últimas órdenes</p>
                <button type="button" className="text-xs font-semibold text-fono-light transition hover:underline" onClick={() => setTab('pedidos')}>Ver todas ({orders.length})</button>
              </div>
              <ul className="mt-1 space-y-1 text-sm">
                {ultimasOrdenes.map((order) => (
                  <li key={order.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 truncate"><b>{codigoPedido(order.orderNumber) || 'Pedido'}</b> <span className="text-xs text-mute">{fecha(order.createdAt)}</span></span>
                    <span className="flex items-center gap-2"><span className="tabular-nums text-mute">{formatGs(order.totalPyg)}</span>{STATUS_BADGE(ORDER_STATUS, order.status)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {deuda > 0 && (
            <div className="rounded-xl border border-warn/30 bg-warn/5 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-warn">Saldo pendiente: {formatGs(deuda)}</p>                <Badge color="red">{ordenesConSaldo.length} {ordenesConSaldo.length === 1 ? 'pedido' : 'pedidos'}</Badge>
              </div>
              <div className="mt-2 overflow-x-auto" data-testid="perfil-deuda">
                <div className={cn(GRID_DEUDA, 'px-1 pb-1 pt-1')}>
                  <span className={CELDA_ENCABEZADO}>Pedido</span>
                  <span className={CELDA_ENCABEZADO}>Fecha</span>
                  <span className={cn(CELDA_ENCABEZADO, 'text-right')}>Total</span>
                  <span className={cn(CELDA_ENCABEZADO, 'text-right')}>Pagado</span>
                  <span className={cn(CELDA_ENCABEZADO, 'text-right')}>Saldo</span>
                </div>
                <div className="space-y-0.5">
                  {ordenesConSaldo.map((order) => (
                    <div key={order.id} data-testid="perfil-deuda-fila" className={cn(GRID_DEUDA, 'rounded-lg px-1 py-1.5 text-sm')}>
                      <span className="truncate font-medium" title={codigoPedido(order.orderNumber) || undefined}>{codigoPedido(order.orderNumber) || 'Pedido'}</span>
                      <span className={CELDA_DATO}>{fecha(order.createdAt)}</span>
                      <CeldaMoneda valor={order.totalPyg} tono="mute" className="truncate" />
                      <CeldaMoneda valor={pagadoOrden(order)} tono="ok" className="truncate" />
                      <CeldaMoneda valor={saldoOrden(order)} tono="warn" className="truncate" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {!esDemo && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-600 bg-ink-800 p-3">
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wider text-mute">Configuración comercial</p>
                <p className="mt-1 text-sm">
                  {mayorista ? 'Mayorista' : 'Cliente final'}
                  {Number(clienteCredito || 0) > 0 ? ` · crédito ${formatGs(Number(clienteCredito))}` : ' · sin crédito'}
                  {clientePlazo ? ` · ${clientePlazo} días` : ''}
                </p>
              </div>
              <span className="flex flex-wrap gap-2">
                {!mayorista && !hayPendiente('WHOLESALE') && (
                  <Button type="button" variant="outline" className="h-9 px-3 text-xs" disabled={esDemo} onClick={() => setSolicitud('WHOLESALE')}>
                    <Icon name="tag" className="h-4 w-4" />
                    Solicitar mayorista
                  </Button>
                )}
                {!creditoHabilitado && !hayPendiente('CREDIT') && (
                  <Button type="button" variant="outline" className="h-9 px-3 text-xs" disabled={esDemo} onClick={() => abrirSolicitud('CREDIT')}>
                    <Icon name="wallet" className="h-4 w-4" />
                    Solicitar crédito
                  </Button>
                )}
                {creditoHabilitado && !hayPendiente('CREDIT_DAYS') && (
                  <Button type="button" variant="outline" className="h-9 px-3 text-xs" disabled={esDemo} onClick={() => abrirSolicitud('CREDIT_DAYS')}>
                    <Icon name="clock" className="h-4 w-4" />
                    Solicitar días
                  </Button>
                )}
              </span>
              {puedeAsignarLista && <div className="w-full border-t border-ink-600 pt-2">
                <label className="block text-xs text-mute" htmlFor="cliente-lista-precios">Lista de precios</label>
                <Select id="cliente-lista-precios" className="mt-1 max-w-xs" value={profile?.customer?.priceListId || customer?.priceListId || ''} disabled={asignandoLista} onChange={(event) => asignarLista(event.target.value)}>
                  <option value="">Sin lista (mayorista o minorista)</option>
                  {listasPrecios.map(lista => <option key={lista.id} value={lista.id}>{lista.name}</option>)}
                </Select>
                <p className="mt-1 text-xs text-mute">Con lista asignada, sus ítems ganan sobre el precio mayorista o minorista en los productos que cubren.</p>
              </div>}
            </div>
          )}
          </>
          )}

          <div className="flex gap-2 overflow-x-auto" role="tablist">
            {TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={tab === item.key}
                onClick={() => setTab(item.key)}
                className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition ${tab === item.key ? 'bg-fono/15 text-fono-light' : 'text-mute hover:bg-ink-700 hover:text-fore'}`}
              >
                {item.label}
                {tabCounts[item.key] !== undefined && ` (${tabCounts[item.key]})`}
              </button>
            ))}
          </div>

          {tab === 'pedidos' && (
            <>
              <p className="text-sm font-semibold">Pedidos</p>
              {!orders.length ? (
                <EmptyState compact icon="receipt" title="Sin compras registradas" description="Las órdenes de esta sucursal aparecerán acá." />
              ) : (
                <DataTable
                  columns={[
                    { key: 'createdAt', label: 'Fecha', render: (row) => <span className="text-mute">{fecha(row.createdAt)}</span> },
                    { key: 'orderNumber', label: 'N.º', render: (row) => <span className="font-medium">{codigoPedido(row.orderNumber) || '—'}</span> },
                    { key: 'status', label: 'Estado', render: (row) => <div className="flex flex-col gap-1">{STATUS_BADGE(ORDER_STATUS, row.status)}{FULFILLMENT_STATUS[row.fulfillmentStatus] && <span className="text-[11px] text-mute">{FULFILLMENT_STATUS[row.fulfillmentStatus].label}</span>}</div> },
                    { key: 'totalPyg', label: 'Total', align: 'right', render: (row) => formatGs(row.totalPyg) },
                    { key: 'paidPyg', label: 'Pagado', align: 'right', render: (row) => <span className="text-ok">{formatGs(pagadoOrden(row))}</span> },
                    { key: 'balancePyg', label: 'Saldo', align: 'right', render: (row) => <span className={saldoOrden(row) > 0 ? 'text-warn' : ''}>{formatGs(saldoOrden(row))}</span> },
                  ]}
                  rows={orders}
                  mobileCard={(row) => (
                    <div className="rounded-xl border border-ink-600 bg-ink-800 p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <b>{codigoPedido(row.orderNumber) || '—'}</b>
                        {STATUS_BADGE(ORDER_STATUS, row.status)}
                      </div>
                      <p className="mt-1 text-xs text-mute">{fecha(row.createdAt)}{row.branch?.name ? ` · ${row.branch.name}` : ''}</p>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        <span className="text-mute">Total <b className="text-fore">{formatGs(row.totalPyg)}</b></span>
                        <span className="text-mute">Pagado <b className="text-ok">{formatGs(pagadoOrden(row))}</b></span>
                        <span className="text-mute">Saldo <b className={saldoOrden(row) > 0 ? 'text-warn' : 'text-fore'}>{formatGs(saldoOrden(row))}</b></span>
                      </div>
                    </div>
                  )}
                />
              )}
            </>
          )}

          {tab === 'pedidos' && (
            <>
              <p className="text-sm font-semibold">Equipos con IMEI/serial</p>
              {!dispositivos.length ? (
                <EmptyState compact icon="phone" title="Sin dispositivos registrados" description="Los equipos con IMEI/serial comprados por este cliente aparecen acá." />
              ) : (
                <div className="overflow-x-auto" data-testid="perfil-dispositivos">
                  <div className={cn(GRID_DISPOSITIVOS, 'px-3.5 pb-2 pt-1')}>
                    <span className={CELDA_ENCABEZADO}>Equipo</span>
                    <span className={CELDA_ENCABEZADO}>IMEI</span>
                    <span className={CELDA_ENCABEZADO}>Comprado</span>
                    <span className={CELDA_ENCABEZADO}>Pedido</span>
                    <span className={CELDA_ENCABEZADO}>Garantía</span>
                    <span className={cn(CELDA_ENCABEZADO, 'text-right')}>Acciones</span>
                  </div>
                  <div className="space-y-1">
                  {dispositivos.map((device) => {
                    const vence = device.warranty?.expiresAt ? new Date(device.warranty.expiresAt) : null
                    const dias = vence ? Math.max(0, Math.ceil((vence.getTime() - Date.now()) / 86400000)) : null
                    const serial = String(device.serial || '')
                    return (
                      <div key={`${device.serial}-${device.orderNumber}`} data-testid="perfil-dispositivo-fila" className={cn(GRID_DISPOSITIVOS, 'rounded-xl border border-ink-600 bg-ink-800 px-3.5 py-2')}>
                        <span className={CELDA_IDENTIDAD} title={device.model || undefined}>{device.model || 'Equipo'}</span>
                        <span className="min-w-0 truncate font-mono text-[11px] text-mute" title={serial}><SerialTexto serial={serial} /></span>
                        <span className={CELDA_DATO}>{fecha(device.date)}</span>
                        <span className={CELDA_DATO}>{device.orderNumber ? codigoPedido(device.orderNumber) : '—'}</span>
                        <span className="min-w-0">{vence ? <Badge color={dias === 0 ? 'red' : dias <= 15 ? 'orange' : 'green'} className="w-fit whitespace-nowrap px-1.5 py-0.5 text-[10px]">{dias === 0 ? 'Vencida' : `${dias} días`}</Badge> : <Badge color="slate" className="w-fit whitespace-nowrap px-1.5 py-0.5 text-[10px]">Sin garantía</Badge>}</span>
                        <span className="flex items-center justify-end gap-1.5">
                          {device.serial && <button type="button" className="whitespace-nowrap rounded-lg border border-fono/40 px-2.5 py-1 text-xs font-semibold text-fono-light transition hover:bg-fono/10" onClick={() => setImeiDe(device)}>Verificación IMEI</button>}
                          {device.warranty?.publicToken && <a className="whitespace-nowrap rounded-lg border border-fono/40 px-2.5 py-1 text-xs font-semibold text-fono-light" href={`${window.location.origin}/garantia/${device.warranty.publicToken}`} target="_blank" rel="noreferrer">Ver garantía</a>}
                        </span>
                      </div>
                    )
                  })}
                  </div>
                </div>
              )}
            </>
          )}

          {tab === 'pedidos' && (
            <>
              <p className="text-sm font-semibold">Garantías</p>
              {!warranties.length ? (
                <EmptyState compact icon="package" title="Sin garantías" description="No hay casos de garantía asociados a este cliente." />
              ) : (
                <div className="overflow-x-auto" data-testid="perfil-garantias">
                  <div className={cn(GRID_GARANTIAS_CLI, 'px-3.5 pb-2 pt-1')}>
                    <span className={CELDA_ENCABEZADO}>Caso</span>
                    <span className={CELDA_ENCABEZADO}>Serial</span>
                    <span className={CELDA_ENCABEZADO}>Fecha</span>
                    <span className={CELDA_ENCABEZADO}>Estado</span>
                  </div>
                  <div className="space-y-1">
                  {warranties.map((item) => (
                    <div key={item.id} data-testid="perfil-garantia-fila" className={cn(GRID_GARANTIAS_CLI, 'rounded-xl border border-ink-600 bg-ink-800 px-3.5 py-2')}>
                      <span className={CELDA_IDENTIDAD} title={item.description || undefined}>{item.description || 'Garantía'}</span>
                      <span className="min-w-0"><SerialTexto serial={item.serial} className="truncate text-[11px] text-mute" /></span>
                      <span className={CELDA_DATO}>{fecha(item.createdAt)}</span>
                      <span className="min-w-0">{STATUS_BADGE(WARRANTY_STATUS, item.status)}</span>
                    </div>
                  ))}
                  </div>
                </div>
              )}
            </>
          )}

          {tab === 'datos' && (
            <div className={GRILLA_DOS_COLUMNAS}>
              <div className="rounded-xl border border-warn/30 bg-warn/5 p-3">
                <Label>Nota interna <span className="text-mute">(solo equipo, nunca visible al cliente)</span></Label>
                <Textarea rows={3} aria-label="Nota interna" value={notaInterna} disabled={esDemo} onChange={event => setNotaInterna(event.target.value)} placeholder="Raya lateral, trato especial, observaciones…" autoCapitalize="sentences" />
              </div>
              <div className="rounded-xl border border-ok/30 bg-ok/5 p-3">
                <Label>Nota pública <span className="text-mute">(visible al cliente)</span></Label>
                <Textarea rows={3} aria-label="Nota pública" value={notaPublica} onChange={event => setNotaPublica(event.target.value)} placeholder="Información que puede ir en comprobantes o mensajes" autoCapitalize="sentences" />
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <Button type="button" variant="outline" disabled={esDemo || guardandoNotas} onClick={guardarNotas}>{guardandoNotas ? 'Guardando…' : 'Guardar notas'}</Button>
              </div>
            </div>
          )}

          {tab === 'cronologia' && (
            <div className="space-y-4">
              <p className="text-sm font-semibold">Comentarios internos <span className="font-normal text-mute">(nunca visibles al cliente)</span></p>
              <form onSubmit={saveNote} className="space-y-3">
                <FormField label={editingNote ? 'Editar comentario' : 'Nuevo comentario'} htmlFor="profile-note">
                  <Textarea id="profile-note" rows={3} maxLength={2000} placeholder="Observación interna del equipo sobre este cliente…" value={newNote} onChange={(event) => setNewNote(event.target.value)} />
                </FormField>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="submit" disabled={esDemo || noteBusy || !newNote.trim()}>{noteBusy ? 'Guardando…' : editingNote ? 'Guardar cambios' : 'Agregar comentario'}</Button>
                  {editingNote && <Button type="button" variant="ghost" onClick={() => { setEditingNote(null); setNewNote('') }}>Cancelar</Button>}
                </div>
              </form>
              {!notes.length ? (
                <EmptyState compact icon="edit" title="Sin comentarios" description="Guardá observaciones internas sobre este cliente (solo las ve el equipo)." />
              ) : (
                <ul className="space-y-2" data-testid="perfil-notas">
                  {notes.map((item) => (
                    <li key={item.id} className="rounded-xl border border-ink-600 bg-ink-800 p-3 text-sm">
                      <p className="whitespace-pre-wrap break-words">{item.content}</p>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="flex items-center gap-1.5 text-xs text-mute" title={item.user?.name || 'Equipo'}><ActorAvatar user={item.user} hasAvatar={item.user?.hasAvatar === true} size="sm" /> <span>{item.user?.name || 'Equipo'}</span> · {fechaHora(item.createdAt)}</p>
                        <div className="flex gap-2">
                          <button type="button" disabled={esDemo} className="text-xs font-semibold text-fono-light disabled:opacity-40" onClick={() => { setEditingNote(item); setNewNote(item.content) }}>Editar</button>
                          <button type="button" disabled={esDemo} className="text-xs font-semibold text-bad disabled:opacity-40" onClick={() => setPendingDelete({ type: 'note', id: item.id })}>Eliminar</button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {tab === 'estadisticas' && (
            <div className="space-y-3">
              {esDemo && <p className="text-sm text-mute">Las estadísticas se calculan con las ventas reales de la tienda.</p>}
              {cargandoAnalitica && <Skeleton className="h-24 w-full" />}
              {!cargandoAnalitica && analitica && (
                <>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    <div className="rounded-xl border border-ink-600 p-3"><p className="text-[11px] uppercase tracking-wider text-mute">Compras</p><p className="mt-1 text-lg font-bold">{analitica.ordersCount}</p></div>
                    <div className="rounded-xl border border-ink-600 p-3"><p className="text-[11px] uppercase tracking-wider text-mute">Total gastado</p><p className="mt-1 text-lg font-bold">{formatGs(analitica.totalPyg)}</p></div>
                    <div className="rounded-xl border border-ink-600 p-3"><p className="text-[11px] uppercase tracking-wider text-mute">Ticket promedio</p><p className="mt-1 text-lg font-bold">{formatGs(analitica.avgTicketPyg)}</p></div>
                    <div className="rounded-xl border border-ink-600 p-3"><p className="text-[11px] uppercase tracking-wider text-mute">Compras por mes</p><p className="mt-1 text-lg font-bold">{analitica.purchasesPerMonth || 0}</p></div>
                    <div className="rounded-xl border border-ink-600 p-3"><p className="text-[11px] uppercase tracking-wider text-mute">Gasto por mes</p><p className="mt-1 text-lg font-bold">{formatGs(analitica.spendPerMonthPyg || 0)}</p></div>
                    <div className="rounded-xl border border-ink-600 p-3"><p className="text-[11px] uppercase tracking-wider text-mute">Frecuencia</p><p className="mt-1 text-lg font-bold">{frecuenciaTexto(analitica.frequencyDays)}</p></div>
                    <div className="rounded-xl border border-ink-600 p-3"><p className="text-[11px] uppercase tracking-wider text-mute">Primera compra</p><p className="mt-1 text-sm font-bold">{analitica.firstPurchaseAt ? fecha(analitica.firstPurchaseAt) : 'Sin compras'}</p></div>
                    <div className="rounded-xl border border-ink-600 p-3"><p className="text-[11px] uppercase tracking-wider text-mute">Última compra</p><p className="mt-1 text-sm font-bold">{analitica.lastPurchaseAt ? fecha(analitica.lastPurchaseAt) : 'Sin compras'}</p></div>
                    <div className="rounded-xl border border-ink-600 p-3"><p className="text-[11px] uppercase tracking-wider text-mute">Antigüedad</p><p className="mt-1 text-sm font-bold">{antiguedadTexto(analitica.antiguedadDias)}</p></div>
                  </div>
                  <div className={GRILLA_DOS_COLUMNAS_COMPACTA}>
                    <Senales titulo="Productos que más compra" items={analitica.topProducts} primario={(item) => item.description} secundario={(item) => `${item.quantity} u. · ${formatGs(item.totalPyg)}`} />
                    <Senales titulo="Modelos favoritos" items={analitica.topModels} primario={(item) => item.model} secundario={(item) => `${item.quantity} u. · ${formatGs(item.totalPyg)}`} />
                    <Senales titulo="Categorías favoritas" items={analitica.topCategories} primario={(item) => item.category} secundario={(item) => `${item.quantity} u. · ${formatGs(item.totalPyg)}`} />
                    <Senales titulo="Meses de mayor actividad" items={analitica.topMonths} primario={(item) => item.label || item.month} secundario={(item) => `${item.count} ${item.count === 1 ? 'compra' : 'compras'} · ${formatGs(item.totalPyg)}`} />
                    <Senales titulo="Días de mayor actividad" items={analitica.topWeekdays} primario={(item) => item.day} secundario={(item) => `${item.count} ${item.count === 1 ? 'compra' : 'compras'}`} />
                    <Senales titulo="Últimos meses" items={analitica.byMonth} primario={(item) => item.label || item.month} secundario={(item) => `${item.count} ${item.count === 1 ? 'compra' : 'compras'} · ${formatGs(item.totalPyg)}`} />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-600 bg-ink-800 p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex flex-wrap gap-1 rounded-xl border border-ink-600 bg-paper p-1">
                        {PERIODOS_INFORME.map((item) => (
                          <button
                            key={item.clave}
                            type="button"
                            aria-pressed={periodoInforme === item.clave}
                            onClick={() => setPeriodoInforme(item.clave)}
                            className={cn('rounded-lg px-2.5 py-1 text-xs font-semibold transition', periodoInforme === item.clave ? 'bg-fono/15 text-fono-light' : 'text-mute hover:text-fore')}
                          >
                            {item.nombre}
                          </button>
                        ))}
                      </div>
                      {periodoInforme === 'custom' && (
                        <div className="flex flex-wrap items-center gap-2">
                          <Input type="date" aria-label="Desde" className="h-9 w-auto" value={desdeInforme} onChange={(event) => setDesdeInforme(event.target.value)} />
                          <Input type="date" aria-label="Hasta" className="h-9 w-auto" value={hastaInforme} onChange={(event) => setHastaInforme(event.target.value)} />
                        </div>
                      )}
                    </div>
                    <Button type="button" variant="outline" onClick={descargarInforme} disabled={generandoInforme || !analitica.statement.length}>
                      <Icon name="download" className="h-4 w-4" />
                      {generandoInforme ? 'Generando…' : 'Descargar informe (CSV)'}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'cronologia' && (
            <div className="space-y-4">
              <p className="text-sm font-semibold">Seguimientos</p>
              <form onSubmit={saveFollowUp} className="grid gap-3 sm:grid-cols-[10rem_12rem_1fr]">
                <FormField label="Tipo" htmlFor="profile-follow-kind">
                  <Select id="profile-follow-kind" value={followForm.kind} onChange={(event) => setFollowForm({ ...followForm, kind: event.target.value })}>
                    {Object.entries(FOLLOW_UP_KINDS).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
                  </Select>
                </FormField>
                <FormField label="Para cuándo (opcional)" htmlFor="profile-follow-due">
                  <Input id="profile-follow-due" type="datetime-local" value={followForm.dueAt} onChange={(event) => setFollowForm({ ...followForm, dueAt: event.target.value })} />
                </FormField>
                <FormField label="Detalle" htmlFor="profile-follow-note">
                  <Input id="profile-follow-note" maxLength={2000} placeholder="Motivo y qué acordaste…" value={followForm.note} onChange={(event) => setFollowForm({ ...followForm, note: event.target.value })} />
                </FormField>
                <div className="sm:col-span-3"><Button type="submit" disabled={esDemo || followBusy || !followForm.note.trim()}>{followBusy ? 'Guardando…' : 'Agendar seguimiento'}</Button></div>
              </form>
              {!followUps.length ? (
                <EmptyState compact icon="calendar" title="Sin seguimientos" description="Agendá llamadas, WhatsApp o visitas para no perderle el rastro." />
              ) : (
                <div className="overflow-x-auto" data-testid="perfil-seguimientos">
                  <div className={cn(GRID_SEGUIMIENTOS, 'px-3.5 pb-2 pt-1')}>
                    <span className={CELDA_ENCABEZADO}>Tipo</span>
                    <span className={CELDA_ENCABEZADO}>Nota</span>
                    <span className={CELDA_ENCABEZADO}>Vence</span>
                    <span className={CELDA_ENCABEZADO}>Hecho</span>
                    <span className={CELDA_ENCABEZADO}>Autor</span>
                    <span className={cn(CELDA_ENCABEZADO, 'text-right')}>Acciones</span>
                  </div>
                  <div className="space-y-1">
                  {followUps.map((item) => {
                    const kind = FOLLOW_UP_KINDS[item.kind] || FOLLOW_UP_KINDS.OTHER
                    return (
                      <li key={item.id} className="rounded-xl border border-ink-600 bg-ink-800 p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge color={kind.color}>{kind.label}</Badge>
                          {item.dueAt && !item.doneAt && <Badge color="orange">Para {fechaHora(item.dueAt)}</Badge>}
                          {item.doneAt && <Badge color="green">Hecho {fechaHora(item.doneAt)}</Badge>}
                        </div>
                        <p className="mt-2 whitespace-pre-wrap break-words">{item.note}</p>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs text-mute" title={item.user?.name || 'Equipo'}><ActorAvatar user={item.user} hasAvatar={item.user?.hasAvatar === true} size="sm" /> <span>{primerNombre(item.user?.name) || 'Equipo'}</span> · {fechaHora(item.createdAt)}</p>
                          <div className="flex gap-2">
                            {!item.doneAt && <button type="button" disabled={esDemo || followDoneId === item.id} className="text-xs font-semibold text-ok disabled:opacity-40" onClick={() => markDone(item)}>{followDoneId === item.id ? 'Guardando…' : 'Marcar hecho'}</button>}
                            <button type="button" disabled={esDemo} className="text-xs font-semibold text-bad disabled:opacity-40" onClick={() => setPendingDelete({ type: 'followUp', id: item.id })}>Eliminar</button>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'datos' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-600 bg-ink-800 p-3" data-testid="perfil-seguro">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Seguro del cliente</p>
                  <p className="mt-0.5 text-xs text-mute">Con el seguro activo, sus ventas suman el porcentaje al costo real y ajustan el margen. El porcentaje de la empresa lo define Finanzas.</p>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={seguroForm.enabled}
                    disabled={esDemo || !puedeResolver || guardandoSeguro}
                    ariaLabel="Seguro del cliente activo"
                    onChange={(event) => { const next = event.target.checked; setSeguroForm((form) => ({ ...form, enabled: next })); guardarSeguro(next) }}
                  />
                  <span className={cn('text-xs font-semibold', seguroForm.enabled ? 'text-ok' : 'text-mute')}>{seguroForm.enabled ? 'Activo' : 'Inactivo'}</span>
                </div>
              </div>
              {seguroForm.enabled && (
                <div className="flex flex-wrap items-end gap-3 rounded-xl border border-ink-600 bg-ink-800 p-3">
                  <div className="w-44">
                    <FormField label="Porcentaje del cliente" htmlFor="perfil-seguro-pct" hint="Vacío = usa el de la empresa.">
                      <PercentField id="perfil-seguro-pct" value={seguroForm.pct} disabled={esDemo || !puedeResolver || guardandoSeguro} onChange={(value) => setSeguroForm((form) => ({ ...form, pct: value }))} />
                    </FormField>
                  </div>
                  {puedeResolver && <Button type="button" variant="outline" disabled={esDemo || guardandoSeguro} onClick={() => guardarSeguro(true)}>{guardandoSeguro ? 'Guardando…' : 'Guardar porcentaje'}</Button>}
                </div>
              )}
              <form onSubmit={guardarTags} className="flex flex-wrap items-end gap-3 rounded-xl border border-ink-600 bg-ink-800 p-3">
                <div className="min-w-[16rem] flex-1">
                  <FormField label="Etiquetas" htmlFor="perfil-tags" hint="Separadas por coma (hasta 20).">
                    <Input id="perfil-tags" maxLength={200} disabled={esDemo} value={tagsTexto} onChange={(event) => setTagsTexto(event.target.value)} placeholder="mayorista, prioridad" />
                  </FormField>
                </div>
                <Button type="submit" variant="outline" disabled={esDemo || guardandoTags}>{guardandoTags ? 'Guardando…' : 'Guardar etiquetas'}</Button>
              </form>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">Configuración comercial</p>
                {puedeResolver && (
                  <Button type="button" variant="outline" className="h-9 px-3 text-xs" onClick={abrirComercial}>
                    <Icon name="edit" className="h-3.5 w-3.5" />
                    Editar configuración
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-ink-600 bg-ink-800 p-3">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-mute">Tipo</p>
                  <p className="mt-1 text-sm font-semibold">{mayorista ? 'Mayorista' : 'Cliente final'}</p>
                </div>
                <div className="rounded-xl border border-ink-600 bg-ink-800 p-3">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-mute">Crédito habilitado</p>
                  <p className="mt-1 text-sm font-semibold">{creditoHabilitado ? 'Sí' : 'No'}</p>
                </div>
                <div className="rounded-xl border border-ink-600 bg-ink-800 p-3">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-mute">Días de crédito</p>
                  <p className="mt-1 text-sm font-semibold">{diasCredito === null || diasCredito === undefined ? '—' : `${diasCredito} día${Number(diasCredito) === 1 ? '' : 's'}`}</p>
                </div>
                <div className="rounded-xl border border-ink-600 bg-ink-800 p-3">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-mute">Límite</p>
                  <p className="mt-1 text-sm font-semibold">{creditoHabilitado ? formatGs(profile?.customer?.creditLimitPyg) : '—'}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-ink-600 bg-ink-800 p-3" data-testid="perfil-lista-precios">
                <div className="min-w-[16rem] flex-1">
                  <FormField
                    label="Lista de precios"
                    htmlFor="profile-lista-precios"
                    hint="La lista manda sobre el precio mayorista o minorista del producto, con sus escalones por cantidad."
                  >
                    <Select
                      id="profile-lista-precios"
                      disabled={guardandoLista || esDemo}
                      value={listaPreciosId}
                      onChange={(event) => cambiarListaPrecios(event.target.value)}
                    >
                      <option value="">Sin lista (según el tipo de cliente)</option>
                      {listas.map((lista) => <option key={lista.id} value={lista.id}>{lista.name}</option>)}
                    </Select>
                  </FormField>
                </div>
                {nombreListaPrecios && <Badge color="blue">{nombreListaPrecios}</Badge>}
              </div>

              <div>
                <p className="text-sm font-semibold">Solicitudes</p>
                {authLoading && <div className="mt-2 space-y-2" aria-busy="true"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>}
                {!authLoading && authError && <Aviso tono="error" className="mt-2">{authError}</Aviso>}
                {!authLoading && !authError && !authorizations.length && (
                  <p className="mt-2 text-xs text-mute">Sin solicitudes registradas para este cliente.</p>
                )}
                {!authLoading && !authError && authorizations.length > 0 && (
                  <ul className="mt-2 space-y-2">
                    {authorizations.map((row) => {
                      const estado = AUTH_STATUS[row.status] || { label: row.status, color: 'slate' }
                      const propia = row.requestedById === usuario?.id
                      return (
                        <li key={row.id} className={`rounded-xl border p-3 text-sm ${row.status === 'PENDING' ? 'border-warn/30 bg-warn/5' : 'border-ink-600 bg-ink-800'}`}>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge color="blue">{AUTH_KINDS[row.kind] || row.kind}</Badge>
                            <Badge color={estado.color}>{estado.label}</Badge>
                          </div>
                          <p className="mt-1 text-xs text-mute">Pedido: {resumenValor(row.kind, row.requestedValue)}</p>
                          <p className="mt-1 text-xs text-mute">Pidió {row.requestedBy?.name || 'Sistema'} · {fechaHora(row.createdAt)}</p>
                          {row.status !== 'PENDING' && (
                            <p className="mt-1 text-xs text-mute">
                              {row.status === 'APPROVED' ? 'Aprobó' : 'Rechazó'} {row.resolvedBy?.name || 'Sistema'} · {fechaHora(row.resolvedAt)}
                              {row.status === 'APPROVED' && <> · Autorizado: {resumenValor(row.kind, row.resolvedValue || row.requestedValue)}</>}
                            </p>
                          )}
                          {row.note && <p className="mt-1 text-xs text-mute">Nota: {row.note}</p>}
                          {row.resolvedNote && <p className="mt-1 text-xs text-mute">Respuesta: {row.resolvedNote}</p>}
                          {puedeResolver && row.status === 'PENDING' && !propia && (
                            <div className="mt-2 flex gap-2">
                              <button type="button" disabled={esDemo} className="text-xs font-semibold text-ok disabled:opacity-40" onClick={() => abrirResolver(row, 'approve')}>Aprobar</button>
                              <button type="button" disabled={esDemo} className="text-xs font-semibold text-bad disabled:opacity-40" onClick={() => abrirResolver(row, 'reject')}>Rechazar</button>
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}

          {tab === 'datos' && (
            <div className="space-y-4">
              <p className="text-sm font-semibold">Puntos de fidelización</p>
              {esDemo ? (
                <p className="text-sm text-mute">La fidelización se calcula con las ventas reales de la tienda.</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-ink-600 bg-ink-800 p-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-mute">Saldo de puntos</p>
                      <p className="mt-1 text-2xl font-semibold text-fore">{formatGs(puntos)}</p>
                      <p className="mt-1 text-xs text-mute">{loyaltyPct > 0 ? `Se acredita el ${loyaltyPct}% del total de cada venta (1 punto = 1 Gs.).` : 'La fidelización está apagada: activala en Configuración → Negocio.'}</p>
                    </div>
                    <Button type="button" disabled={esDemo || !puedeCanjearPuntos || puntos <= 0} onClick={abrirCanje}>Canjear como saldo a favor</Button>
                  </div>
                  {loyaltyLoading && <div className="space-y-2" aria-busy="true"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>}
                  {!loyaltyLoading && loyaltyError && (
                    <EmptyState compact icon="alert" title="No se pudo cargar la fidelización" description={loyaltyError} action={<Button onClick={() => setLoyaltyRevision((value) => value + 1)}>Reintentar</Button>} />
                  )}
                  {!loyaltyLoading && !loyaltyError && !movimientosPuntos.length && (
                    <EmptyState compact icon="wallet" title="Sin movimientos de puntos" description="Cada venta a este cliente suma puntos canjeables como saldo a favor." />
                  )}
                  {!loyaltyLoading && !loyaltyError && movimientosPuntos.length > 0 && (
                    <ul className="space-y-1" data-testid="perfil-puntos">
                      {movimientosPuntos.map((movimiento) => {
                        const tipo = LOYALTY_KINDS[movimiento.kind] || { label: movimiento.kind, color: 'slate' }
                        return (
                          <li key={movimiento.id} data-testid="perfil-punto-movimiento" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-600 bg-ink-800 px-3.5 py-2 text-sm">
                            <span className="flex min-w-0 items-center gap-2">
                              <Badge color={tipo.color}>{tipo.label}</Badge>
                              <span className={cn('min-w-0', CELDA_DATO)}>{movimiento.note || (movimiento.order?.orderNumber ? codigoPedido(movimiento.order.orderNumber) : '—')}</span>
                            </span>
                            <span className="flex items-center gap-3">
                              <span className="text-xs text-mute">{fechaHora(movimiento.createdAt)}</span>
                              <b className={cn('tabular-nums', movimiento.pointsPyg < 0 ? 'text-warn' : 'text-ok')}>{movimiento.pointsPyg > 0 ? '+' : ''}{formatGs(movimiento.pointsPyg)}</b>
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}

          {tab === 'datos' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">Direcciones</p>
                <Button type="button" variant="outline" className="h-9 px-3 text-xs" disabled={esDemo} onClick={() => abrirDireccion(null)}>
                  <Icon name="plus" className="h-3.5 w-3.5" />
                  Agregar dirección
                </Button>
              </div>
              {!direcciones.length ? (
                <EmptyState compact icon="store" title="Sin direcciones" description="Agregá las direcciones de entrega o facturación de este cliente." />
              ) : (
                <ul className="space-y-2" data-testid="perfil-direcciones">
                  {direcciones.map((address, index) => (
                    <li key={`${address.id || address.label || 'direccion'}-${index}`} className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-ink-600 bg-ink-800 p-3 text-sm">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-semibold">
                          <span className="truncate">{address.label || `Dirección ${index + 1}`}</span>
                          {address.isDefault && <Badge color="blue" className="w-fit whitespace-nowrap px-1.5 py-0 text-[10px]">Predeterminada</Badge>}
                        </p>
                        <p className="mt-0.5 break-words text-mute">
                          {address.address}
                          {address.city ? ` · ${address.city}` : ''}
                          {address.department ? ` · ${address.department}` : ''}
                          {address.country && address.country !== 'Paraguay' ? ` · ${address.country}` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button type="button" disabled={esDemo} className="text-xs font-semibold text-fono-light disabled:opacity-40" onClick={() => abrirDireccion(address, index)}>Editar</button>
                        <button type="button" disabled={esDemo} className="text-xs font-semibold text-bad disabled:opacity-40" onClick={() => setPendingDelete({ type: 'address', index })}>Eliminar</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {tab === 'datos' && (
            <div className="space-y-4">
              <p className="text-sm font-semibold">Datos de facturación</p>
              <div className="rounded-xl border border-ink-600 bg-ink-800 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-mute">Factura a otro titular</p>
                    <p className="mt-1 text-sm font-semibold">{facturaActual ? 'Sí' : 'No'}</p>
                    {facturaActual && (
                      <p className="mt-1 text-xs text-mute">
                        {profile.customer?.billingName || 'Sin razón social'}
                        {profile.customer?.billingDocument ? ` · RUC ${profile.customer.billingDocument}` : ''}
                      </p>
                    )}
                  </div>
                  <Button type="button" variant="outline" onClick={() => abrirIdentidad(null)}>
                    <Icon name="plus" className="h-4 w-4" />
                    Agregar identidad
                  </Button>
                </div>
              </div>
              {identitiesLoading && <div className="space-y-2" aria-busy="true"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>}
              {!identitiesLoading && identitiesError && (
                <EmptyState compact icon="alert" title="No se pudieron cargar las identidades" description={identitiesError} action={<Button onClick={refresh}>Reintentar</Button>} />
              )}
              {!identitiesLoading && !identitiesError && !identities.length && (
                <EmptyState compact icon="receipt" title="Sin identidades guardadas" description="Agregá la razón social y el RUC para volver a facturar a ese titular." />
              )}
              {!identitiesLoading && !identitiesError && identities.length > 0 && (
                <div className="overflow-x-auto" data-testid="perfil-facturacion">
                  <div className={cn(GRID_FACTURACION, 'px-3.5 pb-2 pt-1')}>
                    <span className={CELDA_ENCABEZADO}>Razón social</span>
                    <span className={CELDA_ENCABEZADO}>RUC</span>
                    <span className={CELDA_ENCABEZADO}>Uso</span>
                    <span className={CELDA_ENCABEZADO}>Estado</span>
                    <span className={cn(CELDA_ENCABEZADO, 'text-right')}>Acciones</span>
                  </div>
                  <div className="space-y-1">
                  {identities.map((identity) => {
                    const actual = Boolean(profile.customer?.billingDocument) && identity.document === profile.customer.billingDocument
                    const uso = Number(identity.uses || 0)
                    return (
                      <div key={identity.id} data-testid="perfil-facturacion-fila" className={cn(GRID_FACTURACION, 'rounded-xl border border-ink-600 bg-ink-800 px-3.5 py-2')}>
                        <span className={CELDA_IDENTIDAD} title={identity.name || undefined}>{identity.name || 'Sin razón social'}</span>
                        <span className="truncate text-xs tabular-nums text-mute">{identity.document || '—'}</span>
                        <span className={CELDA_DATO} title={uso ? `Utilizado en ${uso} ${uso === 1 ? 'pedido' : 'pedidos'}` : 'Todavía sin uso'}>{uso ? `${uso} ${uso === 1 ? 'pedido' : 'pedidos'}` : '—'}</span>
                        <span className="min-w-0">{actual ? <Badge color="green" className="w-fit whitespace-nowrap px-1.5 py-0.5 text-[10px]">Actual</Badge> : <span className="text-xs text-mute">—</span>}</span>
                        <span className="flex items-center justify-end gap-2">
                          {!actual && <button type="button" disabled={esDemo || identityBusy} className="whitespace-nowrap text-xs font-semibold text-ok disabled:opacity-40" onClick={() => usarComoActual(identity)}>Usar</button>}
                          <button type="button" disabled={esDemo} className="text-xs font-semibold text-fono-light disabled:opacity-40" onClick={() => abrirIdentidad(identity)}>Editar</button>
                          <button type="button" disabled={esDemo} className="text-xs font-semibold text-bad disabled:opacity-40" onClick={() => setPendingDelete({ type: 'billing', id: identity.id })}>Eliminar</button>
                        </span>
                      </div>
                    )
                  })}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'cronologia' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-mute">Alta, pedidos, entregas, pagos, saldo, comentarios, seguimientos, cambios de datos, solicitudes y autorizaciones comerciales, garantías y facturación.</p>
                <button type="button" disabled={timelineLoading} onClick={() => setTimelineRevision((value) => value + 1)} className="rounded-lg border border-ink-500 px-3 py-1.5 text-xs font-semibold text-mute transition hover:border-fono hover:text-fore disabled:opacity-40">Actualizar</button>
              </div>
              {timelineLoading && (
                <div className="space-y-2" aria-busy="true">
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                </div>
              )}
              {!timelineLoading && timelineError && (
                <EmptyState
                  compact
                  icon="alert"
                  title="No se pudo cargar la cronología"
                  description={timelineError}
                  action={<Button onClick={() => setTimelineRevision((value) => value + 1)}>Reintentar</Button>}
                />
              )}
              {!timelineLoading && !timelineError && !timeline.length && (
                <EmptyState compact icon="clock" title="Sin actividad" description="Los movimientos de este cliente aparecerán acá." />
              )}
              {!timelineLoading && !timelineError && timeline.length > 0 && (
                <ol className="space-y-2">
                  {timeline.map((event) => {
                    const estilo = EVENTOS[event.type] || { icon: 'clock', tono: 'bg-ink-700 text-mute' }
                    return (
                      <li key={event.id} className="flex gap-3 rounded-xl border border-ink-600 bg-ink-800 p-3">
                        <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${estilo.tono}`}>
                          <Icon name={estilo.icon} className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                            <p className="text-sm font-semibold">{event.label || event.action}</p>
                            <p className="text-[11px] text-mute">{fechaHora(event.createdAt)}</p>
                          </div>
                          {event.detail && <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-mute">{conCodigos(event.detail)}</p>}
                          <p className="mt-1 text-[11px] text-mute" title={event.user?.name || 'Sistema'}><ActorAvatar user={event.user} hasAvatar={event.user?.hasAvatar === true} size="sm" /> <span>{primerNombre(event.user?.name) || 'Sistema'}</span></p>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              )}
              {!timelineLoading && !timelineError && timeline.length > 0 && timelineNext && (
                <div className="flex justify-center pt-1">
                  <button type="button" disabled={timelineCargandoMas} onClick={cargarMasTimeline} className="rounded-lg border border-ink-500 px-4 py-2 text-xs font-semibold text-mute transition hover:border-fono hover:text-fore disabled:opacity-60">
                    {timelineCargandoMas ? 'Cargando…' : 'Cargar más'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <Modal open={Boolean(solicitud)} onClose={() => setSolicitud(null)} title={solicitud === 'WHOLESALE' ? 'Solicitar pasar a mayorista' : 'Solicitar crédito'} size="corto">
        <div className="space-y-3">
          <p className="text-sm text-mute">
            {solicitud === 'WHOLESALE'
              ? 'Se pedirá a administración que este cliente pase a lista de precios mayorista.'
              : 'Se pedirá a administración que habilite crédito para este cliente.'}
            La solicitud queda pendiente de aprobación.
          </p>
          {solicitud === 'CREDIT' && (
            <div className={GRILLA_DOS_COLUMNAS}>
              <FormField label="Días de plazo" hint="Por ejemplo 30">
                <Input inputMode="numeric" value={solicitudDias} onChange={event => setSolicitudDias(event.target.value.replace(/\D/g, '').slice(0, 3))} autoCapitalize="none" />
              </FormField>
              <FormField label="Límite (Gs)" hint="Monto máximo a deber">
                <MoneyInput value={solicitudLimite} onValueChange={value => setSolicitudLimite(value === '' ? '' : String(value))} placeholder="1.000.000" />
              </FormField>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setSolicitud(null)}>Cancelar</Button>
            <Button type="button" disabled={solicitudBusy} onClick={pedirCambio}>{solicitudBusy ? 'Enviando…' : 'Enviar solicitud'}</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={pendingDelete?.type === 'note'}
        onCancel={() => setPendingDelete(null)}
        onConfirm={removeNote}
        title="Eliminar comentario"
        description="Este comentario se eliminará de forma permanente. No se puede deshacer."
        confirmLabel="Eliminar comentario"
        variant="danger"
        busy={deleteBusy}
      />
      <ConfirmDialog
        open={pendingDelete?.type === 'followUp'}
        onCancel={() => setPendingDelete(null)}
        onConfirm={removeFollowUp}
        title="Eliminar seguimiento"
        description="Este seguimiento se eliminará de forma permanente. No se puede deshacer."
        confirmLabel="Eliminar seguimiento"
        variant="danger"
        busy={deleteBusy}
      />
      <ConfirmDialog
        open={pendingDelete?.type === 'billing'}
        onCancel={() => setPendingDelete(null)}
        onConfirm={removeBillingIdentity}
        title="Eliminar identidad de facturación"
        description="Se quitará de las identidades guardadas. La facturación actual del cliente no cambia."
        confirmLabel="Eliminar identidad"
        variant="danger"
        busy={deleteBusy}
      />

      <Modal
        open={Boolean(requestKind)}
        onClose={() => { if (!requestBusy) setRequestKind('') }}
        title={requestKind === 'CREDIT' ? 'Solicitar habilitación de crédito' : 'Solicitar días de crédito'} size="formulario">
        <form onSubmit={enviarSolicitud} className="space-y-4">
          {requestKind === 'CREDIT' && (
            <FormField label="Límite de crédito solicitado (Gs.)" htmlFor="profile-request-limit">
              <MoneyInput
                id="profile-request-limit"
                value={requestForm.creditLimitPyg}
                onValueChange={(value) => setRequestForm((form) => ({ ...form, creditLimitPyg: value }))}
                placeholder="1.000.000"
              />
            </FormField>
          )}
          <FormField label="Días de crédito solicitados" htmlFor="profile-request-days">
            <Input
              id="profile-request-days"
              type="number"
              min={0}
              max={365}
              value={requestForm.creditDays}
              onChange={(event) => setRequestForm((form) => ({ ...form, creditDays: event.target.value }))}
              placeholder="30"
            />
          </FormField>
          <FormField label="Nota (opcional)" htmlFor="profile-request-note">
            <Textarea
              id="profile-request-note"
              rows={2}
              maxLength={500}
              value={requestForm.note}
              onChange={(event) => setRequestForm((form) => ({ ...form, note: event.target.value }))}
              placeholder="Motivo de la solicitud…"
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setRequestKind('')} disabled={requestBusy}>Cancelar</Button>
            <Button type="submit" disabled={requestBusy}>{requestBusy ? 'Enviando…' : 'Enviar solicitud'}</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(resolveTarget)}
        onClose={() => { if (!resolveBusy) setResolveTarget(null) }}
        title={resolveAction === 'approve' ? 'Aprobar solicitud' : 'Rechazar solicitud'} size="formulario">
        {resolveTarget && (
          <div className="space-y-4">
            <p className="text-sm text-mute">
              {AUTH_KINDS[resolveTarget.kind] || resolveTarget.kind} · pedido por {resolveTarget.requestedBy?.name || 'Sistema'}: <b className="text-fore">{resumenValor(resolveTarget.kind, resolveTarget.requestedValue)}</b>
            </p>
            {resolveAction === 'approve' && resolveTarget.kind === 'CREDIT' && (
              <FormField label="Límite autorizado (Gs.)" htmlFor="profile-resolve-limit">
                <MoneyInput
                  id="profile-resolve-limit"
                  value={resolveForm.creditLimitPyg}
                  onValueChange={(value) => setResolveForm((form) => ({ ...form, creditLimitPyg: value }))}
                  placeholder="1.000.000"
                />
              </FormField>
            )}
            {resolveAction === 'approve' && resolveTarget.kind === 'DISCOUNT' && (
              <FormField label="Descuento máximo autorizado (Gs.)" hint="Podés autorizar menos de lo pedido: ese será el máximo de la venta." htmlFor="profile-resolve-discount">
                <MoneyInput
                  id="profile-resolve-discount"
                  value={resolveForm.maxDiscountPyg}
                  onValueChange={(value) => setResolveForm((form) => ({ ...form, maxDiscountPyg: value }))}
                  placeholder="50.000"
                />
              </FormField>
            )}
            {resolveAction === 'approve' && (resolveTarget.kind === 'CREDIT' || resolveTarget.kind === 'CREDIT_DAYS') && (
              <FormField
                label={resolveTarget.kind === 'CREDIT_DAYS' ? 'Días autorizados (máximo)' : 'Días de crédito autorizados'}
                hint={resolveTarget.kind === 'CREDIT_DAYS' ? 'Podés autorizar menos días que los pedidos: ese será el máximo habilitado.' : undefined}
                htmlFor="profile-resolve-days"
              >
                <Input
                  id="profile-resolve-days"
                  type="number"
                  min={0}
                  max={365}
                  value={resolveForm.creditDays}
                  onChange={(event) => setResolveForm((form) => ({ ...form, creditDays: event.target.value }))}
                  placeholder="30"
                />
              </FormField>
            )}
            <FormField label={resolveAction === 'reject' ? 'Motivo del rechazo' : 'Nota de la respuesta (opcional)'} htmlFor="profile-resolve-note">
              <Textarea
                id="profile-resolve-note"
                rows={3}
                maxLength={500}
                value={resolveForm.resolvedNote}
                onChange={(event) => setResolveForm((form) => ({ ...form, resolvedNote: event.target.value }))}
                placeholder={resolveAction === 'reject' ? 'Explicá por qué no se autoriza…' : 'Condición acordada…'}
              />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setResolveTarget(null)} disabled={resolveBusy}>Cancelar</Button>
              <Button
                type="button"
                variant={resolveAction === 'reject' ? 'danger' : 'primary'}
                onClick={confirmarResolver}
                disabled={resolveBusy || (resolveAction === 'reject' && !resolveForm.resolvedNote.trim())}
              >
                {resolveBusy ? 'Guardando…' : resolveAction === 'approve' ? 'Aprobar' : 'Rechazar'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(identityForm)}
        onClose={() => { if (!identityBusy) setIdentityForm(null) }}
        title={identityForm?.id ? 'Editar identidad' : 'Agregar identidad'} size="formulario">
        {identityForm && (
          <form onSubmit={guardarIdentidad} className="space-y-4">
            <FormField label="Razón social" htmlFor="profile-identity-name">
              <Input
                id="profile-identity-name"
                maxLength={200}
                value={identityForm.name}
                onChange={(event) => setIdentityForm((form) => ({ ...form, name: event.target.value }))}
                placeholder="Empresa S.A."
              />
            </FormField>
            <FormField label="RUC / documento" htmlFor="profile-identity-document">
              <RucField
                id="profile-identity-document"
                value={identityForm.document}
                onChange={(document) => setIdentityForm((form) => ({ ...form, document }))}
                onAplicar={(datos) => setIdentityForm((form) => ({ ...form, name: datos.name || form.name, document: datos.fullRuc || form.document }))}
                esDemo={esDemo}
              />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setIdentityForm(null)} disabled={identityBusy}>Cancelar</Button>
              <Button type="submit" disabled={identityBusy || !identityForm.name.trim() || !identityForm.document.trim()}>
                {identityBusy ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={Boolean(portal)}
        onClose={() => { if (!portalBusy) { setPortal(null); setPortalQr(''); setPortalMsg(''); setPortalError('') } }}
        title="Portal del cliente" size="corto">
        <div className="space-y-4 text-center">
          <p className="text-sm text-mute">Compartí este enlace o QR con el cliente: ve su saldo, vencimientos y pedidos sin instalar nada.</p>
          <div className="flex justify-center gap-1 rounded-xl border border-ink-600 bg-ink-800 p-1">
            {[['rapido', 'Rápido'], ['completo', 'Completo']].map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={portalNivel === key}
                disabled={portalBusy}
                onClick={() => cambiarNivelPortal(key)}
                className={cn('rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60', portalNivel === key ? 'bg-fono/15 text-fono-light' : 'text-mute hover:text-fore')}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-mute">{portalNivel === 'rapido' ? 'Saldo, vencimientos y últimos pedidos.' : 'Además garantías activas, direcciones y comprobantes.'}</p>
          {portalBusy && !portalQr
            ? <p className="py-10 text-sm text-mute">Preparando enlace…</p>
            : portalQr
              ? <img src={portalQr} alt="QR del portal del cliente" className="mx-auto h-44 w-44 rounded-xl bg-white p-2" />
              : null}
          <p className="break-all rounded-lg border border-ink-600 bg-ink-900 px-3 py-2 text-[11px] text-mute">{portal?.token ? portalUrlFor(portal.token) : '—'}</p>
          {portalMsg && <p role="status" className="text-xs text-fono-light">{portalMsg}</p>}
          {portalError && <Aviso tono="error">{portalError}</Aviso>}
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" variant="outline" disabled={!portal?.token} onClick={copiarPortal}><Icon name="copy" className="h-4 w-4" />Copiar enlace</Button>
            <Button type="button" variant="outline" disabled={!portal?.token} onClick={() => window.open(portalUrlFor(portal.token), '_blank', 'noopener')}><Icon name="external" className="h-4 w-4" />Abrir</Button>
            <Button type="button" variant="outline" disabled={!portal?.token} onClick={() => window.open(portalVitrinaUrlFor(portal.token), '_blank', 'noopener')}><Icon name="store" className="h-4 w-4" />Abrir vitrina</Button>
            <Button type="button" variant="outline" disabled={portalBusy || (!portal?.token && !portal?.reused)} onClick={() => setConfirmarRegenerar(true)}><Icon name="refresh" className="h-4 w-4" />Regenerar</Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(direccionForm)}
        onClose={() => { if (!direccionBusy) setDireccionForm(null) }}
        title={direccionForm?.index >= 0 ? 'Editar dirección' : 'Agregar dirección'} size="formulario">
        {direccionForm && (
          <form onSubmit={guardarDireccion} className="space-y-4">
            <FormField label="Etiqueta" htmlFor="direccion-etiqueta" hint="Casa, oficina, depósito…">
              <Input id="direccion-etiqueta" maxLength={80} disabled={direccionBusy} value={direccionForm.label} onChange={(event) => setDireccionForm((form) => ({ ...form, label: event.target.value }))} />
            </FormField>
            <FormField label="Dirección" htmlFor="direccion-detalle">
              <Input id="direccion-detalle" maxLength={400} disabled={direccionBusy} autoCapitalize="sentences" value={direccionForm.address} onChange={(event) => setDireccionForm((form) => ({ ...form, address: event.target.value }))} placeholder="Calle, número y referencia" />
            </FormField>
            <div className={GRILLA_DOS_COLUMNAS}>
              <div>
                <span className="block text-[11px] font-medium uppercase tracking-wider text-mute">Ciudad</span>
                <div className="mt-1.5">
                  <CityAutocomplete esDemo={esDemo} disabled={direccionBusy} value={direccionForm.city} onSelect={(city, department) => setDireccionForm((form) => ({ ...form, city, department }))} />
                </div>
                {direccionForm.department && <p className="mt-1 text-xs text-fono-light">Departamento: {direccionForm.department}</p>}
              </div>
              <FormField label="País" htmlFor="direccion-pais">
                <Input id="direccion-pais" maxLength={100} disabled={direccionBusy} value={direccionForm.country} onChange={(event) => setDireccionForm((form) => ({ ...form, country: event.target.value }))} />
              </FormField>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" disabled={direccionBusy} checked={direccionForm.isDefault} onChange={(event) => setDireccionForm((form) => ({ ...form, isDefault: event.target.checked }))} />
              Predeterminada
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" disabled={direccionBusy} onClick={() => setDireccionForm(null)}>Cancelar</Button>
              <Button type="submit" disabled={esDemo || direccionBusy || !direccionForm.address.trim()}>{direccionBusy ? 'Guardando…' : 'Guardar dirección'}</Button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={pendingDelete?.type === 'address'}
        onCancel={() => setPendingDelete(null)}
        onConfirm={removeDireccion}
        title="Eliminar dirección"
        description="Se quitará de la ficha del cliente. Las ventas ya registradas no cambian."
        confirmLabel="Eliminar dirección"
        variant="danger"
        busy={deleteBusy}
      />

      <Modal
        open={comercialAbierto}
        onClose={() => { if (!guardandoComercial) setComercialAbierto(false) }}
        title="Configuración comercial" size="formulario">
        <form onSubmit={guardarComercial} className="space-y-4">
          <FormField label="Tipo de cliente" htmlFor="comercial-tipo">
            <Select id="comercial-tipo" disabled={guardandoComercial} value={comercialForm.pricingTier} onChange={(event) => setComercialForm((form) => ({ ...form, pricingTier: event.target.value }))}>
              <option value="RETAIL">Cliente final</option>
              <option value="WHOLESALE">Mayorista</option>
            </Select>
          </FormField>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" disabled={guardandoComercial} checked={comercialForm.creditHabilitado} onChange={(event) => setComercialForm((form) => ({ ...form, creditHabilitado: event.target.checked }))} />
            Habilitar venta a crédito
          </label>
          {comercialForm.creditHabilitado && (
            <div className={GRILLA_DOS_COLUMNAS}>
              <FormField label="Límite de crédito (Gs.)" htmlFor="comercial-limite">
                <MoneyInput id="comercial-limite" disabled={guardandoComercial} value={comercialForm.creditLimitPyg} onValueChange={(value) => setComercialForm((form) => ({ ...form, creditLimitPyg: value }))} placeholder="1.000.000" />
              </FormField>
              <FormField label="Días de crédito autorizados" htmlFor="comercial-dias" hint="0 = a la vista; vacío = sin plazo definido.">
                <Input id="comercial-dias" type="number" min={0} max={365} disabled={guardandoComercial} value={comercialForm.creditDays} onChange={(event) => setComercialForm((form) => ({ ...form, creditDays: event.target.value }))} placeholder="30" />
              </FormField>
            </div>
          )}
          <p className="text-xs text-mute">El cambio queda registrado en la cronología del cliente.</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={guardandoComercial} onClick={() => setComercialAbierto(false)}>Cancelar</Button>
            <Button type="submit" disabled={esDemo || guardandoComercial}>{guardandoComercial ? 'Guardando…' : 'Guardar configuración'}</Button>
          </div>
        </form>
      </Modal>

      <ImeiVerificacionModal
        open={Boolean(imeiDe)}
        onClose={() => setImeiDe(null)}
        imei={String(imeiDe?.serial || '')}
        cliente={profile?.customer?.name || customer?.name || ''}
        esDemo={esDemo}
        onAgregarComentario={agregarComentarioImei}
        onAgregarNotaPublica={agregarNotaPublicaImei}
      />

      <Modal
        open={canjeAbierto}
        onClose={() => { if (!canjeBusy) setCanjeAbierto(false) }}
        title="Canjear puntos como saldo a favor" size="corto">
        <form onSubmit={canjearPuntos} className="space-y-4">
          <p className="text-sm text-mute">Los puntos canjeados quedan como saldo a favor del cliente y se descuentan de su saldo de <b className="text-fore">{formatGs(puntos)}</b>. 1 punto = 1 Gs.</p>
          <FormField label="Puntos a canjear" htmlFor="profile-canje-puntos" hint={`Máximo ${formatGs(puntos)}.`}>
            <MoneyInput id="profile-canje-puntos" autoFocus value={canjePuntos} onValueChange={setCanjePuntos} placeholder="0" />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={canjeBusy} onClick={() => setCanjeAbierto(false)}>Cancelar</Button>
            <Button type="submit" disabled={canjeBusy || !Number(canjePuntos)}>{canjeBusy ? 'Canjeando…' : 'Canjear'}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmarRegenerar}
        onCancel={() => setConfirmarRegenerar(false)}
        onConfirm={() => prepararPortal(portalNivel, true)}
        title="Regenerar enlace del portal"
        description="El enlace y el QR anteriores dejarán de funcionar. Si el cliente ya lo tenía guardado, vas a tener que compartirle el nuevo."
        confirmLabel="Regenerar"
        busy={portalBusy}
      />
    </Modal>
  )
}
