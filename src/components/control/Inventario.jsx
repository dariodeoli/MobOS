import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useBusquedaDiferida } from '@/hooks/useBusquedaDiferida'
import { useVistaListaGrid } from '@/hooks/useVistaListaGrid'
import QRCode from 'qrcode'
import { getProductos, modoDatosActual, updateProducto } from '@/lib/storage'
import { gs } from '@/utils/calculos'
import { formatUsd } from '@/utils/moneda'
import { montoTexto } from '@/utils/moneda'
import BarraLote from '@/components/shared/BarraLote'
import Switch from '@/components/shared/Switch'
import { alternarId, seleccionarTodos } from '@/lib/seleccionLote'
import { Aviso, Badge, Button, Card, ConfirmDialog, Dot, EmptyState, Input, Label, Modal, MoneyInput, Select, Skeleton, Textarea, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { descargarCsv } from '@/utils/descargarCsv'
import { descargarCsvCliente } from '@/utils/descargarArchivo'
import { copiarAlPortapapeles } from '@/utils/portapapeles'
import { fechaHora } from '@/utils/fecha'
import { resources } from '@/lib/api'
import { api, apiFetch } from '@/lib/api/client'
import { useSesion } from '@/lib/sesion'
import { APP_NAME } from '@/lib/brand'
import { printRemisionReceipt, printReservationReceipt, printTransferReceipt, transferReceiveUrlFor, buildUnitLabelsHtml, printOrderReceipt, tokenDeNivel, accessUrlFor } from '@/components/shared/OrderReceipt'
import { configImpresora, imprimirConDialogo, imprimirDocumento, puedeCaerAlDialogo } from '@/lib/printing/agent'
import { imprimirDocumentoNoFiscal } from '@/lib/printing/documentos'
import { ticketEtiquetasUnidad, ticketEtiquetaUbicacion, ticketEtiquetaUnidad, ticketRemision, ticketComprobante } from '@/lib/printing/tickets'
import { leerEtiqueta } from '@/lib/printing/qr'

import UnidadDetalle from '@/components/inventory/UnidadDetalle'
import EtiquetasProductoModal from '@/components/shared/EtiquetasProductoModal'
import AutorizacionBloque from '@/components/ventas/venta/AutorizacionBloque'
import ListGridToggle from '@/components/shared/ListGridToggle'
import AttachmentList from '@/components/shared/AttachmentList'
import { internationalPhone } from '@/utils/telefono'
import { cn } from '@/lib/utils'
import SerialTexto from '@/components/shared/SerialTexto'
import Avatar from '@/components/shared/Avatar'
import SearchField from '@/components/shared/SearchField'
import CurrencySelect from '@/components/shared/CurrencySelect'
import { suppliersApi } from '@/lib/api/suppliers'
import { cotizacionReferencia } from '@/lib/fx'
import { estadoInventario, nombreProducto, sigueEnInventario, sinCostoUnitario, costoEnGs } from '@/utils/inventario'
import { serialEnmascarado, ultimos4 } from '@/utils/serial'
import { useUltimoUsado } from '@/hooks/useUltimoUsado'
import { CELDA_DATO, CELDA_ENCABEZADO, CELDA_IDENTIDAD, ROTULO_SECCION } from '@/components/shared/tabla'
import { GRILLA_DOS_COLUMNAS, GRILLA_DOS_COLUMNAS_COMPACTA, PIE_ACCIONES, PIE_ACCIONES_REVERSO } from '@/components/shared/formulario'
import TallerRack from '@/components/inventory/TallerRack'
const conditionLabel = { NEW: 'Nuevo', USED: 'Seminuevo', REFURBISHED: 'Reacondicionado' }
const MOTIVOS_BAJA = ['Uso interno', 'Daño', 'Transferencia', 'Pérdida', 'Devolución a proveedor', 'Otro']
const MOTIVOS_REVISION = ['Revisión física', 'Falla detectada', 'Verificación vencida', 'Otro']
// Formatos de impresión que acepta AEX (doc API v1.5.4, /envios/imprimir).
const FORMATOS_ETIQUETA_AEX = [
  ['etiqueta8x6', 'Etiqueta 8 × 6 cm'],
  ['etiqueta8x10', 'Etiqueta 8 × 10 cm'],
  ['etiqueta65x45', 'Etiqueta 6,5 × 4,5 cm'],
  ['guia_A4', 'Guía A4 (retiro y entrega)'],
  ['guia_A5', 'Guía A5'],
  ['guia_A6', 'Guía A6'],
  ['guia', 'Guía (predeterminado de AEX)'],
]
const VERIFIER_NAMES = { VPE: 'Edgar', VPM: 'Matheo' }
// Tonos de fila como la planilla: nuevos verde, semis amarillo, atajando/reservado
// lila, vendido rojo y asistencia/tránsito celeste.
const rowTone = unit => unit.status === 'SOLD' ? 'border-l-4 border-l-bad/70 bg-bad/10' : unit.status === 'RESERVED' ? 'border-l-4 border-l-reserved/80 bg-reserved/10' : unit.status === 'IN_TRANSIT' || unit.status === 'DEFECTIVE' ? 'border-l-4 border-l-info/70 bg-info/10' : unit.condition === 'NEW' ? 'border-l-4 border-l-ok/70 bg-ok/10' : 'border-l-4 border-l-warn/70 bg-warn/10'
const badgeTone = unit => unit.status === 'AVAILABLE' ? (unit.condition === 'NEW' ? 'green' : 'orange') : unit.status === 'RESERVED' ? 'orange' : unit.status === 'IN_TRANSIT' ? 'blue' : unit.status === 'DEFECTIVE' ? 'slate' : 'red'
// Muestra de hasta 4 variantes distintas (un producto por modelo) de una ubicación.
const locationSample = (units, locationId) => {
  const seen = new Set()
  const sample = []
  for (const unit of units) {
    if (unit.locationId !== locationId || seen.has(unit.productId)) continue
    seen.add(unit.productId)
    sample.push(unit)
    if (sample.length === 4) break
  }
  return sample
}
const formatCost = unit => {
  const amount = Number(unit.originalCost)
  if (!Number.isFinite(amount) || amount <= 0) return ''
  return montoTexto(amount, unit.costCurrency)
}
// El verificador puede ser un usuario real (foto + nombre) o un código legacy
// de vendedor sin cuenta (VPE/VPM): en los dos casos la fila muestra su avatar.
const verifiedLabel = (unit) => {
  const fecha = fechaHora(unit.lastVerifiedAt, '')
  const usuario = unit.lastVerifiedBy?.name ? unit.lastVerifiedBy : unit.verifiedByCode ? { name: VERIFIER_NAMES[unit.verifiedByCode] || unit.verifiedByCode } : null
  if (!fecha || !usuario) return null
  return { fecha, quien: usuario.name, usuario }
}

const LOCATION_TONES = ['#22d3ee', '#a78bfa', '#fbbf24', '#34d399', '#f472b6', '#60a5fa']
// Colores estables por nombre para las ubicaciones típicas del local; el resto
// cae en un tono derivado del id. Así "Piso de venta" siempre se ve verde y
// "Depósito 1/2" azules en cualquier pantalla.
const LOCATION_TONES_NOMBRE = [
  [/piso de venta|sal[oó]n|mostrador/i, '#34d399'],
  [/dep[oó]sito\s*1/i, '#60a5fa'],
  [/dep[oó]sito\s*2/i, '#a78bfa'],
  [/dep[oó]sito/i, '#38bdf8'],
  [/recepci[oó]n/i, '#fbbf24'],
  [/taller|servicio/i, '#f472b6'],
]
const locationTone = (location) => {
  const colorPropio = typeof location === 'object' ? location?.color : ''
  if (colorPropio && /^#[0-9a-fA-F]{6}$/.test(colorPropio)) return colorPropio
  const nombre = typeof location === 'string' ? location : location?.name || ''
  const porNombre = LOCATION_TONES_NOMBRE.find(([patron]) => patron.test(nombre))
  if (porNombre) return porNombre[1]
  const id = typeof location === 'string' ? location : location?.id || ''
  return LOCATION_TONES[[...String(id)].reduce((sum, char) => sum + char.charCodeAt(0), 0) % LOCATION_TONES.length]
}
const fechaVerificacion = (value) => {
  if (!value) return ''
  const date = new Date(value)
  const dia = date.toLocaleDateString('es-PY', { day: '2-digit' })
  const mes = date.toLocaleDateString('es-PY', { month: 'short' }).replace('.', '')
  const hora = date.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${dia} ${mes} ${String(date.getFullYear()).slice(-2)} · ${hora}`
}
// Mismas columnas para el encabezado y cada unidad: nada se desplaza.
// Anchos medidos sobre el contenido real de cada columna: las compactas
// (batería, proveedor, costo, estado) ceden el ancho a producto, serial y
// verificación, que son los datos que se leen de un vistazo.
const UNIDADES_GRID = 'grid min-w-[66rem] grid-cols-[1.5rem_minmax(11rem,2fr)_6.5rem_4.5rem_6.5rem_5.5rem_6.5rem_6rem_8.5rem] items-center gap-x-2'
const GRID_RESERVAS = 'grid min-w-[44rem] grid-cols-[minmax(8rem,1.4fr)_minmax(5rem,0.9fr)_minmax(6rem,1.1fr)_6rem_15rem] items-center gap-x-2'
const GRID_ELIMINADOS = 'grid min-w-[42rem] grid-cols-[minmax(8rem,1.4fr)_minmax(5rem,0.9fr)_minmax(7rem,1.6fr)_7rem] items-center gap-x-2'
const GRID_TRASLADOS = 'grid min-w-[60rem] grid-cols-[minmax(9rem,1.4fr)_minmax(8rem,1.5fr)_4rem_6rem_6rem_6rem_7rem_13rem] items-center gap-x-2'
const fechaReserva = (value) => {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return '—'
  const dia = date.toLocaleDateString('es-PY', { day: '2-digit', month: 'short' }).replace('.', '')
  return `${dia} · ${date.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit', hour12: false })}`
}
// Abreviatura estable para proveedor (3–5 caracteres) y códigos cortos.
const abrev = (texto, largo = 5) => {
  const limpio = String(texto || '').trim()
  if (!limpio) return '—'
  return limpio.length > largo ? `${limpio.slice(0, largo)}…` : limpio
}

function EncabezadoUnidades({ seleccionado = false, onSeleccionar }) {
  const celda = 'truncate text-[10px] font-bold uppercase tracking-wider text-mute'
  return (
    <div className={`${UNIDADES_GRID} px-2.5 pb-0.5`}>
      {onSeleccionar
        ? <input type="checkbox" className="h-4 w-4 accent-fono" aria-label="Seleccionar visibles" title="Seleccionar visibles" checked={seleccionado} onChange={onSeleccionar} />
        : <span />}
      <span className={celda}>Producto</span>
      <span className={celda}>Modelo / variante</span>
      <span className={celda} title="Proveedor (3 a 5 caracteres; pasá el mouse para verlo completo)">Prov</span>
      <span className={`${celda} text-right`}>Costo</span>
      <span className={celda} title="Ubicación: depósito o sucursal por código corto">Ubi</span>
      <span className={`${celda} text-center`}>Estado</span>
      <span className={celda} title="Quién verificó la unidad y cuándo">Verificado</span>
      <span className={`${celda} text-right`}>Acciones</span>
    </div>
  )
}

// Menú de acciones de la fila: íconos con tooltip, se cierra al elegir o al
// hacer clic afuera.
function MenuAcciones({ unit, busy, acciones }) {
  const [abierto, setAbierto] = useState(false)
  useEffect(() => {
    if (!abierto) return undefined
    const cerrar = () => setAbierto(false)
    document.addEventListener('mousedown', cerrar)
    return () => document.removeEventListener('mousedown', cerrar)
  }, [abierto])
  if (!acciones.length) return null
  return <span className="relative" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
    <button type="button" disabled={busy} aria-label={`Acciones de ${unit.serial}`} title="Más acciones" onClick={() => setAbierto((valor) => !valor)} className="grid h-7 w-7 place-items-center rounded-lg border border-ink-600 text-mute transition hover:border-fono/40 hover:text-fore">
      <Icon name="dots" className="h-3.5 w-3.5" />
    </button>
    {abierto && <span className="absolute right-0 top-full z-30 mt-1 w-56 rounded-xl border border-ink-500 bg-paper p-1 shadow-xl">
      {acciones.map((accion) => <button key={accion.label} type="button" disabled={busy || accion.disabled} title={accion.tooltip} onClick={() => { setAbierto(false); accion.run() }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-fore transition hover:bg-ink-700 disabled:opacity-40">
        <Icon name={accion.icon} className="h-3.5 w-3.5 shrink-0 text-mute" />
        <span className="min-w-0 flex-1 truncate">{accion.label}</span>
        {accion.hint && <span className="shrink-0 text-[10px] text-mute">{accion.hint}</span>}
      </button>)}
    </span>}
  </span>
}

function FilaUnidad({ unit, onClick, onVerify, onSell, onReserve, onLabel, onAdjust, onRemove, onMove, onEdit, onCosto, onComprobante, cotizacion, fechaVenta, busy, seleccionado = false, onAlternar }) {
  const v = verifiedLabel(unit)
  const estado = estadoInventario(unit)
  const serial = String(unit.serial || '')
  const [costoAbierto, setCostoAbierto] = useState(false)
  const [costoUsd, setCostoUsd] = useState('')
  const diasStock = unit.createdAt ? Math.floor((Date.now() - new Date(unit.createdAt).getTime()) / 86400000) : null
  const ingreso = unit.createdAt ? new Date(unit.createdAt).toLocaleDateString('es-PY') : null
  const costoGs = costoEnGs(unit)
  const enUsd = costoGs === null ? null : (unit.costCurrency === 'USD' && !cotizacion ? Number(unit.originalCost) : (cotizacion > 0 ? costoGs / cotizacion : Number(unit.originalCost)))
  const costoTexto = sinCostoUnitario(unit)
    ? null
    : enUsd !== null && Number.isFinite(enUsd)
      ? formatUsd(enUsd)
      : costoGs !== null ? gs(costoGs) : '—'
  const vencida = unit.warrantyUntil ? new Date(unit.warrantyUntil).getTime() < Date.now() : null
  const acciones = [
    ...(unit.status === 'SOLD' ? [{ label: 'Comprobante rápido', tooltip: 'Imprimir el comprobante de la venta sin abrir la ficha', icon: 'receipt', run: () => onComprobante?.(unit) }] : []),
    { label: 'Vender', tooltip: 'Cargar la venta de esta unidad', icon: 'cart', run: () => onSell?.(unit) },
    { label: 'Reservar', tooltip: 'Apartar la unidad para un cliente', icon: 'clock', run: () => onReserve?.(unit) },
    { label: 'Verificar', tooltip: 'Registrar la verificación física ahora', icon: 'check', run: () => onVerify?.(unit) },
    { label: 'Imprimir etiqueta', tooltip: 'Imprimir la etiqueta de esta unidad', icon: 'printer', run: () => onLabel?.(unit) },
    { label: 'Enviar a revisión', tooltip: 'Marcar la unidad en revisión con un motivo', icon: 'alert', run: () => onAdjust?.(unit) },
    { label: 'Cambiar ubicación', tooltip: 'Mover la unidad a otro depósito o sucursal', icon: 'box', run: () => onMove?.(unit) },
    { label: 'Dar de baja', tooltip: 'Sacar la unidad del stock (queda en Eliminados)', icon: 'trash', run: () => onRemove?.(unit) },
    { label: 'Ver detalles', tooltip: 'Abrir la ficha completa de la unidad', icon: 'eye', run: () => onClick?.() },
  ]
  return <div role="button" tabIndex={0} data-testid="inventario-fila" onClick={onClick} onKeyDown={event => { if (event.key === 'Enter') onClick() }} className={`${UNIDADES_GRID} cursor-pointer rounded-lg border border-ink-600 px-3 py-1.5 transition hover:border-fono/40 ${rowTone(unit)}`}>
    {onAlternar
      ? <span className="flex items-center" onClick={(event) => event.stopPropagation()}><input type="checkbox" className="h-4 w-4 accent-fono" aria-label={`Seleccionar ${nombreProducto(unit.product || {})} ${serial}`} checked={seleccionado} onChange={() => onAlternar()} /></span>
      : <span />}
    <span className="flex min-w-0 items-center gap-1.5">
      <b className="min-w-0 truncate text-[13px] leading-tight" title={nombreProducto(unit.product || {})}>{nombreProducto(unit.product || {})}</b>
      <SerialTexto serial={serial} className="shrink-0 text-[10px] text-mute" />
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${unit.condition === 'NEW' ? 'bg-ok' : unit.condition === 'USED' ? 'bg-warn' : 'bg-mute'}`}
        title={`Condición: ${conditionLabel[unit.condition] || unit.condition}`}
        aria-label={`Condición: ${conditionLabel[unit.condition] || unit.condition}`}
      />
      {diasStock != null && diasStock >= 30 && (
        <span className={`shrink-0 rounded border px-1 text-[10px] font-semibold tabular-nums ${diasStock >= 90 ? 'border-bad/30 text-bad' : 'border-warn/30 text-warn'}`} title={`Ingresó a stock el ${ingreso} · ${diasStock} días`}>{diasStock} d</span>
      )}
    </span>
    <span className="flex min-w-0 flex-wrap items-center gap-1 text-[11px] text-mute">
      <span className="truncate" title={`${conditionLabel[unit.condition] || unit.condition}${unit.product?.capacity ? ` · ${unit.product.capacity}` : ''}`}>{conditionLabel[unit.condition] || '—'}{unit.product?.capacity ? ` · ${unit.product.capacity}` : ''}</span>
      {unit.batteryHealth ? <span className="shrink-0 rounded border border-ink-600 px-1 tabular-nums" title={`Batería: ${unit.batteryHealth}% (salud informada)`}>{unit.batteryHealth}%</span> : null}
    </span>
    <span className={CELDA_DATO} title={unit.supplierName || undefined}>{abrev(unit.supplierName, 5)}</span>
    <span className="flex items-center justify-end gap-1 text-right text-xs font-semibold tabular-nums text-fore">
      {costoAbierto ? (
        <span className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
          <Input autoFocus aria-label={`Costo en USD de ${serial}`} className="h-7 w-20 px-1 text-right text-xs" inputMode="decimal" value={costoUsd} onChange={(event) => setCostoUsd(event.target.value.replace(/[^0-9.,]/g, ''))} onKeyDown={(event) => { if (event.key === 'Enter') { onCosto?.(unit, costoUsd); setCostoAbierto(false) } if (event.key === 'Escape') setCostoAbierto(false) }} />
          <button type="button" title="Guardar el costo en USD" onClick={() => { onCosto?.(unit, costoUsd); setCostoAbierto(false) }} className="rounded-lg border border-ok/40 px-1.5 py-0.5 text-[10px] font-bold text-ok">OK</button>
          <button type="button" title="Cancelar" onClick={() => setCostoAbierto(false)} className="rounded-lg px-1 text-[10px] text-mute">✕</button>
        </span>
      ) : sinCostoUnitario(unit) ? (
        <Badge color="orange" className="px-1.5 py-0.5 text-[10px]" title="Falta cargar el costo: usá el lápiz para completarlo">Sin costo</Badge>
      ) : <span title={`Costo cargado${costoGs !== null ? ` (${gs(costoGs)})` : ''}`}>{costoTexto}</span>}
      <button type="button" disabled={busy} title="Editar el costo en dólares" aria-label={`Editar el costo de ${serial}`} onClick={(event) => { event.stopPropagation(); setCostoUsd(enUsd !== null && Number.isFinite(enUsd) ? String(Number(enUsd.toFixed(2))) : ''); setCostoAbierto(true) }} className="text-mute transition hover:text-fono"><Icon name="edit" className="h-3.5 w-3.5" /></button>
    </span>
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-mute" title={unit.location?.name ? `Ubicación: ${unit.location.name}${unit.location.code ? ` (${unit.location.code})` : ''}` : 'Sin ubicación asignada'}>
      {unit.location?.name ? <><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: locationTone(unit.location) }} /><span className={`truncate ${unit.location.code ? 'font-semibold text-fore/80' : ''}`}>{unit.location.code ? abrev(unit.location.code, 4) : unit.location.name}</span></> : '—'}
    </span>
    <span className="flex min-w-0 flex-col items-center text-center">
      <Badge color={estado.tone} className="max-w-full truncate" title={estado.label}>{estado.label}</Badge>
      {vencida !== null && <span className={`mt-0.5 block truncate text-[10px] font-semibold ${vencida ? 'text-bad' : 'text-ok'}`} title={vencida ? `Garantía vencida el ${new Date(unit.warrantyUntil).toLocaleDateString('es-PY')}` : `Garantía vigente hasta ${new Date(unit.warrantyUntil).toLocaleDateString('es-PY')}`}>Garantía {vencida ? 'vencida' : 'vigente'}</span>}
      {unit.reservationCustomer && <span className="mt-0.5 block truncate text-[10px] font-semibold text-reserved" title={`Reservado para ${unit.reservationCustomer}`}>{unit.reservationCustomer}</span>}
      {unit.consignorName && <span className="mt-0.5 block truncate text-[10px] font-semibold text-fono-light" title={`En consignación de ${unit.consignorName}`}>Consignado</span>}
      {fechaVenta && <span className="mt-0.5 block truncate text-[10px] text-mute" title={`Vendido el ${new Date(fechaVenta).toLocaleString('es-PY')}`}>{fechaReserva(fechaVenta)}</span>}
    </span>
    <span className={`flex min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-0.5 text-[10px] ${v ? 'bg-ok/10 text-ok' : 'border border-ink-600 text-mute'}`} title={v ? `Verificó: ${v.quien} · ${fechaVerificacion(unit.lastVerifiedAt)}` : 'Todavía sin verificación física'}>
      {v ? <Avatar user={v.usuario} hasAvatar={false} picture={unit.lastVerifiedBy?.picture} size="xs" /> : <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ink-700 text-[8px] font-bold text-fore">—</span>}
      <span className="truncate">{v ? fechaVerificacion(unit.lastVerifiedAt) : 'Sin verificar'}</span>
      <button type="button" disabled={busy} aria-label="✓ Verificar" title={`Verificar ${serial} (un clic)`} onClick={(event) => { event.stopPropagation(); onVerify?.(unit) }} className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-ok/40 text-ok transition hover:bg-ok/10 disabled:opacity-50"><Icon name="check" className="h-3.5 w-3.5" /></button>
    </span>
    <span className="flex flex-wrap items-center justify-end gap-1">
      {unit.status === 'RESERVED' && <button type="button" disabled={busy} title="Cerrar la reserva y cargar la venta" onClick={event => { event.stopPropagation(); onSell?.(unit) }} className="whitespace-nowrap rounded-lg border border-fono/40 px-2 py-1 text-[10px] font-bold text-fono-light transition hover:bg-fono/10 disabled:opacity-50">Finalizar venta</button>}
      <button type="button" disabled={busy} title="Editar los datos de la unidad" onClick={event => { event.stopPropagation(); onEdit?.(unit) }} className="whitespace-nowrap rounded-lg border border-ink-600 px-2 py-1 text-[10px] font-semibold text-fore transition hover:border-fono/40">Editar</button>
      {unit.status === 'SOLD' && <button type="button" disabled={busy} aria-label={`Imprimir comprobante rápido de ${serial}`} title="Imprimir comprobante rápido (nivel Rápido, 80 mm) sin salir de la lista" onClick={event => { event.stopPropagation(); onComprobante?.(unit) }} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-ink-600 text-mute transition hover:border-fono/40 hover:text-fore disabled:opacity-50"><Icon name="receipt" className="h-3.5 w-3.5" /></button>}
      <MenuAcciones unit={unit} busy={busy} acciones={acciones} />
    </span>
  </div>
}

function TarjetaUnidad({ unit, onClick }) {
  const v = verifiedLabel(unit)
  const serial = String(unit.serial || '')
  return <button type="button" onClick={onClick} className={`group flex w-full flex-col rounded-2xl border border-ink-600 p-3 text-left transition hover:border-fono/40 ${rowTone(unit)}`}>
    <span className="flex items-start justify-between gap-2">
      <b className="min-w-0 truncate text-[13px]" title={nombreProducto(unit.product || {})}>{nombreProducto(unit.product || {})}</b>
      <Badge color={estadoInventario(unit).tone}>{estadoInventario(unit).label}</Badge>
    </span>
    <SerialTexto serial={serial} className="mt-1 truncate text-[11px] text-mute" />
    <span className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-mute">
      {unit.batteryHealth ? <span className="rounded border border-ink-500 px-1.5 py-0.5">{unit.batteryHealth}%</span> : null}
      {unit.location?.name ? <span className="truncate rounded border border-ink-500 px-1.5 py-0.5">{unit.location.name}</span> : null}
      {unit.supplierName ? <span className="rounded border border-ink-500 px-1.5 py-0.5">{unit.supplierName}</span> : null}
      {unit.consignorName ? <span className="rounded border border-fono/40 px-1.5 py-0.5 text-fono-light" title={`En consignación de ${unit.consignorName}`}>Consignado</span> : null}
    </span>
    <span className="mt-2 flex items-center justify-between gap-2 text-[11px] text-mute">
      <span className="flex min-w-0 items-center gap-1.5" title={v ? `Verificó ${v.quien} · ${fechaVerificacion(unit.lastVerifiedAt)}` : undefined}>
        {v ? <><Avatar user={v.usuario} size="xs" /><span className="truncate">{fechaVerificacion(unit.lastVerifiedAt)}</span></> : <span className="truncate">Sin verificación</span>}
      </span>
      <span className="shrink-0 font-semibold text-fore">{unit.originalCost ? formatCost(unit) : ''}</span>
    </span>
    {unit.reservationCustomer ? <span className="mt-1 truncate text-[11px] font-semibold text-reserved">Atajado por {unit.reservationCustomer}</span> : null}
  </button>
}
// Un QR nuevo llega como URL de la app (`/u/<serial>`) y el lector de barras
// sigue mandando `MOBOS:<serial>`: las dos formas entran al mismo flujo.
const normalizeScan = (value = '') => {
  const etiqueta = leerEtiqueta(value)
  const crudo = etiqueta.tipo === 'UBI'
    ? `UBI:${etiqueta.valor}`
    : etiqueta.tipo === 'UNIDAD'
      ? etiqueta.valor
      : etiqueta.tipo
        ? `${etiqueta.tipo}:${etiqueta.valor}`
        : String(value)
  return crudo.trim().replace(/^MOBOS:/i, '').replace(/[\s-]+/g, '').toUpperCase()
}
const safe = (value = '') => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))

// Impresión masiva de etiquetas de unidades (#220): sale directo por la
// impresora configurada (agente o puente) y el diálogo queda solo como respaldo
// de un fallo claro. Una página por etiqueta, con el ancho real del rollo.
async function printLabels(units = []) {
  if (!units.length) return
  const { ancho } = configImpresora()
  const html = await buildUnitLabelsHtml(units, { ancho })
  const resultado = await imprimirDocumento(ticketEtiquetasUnidad(units, { ancho }), { tipo: 'etiquetas-stock' })
  // Diálogo solo si el fallo fue CLARO (nada se envió ni quedó en cola):
  // tras un resultado incierto o encolado abrirlo podría duplicar el ticket.
  if (puedeCaerAlDialogo(resultado)) imprimirConDialogo(html)
  return resultado
}

async function printLocationLabel(location) {
  const code = `MOBOS:UBI:${location.id}`
  let qr = ''
  try { qr = await QRCode.toDataURL(code, { errorCorrectionLevel: 'M', margin: 0, width: 190 }) } catch { /* La etiqueta conserva el texto aunque el QR no se renderice. */ }
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Ubicación ${safe(location.name)}</title><style>@page{size:58mm auto;margin:2mm}*{box-sizing:border-box}body{width:54mm;margin:0;font:11px/1.4 ui-sans-serif,system-ui,sans-serif;color:#0f1720;text-align:center}.brand{display:flex;justify-content:space-between;font-size:7.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#0c8876;border-bottom:1px solid #d5dbe0;padding-bottom:1.5mm;margin-bottom:2.5mm}.name{font-size:15px;font-weight:900;letter-spacing:-.01em}.meta{font-size:8.5px;color:#66707a;margin-top:1mm}.qr{width:26mm;height:26mm;margin:3mm auto 2mm;display:block}footer{margin-top:2mm;border-top:1px dashed #999;padding-top:1.5mm;font-size:7px;color:#66707a}</style></head><body><div class="brand"><span>${safe(APP_NAME)} · UBICACIÓN</span><span>STOCK</span></div><div class="name">${safe(location.name)}</div><div class="meta">${safe(location.branch?.name || '')}${location.code ? ` · ${safe(location.code)}` : ''}</div>${qr ? `<img class="qr" src="${qr}" alt="QR">` : ''}<footer>Escaneá al recibir o trasladar para asignar esta ubicación.</footer></body></html>`
  const resultado = await imprimirDocumento(ticketEtiquetaUbicacion(location), { tipo: 'etiqueta-ubicacion' })
  // Diálogo solo si el fallo fue CLARO (nada se envió ni quedó en cola):
  // tras un resultado incierto o encolado abrirlo podría duplicar el ticket.
  if (puedeCaerAlDialogo(resultado)) imprimirConDialogo(html)
  return resultado
}

// Reimprimir la etiqueta de una unidad (#220): sale directo por la impresora
// configurada, sin diálogo; el respaldo abre el HTML solo ante un fallo claro.
// La usa la ficha y la recepción en tránsito (reimprimir al llegar).
async function printLabel(unit) {
  const { ancho } = configImpresora()
  const html = await buildUnitLabelsHtml([unit], { ancho })
  const resultado = await imprimirDocumento(ticketEtiquetaUnidad(unit, { ancho }), { tipo: 'etiqueta-stock' })
  // Diálogo solo si el fallo fue CLARO (nada se envió ni quedó en cola):
  // tras un resultado incierto o encolado abrirlo podría duplicar el ticket.
  if (puedeCaerAlDialogo(resultado)) imprimirConDialogo(html)
  return resultado
}

// Comprobante rápido de una venta (#215 §10): se dispara desde la lista de
// Vendidos sin abrir la ficha. Reutiliza el mismo comprobante que el resto de
// la app (nivel Rápido): directo por la impresora configurada (80 mm por
// defecto) y, ante un fallo claro, el PDF con OrderReceipt.
async function printQuickReceipt(unit) {
  const venta = unit?.sale
  if (!venta?.orderId) return { ok: false, motivo: 'sin-pedido', error: 'La unidad no tiene un pedido asociado.' }
  const { ancho } = configImpresora()
  const formato = ancho === 58 ? 'thermal-58' : 'thermal-80'
  const orden = await api.get(`/api/orders/${encodeURIComponent(venta.orderId)}`)
  // El QR del nivel rápido: mismo token de impresión que emite el comprobante.
  const token = await tokenDeNivel(orden.id, 'rapido')
  const link = token ? accessUrlFor(token) : ''
  const resultado = await imprimirDocumento(ticketComprobante(orden, { nivel: 'rapido', ancho, link }), { tipo: 'comprobante', ref: orden.orderNumber || venta.orderNumber || '' })
  if (resultado?.ok || !puedeCaerAlDialogo(resultado)) return resultado
  const abierto = await printOrderReceipt(orden, { level: 'rapido', format: formato, token })
  return { ...resultado, dialogo: Boolean(abierto) }
}

// Remisión interna del traslado: primero la térmica (agente o puente) y solo
// si el fallo fue claro cae al diálogo con el A4. Tras encolar o un resultado
// incierto no se abre nada: el reintento podría duplicar el papel.
async function imprimirRemision(transfer) {
  const { ancho } = configImpresora()
  return imprimirDocumentoNoFiscal(ticketRemision(transfer, { ancho }), {
    tipo: 'remision',
    respaldo: () => printRemisionReceipt(transfer, { format: 'a4' }),
  })
}

function CameraScan({ onDetected, onClose, continuous = false }) {
  const video = useRef(null)
  const [message, setMessage] = useState('Preparando cámara…')
  useEffect(() => {
    let stream; let timer; let stopped = false
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia || !window.BarcodeDetector) { setMessage('Este navegador no admite escaneo por cámara. Usá un lector Bluetooth/USB o ingresá el código.'); return }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
        if (stopped || !video.current) return
        video.current.srcObject = stream; await video.current.play(); setMessage(continuous ? 'Escaneá cada equipo, uno tras otro. Se registran solos.' : 'Enfocá el QR o código de barras.')
        const detector = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'upc_a'] })
        // En modo continuo se ignora el mismo código durante 1,5 s para no
        // duplicar lecturas del mismo cuadro de video.
        let lastRaw = ''; let lastAt = 0
        const read = async () => {
          if (stopped || !video.current) return
          try {
            const codes = await detector.detect(video.current)
            const raw = codes[0]?.rawValue
            if (raw) {
              const now = Date.now()
              if (continuous && raw === lastRaw && now - lastAt < 1500) { timer = window.setTimeout(read, 250); return }
              lastRaw = raw; lastAt = now
              onDetected(raw)
              if (!continuous) { onClose(); return }
            }
          } catch { /* la cámara sigue activa */ }
          timer = window.setTimeout(read, 250)
        }
        read()
      } catch { setMessage('No se pudo abrir la cámara. Revisá el permiso del navegador.') }
    }
    start()
    return () => { stopped = true; if (timer) clearTimeout(timer); stream?.getTracks().forEach(track => track.stop()) }
  }, [onDetected, onClose, continuous])
  return <div className="space-y-3"><video ref={video} className="aspect-video w-full rounded-xl bg-black object-cover" muted playsInline /><p className="text-sm text-mute">{message}</p></div>
}

