import { estadoInventario, etiquetaCondicionUnidad, nombreProducto, puntoCondicionUnidad } from '@/utils/inventario'
import { useState } from 'react'
import { formatUsd } from '@/utils/moneda'
import { gs } from '@/utils/calculos'
import { etiquetaDeCategoria } from '@/lib/categorias'
import IconoCategoria from '@/components/shared/IconoCategoria'
import MedidorBateria from '@/components/shared/MedidorBateria'
import { fechaHora } from '@/utils/fecha'
import Icon from '@/components/shared/Icon'
import { Badge, Button, Input } from '@/components/ui'
import { cn } from '@/lib/utils'
import { identificadorDeItem, modeloDeItem } from '@/lib/stockItems'
import { BateriaStock, CostoStock, EstadoStock, fechaVentaStock } from './CeldasStock'
import { UNIDADES_GRID, accionesDeUnidad, costoVisible, fechaReserva, fechaVerificacionCorta, locationTone, rowTone, verifiedLabel } from './stockHelpers'
import { MenuAcciones } from './MenuAcciones'

// Stock display helper end

export function FilaUnidad({
  unit,
  onClick,
  onVerify,
  onSell,
  onReserve,
  onLabel,
  onAdjust,
  onRemove,
  onMove,
  onEdit,
  onCosto,
  onComprobante,
  onApartar,
  onLiberarApartado,
  cotizacion,
  fechaVenta,
  busy,
  seleccionado = false,
  onAlternar,
}) {
  const v = verifiedLabel(unit)
  const estado = estadoInventario(unit)
  const serial = String(unit.serial || '')
  const [costoAbierto, setCostoAbierto] = useState(false)
  const [costoUsd, setCostoUsd] = useState('')
  const { costoGs, enUsd, sinCosto } = costoVisible(unit, cotizacion)
  const costoTexto = sinCosto
    ? null
    : enUsd !== null && Number.isFinite(enUsd)
      ? formatUsd(enUsd)
      : costoGs !== null
        ? gs(costoGs)
        : '—'
  // #285: el depósito muestra su código cuando lo tiene («Asunción · D1»).
  const deposito = unit.location ? unit.location.code || unit.location.name || '' : ''
  const acciones = accionesDeUnidad(unit, {
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
  })
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid="inventario-fila"
      onClick={onClick}
      aria-label={`Ver detalles de ${serial}`}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) {
          event.preventDefault()
          onClick?.()
        }
      }}
      className={`stock-f4-row ${UNIDADES_GRID} cursor-pointer rounded-lg border border-ink-600 px-3 py-1.5 transition hover:border-fono/40 ${rowTone(unit)}`}
    >
      {onAlternar ? (
        <span className="flex items-center" onClick={(event) => event.stopPropagation()}>
          <label className="flex h-11 w-11 items-center justify-center md:h-5 md:w-5">
            <input
              type="checkbox"
              className="h-4 min-h-0 w-4 accent-fono"
              aria-label={`Seleccionar ${nombreProducto(unit.product || {})} ${serial}`}
              checked={seleccionado}
              onChange={() => onAlternar()}
            />
          </label>
        </span>
      ) : (
        <span />
      )}
      <span
        data-testid="unidad-modelo"
        className="stock-f4-model flex min-w-0 items-center gap-1.5"
      >
        <span
          className="grid h-5 w-5 shrink-0 place-items-center overflow-hidden rounded-md border border-ink-600 bg-ink-800 text-mute"
          title={`Categoría: ${etiquetaDeCategoria(nombreProducto(unit.product || {}))}`}
        >
          <IconoCategoria categoria={nombreProducto(unit.product || {})} className="h-3.5 w-3.5" />
        </span>
        {/* Full model, variant and battery identity; serial keeps its own column. */}
        <b className="min-w-0 text-[13px] leading-tight" title={nombreProducto(unit.product || {})}>
          {nombreProducto(unit.product || {})}
          {(unit.color || unit.product?.color) &&
          !nombreProducto(unit.product || {})
            .toLowerCase()
            .includes(String(unit.color || unit.product.color).toLowerCase())
            ? ` · ${unit.color || unit.product.color}`
            : ''}
          {unit.batteryHealth ? (
            <>
              {' '}
              ·{' '}
              <MedidorBateria
                porcentaje={unit.batteryHealth}
                variante="chip"
                className="stock-f4-battery"
              />
            </>
          ) : null}
        </b>
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${puntoCondicionUnidad(unit)}`}
          title={`Condición: ${etiquetaCondicionUnidad(unit)}`}
          aria-label={`Condición: ${etiquetaCondicionUnidad(unit)}`}
        />
        {/* #279 (A4): equipo que viaja, apartado para una venta futura. */}
        {unit.transitAssignment && (
          <span
            data-testid="unidad-apartada"
            className="shrink-0 rounded border border-info/40 bg-info/10 px-1 font-semibold text-info"
            title={`Apartada para ${unit.transitAssignment.customerName || unit.transitAssignment.order?.orderNumber || 'una venta futura'} · la apartó ${unit.transitAssignment.seller?.name || 'un vendedor'}. Queda bloqueada para otras ventas y el IMEI se vincula al llegar.`}
          >
            Apart.
          </span>
        )}
      </span>
      {/* #285: el IMEI es su propia columna (ya no va debajo del modelo).
        #305: completo, sin recortar la cabeza. */}
      <span
        data-testid="unidad-imei"
        className="flex min-w-0 items-center font-mono text-[11px] tabular-nums text-mute"
        title={`IMEI/serial ${serial}`}
      >
        {serial || '—'}
      </span>
      {/* #285: Verificación = estado + verificador + fecha en una línea
        («OK VPC · 01/09/2026»), con la verificación de un clic al lado.
        #305: sin truncar la fecha. */}
      <span
        data-testid="unidad-verificacion"
        className={`flex min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-0.5 text-xs ${v ? 'bg-ok/10 text-ok' : 'border border-ink-600 text-mute'}`}
        title={
          v
            ? `Verificado OK por ${v.quien} · ${fechaHora(unit.lastVerifiedAt)}`
            : 'Todavía sin verificación física'
        }
      >
        {/* El texto ocupa el ancho libre: el botón de verificar queda pegado al
          borde y el centro de la fila no cae sobre una acción (#285). */}
        {v ? (
          <span className="min-w-0 flex-1 font-semibold">{`OK ${v.quien} · ${fechaVerificacionCorta(unit.lastVerifiedAt)}`}</span>
        ) : (
          <span className="min-w-0 flex-1 whitespace-nowrap">Sin verificar</span>
        )}
        <button
          type="button"
          disabled={busy}
          aria-label="✓ Verificar"
          title={`Verificar ${serial} (un clic)`}
          onClick={(event) => {
            event.stopPropagation()
            onVerify?.(unit)
          }}
          className="grid h-11 w-11 md:h-6 md:w-6 shrink-0 place-items-center rounded-full border border-ok/40 text-ok transition hover:bg-ok/10 disabled:opacity-50"
        >
          <Icon name="check" className="h-3.5 w-3.5" />
        </button>
      </span>
      {/* #285: sucursal y depósito cuando corresponda («Asunción · D1»). */}
      <span
        className="flex min-w-0 items-center gap-1.5 text-xs text-mute"
        title={`Ubicación: ${[unit.branch?.name, deposito].filter(Boolean).join(' · ') || 'sin asignar'}`}
      >
        {unit.branch?.name || deposito ? (
          <>
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: locationTone(unit.location) }}
            />
            <span className="truncate">
              {unit.branch?.name && deposito
                ? `${unit.branch.name} · ${deposito}`
                : deposito || unit.branch?.name}
            </span>
          </>
        ) : (
          '—'
        )}
      </span>
      {/* #246: el estado y sus avisos van en una sola línea (con tooltip para el
        detalle completo), así todas las filas tienen la misma altura. */}
      <span className="flex min-w-0 items-center gap-1.5 overflow-hidden text-[10px]">
        <Badge color={estado.tone} className="shrink-0 max-w-full truncate" title={estado.label}>
          {estado.label}
        </Badge>
        {unit.reservationCustomer && (
          <span
            className="font-semibold text-reserved"
            title={`Reservado para ${unit.reservationCustomer}`}
          >
            {unit.reservationCustomer}
          </span>
        )}
        {unit.consignorName && (
          <span
            className="shrink-0 font-semibold text-fono-light"
            title={`En consignación de ${unit.consignorName}`}
          >
            Consignado
          </span>
        )}
        {fechaVenta && (
          <span
            className="shrink-0 text-mute"
            title={`Vendido el ${new Date(fechaVenta).toLocaleString('es-PY')}`}
          >
            {fechaReserva(fechaVenta)}
          </span>
        )}
      </span>
      <span className="flex items-center justify-end gap-1 text-right text-xs font-semibold tabular-nums text-fore">
        {costoAbierto ? (
          <span className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
            <Input
              autoFocus
              aria-label={`Costo en USD de ${serial}`}
              className="h-7 w-20 px-1 text-right text-xs"
              inputMode="decimal"
              value={costoUsd}
              onChange={(event) => setCostoUsd(event.target.value.replace(/[^0-9.,]/g, ''))}
              onKeyDown={(event) => {
                event.stopPropagation()
                if (event.key === 'Enter') {
                  onCosto?.(unit, costoUsd)
                  setCostoAbierto(false)
                }
                if (event.key === 'Escape') setCostoAbierto(false)
              }}
            />
            <button
              type="button"
              title="Guardar el costo en USD"
              onClick={() => {
                onCosto?.(unit, costoUsd)
                setCostoAbierto(false)
              }}
              className="rounded-lg border border-ok/40 px-1.5 py-0.5 text-[10px] font-bold text-ok"
            >
              OK
            </button>
            <button
              type="button"
              title="Cancelar"
              onClick={() => setCostoAbierto(false)}
              className="rounded-lg px-1 text-[10px] text-mute"
            >
              ✕
            </button>
          </span>
        ) : sinCosto ? (
          <Badge
            color="orange"
            className="whitespace-nowrap px-1.5 py-0.5 text-[10px]"
            title="Falta cargar el costo: usá el lápiz para completarlo"
          >
            Sin costo
          </Badge>
        ) : (
          <span
            className="stock-f4-cost"
            title={`Costo cargado${costoGs !== null ? ` (${gs(costoGs)})` : ''}`}
          >
            {enUsd !== null && Number.isFinite(enUsd) && costoTexto
              ? costoTexto.replace(/^USD /, '')
              : costoTexto}
          </span>
        )}
        <button
          type="button"
          disabled={busy}
          title="Editar el costo en dólares"
          aria-label={`Editar el costo de ${serial}`}
          onClick={(event) => {
            event.stopPropagation()
            setCostoUsd(
              enUsd !== null && Number.isFinite(enUsd) ? String(Number(enUsd.toFixed(2))) : '',
            )
            setCostoAbierto(true)
          }}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-mute transition hover:text-fono md:h-7 md:w-7"
        >
          <Icon name="edit" className="h-3.5 w-3.5" />
        </button>
      </span>
      <span className="flex min-w-0 items-center justify-end gap-1">
        {/* #285: ver detalles, editar y el menú adicional. Las reservadas
          conservan «Finalizar venta» y las vendidas su comprobante rápido (sus
          acciones primarias), como hasta ahora. */}
        <button
          type="button"
          disabled={busy}
          aria-label={`Ver detalles de ${serial}`}
          title="Ver los detalles de la unidad"
          onClick={(event) => {
            event.stopPropagation()
            onClick?.()
          }}
          className="grid h-11 w-11 md:h-7 md:w-7 shrink-0 place-items-center rounded-lg text-mute transition hover:text-fono disabled:opacity-50"
        >
          <Icon name="eye" className="h-3.5 w-3.5" />
        </button>
        {unit.status === 'RESERVED' && (
          <button
            type="button"
            disabled={busy}
            title="Cerrar la reserva y cargar la venta"
            onClick={(event) => {
              event.stopPropagation()
              onSell?.(unit)
            }}
            className="min-h-11 whitespace-nowrap rounded-lg border border-fono/40 px-2 py-1 text-[10px] font-bold text-fono-light transition hover:bg-fono/10 disabled:opacity-50 md:min-h-0"
          >
            Finalizar venta
          </button>
        )}
        {unit.status === 'SOLD' && (
          <button
            type="button"
            disabled={busy}
            aria-label={`Imprimir comprobante rápido de ${serial}`}
            title="Imprimir comprobante rápido (nivel Rápido, 80 mm) sin salir de la lista"
            onClick={(event) => {
              event.stopPropagation()
              onComprobante?.(unit)
            }}
            className="grid h-11 w-11 md:h-7 md:w-7 shrink-0 place-items-center rounded-lg border border-ink-600 text-mute transition hover:border-fono/40 hover:text-fore disabled:opacity-50"
          >
            <Icon name="receipt" className="h-3.5 w-3.5" />
          </button>
        )}
        {unit.status !== 'RESERVED' && unit.status !== 'SOLD' && (
          <button
            type="button"
            disabled={busy}
            aria-label={`Editar los datos de ${serial}`}
            title="Editar los datos de la unidad"
            onClick={(event) => {
              event.stopPropagation()
              onEdit?.(unit)
            }}
            className="min-h-11 whitespace-nowrap rounded-lg border border-ink-600 px-2 py-1 text-[10px] font-semibold text-fore transition hover:border-fono/40 md:min-h-0"
          >
            <Icon name="edit" className="h-3.5 w-3.5" />
          </button>
        )}
        <MenuAcciones unit={unit} busy={busy} acciones={acciones} />
      </span>
    </div>
  )
}

// ── Lista unificada de Stock (U3) ───────────────────────────────────────────
// Una fila = una unidad serializada (IMEI) o un producto sin unidades
// (accesorio con cantidad). Columnas: Modelo · IMEI/serie · Batería · Proveedor ·
// Costo · Estado; Vendidos suma «Vendido» y Eliminados una nota. Proveedor y
// Costo solo existen si el rol los ve (la API devuelve null para el resto).
export function columnasStock({ verCosto, vista }) {
  const extra = vista === 'vendidos' ? ['8.5rem'] : vista === 'eliminados' ? ['minmax(8rem,1fr)'] : []
  const acciones = vista === 'eliminados' ? '11.5rem' : '2.75rem'
  const base = ['2.75rem', 'minmax(7.5rem,1.7fr)', 'minmax(8.5rem,1fr)', '4.5rem']
  const completa = [...base, ...(verCosto ? ['minmax(5.5rem,0.9fr)', '7.75rem'] : []), '8.25rem', ...extra, acciones]
  const compacta = [...base, ...(verCosto ? ['7.75rem'] : []), '8.25rem', ...extra, acciones]
  return { completa: completa.join(' '), compacta: compacta.join(' ') }
}

export function estiloColumnas(columnas) {
  return { '--stock-cols': columnas.completa, '--stock-cols-compacta': columnas.compacta }
}

export function FilaStock({ item, vista = 'unidades', verCosto = false, seleccionado = false, onAlternar, onAbrir, acciones = [], onRestaurar, busy = false }) {
  const { nombre, variante } = modeloDeItem(item)
  const identificador = identificadorDeItem(item)
  const ubicacion = [item.branchName, item.locationName].filter(Boolean).join(' · ')
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid="inventario-fila"
      data-kind={item.kind}
      data-estado={item.status}
      aria-label={`Ver detalles de ${nombre} ${identificador}`.trim()}
      onClick={onAbrir}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) {
          event.preventDefault()
          onAbrir?.()
        }
      }}
      className={cn(
        'stock-lista-grid stock-lista-fila cursor-pointer rounded-lg border px-2 py-1.5 transition hover:border-fono/40',
        seleccionado ? 'border-fono/50 bg-fono/5' : 'border-ink-600',
      )}
    >
      <span className="flex items-center" onClick={(event) => event.stopPropagation()}>
        <label className="flex h-11 w-11 items-center justify-center">
          <input
            type="checkbox"
            className="h-4 min-h-0 w-4 accent-fono"
            aria-label={`Seleccionar ${nombre} ${identificador}`.trim()}
            checked={seleccionado}
            onChange={() => onAlternar?.()}
          />
        </label>
      </span>
      <span data-testid="unidad-modelo" className="min-w-0">
        <b className="block min-w-0 text-[13px] leading-tight" title={`${nombre}${variante ? ` · ${variante}` : ''}`}>
          {nombre}
          {variante ? <span className="font-normal text-mute"> · {variante}</span> : null}
        </b>
        {ubicacion ? <span className="block truncate text-[11px] text-mute" title={ubicacion}>{ubicacion}</span> : null}
        {verCosto && item.supplierName ? <span className="stock-lista-prov-chico truncate text-[11px] text-mute" title={`Proveedor: ${item.supplierName}`}>Proveedor: {item.supplierName}</span> : null}
      </span>
      <span data-testid="unidad-imei" className={cn('min-w-0 text-[11px] tabular-nums text-mute', item.kind === 'unit' && 'font-mono')} title={item.kind === 'product' ? `SKU ${identificador}` : `IMEI/serial ${identificador}`}>
        {identificador || '—'}
      </span>
      <span className="flex items-center"><BateriaStock item={item} /></span>
      {verCosto ? (
        <span className="stock-lista-prov min-w-0 truncate text-xs text-mute" title={item.supplierName || 'Sin proveedor'}>{item.supplierName || '—'}</span>
      ) : null}
      {verCosto ? <span className="flex items-center justify-end text-right"><CostoStock item={item} /></span> : null}
      <span className="flex items-center"><EstadoStock item={item} /></span>
      {vista === 'vendidos' ? <span className="text-xs text-mute" title={`Vendido el ${fechaVentaStock(item)}`}>{fechaVentaStock(item)}</span> : null}
      {vista === 'eliminados' ? <span className="truncate text-[11px] text-mute">Conserva su historial de auditoría</span> : null}
      <span className="flex items-center justify-end gap-1" onClick={(event) => event.stopPropagation()}>
        {vista === 'eliminados' && onRestaurar ? (
          <Button type="button" className="min-h-11 px-3 text-xs" disabled={busy} onClick={onRestaurar}>Restaurar</Button>
        ) : null}
        <MenuAcciones unit={{ serial: identificador || nombre }} busy={busy} acciones={acciones} />
      </span>
    </div>
  )
}

export default FilaStock
