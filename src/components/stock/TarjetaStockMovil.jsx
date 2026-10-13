import { estadoInventario, etiquetaCondicionUnidad, nombreProducto, puntoCondicionUnidad } from '@/utils/inventario'
import { gs } from '@/utils/calculos'
import { formatUsd } from '@/utils/moneda'
import { cn } from '@/lib/utils'
import { etiquetaDeCategoria } from '@/lib/categorias'
import IconoCategoria from '@/components/shared/IconoCategoria'
import { Badge } from '@/components/ui'
import MedidorBateria from '@/components/shared/MedidorBateria'
import { fechaHora } from '@/utils/fecha'
import { temaV2Activo } from '@/lib/temaV2'
import { locksParaChips, resumenVerificacion } from '@/lib/phonecheck'
import GradoBadge from '@/components/shared/GradoBadge'
import SerialTexto from '@/components/shared/SerialTexto'
import ChipsLocks from '@/components/shared/ChipsLocks'
import Avatar from '@/components/shared/Avatar'
import { accionesDeUnidad, costoVisible, fechaReserva, fechaVerificacion, fechaVerificacionCorta, formatCost, rowTone, verifiedLabel } from './stockHelpers'
import { MenuAcciones } from './MenuAcciones'

// #304: tarjeta compacta del listado móvil. Muestra lo que el operario
// necesita para trabajar (modelo, batería, IMEI completo, verificación,
// ubicación, estado y costo) con «Ver» y el menú de acciones, sin esconder el
// IMEI ni exigir scroll horizontal.
export function TarjetaUnidadMovil({
  unit,
  busy,
  fechaVenta,
  onClick,
  onVerify,
  onSell,
  onReserve,
  onLabel,
  onAdjust,
  onRemove,
  onMove,
  onComprobante,
  onApartar,
  onLiberarApartado,
  seleccionado = false,
  onAlternar,
}) {
  const v = verifiedLabel(unit)
  const estado = estadoInventario(unit)
  const serial = String(unit.serial || '')
  const nombre = nombreProducto(unit.product || {})
  const deposito = unit.location
    ? unit.location.name
      ? `${unit.location.name}${unit.location.code ? ` (${unit.location.code})` : ''}`
      : unit.location.code || ''
    : ''
  const ubicacion = [unit.branch?.name, deposito].filter(Boolean).join(' · ')
  const { costoGs, enUsd, sinCosto } = costoVisible(unit, null)
  const costoTexto = sinCosto
    ? 'Sin costo'
    : costoGs !== null
      ? gs(costoGs)
      : enUsd === 0
        ? formatUsd(enUsd)
        : '—'
  const acciones = accionesDeUnidad(
    unit,
    {
      onComprobante,
      onApartar,
      onLiberarApartado,
      onSell,
      onReserve,
      onVerify,
      onLabel,
      onAdjust,
      onMove,
      onRemove,
    },
    { incluirVerificar: true },
  )
  return (
    <article
      role="button"
      tabIndex={0}
      data-testid="inventario-tarjeta-movil"
      aria-label={`Ver detalles de ${serial}`}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) {
          event.preventDefault()
          onClick?.()
        }
      }}
      className={cn(
        'stock-f4-card cursor-pointer rounded-xl border border-ink-600 px-3 py-2 transition hover:border-fono/40',
        rowTone(unit),
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-start gap-1.5">
          <span
            className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center overflow-hidden rounded-md border border-ink-600 bg-ink-800 text-mute"
            title={`Categoría: ${etiquetaDeCategoria(nombre)}`}
          >
            <IconoCategoria categoria={nombre} className="h-3.5 w-3.5" />
          </span>
          <b
            data-testid="unidad-modelo"
            className="min-w-0 text-[13px] leading-tight"
            title={nombre}
          >
            {nombre}
            {(unit.color || unit.product?.color) &&
            !nombre.toLowerCase().includes(String(unit.color || unit.product.color).toLowerCase())
              ? ` · ${unit.color || unit.product.color}`
              : ''}
          </b>
          <span
            className={`mt-1 h-2 w-2 shrink-0 rounded-full ${puntoCondicionUnidad(unit)}`}
            title={`Condición: ${etiquetaCondicionUnidad(unit)}`}
            aria-label={`Condición: ${etiquetaCondicionUnidad(unit)}`}
          />
          {unit.transitAssignment && (
            <span
              data-testid="unidad-apartada"
              className="shrink-0 rounded border border-info/40 bg-info/10 px-1 font-semibold text-info"
              title={`Apartada para ${unit.transitAssignment.customerName || unit.transitAssignment.order?.orderNumber || 'una venta futura'}.`}
            >
              Apart.
            </span>
          )}
        </span>
        <Badge color={estado.tone} className="shrink-0 whitespace-nowrap px-1.5 py-0.5 text-[10px]">
          {estado.label}
        </Badge>
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-mute">
        {unit.batteryHealth ? (
          <MedidorBateria porcentaje={unit.batteryHealth} variante="chip" />
        ) : null}
        {/* #304: el IMEI nunca se oculta; si no entra, baja de línea completo. */}
        <span
          data-testid="unidad-imei"
          className="break-all font-mono tabular-nums"
          title={`IMEI/serial ${serial}`}
        >
          {serial || '—'}
        </span>
      </p>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-mute">
        <span
          data-testid="unidad-verificacion"
          className={v ? 'font-semibold text-ok' : ''}
          title={
            v
              ? `Verificado por ${v.quien} · ${fechaHora(unit.lastVerifiedAt)}`
              : 'Todavía sin verificación física'
          }
        >
          {v ? `OK ${v.quien} · ${fechaVerificacionCorta(unit.lastVerifiedAt)}` : 'Sin verificar'}
        </span>
        {ubicacion && (
          <span className="stock-f4-location" title={`Ubicación: ${ubicacion}`}>
            {ubicacion}
          </span>
        )}
        {unit.reservationCustomer && (
          <span
            className="font-semibold text-reserved"
            title={`Reservado para ${unit.reservationCustomer}`}
          >
            {unit.reservationCustomer}
          </span>
        )}
        {fechaVenta && (
          <span
            className="text-mute"
            title={`Vendido el ${new Date(fechaVenta).toLocaleString('es-PY')}`}
          >
            {fechaReserva(fechaVenta)}
          </span>
        )}
      </p>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span
          className="stock-f4-cost min-w-0 text-xs font-semibold tabular-nums text-fore"
          title="Costo cargado de la unidad"
        >
          {costoTexto}
        </span>
        <span className="stock-f4-card-actions flex shrink-0 items-center gap-1">
          {onAlternar && (
            <label className="stock-f4-select" onClick={(event) => event.stopPropagation()}>
              <input
                type="checkbox"
                aria-label={`Seleccionar ${nombre} ${serial}`}
                checked={seleccionado}
                onChange={onAlternar}
              />
            </label>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation()
              onClick?.()
            }}
            className="min-h-11 rounded-lg border border-ink-600 px-3 text-xs font-semibold text-fore transition hover:border-fono/40 "
          >
            Ver
          </button>
          <MenuAcciones unit={unit} busy={busy} acciones={acciones} />
        </span>
      </div>
    </article>
  )
}
export function TarjetaUnidad({ unit, onClick }) {
  const v = verifiedLabel(unit)
  const serial = String(unit.serial || '')
  // Vista previa v2 (#241, lote C): el tile de equipo del mock — superficie de
  // consola, números de consola y chips tipo pill. Se apaga con el flag.
  const v2 = temaV2Activo()
  // #241 lote C (cierre): con el flag, el tile suma el grado oficial (#240) y los
  // chips de locks de la última consulta IMEI del serial (con su fuente y hora);
  // sin el flag el tile queda como estaba.
  const grado = v2 ? (unit.inspection?.grado || null) : null
  const verificacion = v2 ? resumenVerificacion(unit.verificacion) : null
  const locks = v2 ? locksParaChips(unit.verificacion) : []
  return <button type="button" data-testid="inventario-tarjeta" onClick={onClick} className={cn('group flex w-full flex-col rounded-2xl border border-ink-600 p-3 text-left transition hover:border-fono/40', v2 && 'v2-tile', rowTone(unit))}>
    <span className="flex min-w-0 items-start justify-between gap-2">
      <b className="min-w-0 truncate text-[13px]" title={nombreProducto(unit.product || {})}>{nombreProducto(unit.product || {})}</b>
      <span className="flex shrink-0 items-center gap-1.5">
        {grado && <GradoBadge grado={grado} className="v2-grado" />}
        <Badge color={estadoInventario(unit).tone}>{estadoInventario(unit).label}</Badge>
      </span>
    </span>
    <SerialTexto serial={serial} className="mt-1 truncate text-[11px] text-mute" />
    {locks.length > 0 && <span className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1" data-testid="tile-locks">
      <ChipsLocks locks={locks} />
      {verificacion?.servicio && <small className="text-[10px] text-mute" data-testid="tile-locks-fuente">{verificacion.servicio}{verificacion.fecha ? ` · ${fechaHora(verificacion.fecha)}` : ''}</small>}
    </span>}
    <span className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-mute">
      {unit.batteryHealth ? <MedidorBateria porcentaje={unit.batteryHealth} variante="chip" /> : null}
      {unit.location?.name ? <span className={cn('truncate rounded border border-ink-500 px-1.5 py-0.5', v2 && 'v2-chip')}>{unit.location.name}</span> : null}
      {unit.supplierName ? <span className={cn('rounded border border-ink-500 px-1.5 py-0.5', v2 && 'v2-chip')}>{unit.supplierName}</span> : null}
      {unit.consignorName ? <span className={cn('rounded border border-fono/40 px-1.5 py-0.5 text-fono-light', v2 && 'v2-chip')} title={`En consignación de ${unit.consignorName}`}>Consignado</span> : null}
    </span>
    <span className="mt-2 flex items-center justify-between gap-2 text-[11px] text-mute">
      <span className="flex min-w-0 items-center gap-1.5" title={v ? `Verificó ${v.quien} · ${fechaVerificacion(unit.lastVerifiedAt)}` : undefined}>
        {v ? <><Avatar user={v.usuario} size="xs" /><span className="truncate">{fechaVerificacion(unit.lastVerifiedAt)}</span></> : <span className="truncate">Sin verificación</span>}
      </span>
      <span className={cn('shrink-0 font-semibold text-fore', v2 && 'v2-numero')}>{unit.originalCost ? formatCost(unit) : ''}</span>
    </span>
    {unit.reservationCustomer ? <span className="mt-1 truncate text-[11px] font-semibold text-reserved">Atajado por {unit.reservationCustomer}</span> : null}
  </button>
}