const INVENTARIO_TABS = ['unidades', 'taller', 'alertas', 'reservas', 'traslados', 'vendidos', 'transito', 'ubicaciones', 'compartido', 'eliminados', 'conteos']
const ESTADO_CONTEO = { DRAFT: ['Borrador', 'orange'], APPLIED: ['Aplicado', 'green'], CANCELLED: ['Cancelado', 'slate'] }

export default function Inventario({ tab: tabProp, onTabChange } = {}) {
  // La búsqueda global abre Unidades con ?q=<serial> ya aplicado.
  const [searchParams] = useSearchParams()
  const qParam = searchParams.get('q') || ''
  const [products, setProducts] = useState([]), [branches, setBranches] = useState([]), [units, setUnits] = useState([]), [removedUnits, setRemovedUnits] = useState([]), [reservations, setReservations] = useState([]), [transfers, setTransfers] = useState([]), [locations, setLocations] = useState([])
  const apiMode = modoDatosActual() === 'api'
  const { sesion, sucursal, esDemo } = useSesion()
  // #213: en demo el inventario usa los mismos recursos (store session-only).
  const inventarioOperativo = apiMode || esDemo
  const canViewAlerts = Boolean(sesion?.esPropietario || sesion?.rol === 'GERENTE')
  const canManageLocations = Boolean(sesion?.esPropietario || sesion?.rol === 'GERENTE')
  const canManageVisibility = Boolean(sesion?.esPropietario)
  const [tab, setTab] = useState(tabProp && INVENTARIO_TABS.includes(tabProp) && (tabProp !== 'alertas' || canViewAlerts) ? tabProp : 'unidades'), [query, setQuery] = useState(qParam), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [orden, recordarOrden] = useUltimoUsado('inventario:orden', 'recientes'), [exportando, setExportando] = useState(false)
  const [stockAlerts, setStockAlerts] = useState({ alerts: [], outOfStock: [] })
  const toast = useToast()
  const [seleccionados, setSeleccionados] = useState([])
  const [gondolaOpen, setGondolaOpen] = useState(false)
  const unidadesElegidas = () => units.filter((unit) => seleccionados.includes(unit.id))
  async function copiarImeis() {
    const texto = unidadesElegidas().map((unit) => `${nombreProducto(unit.product || {})} · IMEI ${unit.serial || ''}`).join('\n')
    if (await copiarAlPortapapeles(texto)) toast.success(`${unidadesElegidas().length} IMEI(s) copiados.`); else toast.error('No se pudieron copiar los IMEIs.')
  }
  function exportarUnidadesSeleccionadas() {
    const lista = unidadesElegidas()
    const filas = [['Producto', 'IMEI / Serial', 'Condición', 'Ubicación', 'Verificado'], ...lista.map((unit) => [nombreProducto(unit.product || {}), unit.serial || '', conditionLabel[unit.condition] || unit.condition || '', unit.location?.name || '', unit.lastVerifiedAt ? fechaVerificacion(unit.lastVerifiedAt) : 'Sin verificar'])]
    const csv = filas.map((fila) => fila.map((celda) => `"${String(celda).replace(/"/g, '""')}"`).join(',')).join('\n')
    descargarCsvCliente('mobos-unidades-seleccionadas.csv', csv)
    toast.success(`${lista.length} unidad(es) exportadas.`)
  }
  const [alertsLoading, setAlertsLoading] = useState(false)
  const [alertsError, setAlertsError] = useState('')
  const [threshold, setThreshold] = useState(null)
  const [thresholdValue, setThresholdValue] = useState('')
  const [detalleUnidad, setDetalleUnidad] = useState(null)
  const [vistaUnidades, cambiarVistaUnidades] = useVistaListaGrid('inventario')
  const [vistaUbicaciones, cambiarVistaUbicaciones] = useVistaListaGrid('ubicaciones', 'grid')
  // #209: selecciones frecuentes arrancan con el último usado; se avisa en
  // pantalla y siempre se puede cambiar.
  const [motivoBajaRecordado, recordarMotivoBaja] = useUltimoUsado('inventario:motivo-baja')
  const [motivoRevisionRecordado, recordarMotivoRevision] = useUltimoUsado('inventario:motivo-revision')
  const [altaSucursalRecordada, recordarAltaSucursal] = useUltimoUsado('inventario:alta-sucursal')
  const [altaDepositoRecordado, recordarAltaDeposito] = useUltimoUsado('inventario:alta-deposito')
  const [recepcionDepositoRecordado, recordarRecepcionDeposito] = useUltimoUsado('inventario:recepcion-deposito')
  const [scannerOpen, setScannerOpen] = useState(false), [receiveOpen, setReceiveOpen] = useState(false), [reserveOpen, setReserveOpen] = useState(false), [transferOpen, setTransferOpen] = useState(false)
  const [reasonAction, setReasonAction] = useState(null), [reason, setReason] = useState(''), [reasonKind, setReasonKind] = useState('')
  const [arrivalUnit, setArrivalUnit] = useState(null), [arrivalLocationId, setArrivalLocationId] = useState('')
  // #218: recepción de un lote completo (transferencia) con depósito destino.
  const [receiveBatch, setReceiveBatch] = useState(null)
  // #217/#215: Vendidos con filtros hoy/ayer/rango y fecha/hora de la venta.
  const [filtroVendidos, setFiltroVendidos] = useState({ periodo: 'todos', desde: '', hasta: '' })
  // Conteo físico rápido con cámara: escanea cada equipo y contrasta contra stock.
  const [countOpen, setCountOpen] = useState(false)
  const [countSession, setCountSession] = useState(null) // { scanning, found: Map, unknown: [], duplicates: [], flash }
  const [receive, setReceive] = useState({ productId: '', serial: '', branchId: '', locationId: '', condition: 'NEW', batteryHealth: '', supplierName: '', costCurrency: 'PYG', originalCost: '', exchangeRatePyg: '', notes: '' })
  const [proveedores, setProveedores] = useState([])
  const [cotizacion, setCotizacion] = useState(null)
  const [reserve, setReserve] = useState({ serials: '', customerName: '', customerId: '', hours: '2' })
  const [reserveMatches, setReserveMatches] = useState([])
  const reserveTimer = useRef(null)
  const [guiaPara, setGuiaPara] = useState(null)
  const [remitoQr, setRemitoQr] = useState(null), [remitoQrImg, setRemitoQrImg] = useState(''), [remitoQrBusy, setRemitoQrBusy] = useState(false), [remitoQrError, setRemitoQrError] = useState('')
  const remitoQrSeq = useRef(0)
  const [tracking, setTracking] = useState(null)
  const [etiquetaAex, setEtiquetaAex] = useState(null) // { guia, formato, partida, busy, error, unconfigured, webUrl }
  const [envioAex, setEnvioAex] = useState(null)
  const [transfer, setTransfer] = useState({ sourceBranchId: '', destinationBranchId: '', destinationLocationId: '', productId: '', serials: '', notes: '' })
  const [transferAuth, setTransferAuth] = useState(null)
  const [locationForm, setLocationForm] = useState(null) // { id?, name, code, branchId }
  const [recipientQuery, setRecipientQuery] = useState('')
  const [recipientResults, setRecipientResults] = useState([])
  const [searchingRecipient, setSearchingRecipient] = useState(false)
  const [recipientError, setRecipientError] = useState('')
  const [grants, setGrants] = useState([])
  const [receivedStock, setReceivedStock] = useState([])
  const [visibilityError, setVisibilityError] = useState('')
  // Aviso del resultado de una etiqueta: el respaldo con diálogo se abre solo
  // (dentro de las funciones de impresión); acá se informa el resto.
  const avisarImpresion = (resultado, nombre = 'Etiqueta') => {
    if (!resultado) return
    if (resultado.ok && !resultado.encolado) { setNotice(`${nombre} enviada a la impresora.`); return }
    if (resultado.ok && resultado.encolado) {
      setNotice(resultado.remoto ? `${nombre} encolada: la imprime el puente cuando la reclame.` : `${nombre} encolada: la impresora no respondió y se reintenta sola.`)
      return
    }
    if (!puedeCaerAlDialogo(resultado)) setError(resultado.error || `No se pudo imprimir ${nombre.toLowerCase()}.`)
  }
  // Comprobante rápido desde Vendidos (#215 §10): un clic en el ícono, sin
  // abrir la ficha ni salir de la lista.
  async function imprimirComprobanteRapido(unit) {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      avisarImpresion(await printQuickReceipt(unit), 'Comprobante')
    } catch (cause) {
      setError(cause?.message || 'No se pudo imprimir el comprobante de la venta.')
    } finally {
      setBusy(false)
    }
  }
  // ADMIN y GERENTE transfieren por su rol; el resto necesita autorización.
  const puedeTransferirSinAuth = sesion?.rol === 'dueno' || sesion?.rol === 'GERENTE'
  const transferSerials = transfer.serials.split(/[\n,;]+/).map(normalizeScan).filter(Boolean)
  useEffect(() => { setTransferAuth(null) }, [transfer.sourceBranchId, transfer.destinationBranchId, transfer.productId, transfer.serials])
  // La pestaña activa vive en la URL (/inventario/<slug>). Sin slug válido o sin
  // permiso para Alertas, se cae en Unidades.
  const refresh = useCallback(async (search) => {
    if (!inventarioOperativo) return
    setBusy(true); setError('')
    try {
      const [nextUnits, nextRemoved, nextReservations, nextTransfers, nextLocations, nextBranches] = await Promise.all([resources.inventoryUnits.list(search), resources.inventoryUnits.list(search, 'removed'), resources.inventoryReservations.list(), resources.transfers.list(), resources.stockLocations.list(), resources.inventoryBranches.list()])
      setUnits(nextUnits); setRemovedUnits(nextRemoved); setReservations(nextReservations); setTransfers(nextTransfers); setLocations(nextLocations); setBranches(nextBranches); setProducts(getProductos())
    } catch (cause) { setError(cause?.message || 'No se pudo actualizar el inventario.') } finally { setBusy(false) }
  }, [inventarioOperativo])
  const busquedaDiferida = useBusquedaDiferida(query)
  useEffect(() => { refresh(busquedaDiferida) }, [refresh, busquedaDiferida])
  // Catálogo de proveedores (para sugerir al recibir) y cotización de hoy para
  // precargar el costo en dólares. Los dos son opcionales: si fallan, se sigue a mano.
  useEffect(() => {
    if (!inventarioOperativo) return
    let activo = true
    suppliersApi.list().then(rows => { if (activo) setProveedores(Array.isArray(rows) ? rows : []) }).catch(() => { if (activo) setProveedores([]) })
    Promise.resolve(cotizacionReferencia()).then(valor => { if (activo) setCotizacion(valor) }).catch(() => {})
    return () => { activo = false }
  }, [inventarioOperativo])
  useEffect(() => { if (qParam) setQuery(qParam) }, [qParam])
  useEffect(() => { if (detalleUnidad) setDetalleUnidad(current => units.find(unit => unit.id === current.id) || current) }, [units]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!apiMode || tab !== 'compartido') return undefined
    let active = true
    setVisibilityError('')
    Promise.all([resources.sharedStock.list().catch(() => []), canManageVisibility ? resources.sharedStock.mine().catch(() => []) : Promise.resolve([])])
      .then(([received, mine]) => { if (active) { setReceivedStock(received); setGrants(mine) } })
      .catch(() => { if (active) setVisibilityError('No se pudo cargar la disponibilidad compartida.') })
    return () => { active = false }
  }, [tab, apiMode, canManageVisibility])
  const loadAlerts = useCallback(async () => {
    if (!inventarioOperativo || !canViewAlerts) return
    setAlertsLoading(true); setAlertsError('')
    const params = new URLSearchParams()
    if (sucursal?.id) params.set('branchId', sucursal.id)
    const query = params.toString() ? `?${params}` : ''
    try {
      const payload = await api.get(`/api/stock-alerts${query}`)
      setStockAlerts(payload || { alerts: [], outOfStock: [] })
    } catch (cause) { setAlertsError(cause?.message || 'No se pudieron cargar las alertas.') } finally { setAlertsLoading(false) }
  }, [inventarioOperativo, canViewAlerts, sucursal?.id])
  useEffect(() => { loadAlerts() }, [loadAlerts])
  const tabValido = (value) => INVENTARIO_TABS.includes(value)
  // La URL manda: si cambia por atrás/adelante o por un enlace profundo, la
  // pestaña activa sigue al prop.
  useEffect(() => {
    if (tabValido && tabValido(tabProp) && tabProp !== tab) setTab(tabProp)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabProp])
  async function saveThreshold(event) {
    event.preventDefault()
    const value = Number(thresholdValue)
    if (!threshold || !Number.isInteger(value) || value < 0 || value > 99999) return
    setBusy(true); setError('')
    try {
      if (esDemo) updateProducto(threshold.id, { reorderPoint: value })
      else await api.patch('/api/products', { id: threshold.id, reorderPoint: value })
      setNotice(`Umbral de ${threshold.name} actualizado a ${value}.`)
      setThreshold(null)
      await loadAlerts()
    } catch (cause) { setError(cause?.message || 'No se pudo actualizar el umbral.') } finally { setBusy(false) }
  }
  const availableProducts = useMemo(() => products.filter(product => product.branchId), [products])
  const filtroBusqueda = lista => { const q = query.trim().toLowerCase(); if (!q) return lista; return lista.filter(unit => [unit.serial, unit.product?.name, unit.reservationCustomer, unit.notes, unit.supplierName].some(valor => String(valor || '').toLowerCase().includes(q))) }
  const modeloNatural = unit => { const numero = String(unit.product?.model || unit.product?.name || '').match(/(\d{2})/); return numero ? Number(numero[1]) : 0 }
  const ordenarUnidades = lista => { const nombre = unit => String(unit.product?.name || '').toLowerCase(); switch (orden) { case 'modelo-az': return [...lista].sort((a, b) => nombre(a).localeCompare(nombre(b))); case 'modelo-za': return [...lista].sort((a, b) => nombre(b).localeCompare(nombre(a))); case 'nuevos': return [...lista].sort((a, b) => (a.condition === 'NEW' ? -1 : 1) - (b.condition === 'NEW' ? -1 : 1) || nombre(a).localeCompare(nombre(b))); case 'semis': return [...lista].sort((a, b) => (a.condition !== 'NEW' ? -1 : 1) - (b.condition !== 'NEW' ? -1 : 1) || nombre(a).localeCompare(nombre(b))); case 'mezclado': return [...lista].sort((a, b) => nombre(a).localeCompare(nombre(b))); case 'modelo-natural': return [...lista].sort((a, b) => modeloNatural(b) - modeloNatural(a) || nombre(a).localeCompare(nombre(b))); case 'costo-mayor': return [...lista].sort((a, b) => (costoEnGs(b) ?? 0) - (costoEnGs(a) ?? 0)); case 'costo-menor': return [...lista].sort((a, b) => (costoEnGs(a) ?? 0) - (costoEnGs(b) ?? 0)); default: return lista } }
  // Inventario: la unidad sigue acá mientras no haya salido del local. Por eso
  // entran reservadas, en revisión y vendidas sin entregar.
  const disponibles = ordenarUnidades(filtroBusqueda(units.filter(sigueEnInventario)))
  const sinCostoUnits = units.filter(sinCostoUnitario)
  const vendidos = filtroBusqueda(units.filter(unit => unit.status === 'SOLD'))
  const fechaDeVenta = unit => unit.sale?.soldAt || unit.sale?.createdAt || unit.updatedAt || null
  const vendidosFiltrados = vendidos.filter(unit => {
    if (filtroVendidos.periodo === 'todos') return true
    const fecha = fechaDeVenta(unit)
    if (!fecha) return false
    const dia = new Date(fecha)
    const mismoDia = otro => dia.toDateString() === otro.toDateString()
    if (filtroVendidos.periodo === 'hoy') return mismoDia(new Date())
    if (filtroVendidos.periodo === 'ayer') return mismoDia(new Date(Date.now() - 86400000))
    const desde = filtroVendidos.desde ? new Date(`${filtroVendidos.desde}T00:00:00`) : null
    const hasta = filtroVendidos.hasta ? new Date(`${filtroVendidos.hasta}T23:59:59`) : null
    return (!desde || dia >= desde) && (!hasta || dia <= hasta)
  })
  const enTransito = filtroBusqueda(units.filter(unit => unit.status === 'IN_TRANSIT'))
  // Traslado dueño del adjunto al recibir: la unidad en tránsito viene de una
  // línea de transferencia que la incluye entre sus IMEI.
  const transferDeArrival = useMemo(() => arrivalUnit ? transfers.find(item => item.lines?.some(line => Array.isArray(line.serials) && line.serials.includes(arrivalUnit.serial))) : null, [arrivalUnit, transfers])
  const locationsFor = branchId => locations.filter(location => location.branchId === branchId && location.isActive)
  const grantedIds = useMemo(() => new Set(grants.filter(grant => grant.isActive).map(grant => grant.recipientTenant?.id).filter(Boolean)), [grants])
  const receivedBySource = useMemo(() => receivedStock.reduce((acc, row) => { const key = row.sourceTenant || 'Otra empresa'; (acc[key] ||= []).push(row); return acc }, {}), [receivedStock])
  const setAndRefresh = async (operation, success) => { setBusy(true); setError(''); setNotice(''); try { await operation(); setNotice(success); await refresh(query); } catch (cause) { setError(cause?.message || 'No se pudo guardar.') } finally { setBusy(false) } }
  async function search(event) { event.preventDefault(); await refresh(busquedaDiferida) }
  async function exportarUnidades() { setExportando(true); setError(''); try { await descargarCsv('inventory-units', { q: query.trim() || undefined, orden }, 'mobos-inventario-unidades.csv') } catch (cause) { setError(cause?.message || 'No se pudo exportar el CSV.') } finally { setExportando(false) } }
  async function verify(unit) { await setAndRefresh(() => resources.inventoryUnits.verify({ serial: unit.serial }), `IMEI ${unit.serial.slice(-4)} verificado.`) }
  // Rack (#240 §4): verificación en serie, un solo refresh y un solo aviso.
  async function verificarLote(lista = []) {
    if (!lista.length) return
    await setAndRefresh(async () => {
      for (const unit of lista) await resources.inventoryUnits.verify({ serial: unit.serial })
    }, `${lista.length} ${lista.length === 1 ? 'unidad verificada' : 'unidades verificadas'}.`)
  }
  // #209: la carga rápida arranca con la última sucursal y depósito usados.
  // Si los catálogos todavía no cargaron se confía en lo recordado (se validó
  // al guardarlo); cuando ya están, se valida que sigan existiendo.
  function abrirReceive() {
    const branchId = !branches.length || branches.some(branch => branch.id === altaSucursalRecordada) ? altaSucursalRecordada : ''
    const locationId = !locations.length || locations.some(location => location.id === altaDepositoRecordado && location.branchId === branchId && location.isActive) ? altaDepositoRecordado : ''
    setReceive(data => ({ ...data, branchId: data.branchId || branchId, locationId: data.locationId || locationId }))
    setReceiveOpen(true)
  }
  // #209: la recepción en tránsito arranca con el último depósito usado.
  function abrirLlegada(unit) {
    const locationId = !locations.length || locations.some(location => location.id === recepcionDepositoRecordado && location.branchId === unit?.branchId && location.isActive) ? recepcionDepositoRecordado : ''
    setArrivalLocationId(locationId)
    setArrivalUnit(unit)
  }
  async function receiveUnit(event) { event.preventDefault(); const lineas = receive.serial.split(/[\n,;]+/).map(normalizeScan).filter(Boolean); const ubicacion = lineas.find((linea) => linea.startsWith('UBI:')); const ubicacionValida = ubicacion && locations.some((location) => location.id === ubicacion.slice(4) && location.branchId === receive.branchId); if (ubicacionValida) setReceive((data) => ({ ...data, locationId: ubicacion.slice(4) })); const serials = lineas.filter((linea) => !linea.startsWith('UBI:')); if (!serials.length) { setError('Indicá al menos un IMEI/serial.'); return } const locationId = ubicacionValida ? ubicacion.slice(4) : receive.locationId
    // Costo diferido y en la moneda elegida: en Gs el monto es el total; en
    // moneda extranjera va el monto original con la cotización y el backend
    // calcula el total en guaraníes.
    const montoCosto = String(receive.originalCost || '').trim()
    const costo = receive.costCurrency === 'PYG'
      ? { costPyg: montoCosto ? Number(montoCosto) : null, costCurrency: 'PYG' }
      : { originalCost: montoCosto ? Number(montoCosto) : null, costCurrency: receive.costCurrency, ...(String(receive.exchangeRatePyg || '').trim() ? { exchangeRatePyg: Number(receive.exchangeRatePyg) } : {}) }
    await setAndRefresh(async () => {
      await resources.inventoryUnits.create({ ...receive, ...costo, locationId: locationId || null, ...(serials.length === 1 ? { serial: serials[0] } : { serials }), batteryHealth: receive.batteryHealth === '' ? undefined : Number(receive.batteryHealth) })
      if (receive.branchId) recordarAltaSucursal(receive.branchId); if (locationId) recordarAltaDeposito(locationId)
      setReceive({ productId: '', serial: '', branchId: receive.branchId, locationId, condition: 'NEW', batteryHealth: '', supplierName: '', costCurrency: 'PYG', originalCost: '', exchangeRatePyg: '', notes: '' }); setReceiveOpen(false)
    }, `${serials.length} ${serials.length === 1 ? 'unidad recibida' : 'unidades recibidas'} y stock actualizado.`) }
  async function createReservation(event) {
    event.preventDefault()
    const serials = reserve.serials.split(/[\n,;]+/).map(normalizeScan).filter(Boolean)
    if (!serials.length) return
    const horas = Number(reserve.hours)
    if (!Number.isInteger(horas) || horas < 1 || horas > 24) { setError('La reserva puede durar entre 1 y 24 horas.'); return }
    await setAndRefresh(async () => {
      // La reserva nunca crea clientes: si no existe, queda solo el nombre (o vacío).
      await resources.inventoryReservations.create({
        serials,
        ...(reserve.customerId ? { customerId: reserve.customerId } : {}),
        customerName: reserve.customerName.trim(),
        minutes: horas * 60,
      })
      setReserve({ serials: '', customerName: '', customerId: '', hours: '2' }); setReserveMatches([]); setReserveOpen(false)
    }, `Reserva creada por ${horas} ${horas === 1 ? 'hora' : 'horas'}. Se liberará automáticamente al vencer.`)
  }
  async function releaseReservation(serial) { await setAndRefresh(() => resources.inventoryReservations.release([serial]), 'Reserva liberada y unidad disponible.') }
  async function moveLocation(unit, locationId) {
    if (!unit || (unit.locationId || null) === (locationId || null)) return
    await setAndRefresh(() => resources.inventoryUnits.update({ id: unit.id, action: 'move', locationId }), locationId ? 'Ubicación actualizada.' : 'Unidad sin ubicación.')
  }
  // #216: costo en dólares editable desde la fila (lápiz) con la cotización del día.
  async function guardarCostoRapido(unit, valor) {
    const monto = Number(String(valor || '').replace(',', '.'))
    if (!Number.isFinite(monto) || monto <= 0) { setError('Indicá un costo en dólares mayor a cero.'); return }
    const rate = Number(cotizacion) > 0 ? Number(cotizacion) : undefined
    await setAndRefresh(() => resources.inventoryUnits.update({ id: unit.id, action: 'details', costCurrency: 'USD', originalCost: monto, ...(rate ? { exchangeRatePyg: rate } : {}) }), 'Costo actualizado en dólares.')
  }
  function sellUnit(unit) {
    // Se lleva producto, IMEI y —si la unidad estaba reservada— el cliente, para
    // no volver a buscarlos en Cargar venta.
    try {
      sessionStorage.setItem('mobos:venta-handoff', JSON.stringify({
        productId: unit.productId,
        serial: unit.serial,
        customerName: unit.reservationCustomer || '',
        ts: Date.now(),
      }))
    } catch { /* la venta sigue disponible sin preselección */ }
    window.location.assign('/ventas')
  }
  function startCount() { setCountSession({ scanning: true, found: new Map(), unknown: [], duplicates: [], flash: null }); setCountOpen(true) }
  function countScan(raw) {
    const serial = normalizeScan(raw)
    if (!serial) return
    setCountSession(current => {
      if (!current) return current
      if (current.found.has(serial)) return { ...current, duplicates: [...current.duplicates, serial], flash: { serial, kind: 'dup' } }
      const unit = units.find(item => item.serial === serial)
      if (unit) {
        const found = new Map(current.found)
        found.set(serial, unit)
        // La verificación física queda registrada con la auditoría de cada IMEI.
        resources.inventoryUnits.verify({ serial }).catch(() => { /* el conteo sigue aunque falle el registro */ })
        return { ...current, found, flash: { serial, kind: 'ok', unit } }
      }
      return { ...current, unknown: [...current.unknown, serial], flash: { serial, kind: 'miss' } }
    })
  }
  const countMissing = useMemo(() => countSession ? units.filter(unit => (unit.status === 'AVAILABLE' || unit.status === 'RESERVED') && !countSession.found.has(unit.serial)) : [], [countSession, units])
  useEffect(() => {
    if (!countSession?.flash) return undefined
    const timer = window.setTimeout(() => setCountSession(current => (current ? { ...current, flash: null } : current)), 2200)
    return () => window.clearTimeout(timer)
  }, [countSession?.flash])
  function copyMissing() {
    const text = countMissing.map(unit => `${unit.product?.name} · IMEI ${unit.serial}${unit.location?.name ? ` · ${unit.location.name}` : ''}`).join('\n')
    copiarAlPortapapeles(text || 'Sin faltantes.')
    setNotice(text ? 'Lista de faltantes copiada.' : 'No hay faltantes para copiar.')
  }
  // ── Conteos físicos auditables ──────────────────────────────────────
  // Documento por sucursal con escaneo incremental; la aprobación (con o sin
  // ajuste de stock) la resuelve gerencia desde el backend.
  const [conteos, setConteos] = useState([]), [conteosLoading, setConteosLoading] = useState(false), [conteosError, setConteosError] = useState('')
  const [conteoId, setConteoId] = useState(null), [conteoDetalle, setConteoDetalle] = useState(null), [conteoLoading, setConteoLoading] = useState(false), [conteoError, setConteoError] = useState('')
  const [conteoSerial, setConteoSerial] = useState(''), [conteoFlash, setConteoFlash] = useState(null), [conteoBusy, setConteoBusy] = useState(false)
  const [conteoSinSerie, setConteoSinSerie] = useState({ productId: '', quantity: '1' })
  const [nuevoConteoOpen, setNuevoConteoOpen] = useState(false), [nuevoConteoNota, setNuevoConteoNota] = useState('')
  const [aplicarConteoOpen, setAplicarConteoOpen] = useState(false), [ajustarConteo, setAjustarConteo] = useState(true)
  const [cancelarConteoOpen, setCancelarConteoOpen] = useState(false), [camaraConteoOpen, setCamaraConteoOpen] = useState(false)
  const conteoSerialRef = useRef(null)
  const escanearConteoRef = useRef(null)
  const puedeAplicarConteo = Boolean(sesion?.esPropietario || sesion?.rol === 'GERENTE')
  const cargarConteos = useCallback(async () => {
    if (!apiMode) return
    setConteosLoading(true); setConteosError('')
    try {
      const params = new URLSearchParams()
      if (sucursal?.id) params.set('branchId', sucursal.id)
      const query = params.toString() ? `?${params}` : ''
      setConteos((await api.get(`/api/inventory-counts${query}`)) || [])
    } catch (cause) { setConteosError(cause?.message || 'No se pudieron cargar los conteos.') } finally { setConteosLoading(false) }
  }, [apiMode, sucursal?.id])
  const cargarConteo = useCallback(async (id, silencioso = false) => {
    if (!id || !apiMode) return
    if (!silencioso) setConteoLoading(true)
    setConteoError('')
    try { setConteoDetalle(await api.get(`/api/inventory-counts/${encodeURIComponent(id)}`)) }
    catch (cause) { setConteoError(cause?.message || 'No se pudo cargar el conteo.') }
    finally { if (!silencioso) setConteoLoading(false) }
  }, [apiMode])
  useEffect(() => { if (tab === 'conteos') cargarConteos() }, [tab, cargarConteos])
  useEffect(() => { if (conteoId) cargarConteo(conteoId); else setConteoDetalle(null) }, [conteoId, cargarConteo])
  useEffect(() => { escanearConteoRef.current = escanearConteo })
  useEffect(() => {
    if (!conteoFlash) return undefined
    const timer = window.setTimeout(() => setConteoFlash(null), 2600)
    return () => window.clearTimeout(timer)
  }, [conteoFlash])
  const detectarConteoCamara = useCallback((raw) => { escanearConteoRef.current?.(raw) }, [])
  const cerrarCamaraConteo = useCallback(() => setCamaraConteoOpen(false), [])
  function abrirConteo(item) { setConteoError(''); setConteoSerial(''); setConteoFlash(null); setConteoDetalle(null); setConteoId(item.id) }
  function cerrarConteo() { setConteoId(null); setConteoDetalle(null); setConteoSerial(''); setConteoFlash(null); setConteoError(''); if (apiMode) cargarConteos() }
  async function crearConteo(event) {
    event.preventDefault()
    if (conteoBusy) return
    setConteoBusy(true); setConteosError('')
    try {
      const nota = nuevoConteoNota.trim()
      const creado = await api.post('/api/inventory-counts', { ...(nota ? { note: nota } : {}), ...(sucursal?.id ? { branchId: sucursal.id } : {}) })
      setNuevoConteoOpen(false); setNuevoConteoNota('')
      await cargarConteos()
      setConteoId(creado.id)
      toast.success('Conteo iniciado: escaneá los equipos y aplicalo al terminar.')
    } catch (cause) { setConteosError(cause?.message || 'No se pudo iniciar el conteo.'); setNuevoConteoOpen(false) } finally { setConteoBusy(false) }
  }
  async function escanearConteo(raw) {
    const serial = normalizeScan(raw)
    if (!serial || !conteoId || conteoBusy) return
    if ((conteoDetalle?.lines || []).some(line => line.serial === serial)) { setConteoSerial(''); setConteoFlash({ kind: 'dup', serial }); conteoSerialRef.current?.focus(); return }
    setConteoBusy(true); setConteoError('')
    try {
      const linea = await api.patch('/api/inventory-counts', { id: conteoId, action: 'scan', serial })
      setConteoSerial(''); setConteoFlash({ kind: linea.expected ? 'ok' : 'miss', serial })
      await cargarConteo(conteoId, true)
      conteoSerialRef.current?.focus()
    } catch (cause) { setConteoError(cause?.message || 'No se pudo registrar el escaneo.') } finally { setConteoBusy(false) }
  }
  async function enviarEscaneo(event) { event.preventDefault(); await escanearConteo(conteoSerial) }
  async function sumarSinSerie(event) {
    event.preventDefault()
    const quantity = Number(conteoSinSerie.quantity)
    if (!conteoId || !conteoSinSerie.productId || !Number.isSafeInteger(quantity) || quantity < 1 || conteoBusy) return
    setConteoBusy(true); setConteoError('')
    try {
      await api.patch('/api/inventory-counts', { id: conteoId, action: 'scan', productId: conteoSinSerie.productId, quantity })
      setConteoSinSerie({ productId: '', quantity: '1' })
      await cargarConteo(conteoId, true)
    } catch (cause) { setConteoError(cause?.message || 'No se pudo sumar el producto sin serie.') } finally { setConteoBusy(false) }
  }
  async function aplicarConteo() {
    if (!conteoId || conteoBusy) return
    setConteoBusy(true); setConteoError('')
    try {
      const resultado = await api.patch('/api/inventory-counts', { id: conteoId, action: 'apply', adjust: ajustarConteo })
      setAplicarConteoOpen(false)
      await Promise.all([cargarConteo(conteoId, true), cargarConteos()])
      await refresh(busquedaDiferida)
      toast.success(ajustarConteo ? `Conteo aplicado: ${resultado.missing} faltante(s) pasaron a defectuoso y el stock se recalculó.` : `Conteo aprobado sin ajustar stock (${resultado.missing} faltante(s)).`)
    } catch (cause) { setConteoError(cause?.message || 'No se pudo aplicar el conteo.'); setAplicarConteoOpen(false) } finally { setConteoBusy(false) }
  }
  async function cancelarConteo() {
    if (!conteoId || conteoBusy) return
    setConteoBusy(true); setConteoError('')
    try {
      await api.patch('/api/inventory-counts', { id: conteoId, action: 'cancel' })
      setCancelarConteoOpen(false)
      await Promise.all([cargarConteo(conteoId, true), cargarConteos()])
      toast.success('Conteo cancelado. El stock no cambió.')
    } catch (cause) { setConteoError(cause?.message || 'No se pudo cancelar el conteo.'); setCancelarConteoOpen(false) } finally { setConteoBusy(false) }
  }
  function openReserveFor(unit) {
    // La reserva se abre sobre el inventario, no detrás del detalle de la unidad.
    setDetalleUnidad(null)
    setReserve({ serials: unit.serial, customerName: '', customerId: '', hours: '2' })
    setReserveMatches([])
    setReserveOpen(true)
  }
  function buscarClienteReserva(texto) {
    setReserve(data => ({ ...data, customerName: texto, customerId: '' }))
    if (reserveTimer.current) clearTimeout(reserveTimer.current)
    reserveTimer.current = setTimeout(async () => {
      const q = texto.trim()
      if (q.length < 2) { setReserveMatches([]); return }
      try { setReserveMatches((await api.get(`/api/customers?q=${encodeURIComponent(q)}`)) || []) } catch { setReserveMatches([]) }
    }, 250)
  }
  function unidadesDeTransferencia(transfer) {
    const seriales = new Set((transfer?.lines || []).flatMap(line => line.serials || []))
    return [...units, ...removedUnits].filter(unit => seriales.has(unit.serial))
  }
  async function confirmarRecepcionLote(event) {
    event.preventDefault()
    const transfer = receiveBatch?.transfer
    const seriales = (transfer?.lines || []).flatMap(line => line.serials || [])
    if (!transfer || !seriales.length) { setError('El lote no tiene seriales para recibir.'); return }
    setReceiveBatch(current => ({ ...current, busy: true }))
    try {
      await setAndRefresh(async () => {
        for (const serial of seriales) await resources.inventoryUnits.verify({ serial, ...(receiveBatch.locationId ? { locationId: receiveBatch.locationId } : {}) })
        if (receiveBatch.locationId) recordarRecepcionDeposito(receiveBatch.locationId)
        setReceiveBatch(null)
      }, `Lote recibido: ${seriales.length} equipo(s) disponibles en stock.`)
    } catch (cause) { setError(cause?.message || 'No se pudo recibir el lote.'); setReceiveBatch(current => (current ? { ...current, busy: false } : current)) }
  }
  async function receiveArrival(event) {
    event.preventDefault()
    const unit = arrivalUnit
    if (!unit) return
    const locationId = arrivalLocationId || null
    await setAndRefresh(async () => { await resources.inventoryUnits.verify({ serial: unit.serial, ...(locationId ? { locationId } : {}) }); if (locationId) recordarRecepcionDeposito(locationId); setArrivalUnit(null); setArrivalLocationId('') }, `IMEI ${ultimos4(unit.serial)} recibido en sucursal y disponible en stock.`)
  }
  async function saveLocation(event) {
    event.preventDefault()
    const form = locationForm
    if (!form?.name?.trim() || !form?.branchId) { setError('Sucursal y nombre son obligatorios.'); return }
    await setAndRefresh(async () => {
      const payload = { name: form.name.trim(), code: form.code?.trim() ? form.code.trim() : null, color: form.color || null }
      if (form.id) await resources.stockLocations.update({ id: form.id, ...payload })
      else await resources.stockLocations.create({ branchId: form.branchId, ...payload })
      setLocationForm(null)
    }, form.id ? 'Ubicación actualizada.' : 'Ubicación creada. Ya podés asignarla al recibir o trasladar unidades.')
  }
  async function guardarGuia(event) {
    event.preventDefault()
    const guia = (guiaPara?.guia || '').trim()
    if (!guia || !guiaPara?.id) return
    await setAndRefresh(async () => { await resources.transfers.update({ id: guiaPara.id, aexGuide: guia }); setGuiaPara(null) }, 'Guía AEX adjuntada al traslado.')
  }
  // Enlace/QR del remito: el destino confirma la recepción desde el teléfono;
  // regenerar invalida el enlace anterior.
  async function prepararRemitoQr(item) {
    const seq = ++remitoQrSeq.current
    setRemitoQr({ ...item, publicToken: item.publicToken || '' }); setRemitoQrImg(''); setRemitoQrError(''); setRemitoQrBusy(true)
    try {
      const data = await resources.transfers.accessToken(item.id)
      if (seq !== remitoQrSeq.current) return
      const token = data?.token || ''
      if (!token) throw new Error('No se pudo preparar el enlace.')
      setRemitoQr(current => current && current.id === item.id ? { ...current, publicToken: token } : current)
      const url = transferReceiveUrlFor(token)
      if (url) setRemitoQrImg(await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 220 }))
    } catch (cause) {
      if (seq === remitoQrSeq.current) setRemitoQrError(cause?.message || 'No se pudo preparar el enlace.')
    } finally { if (seq === remitoQrSeq.current) setRemitoQrBusy(false) }
  }
  async function regenerarRemitoQr() {
    if (!remitoQr || remitoQrBusy) return
    const seq = ++remitoQrSeq.current
    setRemitoQrBusy(true); setRemitoQrError('')
    try {
      const data = await resources.transfers.accessToken(remitoQr.id, true)
      if (seq !== remitoQrSeq.current) return
      const token = data?.token || ''
      if (!token) throw new Error('No se pudo regenerar el enlace.')
      setRemitoQr(current => current ? { ...current, publicToken: token } : current)
      const url = transferReceiveUrlFor(token)
      if (url) setRemitoQrImg(await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 220 }))
      setNotice('Enlace regenerado: el remito impreso con el QR anterior ya no confirma la recepción.')
    } catch (cause) {
      if (seq === remitoQrSeq.current) setRemitoQrError(cause?.message || 'No se pudo regenerar el enlace.')
    } finally { if (seq === remitoQrSeq.current) setRemitoQrBusy(false) }
  }
  async function copiarRemitoQr() {
    const url = transferReceiveUrlFor(remitoQr?.publicToken)
    if (!url) return
    if (await copiarAlPortapapeles(url)) setNotice('Enlace del remito copiado al portapapeles.'); else setRemitoQrError('No se pudo copiar el enlace.')
  }
  async function cotizarEnvio(item) {
    setEnvioAex({ transferId: item.id, pesoKg: '1', quotes: null, busy: true, unconfigured: false, webUrl: '', resultado: null })
    try {
      const resultado = await api.post('/api/aex/ship', { transferId: item.id, pesoKg: 1 })
      if (resultado?.unconfigured) { setEnvioAex(current => ({ ...current, busy: false, unconfigured: true, webUrl: resultado.webUrl })); window.open(resultado.webUrl, '_blank', 'noopener,noreferrer'); return }
      setEnvioAex(current => ({ ...current, busy: false, quotes: resultado?.quotes || [], origen: resultado?.origen, destino: resultado?.destino }))
    } catch (cause) { setError(cause?.message || 'No se pudo cotizar el envío.'); setEnvioAex(null) }
  }
  async function confirmarEnvio(event) {
    event.preventDefault()
    if (!envioAex?.transferId || envioAex.busy) return
    setEnvioAex(current => ({ ...current, busy: true }))
    try {
      const resultado = await api.post('/api/aex/ship', { transferId: envioAex.transferId, pesoKg: Number(envioAex.pesoKg) || 1, confirm: true })
      if (resultado?.unavailable) { setEnvioAex(current => ({ ...current, busy: false, unavailable: true, webUrl: resultado.webUrl })); return }
      setEnvioAex(null)
      setNotice(`Envío AEX confirmado. Guía ${resultado.guide} · ${gs(resultado.costPyg)} · ${resultado.serviceName}`)
      await refresh()
    } catch (cause) { setError(cause?.message || 'No se pudo confirmar el envío.'); setEnvioAex(null) }
  }
  async function seguirGuia(item) {
    setTracking({ guia: item.aexGuide, loading: true, unconfigured: false, webUrl: '', events: [] })
    try {
      const resultado = await api.get(`/api/aex/tracking?guia=${encodeURIComponent(item.aexGuide)}`)
      if (resultado?.unconfigured) {
        setTracking(current => ({ ...current, loading: false, unconfigured: true, webUrl: resultado.webUrl }))
        window.open(resultado.webUrl, '_blank', 'noopener,noreferrer')
      } else {
        setTracking({ guia: item.aexGuide, loading: false, unconfigured: false, webUrl: resultado?.webUrl || '', events: resultado?.events || [] })
      }
    } catch (cause) { setError(cause?.message || 'No se pudo consultar el seguimiento.'); setTracking(null) }
  }
  // Etiqueta/guía AEX: el PDF lo genera AEX y lo descarga el servidor (la
  // clave privada nunca llega al navegador). Se abre en una pestaña para que el
  // diálogo de impresión del sistema elija la etiqueta térmica o el A4.
  function abrirEtiquetaAex(item) {
    setEtiquetaAex({ guia: item.aexGuide, formato: 'etiqueta8x6', partida: false, busy: false, error: '', unconfigured: false, webUrl: '' })
  }
  async function imprimirEtiquetaAex(event) {
    event.preventDefault()
    const actual = etiquetaAex
    if (!actual?.guia || actual.busy) return
    setEtiquetaAex(current => ({ ...current, busy: true, error: '', unconfigured: false }))
    try {
      const query = new URLSearchParams({ guia: actual.guia, formato: actual.formato, ...(actual.partida ? { partida: '1' } : {}) })
      const response = await apiFetch(`/api/aex/label?${query}`)
      const tipo = response.headers.get('content-type') || ''
      if (!response.ok || !tipo.includes('application/pdf')) {
        const data = tipo.includes('application/json') ? await response.json() : null
        if (data?.unconfigured) {
          setEtiquetaAex(current => ({ ...current, busy: false, unconfigured: true, webUrl: data.webUrl || '' }))
          window.open(data.webUrl, '_blank', 'noopener,noreferrer')
          return
        }
        throw new Error(data?.message || 'AEX no pudo generar la etiqueta.')
      }
      const url = URL.createObjectURL(await response.blob())
      const abierta = window.open(url, '_blank', 'noopener,noreferrer')
      if (!abierta) {
        const link = document.createElement('a')
        link.href = url
        link.download = `aex-${actual.guia}.pdf`
        document.body.appendChild(link)
        link.click()
        link.remove()
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000)
      setEtiquetaAex(null)
      setNotice(`Etiqueta de la guía ${actual.guia} lista para imprimir.`)
    } catch (cause) {
      setEtiquetaAex(current => ({ ...current, busy: false, error: cause?.message || 'No se pudo descargar la etiqueta.' }))
    }
  }
  async function toggleLocation(location) { await setAndRefresh(() => resources.stockLocations.update({ id: location.id, isActive: !location.isActive }), location.isActive ? 'Ubicación desactivada. Deja de aparecer al recibir unidades.' : 'Ubicación reactivada.') }
  async function searchRecipients(event) {
    event.preventDefault()
    const query = recipientQuery.trim()
    if (query.length < 2) return
    setSearchingRecipient(true); setRecipientError(''); setRecipientResults([])
    try { setRecipientResults(await resources.tenants.search(query)) } catch (cause) { setRecipientError(cause?.message || 'No se pudo buscar.') } finally { setSearchingRecipient(false) }
  }
  async function setGrant(tenantId, isActive, name) {
    setBusy(true); setError(''); setNotice('')
    try {
      await resources.sharedStock.setGrant({ recipientTenantId: tenantId, isActive })
      setNotice(`${name}: ${isActive ? 'ahora ve tu disponibilidad.' : 'permiso revocado.'}`)
      const [received, mine] = await Promise.all([resources.sharedStock.list().catch(() => []), resources.sharedStock.mine().catch(() => [])])
      setReceivedStock(received); setGrants(mine)
    } catch (cause) { setError(cause?.message || 'No se pudo actualizar el permiso.') } finally { setBusy(false) }
  }
  function cambiarTab(next) {
    if (!tabValido(next)) return
    setTab(next)
    // Conteos vive solo en esta pantalla: el slug no está en la whitelist del
    // panel, así que no se navega y la URL conserva la pestaña anterior.
    if (next !== 'conteos') onTabChange?.(next)
  }
  function requestReason(kind, unitOrUnits) {
    const units = Array.isArray(unitOrUnits) ? unitOrUnits : [unitOrUnits]
    const unit = units[0]
    const esBaja = kind === 'remove'
    const habilita = kind === 'adjust' && unit?.status === 'DEFECTIVE'
    const opciones = esBaja ? MOTIVOS_BAJA : MOTIVOS_REVISION
    const recordado = esBaja ? motivoBajaRecordado : motivoRevisionRecordado
    setReason('')
    setReasonKind(!habilita && opciones.includes(recordado) ? recordado : '')
    setReasonAction({ kind, units, unit })
  }
  async function applyReason(event) {
    event.preventDefault()
    if (!reason.trim() || !reasonAction) return
    const { kind, units = [], unit } = reasonAction
    const objetivos = units.length ? units : [unit]
    const motivo = reasonKind ? `${reasonKind}: ${reason.trim()}` : reason.trim()
    if (kind === 'remove' && reasonKind) recordarMotivoBaja(reasonKind)
    if (kind === 'adjust' && reasonKind && objetivos[0]?.status !== 'DEFECTIVE') recordarMotivoRevision(reasonKind)
    for (const target of objetivos) {
      const lastFour = ultimos4(target.serial)
      if (kind === 'adjust') {
        const status = target.status === 'DEFECTIVE' ? 'AVAILABLE' : 'DEFECTIVE'
        await setAndRefresh(() => resources.inventoryUnits.update({ id: target.id, action: 'adjust', status, reason: motivo }), `IMEI ${lastFour} marcado como ${status === 'DEFECTIVE' ? 'en revisión' : 'disponible'}.`)
      } else if (kind === 'remove') {
        await setAndRefresh(() => resources.inventoryUnits.update({ id: target.id, action: 'remove', reason: motivo }), `IMEI ${lastFour} retirado. Podés restaurarlo desde Eliminados.`)
      } else {
        await setAndRefresh(() => resources.inventoryUnits.update({ id: target.id, action: 'restore', reason: reason.trim() }), `IMEI ${lastFour} restaurado a disponible.`)
      }
    }
    setReasonAction(null)
  }
  async function createTransfer(event) { event.preventDefault(); const serials = transfer.serials.split(/[\n,;]+/).map(normalizeScan).filter(Boolean); if (!serials.length) { setError('Indicá al menos un IMEI/serial para trasladar.'); return }; if (!puedeTransferirSinAuth && !transferAuth) { setError('Tu rol necesita autorización de gerencia para transferir entre sucursales. Solicitá la autorización y esperá la aprobación.'); return }; await setAndRefresh(async () => { await resources.transfers.create({ ...transfer, destinationLocationId: transfer.destinationLocationId || null, lines: [{ productId: transfer.productId, quantity: serials.length, serials }], ...(transferAuth && !puedeTransferirSinAuth ? { transferAuthorizationId: transferAuth.id } : {}) }); setTransfer({ sourceBranchId: '', destinationBranchId: '', destinationLocationId: '', productId: '', serials: '', notes: '' }); setTransferAuth(null); setTransferOpen(false) }, 'Transferencia registrada con trazabilidad por IMEI.') }
  if (!inventarioOperativo) return <Card><h2 className="font-bold">Inventario operativo</h2><p className="mt-2 text-sm text-mute">Ingresá con una cuenta real para controlar IMEI, reservas, ubicaciones y transferencias. La demo conserva sus datos aislados.</p></Card>
  return <div className="space-y-4"><Card className="p-4 md:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-mute">Cada IMEI es una unidad física con sucursal, ubicación, estado y auditoría.</p><div className="flex shrink-0 flex-wrap items-center gap-2"><Button onClick={abrirReceive}>+ Recibir unidad</Button><Button variant="outline" onClick={() => setReserveOpen(true)}>Reservar</Button><Button variant="outline" onClick={() => setTransferOpen(true)}>Transferir</Button></div></div><form onSubmit={search} className="mt-4 flex flex-wrap gap-2"><SearchField value={query} onChange={event => setQuery(event.target.value)} placeholder="Escanear IMEI, SKU o buscar modelo" ariaLabel="Buscar en inventario" className="min-w-0 flex-1" /><Select value={orden} onChange={event => recordarOrden(event.target.value)} className="w-auto" aria-label="Orden del inventario" title="Se recuerda tu último orden"><option value="recientes">Recientes</option><option value="modelo-az">Modelo A→Z</option><option value="modelo-za">Modelo Z→A</option><option value="nuevos">Nuevos primero</option><option value="semis">Seminuevos primero</option><option value="modelo-natural">Modelo (17→13)</option><option value="mezclado">Modelos mezclados</option><option value="costo-mayor">Costo mayor</option><option value="costo-menor">Costo menor</option></Select><Button type="button" variant="outline" onClick={() => setScannerOpen(true)}>Escanear</Button><Button type="button" variant="outline" onClick={startCount}>Conteo rápido</Button><ListGridToggle value={vistaUnidades} onChange={cambiarVistaUnidades} />{disponibles.length > 0 && <Button type="button" variant="outline" onClick={() => printLabels(disponibles).then(avisarImpresion)}>Etiquetas ({disponibles.length})</Button>}<Button type="button" variant="outline" onClick={() => setGondolaOpen(true)}>Etiquetas de góndola</Button>{tab === 'unidades' && <Button type="button" variant="outline" className="h-9 px-3 text-xs" disabled={exportando || busy} onClick={exportarUnidades}><Icon name="download" className="h-4 w-4" />Exportar CSV</Button>}</form><div className="mt-4 flex gap-1 overflow-x-auto rounded-lg border border-ink-600 bg-ink-800 p-1">{[['unidades', `Inventario (${disponibles.length})`], ['taller', 'Taller'], ...(canViewAlerts ? [['alertas', `Alertas (${(stockAlerts.alerts?.length || 0) + (stockAlerts.outOfStock?.length || 0)})`]] : []), ['reservas', `Reservas (${reservations.length})`], ['traslados', `Traslados (${transfers.length})`], ['vendidos', `Vendidos (${vendidosFiltrados.length})`], ['transito', `En tránsito (${enTransito.length})`], ['ubicaciones', `Ubicaciones (${locations.length})`], ['compartido', 'Compartido'], ['eliminados', `Eliminados (${removedUnits.length})`], ['conteos', 'Conteos']].map(([key, label]) => <button key={key} onClick={() => cambiarTab(key)} className={`shrink-0 rounded-md px-3 py-2 text-xs font-semibold ${tab === key ? 'bg-fono/15 text-fono-light' : 'text-mute hover:text-fore'}`}>{label}</button>)}</div>{notice && <Aviso tono="ok" className="mt-3">{notice}</Aviso>}{error && <Aviso tono="error" className="mt-3">{error}</Aviso>}
    <BarraLote cantidad={seleccionados.length} onLimpiar={() => setSeleccionados([])}>
      <button type="button" disabled={busy} title="Registrar la verificación física de todas las seleccionadas" onClick={() => Promise.all(unidadesElegidas().map(unidad => verify(unidad)))} className="rounded-lg border border-ok/40 px-2 py-1 text-xs font-semibold text-ok transition hover:bg-ok/10 disabled:opacity-50">Verificar todos</button>
      <button type="button" disabled={busy} title="Apartar todas las seleccionadas para un cliente" onClick={() => { setReserve(data => ({ ...data, serials: unidadesElegidas().map(unidad => unidad.serial).join(', ') })); setReserveOpen(true) }} className="rounded-lg border border-ink-500 px-2 py-1 text-xs font-semibold transition hover:text-fore disabled:opacity-50">Reservar todos</button>
      <button type="button" disabled={busy} title="Marcar en revisión con un motivo (queda auditado)" onClick={() => requestReason('adjust', unidadesElegidas())} className="rounded-lg border border-warn/40 px-2 py-1 text-xs font-semibold text-warn transition hover:bg-warn/10 disabled:opacity-50">Enviar a revisión</button>
      <button type="button" disabled={busy} title="Dar de baja con un motivo (quedan en Eliminados)" onClick={() => requestReason('remove', unidadesElegidas())} className="rounded-lg border border-bad/40 px-2 py-1 text-xs font-semibold text-bad transition hover:bg-bad/10 disabled:opacity-50">Dar de baja</button>
      <button type="button" className="rounded-lg border border-ink-500 px-2 py-1 text-xs font-semibold transition hover:text-fore" onClick={copiarImeis}>Copiar IMEIs</button>
      <button type="button" className="rounded-lg border border-ink-500 px-2 py-1 text-xs font-semibold transition hover:text-fore" onClick={() => printLabels(unidadesElegidas()).then(avisarImpresion)}>Imprimir etiquetas</button>
      <button type="button" className="rounded-lg border border-ink-500 px-2 py-1 text-xs font-semibold transition hover:text-fore" onClick={exportarUnidadesSeleccionadas}>Exportar CSV</button>
    </BarraLote>
    {tab === 'taller' && (
      <div className="mt-4">
        <TallerRack
          unidades={disponibles}
          busy={busy}
          onVerificar={(unit) => verify(unit)}
          onVerificarLote={verificarLote}
          onEtiqueta={(unit) => printLabel(unit).then(avisarImpresion)}
          onEtiquetasLote={(lista) => printLabels(lista).then(avisarImpresion)}
        />
      </div>
    )}
    {tab === 'unidades' && vistaUnidades === 'list' && <div className="mt-4 overflow-x-auto"><EncabezadoUnidades seleccionado={disponibles.length > 0 && seleccionados.length === disponibles.length} onSeleccionar={() => setSeleccionados((actuales) => seleccionarTodos(disponibles, actuales))} /><div className="space-y-1">{disponibles.map(unit => <FilaUnidad key={unit.id} unit={unit} busy={busy} onVerify={verify} onSell={sellUnit} onReserve={openReserveFor} onLabel={unit => printLabel(unit).then(avisarImpresion)} onAdjust={unit => requestReason('adjust', unit)} onRemove={unit => requestReason('remove', unit)} onMove={unit => setDetalleUnidad(unit)} onEdit={unit => setDetalleUnidad(unit)} onCosto={guardarCostoRapido} cotizacion={cotizacion} onClick={() => setDetalleUnidad(unit)} seleccionado={seleccionados.includes(unit.id)} onAlternar={() => setSeleccionados((actuales) => alternarId(actuales, unit.id))} />)}{!disponibles.length && <EmptyState compact icon="box" title={query ? 'Ninguna unidad coincide con la búsqueda.' : 'No hay unidades en inventario.'} />}</div></div>}
    {tab === 'unidades' && vistaUnidades === 'grid' && <div className={cn('mt-4 min-[1200px]:grid-cols-3', GRILLA_DOS_COLUMNAS_COMPACTA)}>{disponibles.map(unit => <TarjetaUnidad key={unit.id} unit={unit} onClick={() => setDetalleUnidad(unit)} />)}{!disponibles.length && <EmptyState compact icon="box" title={query ? 'Ninguna unidad coincide con la búsqueda.' : 'No hay stock disponible.'} />}</div>}
    {tab === 'vendidos' && <div className="mt-4 space-y-2"><div className="flex flex-wrap items-center gap-2"><Select aria-label="Período de vendidos" value={filtroVendidos.periodo} onChange={event => setFiltroVendidos(actual => ({ ...actual, periodo: event.target.value }))} className="w-auto"><option value="todos">Todos</option><option value="hoy">Hoy</option><option value="ayer">Ayer</option><option value="rango">Rango</option></Select>{filtroVendidos.periodo === 'rango' && <><Input type="date" aria-label="Desde" value={filtroVendidos.desde} onChange={event => setFiltroVendidos(actual => ({ ...actual, desde: event.target.value }))} className="w-auto" /><Input type="date" aria-label="Hasta" value={filtroVendidos.hasta} onChange={event => setFiltroVendidos(actual => ({ ...actual, hasta: event.target.value }))} className="w-auto" /></>}<span className="text-xs text-mute">{vendidosFiltrados.length} de {vendidos.length} vendidos</span></div><div className="overflow-x-auto"><EncabezadoUnidades /><div className="space-y-1">{vendidosFiltrados.map(unit => <FilaUnidad key={unit.id} unit={unit} busy={busy} fechaVenta={fechaDeVenta(unit)} onVerify={verify} onLabel={unit => printLabel(unit).then(avisarImpresion)} onAdjust={unit => requestReason('adjust', unit)} onRemove={unit => requestReason('remove', unit)} onMove={unit => setDetalleUnidad(unit)} onEdit={unit => setDetalleUnidad(unit)} onComprobante={imprimirComprobanteRapido} onCosto={guardarCostoRapido} cotizacion={cotizacion} onClick={() => setDetalleUnidad(unit)} />)}{!vendidosFiltrados.length && <EmptyState compact icon="box" title={query ? 'Ninguna unidad coincide con la búsqueda.' : 'Todavía no hay vendidos en el período.'} />}</div></div></div>}
    {tab === 'transito' && <div className="mt-4 overflow-x-auto"><EncabezadoUnidades /><div className="space-y-1">{enTransito.map(unit => <FilaUnidad key={unit.id} unit={unit} busy={busy} onVerify={verify} onLabel={unit => printLabel(unit).then(avisarImpresion)} onAdjust={unit => requestReason('adjust', unit)} onRemove={unit => requestReason('remove', unit)} onMove={unit => setDetalleUnidad(unit)} onEdit={unit => setDetalleUnidad(unit)} onCosto={guardarCostoRapido} cotizacion={cotizacion} onClick={() => setDetalleUnidad(unit)} />)}{!enTransito.length && <EmptyState compact icon="box" title={query ? 'Ninguna unidad coincide con la búsqueda.' : 'No hay unidades en tránsito.'} />}</div></div>}
{tab === 'alertas' && <div className="mt-4 space-y-4">{sinCostoUnits.length > 0 && <section className="rounded-xl border border-warn/25 bg-warn/5 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div className="min-w-0"><h3 className="text-xs font-bold uppercase tracking-wider text-warn">Unidades sin costo ({sinCostoUnits.length})</h3><p className="mt-1 text-xs text-mute">Se recibieron sin costo: completalo desde la ficha para que la ganancia y el kardex no queden incompletos. Es el mismo dato que alimenta el «Costo pendiente» de Resumen cuando se venden sin costo.</p></div><Badge color="orange">Costo pendiente</Badge></div><div className="mt-2 flex flex-wrap gap-1.5">{sinCostoUnits.slice(0, 8).map(unit => <button key={unit.id} type="button" onClick={() => setDetalleUnidad(unit)} className="rounded-lg border border-ink-500 bg-ink-800 px-2 py-0.5 text-[11px] text-fore transition hover:border-fono">{nombreProducto(unit.product || {})} · {ultimos4(unit.serial)}</button>)}{sinCostoUnits.length > 8 && <span className="px-2 py-0.5 text-[11px] text-mute">y {sinCostoUnits.length - 8} más…</span>}</div></section>}{alertsLoading && <div className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>}{alertsError && <Aviso tono="error">{alertsError}</Aviso>}{!alertsLoading && !alertsError && !(stockAlerts.alerts?.length || stockAlerts.outOfStock?.length) && <EmptyState compact icon="check" title="Sin alertas de reposición." description="Todo el stock está por encima de su umbral." />}{!alertsLoading && stockAlerts.alerts?.length > 0 && <section><h3 className={ROTULO_SECCION}>Bajo el umbral de reposición</h3><div className="mt-2 space-y-2">{stockAlerts.alerts.map(item => <article key={item.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-warn/25 bg-warn/5 px-3 py-2"><div className="min-w-0"><b className="text-sm">{item.name}</b><p className="mt-1 text-xs text-mute">{item.sku ? `SKU ${item.sku} · ` : ''}Stock {item.stock} de {item.reorderPoint}{item.branchName ? ` · ${item.branchName}` : ''}</p></div><div className="flex shrink-0 items-center gap-2"><Badge color="orange">Reponer</Badge><Button type="button" variant="outline" disabled={busy} onClick={() => { setThreshold({ id: item.id, name: item.name }); setThresholdValue(String(item.reorderPoint ?? '')) }}>Ajustar umbral</Button></div></article>)}</div></section>}{!alertsLoading && stockAlerts.outOfStock?.length > 0 && <section><h3 className={ROTULO_SECCION}>Agotados</h3><div className="mt-2 space-y-2">{stockAlerts.outOfStock.map(item => <article key={item.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-bad/25 bg-bad/5 px-3 py-2"><div className="min-w-0"><b className="text-sm">{item.name}</b><p className="mt-1 text-xs text-mute">{item.sku ? `SKU ${item.sku} · ` : ''}Sin stock{item.branchName ? ` · ${item.branchName}` : ''}</p></div><div className="flex shrink-0 items-center gap-2"><Badge color="red">Agotado</Badge><Button type="button" variant="outline" disabled={busy} onClick={() => { setThreshold({ id: item.id, name: item.name }); setThresholdValue(String(item.reorderPoint ?? '')) }}>Definir umbral</Button></div></article>)}</div></section>}</div>}
    {tab === 'reservas' && <div className="mt-4 overflow-x-auto" data-testid="reservas-tabla"><div className={cn(GRID_RESERVAS, 'px-3.5 pb-2 pt-1')}><span className={CELDA_ENCABEZADO}>Producto</span><span className={CELDA_ENCABEZADO}>IMEI</span><span className={CELDA_ENCABEZADO}>Cliente</span><span className={CELDA_ENCABEZADO}>Vence</span><span className={cn(CELDA_ENCABEZADO, 'text-right')}>Acciones</span></div><div className="space-y-1">{reservations.map(unit => { const serial = String(unit.serial || ''); const cliente = unit.reservationCustomerRef?.name || unit.reservationCustomer || 'Sin cliente'; return <div key={unit.id} data-testid="reserva-fila" className={cn(GRID_RESERVAS, 'rounded-xl border border-reserved/30 bg-reserved/10 px-3.5 py-2')}><span className={CELDA_IDENTIDAD} title={nombreProducto(unit.product || {})}>{nombreProducto(unit.product || {}) || 'Producto'}</span><SerialTexto serial={serial} className="truncate text-[11px] text-mute" /><span className="truncate text-xs" title={cliente}>{cliente}</span><span className={CELDA_DATO} title={unit.reservedUntil ? new Date(unit.reservedUntil).toLocaleString('es-PY') : undefined}>{unit.reservedUntil ? fechaReserva(unit.reservedUntil) : '—'}</span><span className="flex flex-wrap items-center justify-end gap-1"><Button type="button" className="h-8 px-2 text-xs" disabled={busy} onClick={() => sellUnit(unit)}>Vender</Button><Button type="button" variant="outline" className="h-8 px-2 text-xs" title="Imprimir comprobante de la reserva" onClick={() => printReservationReceipt(unit, { format: 'a4' })}>Comprobante</Button><Button variant="outline" className="h-8 px-2 text-xs" disabled={busy} onClick={() => releaseReservation(unit.serial)}>Liberar</Button></span></div> })}{!reservations.length && <EmptyState compact icon="box" title="No hay reservas activas." />}</div></div>}
    {tab === 'traslados' && <div className="mt-4 overflow-x-auto" data-testid="traslados-tabla"><div className={cn(GRID_TRASLADOS, 'px-3.5 pb-2 pt-1')}><span className={CELDA_ENCABEZADO}>Ruta</span><span className={CELDA_ENCABEZADO}>Líneas</span><span className={CELDA_ENCABEZADO} title="Cantidad de equipos del lote">Cant.</span><span className={CELDA_ENCABEZADO}>Enviado</span><span className={CELDA_ENCABEZADO} title="Llegada real a destino">Llegada</span><span className={CELDA_ENCABEZADO}>Estado</span><span className={CELDA_ENCABEZADO}>Guía AEX</span><span className={cn(CELDA_ENCABEZADO, 'text-right')}>Acciones</span></div><div className="space-y-1">{transfers.map(item => { const lineas = item.lines?.map(line => `${line.quantity} × ${line.sourceProduct?.name}`).join(' · ') || 'Sin líneas'; return <div key={item.id} data-testid="traslado-fila" className={cn(GRID_TRASLADOS, 'rounded-xl border border-ink-600 bg-ink-800/40 px-3.5 py-2')}><span className={CELDA_IDENTIDAD} title={`${item.sourceBranch?.name} → ${item.destinationBranch?.name}`}>{item.sourceBranch?.name} → {item.destinationBranch?.name}</span><span className={CELDA_DATO} title={[lineas, item.notes].filter(Boolean).join(' · ')}>{lineas}{item.notes ? <span className="text-mute/70"> · {item.notes}</span> : null}</span><span className="text-center text-xs font-semibold tabular-nums text-fore" title="Equipos del lote">{(item.lines || []).reduce((suma, line) => suma + Number(line.quantity || 0), 0)}</span><span className={CELDA_DATO} title={`Enviado el ${new Date(item.createdAt).toLocaleDateString('es-PY')}`}>{new Date(item.createdAt).toLocaleDateString('es-PY', { day: '2-digit', month: 'short' }).replace('.', '')}</span><span className={CELDA_DATO} title={item.receivedAt ? `Llegó el ${new Date(item.receivedAt).toLocaleString('es-PY')}` : 'Todavía no llegó a destino'}>{item.receivedAt ? fechaReserva(item.receivedAt) : '—'}</span><span className="min-w-0"><Badge color={item.receivedAt ? 'green' : 'blue'} className="w-fit whitespace-nowrap px-1.5 py-0.5 text-[10px]" title={item.receivedAt ? `Recibido el ${new Date(item.receivedAt).toLocaleDateString('es-PY')}` : 'Todavía no llegó a destino'}>{item.receivedAt ? 'Recibido' : 'En camino'}</Badge></span><span className="truncate font-mono text-[11px] text-fono-light" title={item.aexGuide || undefined}>{item.aexGuide || '—'}</span><span className="flex flex-wrap items-center justify-end gap-1"><Button type="button" variant="outline" className="h-8 px-2 text-xs" title="Reimprimir las etiquetas de todas las unidades del lote" onClick={() => { const delLote = unidadesDeTransferencia(item); if (delLote.length) printLabels(delLote).then(avisarImpresion); else toast.error('No se encontraron las unidades del lote para imprimir.') }}>Etiquetas</Button><Button type="button" variant="outline" className="h-8 px-2 text-xs" title="Recibir todo el lote y elegir depósito destino" onClick={() => setReceiveBatch({ transfer: item, locationId: '', busy: false })}>Recibir lote</Button><Button type="button" variant="outline" className="h-8 px-2 text-xs" onClick={() => prepararRemitoQr(item)}>Enlace/QR</Button><Button type="button" variant="outline" className="h-8 px-2 text-xs" onClick={() => printTransferReceipt(item, { format: 'a4' })}>Remito</Button><Button type="button" variant="outline" className="h-8 px-2 text-xs" title="Remisión interna con firma de entrega y recepción" onClick={() => imprimirRemision(item).then(resultado => avisarImpresion(resultado, 'Remisión'))}>Remisión</Button>{!item.aexGuide && <Button type="button" variant="outline" className="h-8 px-2 text-xs" onClick={() => cotizarEnvio(item)}>Enviar por AEX</Button>}{item.aexGuide ? <><Button type="button" variant="outline" className="h-8 px-2 text-xs" onClick={() => abrirEtiquetaAex(item)}>Etiqueta AEX</Button><Button type="button" variant="outline" className="h-8 px-2 text-xs" onClick={() => seguirGuia(item)}>Seguimiento</Button></> : guiaPara?.id === item.id ? <form onSubmit={guardarGuia} className="flex flex-wrap items-center gap-1"><Input className="h-8 w-40" aria-label="Guía AEX" value={guiaPara.guia} onChange={event => setGuiaPara(current => ({ ...current, guia: event.target.value }))} placeholder="A003526979" /><Button type="submit" className="h-8 px-2 text-xs" disabled={busy}>Guardar</Button><Button type="button" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setGuiaPara(null)}>Cancelar</Button></form> : <Button type="button" variant="outline" className="h-8 px-2 text-xs" disabled={busy} onClick={() => setGuiaPara({ id: item.id, guia: '' })}>Agregar guía</Button>}</span></div> })}{!transfers.length && <EmptyState compact icon="box" title="Todavía no hay transferencias." />}</div></div>}
    {tab === 'ubicaciones' && <div className="mt-4 space-y-3">{canManageLocations && <div className="flex flex-wrap gap-2"><Button type="button" onClick={() => setLocationForm({ id: null, name: '', code: '', branchId: '', color: '#60a5fa' })}>+ Crear ubicación</Button><ListGridToggle value={vistaUbicaciones} onChange={cambiarVistaUbicaciones} /></div>}<div className={vistaUbicaciones === 'grid' ? 'grid gap-2 sm:grid-cols-2' : 'space-y-1.5'}>{locations.map(location => { const sample = locationSample(units, location.id); return <article key={location.id} className="rounded-xl border border-ink-600 p-3"><div className="flex justify-between gap-2"><b className="text-sm">{location.name}</b><Badge color={location.isActive ? 'green' : 'slate'}>{location.isActive ? 'Activa' : 'Inactiva'}</Badge></div><p className="mt-1 text-xs text-mute">{location.branch?.name} · {location._count?.inventoryUnits || 0} unidades{location.code ? ` · ${location.code}` : ''}</p>{sample.length > 0 ? <div className="mt-2 flex flex-wrap gap-1.5">{sample.map(unit => <span key={unit.id} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-ink-500 bg-ink-800 px-2 py-0.5"><Dot color={badgeTone(unit)} className="h-1.5 w-1.5" /><span className="max-w-[9rem] truncate text-[11px] text-fore">{unit.product?.name}</span></span>)}</div> : <p className="mt-2 text-[11px] text-mute">Sin unidades</p>}{canManageLocations && <div className="mt-2 flex gap-3"><button type="button" className="text-xs font-semibold text-fono-light hover:underline" onClick={() => setLocationForm({ id: location.id, name: location.name, code: location.code || '', branchId: location.branchId, color: location.color || '#60a5fa' })}>Editar</button><button type="button" className="text-xs font-semibold text-fono-light hover:underline" onClick={() => printLocationLabel(location).then(avisarImpresion)}>Etiqueta</button><button type="button" className="text-xs font-semibold text-fono-light hover:underline" onClick={() => printLabels(units.filter(unit => unit.locationId === location.id)).then(avisarImpresion)}>Etiquetas</button><button type="button" className="text-xs font-semibold text-mute hover:underline" disabled={busy} onClick={() => toggleLocation(location)}>{location.isActive ? 'Desactivar' : 'Reactivar'}</button></div>}</article> })}{!locations.length && <EmptyState compact icon="box" title={canManageLocations ? 'Creá tu primera ubicación para organizar el stock.' : 'Todavía no hay ubicaciones cargadas.'} />}</div></div>}
    {tab === 'compartido' && <div className="mt-4 space-y-5">{visibilityError && <Aviso tono="error">{visibilityError}</Aviso>}{canManageVisibility && <section className="rounded-xl border border-ink-600 bg-ink-800/40 p-3"><h3 className={ROTULO_SECCION}>Compartir mi disponibilidad</h3><p className="mt-1 text-sm text-mute">Otra empresa ve nombre, SKU, categoría, condición y cantidad disponible. Nunca precios, costos, IMEI, reservas ni clientes.</p><form onSubmit={searchRecipients} className="mt-3 flex gap-2"><Input value={recipientQuery} onChange={event => setRecipientQuery(event.target.value)} placeholder="Buscar empresa por nombre (mínimo 2 letras)" /><Button type="submit" variant="outline" disabled={searchingRecipient || recipientQuery.trim().length < 2}>{searchingRecipient ? 'Buscando…' : 'Buscar'}</Button></form>{recipientError && <p role="alert" className="mt-2 text-sm text-bad">{recipientError}</p>}{recipientResults.length > 0 && <div className="mt-3 space-y-2">{recipientResults.map(tenant => <article key={tenant.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-600 p-3"><b className="min-w-0 truncate text-sm">{tenant.name}</b>{grantedIds.has(tenant.id) ? <Button type="button" variant="ghost" disabled={busy} onClick={() => setGrant(tenant.id, false, tenant.name)}>Dejar de compartir</Button> : <Button type="button" disabled={busy} onClick={() => setGrant(tenant.id, true, tenant.name)}>Compartir</Button>}</article>)}</div>}<h4 className={cn('mt-4', ROTULO_SECCION)}>Permisos otorgados</h4>{grants.length === 0 ? <EmptyState compact icon="users" title="Todavía no compartís tu disponibilidad." description="Cuando compartas, otras empresas ven nombre, SKU y cantidad: nunca precios ni clientes." /> : <div className="mt-2 space-y-2">{grants.map(grant => <article key={grant.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-600 p-3"><div className="min-w-0"><b className="text-sm">{grant.recipientTenant?.name || 'Empresa'}</b><p className="text-xs text-mute">{grant.isActive ? 'Ve tu disponibilidad' : 'Permiso revocado'} · {new Date(grant.createdAt).toLocaleDateString('es-PY')}</p></div>{grant.isActive && <Button type="button" variant="outline" disabled={busy} onClick={() => setGrant(grant.recipientTenant.id, false, grant.recipientTenant.name)}>Revocar</Button>}</article>)}</div>}</section>}<section className="rounded-xl border border-ink-600 bg-ink-800/40 p-3"><h3 className={ROTULO_SECCION}>Disponibilidad que veo de otras empresas</h3>{receivedStock.length === 0 ? <EmptyState compact icon="box" title="Ninguna empresa comparte su disponibilidad." description="Cuando alguien te comparta, aparece acá sin precios ni IMEI." /> : <div className="mt-2 space-y-3">{Object.entries(receivedBySource).map(([source, rows]) => <div key={source}><p className="text-sm font-semibold text-fore">{source} · {rows.reduce((sum, row) => sum + Number(row.available || 0), 0)} disponibles</p><div className="mt-1.5 space-y-1">{rows.slice(0, 40).map((row, index) => <p key={`${row.product?.id}-${index}`} className="text-xs text-mute">{row.product?.name}{row.product?.sku ? ` · SKU ${row.product.sku}` : ''}{row.product?.condition ? ` · ${conditionLabel[row.product.condition] || row.product.condition}` : ''} · {row.branch?.name || 'Sin sucursal'} · <b className="text-fore">{row.available}</b></p>)}{rows.length > 40 && <p className="text-xs text-mute">+ {rows.length - 40} productos más</p>}</div></div>)}</div>}</section></div>}
    {tab === 'eliminados' && <div className="mt-4 overflow-x-auto" data-testid="eliminados-tabla"><div className={cn(GRID_ELIMINADOS, 'px-3.5 pb-2 pt-1')}><span className={CELDA_ENCABEZADO}>Producto</span><span className={CELDA_ENCABEZADO}>IMEI</span><span className={CELDA_ENCABEZADO}>Nota</span><span className={cn(CELDA_ENCABEZADO, 'text-right')}>Acciones</span></div><div className="space-y-1">{removedUnits.map(unit => { const serial = String(unit.serial || ''); return <div key={unit.id} data-testid="eliminado-fila" className={cn(GRID_ELIMINADOS, 'rounded-xl border border-bad/25 bg-bad/5 px-3.5 py-2')}><span className={CELDA_IDENTIDAD} title={nombreProducto(unit.product || {})}>{nombreProducto(unit.product || {}) || 'Producto'}</span><SerialTexto serial={serial} className="truncate text-[11px] text-mute" /><span className="truncate text-[11px] text-mute">Conserva su historial de auditoría</span><span className="flex items-center justify-end"><Button className="h-8 px-2 text-xs" disabled={busy} onClick={() => requestReason('restore', unit)}>Restaurar</Button></span></div> })}{!removedUnits.length && <EmptyState compact icon="box" title="No hay unidades eliminadas recuperables." />}</div></div>}
    {tab === 'conteos' && (esDemo
      ? <div className="mt-4"><Aviso tono="warn">Los conteos físicos auditables necesitan conexión con el servidor: en la demo no se guardan documentos ni se ajusta stock. Ingresá con una cuenta real para usarlos.</Aviso></div>
      : <div className="mt-4 space-y-4" data-testid="conteos-tab">
        {conteoId ? <div className="space-y-4">
          {conteoError && <Aviso tono="error">{conteoError}</Aviso>}
          {(conteoLoading || !conteoDetalle) && !conteoError && <div className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-44 w-full" /></div>}
          {!conteoDetalle && conteoError && <Button type="button" variant="outline" onClick={cerrarConteo}>Volver a conteos</Button>}
          {conteoDetalle && (() => {
            const s = conteoDetalle.summary || { expected: 0, counted: 0, missing: 0, unexpected: 0, productsWithoutSerial: 0 }
            const borrador = conteoDetalle.status === 'DRAFT'
            const [estadoLabel, estadoTone] = ESTADO_CONTEO[conteoDetalle.status] || ['Conteo', 'slate']
            return <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" className="h-8 px-2 text-xs" onClick={cerrarConteo}><Icon name="back" className="h-4 w-4" />Volver</Button>
                <Badge color={estadoTone}>{estadoLabel}</Badge>
                <b className="min-w-0 truncate text-sm">{conteoDetalle.branch?.name || 'Sucursal'}</b>
                <span className="text-xs text-mute">Iniciado {fechaReserva(conteoDetalle.createdAt)}{conteoDetalle.appliedAt ? ` · Aplicado ${fechaReserva(conteoDetalle.appliedAt)}` : ''}</span>
                {conteoDetalle.note && <span className={cn('min-w-0', CELDA_DATO)}>· {conteoDetalle.note}</span>}
              </div>
              <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                {[['Esperados', s.expected, 'text-fore'], ['Contados', s.counted, 'text-ok'], ['Faltantes', s.missing, 'text-warn'], ['Inesperados', s.unexpected, 'text-bad']].map(([label, value, tone]) => <div key={label} className="rounded-xl border border-ink-600 p-3"><p className={`text-xl font-bold ${tone}`}>{value}</p><p className="text-[11px] text-mute">{label}</p></div>)}
              </div>
              {borrador && <form onSubmit={enviarEscaneo} className="rounded-xl border border-ink-600 bg-ink-800/40 p-3">
                <Label htmlFor="conteo-serial">Escanear IMEI / serial</Label>
                <div className="mt-1 flex flex-wrap gap-2">
                  <Input id="conteo-serial" ref={conteoSerialRef} className="min-w-0 flex-1" value={conteoSerial} onChange={event => setConteoSerial(event.target.value)} placeholder="Escaneá o escribí el IMEI y presioná Enter" autoCapitalize="characters" autoComplete="off" autoFocus />
                  <Button type="submit" disabled={conteoBusy || !conteoSerial.trim()}>{conteoBusy ? 'Guardando…' : 'Escanear'}</Button>
                  <Button type="button" variant="outline" onClick={() => setCamaraConteoOpen(true)}>Cámara</Button>
                </div>
                {conteoFlash && <p role="status" className={`mt-2 rounded-lg border px-3 py-1.5 text-sm ${conteoFlash.kind === 'ok' ? 'border-ok/40 bg-ok/10 text-ok' : conteoFlash.kind === 'miss' ? 'border-warn/40 bg-warn/10 text-warn' : 'border-bad/40 bg-bad/10 text-bad'}`}>{conteoFlash.kind === 'ok' ? `✓ IMEI ${conteoFlash.serial}: figura en el stock de esta sucursal.` : conteoFlash.kind === 'miss' ? `⚠ IMEI ${conteoFlash.serial}: no figura en el stock de esta sucursal.` : `⚠ IMEI ${conteoFlash.serial}: ya estaba escaneado en este conteo.`}</p>}
                <p className="mt-2 text-xs text-mute">Cada lectura se guarda al instante, así podés cortar y seguir después. Un lector Bluetooth o USB que envíe Enter funciona igual que la cámara.</p>
              </form>}
              {borrador && <form onSubmit={sumarSinSerie} className="rounded-xl border border-ink-600 bg-ink-800/40 p-3">
                <Label htmlFor="conteo-producto">Producto sin serie</Label>
                <p className="mt-1 text-xs text-mute">Para accesorios o productos sin IMEI: sumá las unidades contadas y el resumen las muestra aparte.</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_auto]">
                  <Select id="conteo-producto" value={conteoSinSerie.productId} onChange={event => setConteoSinSerie(current => ({ ...current, productId: event.target.value }))}><option value="">Elegí el producto</option>{availableProducts.map(product => <option key={product.id} value={product.id}>{product.nombre}{product.branch?.name ? ` · ${product.branch.name}` : ''}</option>)}</Select>
                  <Input aria-label="Cantidad contada" inputMode="numeric" value={conteoSinSerie.quantity} onChange={event => setConteoSinSerie(current => ({ ...current, quantity: event.target.value.replace(/\D/g, '') }))} placeholder="Cantidad" />
                  <Button type="submit" disabled={conteoBusy || !conteoSinSerie.productId || !conteoSinSerie.quantity}>Sumar</Button>
                </div>
              </form>}
              <section>
                <h4 className={ROTULO_SECCION}>Escaneados ({conteoDetalle.lines.length})</h4>
                {conteoDetalle.lines.length === 0
                  ? <p className="mt-2 text-sm text-mute">Todavía no hay líneas en este conteo.</p>
                  : <div className="mt-2 max-h-72 space-y-1 overflow-y-auto">{conteoDetalle.lines.map(line => <div key={line.id} data-testid="conteo-linea" className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-600 px-3 py-1.5">{line.serial ? <SerialTexto serial={line.serial} className="w-40 shrink-0 text-[11px]" /> : <span className="shrink-0 text-[11px] text-mute">Sin serie × {line.quantity}</span>}<span className="min-w-0 flex-1 truncate text-xs" title={line.product?.name || 'Producto no reconocido'}>{line.product?.name || 'Producto no reconocido'}{line.product?.sku ? ` · SKU ${line.product.sku}` : ''}</span><Badge color={line.serial ? (line.expected ? 'green' : 'red') : 'slate'}>{line.serial ? (line.expected ? 'Esperado' : 'No esperado') : 'Sin serie'}</Badge></div>)}</div>}
              </section>
              {conteoDetalle.missing.length > 0 && <section>
                <h4 className={ROTULO_SECCION}>Faltantes ({conteoDetalle.missing.length})</h4>
                <p className="mt-1 text-xs text-mute">Figuran disponibles en la sucursal y no se escanearon. Al aplicar con ajuste pasan a defectuoso.</p>
                <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">{conteoDetalle.missing.map(unit => <div key={unit.id} data-testid="conteo-faltante" className="flex flex-wrap items-center gap-2 rounded-lg border border-warn/25 bg-warn/5 px-3 py-1.5"><span className="min-w-0 flex-1 truncate text-xs">{unit.product?.name || 'Producto'}{unit.product?.sku ? ` · SKU ${unit.product.sku}` : ''}</span><SerialTexto serial={unit.serial} className="w-40 shrink-0 text-[11px]" /></div>)}</div>
              </section>}
              {borrador
                ? <div className="flex flex-wrap items-center gap-2">
                  {puedeAplicarConteo && <Button type="button" disabled={conteoBusy} onClick={() => { setAjustarConteo(true); setAplicarConteoOpen(true) }}>Aplicar conteo</Button>}
                  <Button type="button" variant="outline" disabled={conteoBusy} onClick={() => setCancelarConteoOpen(true)}>Cancelar conteo</Button>
                  {!puedeAplicarConteo && <p className="text-xs text-mute">Solo administración o gerencia pueden aplicar el conteo: pediles la aprobación al terminar.</p>}
                </div>
                : <p className="rounded-lg border border-ink-600 bg-ink-800/40 px-3 py-2 text-sm text-mute">{conteoDetalle.status === 'APPLIED' ? 'Conteo aplicado y auditado: no admite más escaneos.' : 'Conteo cancelado: el stock no cambió.'}</p>}
              <Modal open={aplicarConteoOpen} onClose={() => setAplicarConteoOpen(false)} title="Aplicar conteo">
                <div className="space-y-4">
                  <p className="text-sm text-mute">Vas a aprobar el conteo de <b className="text-fore">{conteoDetalle.branch?.name || 'la sucursal'}</b>: {s.counted} contados, {s.missing} faltantes y {s.unexpected} inesperados. La acción queda auditada y no se puede deshacer.</p>
                  <label className="flex items-start gap-2 text-sm text-mute"><Switch className="mt-0.5" checked={ajustarConteo} onChange={event => setAjustarConteo(event.target.checked)} /><span><b className="text-fore">Ajustar stock:</b> los faltantes pasan a defectuoso y se recalcula el stock. Sin marcar, solo se aprueba el documento.</span></label>
                  <div className={PIE_ACCIONES_REVERSO}><Button type="button" variant="ghost" onClick={() => setAplicarConteoOpen(false)} disabled={conteoBusy}>Volver</Button><Button type="button" onClick={aplicarConteo} disabled={conteoBusy}>{conteoBusy ? 'Aplicando…' : 'Aplicar conteo'}</Button></div>
                </div>
              </Modal>
              <ConfirmDialog open={cancelarConteoOpen} onCancel={() => setCancelarConteoOpen(false)} onConfirm={cancelarConteo} busy={conteoBusy} variant="danger" title="Cancelar conteo" confirmLabel="Cancelar conteo" description="El conteo queda cancelado y no se puede volver a escanear. El stock no cambia." />
              <Modal open={camaraConteoOpen} onClose={cerrarCamaraConteo} title="Escanear con cámara">
                <CameraScan continuous onDetected={detectarConteoCamara} onClose={cerrarCamaraConteo} />
                <p className="mt-2 text-xs text-mute">Cada equipo que enfoques se registra solo. Cerrá esta ventana para seguir con el conteo.</p>
              </Modal>
            </div>
          })()}
        </div> : <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="text-sm font-bold text-fore">Conteos físicos</h3><p className="mt-0.5 text-xs text-mute">Documento auditable por sucursal: escaneá, revisá diferencias y aprobalo al terminar.</p></div>
            <Button type="button" onClick={() => setNuevoConteoOpen(true)} disabled={conteosLoading}><Icon name="plus" className="h-4 w-4" />Nuevo conteo</Button>
          </div>
          {conteosError && <Aviso tono="error">{conteosError}</Aviso>}
          {conteosLoading && conteos.length === 0 && <div className="space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>}
          {!conteosLoading && conteos.length === 0 && <EmptyState compact icon="box" title="Todavía no hay conteos." description="Creá uno para comparar lo que hay físicamente contra el stock del sistema." />}
          {conteos.length > 0 && <div className="space-y-1.5">{conteos.map(item => { const [estadoLabel, estadoTone] = ESTADO_CONTEO[item.status] || ['Conteo', 'slate']; return <button key={item.id} type="button" data-testid="conteo-fila" onClick={() => abrirConteo(item)} className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-ink-600 bg-ink-800/40 px-3 py-2 text-left transition hover:border-fono/40"><Badge color={estadoTone}>{estadoLabel}</Badge><b className="min-w-0 truncate text-sm">{item.branch?.name || 'Sucursal'}</b><span className="text-xs text-mute">{fechaReserva(item.createdAt)}</span><span className="text-xs text-mute">{item._count?.lines || 0} línea(s)</span>{item.note && <span className={cn('min-w-0', CELDA_DATO)}>· {item.note}</span>}<span className="ml-auto flex shrink-0 items-center gap-1 text-xs font-semibold text-fono-light">Abrir<Icon name="chevron" className="h-3.5 w-3.5 -rotate-90" /></span></button> })}</div>}
          <Modal open={nuevoConteoOpen} onClose={() => setNuevoConteoOpen(false)} title="Nuevo conteo">
            <form onSubmit={crearConteo} className="space-y-3">
              <p className="text-sm text-mute">Se abre un conteo en borrador para <b className="text-fore">{sucursal?.nombre || sucursal?.name || 'tu sucursal'}</b>. Escaneá los equipos y al terminar aplicalo con gerencia.</p>
              <div><Label htmlFor="conteo-nota">Nota (opcional)</Label><Textarea id="conteo-nota" rows={2} maxLength={300} value={nuevoConteoNota} onChange={event => setNuevoConteoNota(event.target.value)} placeholder="Ej: conteo mensual, turno mañana…" /></div>
              <div className={PIE_ACCIONES_REVERSO}><Button type="button" variant="ghost" onClick={() => setNuevoConteoOpen(false)} disabled={conteoBusy}>Volver</Button><Button type="submit" disabled={conteoBusy}>{conteoBusy ? 'Iniciando…' : 'Iniciar conteo'}</Button></div>
            </form>
          </Modal>
        </div>}
      </div>)}
  </Card><Modal open={locationForm !== null} onClose={() => setLocationForm(null)} title={locationForm?.id ? 'Editar ubicación' : 'Crear ubicación'}><form onSubmit={saveLocation} className="space-y-3"><p className="text-sm text-mute">La ubicación organiza el stock dentro de una sucursal: piso de venta, depósito, recepción. Podés asignarla al recibir una unidad o declararla al trasladar.</p><Select required value={locationForm?.branchId || ''} disabled={Boolean(locationForm?.id)} onChange={event => setLocationForm(current => ({ ...current, branchId: event.target.value }))}><option value="">Elegí la sucursal</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}{branch.city ? ` · ${branch.city}` : ''}</option>)}</Select><Input required maxLength={120} autoFocus value={locationForm?.name || ''} onChange={event => setLocationForm(current => ({ ...current, name: event.target.value }))} placeholder="Nombre: Piso de venta, Depósito 1, Recepción…" /><Input maxLength={32} value={locationForm?.code || ''} onChange={event => setLocationForm(current => ({ ...current, code: event.target.value }))} placeholder="Código corto (opcional)" /><div className="flex items-center gap-2"><label className="text-xs text-mute" htmlFor="ubicacion-color">Color</label><input id="ubicacion-color" type="color" title="Color del depósito o sucursal" aria-label="Color de la ubicación" value={locationForm?.color || '#60a5fa'} onChange={event => setLocationForm(current => ({ ...current, color: event.target.value }))} className="h-9 w-14 cursor-pointer rounded-lg border border-ink-600 bg-ink-800 p-1" /></div><Button type="submit" disabled={busy || !locationForm?.name?.trim() || !locationForm?.branchId}>{busy ? 'Guardando…' : locationForm?.id ? 'Guardar cambios' : 'Crear ubicación'}</Button></form></Modal><Modal open={scannerOpen} onClose={() => setScannerOpen(false)} title="Escanear código"><CameraScan onDetected={value => { setQuery(normalizeScan(value)); refresh(normalizeScan(value)) }} onClose={() => setScannerOpen(false)} /></Modal><Modal open={countOpen} onClose={() => { setCountOpen(false); setCountSession(null) }} title="Conteo físico rápido" size="amplio">
  {!countSession && <div className="space-y-3"><p className="text-sm text-mute">Escaneá con la cámara el código de cada equipo (IMEI/serial). Cada lectura se compara contra el stock de tu sucursal, queda verificada en la auditoría y al final ves qué falta y qué no aparece en el sistema.</p><Button onClick={startCount}>Empezar conteo</Button></div>}
  {countSession?.scanning && <div className="space-y-3"><CameraScan continuous onDetected={countScan} onClose={() => {}} /><div className="grid grid-cols-3 gap-2 text-center">{[
    ['Encontrados', countSession.found.size, 'text-ok'],
    ['Restan por ver', countMissing.length, 'text-warn'],
    ['No en stock', countSession.unknown.length, 'text-bad'],
  ].map(([label, value, tone]) => <div key={label} className="rounded-xl border border-ink-600 p-3"><p className={`text-xl font-bold ${tone}`}>{value}</p><p className="text-[11px] text-mute">{label}</p></div>)}</div>{countSession.flash && <p className={`rounded-lg border px-3 py-2 text-sm ${countSession.flash.kind === 'ok' ? 'border-ok/40 bg-ok/10 text-ok' : countSession.flash.kind === 'dup' ? 'border-warn/40 bg-warn/10 text-warn' : 'border-bad/40 bg-bad/10 text-bad'}`}>{countSession.flash.kind === 'ok' ? `✓ ${countSession.flash.unit?.product?.name || 'Equipo'} · IMEI ${countSession.flash.serial}` : countSession.flash.kind === 'dup' ? `⚠ IMEI ${countSession.flash.serial} ya fue escaneado.` : `✗ IMEI ${countSession.flash.serial} no está en el stock de esta sucursal.`}</p>}<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setCountSession(current => ({ ...current, scanning: false }))}>Terminar conteo</Button></div></div>}
  {countSession && !countSession.scanning && <div className="space-y-3"><div className="grid grid-cols-3 gap-2 text-center">{[
    ['Encontrados', countSession.found.size, 'text-ok'],
    ['Faltantes', countMissing.length, 'text-warn'],
    ['No en stock', countSession.unknown.length, 'text-bad'],
  ].map(([label, value, tone]) => <div key={label} className="rounded-xl border border-ink-600 p-3"><p className={`text-xl font-bold ${tone}`}>{value}</p><p className="text-[11px] text-mute">{label}</p></div>)}</div>{countSession.duplicates.length > 0 && <p className="text-xs text-mute">Repetidos: {countSession.duplicates.map(serial => serialEnmascarado(serial)).join(', ')}</p>}{countSession.unknown.length > 0 && <div><h4 className={ROTULO_SECCION}>No están en stock de esta sucursal</h4><div className="mt-2 max-h-32 space-y-1 overflow-y-auto">{countSession.unknown.map(serial => <p key={serial} className="rounded-lg border border-bad/25 bg-bad/5 px-2 py-1 text-xs text-bad">IMEI {serial}</p>)}</div></div>}{countMissing.length > 0 && <div><h4 className={ROTULO_SECCION}>Faltantes (en stock pero sin escanear)</h4><div className="mt-2 max-h-56 space-y-1 overflow-y-auto">{countMissing.map(unit => <p key={unit.id} className="rounded-lg border border-warn/25 bg-warn/5 px-2 py-1 text-xs text-fore/90">{unit.product?.name} · <b>{serialEnmascarado(unit.serial)}</b>{unit.location?.name ? ` · ${unit.location.name}` : ''}{unit.batteryHealth ? ` · ${unit.batteryHealth}%` : ''}</p>)}</div></div>}{countMissing.length === 0 && countSession.unknown.length === 0 && <Aviso tono="ok">Todo el stock fue verificado. No hay faltantes.</Aviso>}<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={copyMissing}>Copiar lista de faltantes</Button><Button variant="outline" onClick={() => { setCountSession(current => ({ ...current, scanning: true })) }}>Seguir escaneando</Button></div></div>}

</Modal><Modal open={threshold !== null} onClose={() => setThreshold(null)} title="Umbral de reposición"><form onSubmit={saveThreshold} className="space-y-3"><p className="text-sm text-mute">Vas a recibir una alerta cuando el stock de <b className="text-fore">{threshold?.name}</b> baje a este valor. Usá 0 para desactivar la alerta.</p><Input inputMode="numeric" maxLength={5} required autoFocus value={thresholdValue} onChange={event => setThresholdValue(event.target.value.replace(/\D/g, ''))} placeholder="Ej: 3" /><Button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar umbral'}</Button></form></Modal><Modal open={envioAex !== null} onClose={() => setEnvioAex(null)} title="Enviar traslado por AEX">{envioAex?.busy && !envioAex.quotes ? <p className="text-sm text-mute">Cotizando envío…</p> : envioAex?.unconfigured ? <p className="text-sm text-mute">La API de AEX no está configurada. Abrimos el sitio de AEX para que gestiones el envío; cuando tengas la guía, pegala con "Agregar guía AEX".</p> : envioAex?.unavailable ? <p className="text-sm text-mute">AEX no pudo confirmar el envío. Gestioná el despacho en <a className="text-fono-light underline" href={envioAex.webUrl} target="_blank" rel="noopener noreferrer">aex.com.py</a> y pegá la guía manualmente.</p> : <form onSubmit={confirmarEnvio} className="space-y-3"><p className="text-sm text-mute">{envioAex?.origen} → {envioAex?.destino}. Se confirma el servicio más barato.</p>{(envioAex?.quotes || []).map((cotizacion) => <div key={cotizacion.serviceId} className="flex items-center justify-between rounded-lg border border-ink-600 p-2 text-sm"><span>{cotizacion.serviceName}{cotizacion.deliveryHours ? ` · ~${cotizacion.deliveryHours} h` : ''}</span><b className="tabular-nums">{gs(cotizacion.costPyg)}</b></div>)}{!envioAex?.quotes?.length && <p className="text-sm text-mute">Sin cotizaciones disponibles para esas ciudades.</p>}<label className="block text-xs text-mute">Peso total (kg)<Input inputMode="numeric" value={envioAex?.pesoKg || '1'} onChange={(event) => setEnvioAex((current) => ({ ...current, pesoKg: event.target.value.replace(/\D/g, '') }))} /></label><div className={PIE_ACCIONES}><Button type="button" variant="ghost" onClick={() => setEnvioAex(null)}>Cancelar</Button><Button type="submit" disabled={envioAex?.busy || !envioAex?.quotes?.length}>{envioAex?.busy ? 'Confirmando…' : 'Confirmar envío'}</Button></div></form>}</Modal><Modal open={tracking !== null} onClose={() => setTracking(null)} title={`Seguimiento AEX · ${tracking?.guia || ''}`}>{tracking?.loading ? <p className="text-sm text-mute">Consultando seguimiento…</p> : tracking?.unconfigured ? <p className="text-sm text-mute">La API de AEX no está configurada. Abrimos el seguimiento en la web; si no se abrió, entrá a <a className="text-fono-light underline" href={tracking.webUrl} target="_blank" rel="noopener noreferrer">aex.com.py</a> con el número de guía.</p> : <div className="space-y-2">{tracking?.events?.length ? tracking.events.map((evento, index) => <article key={index} className="rounded-lg border border-ink-600 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><Badge color="blue">{evento.estado || 'Evento'}</Badge><span className="text-xs text-mute">{evento.fecha ? new Date(evento.fecha).toLocaleString('es-PY') : ''}</span></div><p className="mt-1 text-sm text-fore">{evento.tipoEvento || ''}</p>{evento.observacion && <p className="mt-1 text-xs text-mute">{evento.observacion}</p>}</article>) : <p className="text-sm text-mute">Todavía no hay eventos para esta guía.</p>}</div>}</Modal><Modal open={etiquetaAex !== null} onClose={() => setEtiquetaAex(null)} title={`Etiqueta AEX · ${etiquetaAex?.guia || ''}`}>{etiquetaAex?.unconfigured ? <p className="text-sm text-mute">La API de AEX no está configurada. Abrimos el sitio de AEX para descargar la etiqueta; si no se abrió, entrá a <a className="text-fono-light underline" href={etiquetaAex.webUrl} target="_blank" rel="noopener noreferrer">aex.com.py</a> con el número de guía.</p> : <form onSubmit={imprimirEtiquetaAex} className="space-y-3"><p className="text-sm text-mute">AEX genera la etiqueta en PDF y se abre para imprimir: elegí el formato según la impresora (etiqueta térmica o guía A4/A5/A6).</p><div><Label htmlFor="aex-formato-etiqueta">Formato</Label><Select id="aex-formato-etiqueta" value={etiquetaAex?.formato || 'etiqueta8x6'} onChange={event => setEtiquetaAex(current => ({ ...current, formato: event.target.value }))}>{FORMATOS_ETIQUETA_AEX.map(([valor, texto]) => <option key={valor} value={valor}>{texto}</option>)}</Select></div><label className="flex items-center gap-2 text-sm text-mute"><Switch checked={Boolean(etiquetaAex?.partida)} onChange={event => setEtiquetaAex(current => ({ ...current, partida: event.target.checked }))} />Una etiqueta por producto (partidas)</label>{etiquetaAex?.error && <Aviso tono="error">{etiquetaAex.error}</Aviso>}<div className={PIE_ACCIONES}><Button type="button" variant="ghost" onClick={() => setEtiquetaAex(null)}>Cerrar</Button><Button type="submit" disabled={etiquetaAex?.busy}>{etiquetaAex?.busy ? 'Preparando…' : 'Descargar e imprimir'}</Button></div></form>}</Modal><Modal open={receiveOpen} onClose={() => setReceiveOpen(false)} title="Carga rápida de unidad"><form onSubmit={receiveUnit} className="space-y-3"><p className="text-xs text-mute">Lo mínimo: modelo, IMEI/serial y dónde entra. El proveedor y el costo son opcionales: si todavía no tenés el costo, dejalo vacío y completalo después desde la ficha.</p><div><Label htmlFor="recibir-modelo">Modelo *</Label><Select id="recibir-modelo" aria-label="Modelo" value={receive.productId} onChange={event => { const product = products.find(item => item.id === event.target.value); setReceive(data => { const branchId = product?.branchId || ''; return { ...data, productId: event.target.value, branchId, locationId: locations.some(location => location.id === data.locationId && location.branchId === branchId) ? data.locationId : '' } }) }} required><option value="">Elegí el modelo</option>{availableProducts.map(product => <option key={product.id} value={product.id}>{nombreProducto(product)} · {product.branch?.name || product.branchId}</option>)}</Select></div><div><Label htmlFor="recibir-serial">IMEI / serial *</Label><Input id="recibir-serial" aria-label="IMEI o serial" value={receive.serial} onChange={event => setReceive(data => ({ ...data, serial: event.target.value }))} placeholder="IMEI o serial" autoCapitalize="characters" required /><p className="mt-1 text-xs text-mute">Podés pegar varios IMEI separados por coma. Escaneá la etiqueta QR de una ubicación para asignarla automáticamente.</p></div><div className={GRILLA_DOS_COLUMNAS}><Select aria-label="Sucursal" value={receive.branchId} onChange={event => setReceive(data => ({ ...data, branchId: event.target.value, locationId: '' }))} required><option value="">Sucursal</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</Select><Select aria-label="Ubicación" value={receive.locationId} onChange={event => setReceive(data => ({ ...data, locationId: event.target.value }))}><option value="">Sin ubicación</option>{locationsFor(receive.branchId).map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</Select><Select aria-label="Condición" value={receive.condition} onChange={event => setReceive(data => ({ ...data, condition: event.target.value }))}>{Object.entries(conditionLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select><Input aria-label="Batería" value={receive.batteryHealth} inputMode="numeric" maxLength={3} onChange={event => setReceive(data => ({ ...data, batteryHealth: event.target.value.replace(/\D/g, '') }))} placeholder="Batería % (opcional)" /></div><p className="mt-1 text-xs text-mute">Recordamos tu última sucursal y depósito; podés cambiarlos.</p><div><Label htmlFor="recibir-proveedor">Proveedor</Label><Input id="recibir-proveedor" aria-label="Proveedor" list="inventario-proveedores" value={receive.supplierName} onChange={event => setReceive(data => ({ ...data, supplierName: event.target.value }))} placeholder="Elegí uno o escribí el nombre" autoCapitalize="words" /><datalist id="inventario-proveedores">{proveedores.map(proveedor => <option key={proveedor.id} value={proveedor.name} />)}</datalist><p className="mt-1 text-xs text-mute">Si el nombre es nuevo, queda en el catálogo de proveedores.</p></div><div className="rounded-xl border border-ink-600 bg-ink-800/30 p-3"><p className="text-xs font-semibold uppercase tracking-wider text-mute">Costo (opcional)</p><p className="mt-1 text-xs text-mute">En guaraníes (sin decimales) o en otra moneda con la cotización del día. Se puede completar después.</p><div className="mt-2 grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)]"><CurrencySelect aria-label="Moneda del costo" value={receive.costCurrency} onChange={event => setReceive(data => ({ ...data, costCurrency: event.target.value, exchangeRatePyg: data.exchangeRatePyg || (event.target.value === 'PYG' ? '' : cotizacion ? String(cotizacion) : '') }))} /><MoneyInput aria-label="Monto del costo" currency={receive.costCurrency} value={receive.originalCost} onValueChange={next => setReceive(data => ({ ...data, originalCost: next === '' ? '' : String(next) }))} placeholder="Costo (opcional)" /></div>{receive.costCurrency !== 'PYG' && <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><div><Label htmlFor="recibir-cotizacion">Cotización del {receive.costCurrency} en Gs.</Label><MoneyInput id="recibir-cotizacion" aria-label="Cotización" currency="USD" symbol="Gs." value={receive.exchangeRatePyg} onValueChange={next => setReceive(data => ({ ...data, exchangeRatePyg: next === '' ? '' : String(next) }))} placeholder="Ej. 7500" /></div>{cotizacion ? <Button type="button" variant="ghost" className="self-end" onClick={() => setReceive(data => ({ ...data, exchangeRatePyg: String(cotizacion) }))}>Usar {gs(cotizacion)}</Button> : null}</div>}{receive.costCurrency !== 'PYG' && receive.originalCost !== '' && Number(receive.exchangeRatePyg) > 0 && <p className="mt-2 text-xs text-mute">Costo en Gs: <b className="text-fore">{gs(Number(receive.originalCost) * Number(receive.exchangeRatePyg))}</b></p>}</div><Input value={receive.notes} onChange={event => setReceive(data => ({ ...data, notes: event.target.value }))} placeholder="Observación de recepción" /><Button type="submit" className="w-full" disabled={busy}>Guardar unidad</Button></form></Modal><Modal open={reserveOpen} onClose={() => setReserveOpen(false)} title="Reservar unidad"><form onSubmit={createReservation} className="space-y-3"><p className="rounded-lg border border-fono/30 bg-fono/5 px-3 py-2 text-sm text-fono-light">IMEI <b>{reserve.serials}</b> · La unidad elegida queda apartada para este cliente.</p><div className="relative"><Input value={reserve.customerName} onChange={event => buscarClienteReserva(event.target.value)} placeholder="Buscar cliente o reservar sin cliente" />{reserveMatches.length > 0 && <ul className="absolute z-30 mt-1 max-h-44 w-full overflow-auto rounded-xl border border-ink-500 bg-paper shadow-xl">{reserveMatches.map(match => <li key={match.id}><button type="button" className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm transition hover:bg-ink-700" onClick={() => { setReserve(data => ({ ...data, customerName: match.name, customerId: match.id })); setReserveMatches([]) }}><span className="truncate font-medium text-fore">{match.name}</span><span className="shrink-0 text-xs text-mute">{[match.phone ? internationalPhone(match.phone, match.countryCode) : '', match.document].filter(Boolean).join(' · ')}</span></button></li>)}</ul>}</div><p className="text-xs text-mute">{reserve.customerId ? 'Reserva a nombre de la ficha del cliente: el teléfono y el RUC quedan en su perfil.' : 'Elegí un cliente de la lista o dejalo vacío para reservar sin cliente. La reserva no crea fichas.'}</p><div className="flex flex-wrap items-center gap-2"><span className="text-sm text-mute">Duración</span><Input aria-label="Duración en horas" className="h-9 w-16 text-center" inputMode="numeric" maxLength={2} value={reserve.hours} onChange={event => setReserve(data => ({ ...data, hours: event.target.value.replace(/\D/g, '') }))} required /><span className="text-sm text-mute">horas</span><span className="text-xs text-mute">(1 a 24)</span></div><p className="text-xs text-mute">Las reservas vencidas se liberan en cada consulta. Para liberarlas sin tráfico se debe configurar el scheduler de producción.</p><Button type="submit" className="w-full" disabled={busy || !reserve.serials}>Reservar</Button></form></Modal><Modal open={transferOpen} onClose={() => setTransferOpen(false)} title="Transferir IMEI entre sucursales"><form onSubmit={createTransfer} className="space-y-3"><p className="rounded-lg border border-info/25 bg-info/10 px-3 py-2 text-xs text-info">Los equipos quedan <b>en tránsito</b> al confirmar y recién suman stock cuando la sucursal destino verifica la llegada.</p><div className={GRILLA_DOS_COLUMNAS}><Select value={transfer.sourceBranchId} onChange={event => setTransfer(data => ({ ...data, sourceBranchId: event.target.value, productId: '' }))} required><option value="">Origen</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</Select><Select value={transfer.destinationBranchId} onChange={event => setTransfer(data => ({ ...data, destinationBranchId: event.target.value, destinationLocationId: '' }))} required><option value="">Destino</option>{branches.filter(branch => branch.id !== transfer.sourceBranchId).map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</Select></div><Select value={transfer.productId} onChange={event => setTransfer(data => ({ ...data, productId: event.target.value }))} required><option value="">Modelo a trasladar</option>{products.filter(product => product.branchId === transfer.sourceBranchId).map(product => <option key={product.id} value={product.id}>{product.nombre}</option>)}</Select><Select value={transfer.destinationLocationId} onChange={event => setTransfer(data => ({ ...data, destinationLocationId: event.target.value }))}><option value="">Ubicación de destino (opcional)</option>{locationsFor(transfer.destinationBranchId).map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</Select><Input value={transfer.serials} onChange={event => setTransfer(data => ({ ...data, serials: event.target.value }))} placeholder="IMEI(s), separados por coma o salto de línea" autoCapitalize="characters" required /><Input value={transfer.notes} onChange={event => setTransfer(data => ({ ...data, notes: event.target.value }))} placeholder="Observación" />{!puedeTransferirSinAuth && transfer.sourceBranchId && transfer.destinationBranchId && transfer.productId && <AutorizacionBloque kind="TRANSFER" entity="STOCK_TRANSFER" entityId={transfer.productId} sinMonto titulo="Autorización de transferencia" descripcion="Tu rol necesita autorización de gerencia para transferir entre sucursales. Pedila y ejecutá el traslado con la aprobación." requestedValue={{ sourceBranchId: transfer.sourceBranchId, destinationBranchId: transfer.destinationBranchId, productId: transfer.productId, ...(transferSerials.length ? { quantity: transferSerials.length, serials: transferSerials } : {}) }} onSelect={setTransferAuth} bloqueado={busy} />}<Button type="submit" className="w-full" disabled={busy}>Confirmar traslado</Button></form></Modal>{remitoQr && <Modal open onClose={() => { setRemitoQr(null); setRemitoQrImg(''); setRemitoQrError('') }} title={`Enlace del remito · ${remitoQr?.sourceBranch?.name || ''} → ${remitoQr?.destinationBranch?.name || ''}`}><div className="space-y-4 text-center"><p className="text-sm text-mute">Imprimí el remito con este QR: en destino lo escanean para confirmar la recepción, controlar los IMEI y dejar la foto, sin cuenta.</p>{remitoQrBusy && !remitoQrImg ? <p className="py-10 text-sm text-mute">Preparando enlace…</p> : remitoQrImg ? <img src={remitoQrImg} alt="QR del remito" className="mx-auto h-44 w-44 rounded-xl bg-white p-2" /> : null}<p className="break-all rounded-lg border border-ink-600 bg-ink-900 px-3 py-2 text-[11px] text-mute">{transferReceiveUrlFor(remitoQr?.publicToken) || '—'}</p>{remitoQrError && <Aviso tono="error">{remitoQrError}</Aviso>}<div className="flex flex-wrap justify-center gap-2"><Button type="button" variant="outline" disabled={!remitoQr?.publicToken} onClick={copiarRemitoQr}><Icon name="copy" className="h-4 w-4" />Copiar enlace</Button><Button type="button" variant="outline" disabled={remitoQrBusy} onClick={regenerarRemitoQr}><Icon name="refresh" className="h-4 w-4" />Regenerar</Button><Button type="button" disabled={remitoQrBusy} onClick={() => printTransferReceipt(remitoQr, { format: 'a4' })}><Icon name="printer" className="h-4 w-4" />Imprimir remito</Button></div></div></Modal>}<Modal open={receiveBatch !== null} onClose={() => setReceiveBatch(null)} title="Recibir lote en tránsito"><form onSubmit={confirmarRecepcionLote} className="space-y-3"><p className="text-sm text-mute">{receiveBatch?.transfer?.sourceBranch?.name} → <b className="text-fore">{receiveBatch?.transfer?.destinationBranch?.name}</b> · {(receiveBatch?.transfer?.lines || []).flatMap(line => line.serials || []).length} equipo(s). Verificá físicamente y elegí dónde quedan en stock: recién al confirmar suman al inventario.</p><div className="max-h-40 space-y-1 overflow-auto rounded-xl border border-ink-600 p-2 text-xs text-mute">{(receiveBatch?.transfer?.lines || []).flatMap(line => line.serials || []).map(serial => <SerialTexto key={serial} serial={serial} className="block" />)}</div><Select required aria-label="Depósito destino" value={receiveBatch?.locationId || ''} onChange={event => setReceiveBatch(current => ({ ...current, locationId: event.target.value }))}><option value="">Elegí depósito destino</option>{locationsFor(receiveBatch?.transfer?.destinationBranch?.id || receiveBatch?.transfer?.destinationBranchId).map(location => <option key={location.id} value={location.id}>{location.code ? `${location.code} · ` : ''}{location.name}</option>)}</Select><Button type="submit" className="w-full" disabled={busy || receiveBatch?.busy || !receiveBatch?.locationId}>{receiveBatch?.busy ? 'Recibiendo…' : 'Recibir todo el lote'}</Button></form></Modal>{detalleUnidad && <UnidadDetalle unit={detalleUnidad} busy={busy} canManage={canViewAlerts} locations={locations} onClose={() => setDetalleUnidad(null)} onChanged={refresh} onSell={sellUnit} onReserve={openReserveFor} onVerify={verify} onArrive={abrirLlegada} onLabel={(unit) => printLabel(unit).then(avisarImpresion)} onRelease={releaseReservation} onAdjust={unit => requestReason('adjust', unit)} onRemove={unit => requestReason('remove', unit)} onMove={moveLocation} />}<Modal open={reasonAction !== null} onClose={() => setReasonAction(null)} title={reasonAction?.kind === 'remove' ? 'Dar de baja' : reasonAction?.kind === 'restore' ? 'Restaurar unidad' : reasonAction?.unit?.status === 'DEFECTIVE' ? 'Habilitar unidad' : 'Marcar en revisión'}><form onSubmit={applyReason} className="space-y-3"><p className="text-sm text-mute">IMEI {ultimos4(reasonAction?.unit?.serial)} · {reasonAction?.kind === 'adjust' ? (reasonAction?.unit?.status === 'DEFECTIVE' ? 'La unidad vuelve al stock disponible.' : 'La unidad queda fuera del stock disponible hasta habilitarla de nuevo.') : reasonAction?.kind === 'remove' ? 'La unidad se mueve a Eliminados: no se borra, conserva su historial y podés restaurarla.' : 'La unidad vuelve al stock disponible.'} El cambio queda registrado en la auditoría.</p>{reasonAction?.kind !== 'restore' && <div><Label>Motivo</Label><Select aria-label="Motivo" value={reasonKind} onChange={event => setReasonKind(event.target.value)}><option value="">Elegí un motivo</option>{(reasonAction?.kind === 'remove' ? MOTIVOS_BAJA : MOTIVOS_REVISION).map(motivo => <option key={motivo} value={motivo}>{motivo}</option>)}</Select>{reasonKind && <p className="mt-1 text-xs text-mute">Recordamos tu último motivo; podés cambiarlo.</p>}</div>}<Textarea required autoFocus minLength={3} value={reason} onChange={event => setReason(event.target.value)} placeholder="Indicá el motivo" rows={3} /><Button className="w-full" type="submit" disabled={busy || reason.trim().length < 3 || (reasonAction?.kind === 'remove' && !reasonKind) || (reasonAction?.kind === 'adjust' && reasonAction?.unit?.status !== 'DEFECTIVE' && !reasonKind)}>{reasonAction?.kind === 'remove' ? 'Dar de baja' : reasonAction?.kind === 'restore' ? 'Restaurar unidad' : reasonAction?.unit?.status === 'DEFECTIVE' ? 'Habilitar' : 'Marcar en revisión'}</Button></form></Modal>
<Modal open={arrivalUnit !== null} onClose={() => { setArrivalUnit(null); setArrivalLocationId('') }} title="Recibir equipo en tránsito"><form onSubmit={receiveArrival} className="space-y-3"><p className="text-sm text-mute">Verificá físicamente <b className="text-fore">{arrivalUnit?.product?.name}</b> (IMEI {arrivalUnit?.serial}) y elegí dónde queda en stock. Recién al confirmar la unidad suma al stock de la sucursal.</p><Select required value={arrivalLocationId} onChange={event => setArrivalLocationId(event.target.value)}><option value="">Elegí ubicación (Depósito 1, Depósito 2…)</option>{locationsFor(arrivalUnit?.branchId).map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</Select><p className="mt-1 text-xs text-mute">Recordamos el último depósito de recepción; podés cambiarlo.</p><div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy || !arrivalLocationId}>{busy ? 'Recibiendo…' : 'Confirmar recepción'}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => printLabel(arrivalUnit).then(avisarImpresion)}><Icon name="printer" className="h-4 w-4" />Reimprimir etiqueta</Button></div></form>{transferDeArrival && <div className="mt-4 rounded-xl border border-ink-600 p-3"><AttachmentList entity="STOCK_TRANSFER" entityId={transferDeArrival.id} puedeSubir titulo="Foto del remito o recepción" /></div>}</Modal>
<EtiquetasProductoModal open={gondolaOpen} onClose={() => setGondolaOpen(false)} productos={products} /></div>}
