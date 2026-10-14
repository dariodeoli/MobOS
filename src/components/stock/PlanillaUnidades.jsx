// Planilla de Unidades (#400): el stock como la hoja de cálculo de Dario. Una fila
// por unidad de 36–40 px, agrupada por modelo (encabezado plegable con las
// disponibles), color de fila por condición (nuevo verde, semi nuevo amarillo,
// con la variante de la ubicación) y el estado como chip aparte.
//
// - Escritorio / tablet (≥768 px): grilla con Modelo (+ batería · ciclos), Ingreso
//   (fecha · quién verificó), IMEI, Ubicación, Proveedor, Costo (con permiso),
//   Garantía, Nota (editable en la fila) y Estado.
// - Celular (<768 px): lista compacta (modelo + chip, IMEI corto, ubicación);
//   tocar abre la ficha. Sin scroll horizontal.
// - Proveedor: solo sigla/ícono/color; el nombre real únicamente para quien la API
//   ya se lo dio (ADMIN/GERENTE → `rolVeCosto`).
import './planilla.css'
import { useMemo, useRef, useState } from 'react'
import Icon from '@/components/shared/Icon'
import ProveedorBadge from '@/components/shared/ProveedorBadge'
import UbicacionBadge from '@/components/shared/UbicacionBadge'
import { CELDA_ENCABEZADO, CELDA_IDENTIDAD } from '@/components/shared/tabla'
import { cn } from '@/lib/utils'
import {
  agruparPorModelo, colorUbicacion, estadoPlanilla, etiquetaCondicion, familiaCondicion, fechaCorta,
  garantiaPlanilla, imeiCorto, modeloPlanilla, quienVerifico, siglaUbicacion, textoBateria, textoGrupo,
} from '@/lib/planilla'
import { identificadorDeItem, textoEstadoItem } from '@/lib/stockItems'
import { fechaHora } from '@/utils/fecha'
import { CostoStock } from './CeldasStock'
import { MenuAcciones } from './MenuAcciones'

/** Columnas de la grilla de escritorio; `compacta` oculta Ingreso y Garantía (bajo 64 rem). */
export function columnasPlanilla({ verCosto }) {
  const costo = verCosto ? ['6.25rem'] : []
  const completa = ['1.75rem', 'minmax(15rem,2.3fr)', '6.5rem', '8.5rem', '4.25rem', '4.75rem', ...costo, '4.75rem', 'minmax(6rem,1fr)', 'minmax(4.5rem,12.5rem)', '1.75rem']
  const compacta = ['1.75rem', 'minmax(13rem,2fr)', '8.5rem', '4.25rem', '4.75rem', ...costo, 'minmax(5rem,1fr)', 'minmax(4.5rem,11rem)', '1.75rem']
  return { '--pl-cols': completa.join(' '), '--pl-cols-compacta': compacta.join(' ') }
}

const estiloFila = (item) => {
  const color = colorUbicacion(item)
  return color ? { '--pl-tono': color } : undefined
}

function ChipEstadoPlanilla({ estado }) {
  if (!estado) return null
  return (
    <span data-testid="planilla-estado" data-estado={estado.clave} data-tono={estado.tono} className="pl-chip" title={estado.titulo}>
      <span>{estado.etiqueta}</span>
    </span>
  )
}

function NotaEditable({ item, puedeEditar, onGuardar }) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState('')
  const [local, setLocal] = useState(null)
  const guardando = useRef(false)
  const actual = local !== null && local.base === (item.notes || '') ? local.valor : item.notes || ''
  const terminar = async (guardar) => {
    if (guardando.current) return
    setEditando(false)
    const limpio = texto.trim().slice(0, 500)
    if (!guardar || limpio === actual.trim()) return
    guardando.current = true
    try {
      if (await onGuardar(item, limpio)) setLocal({ base: item.notes || '', valor: limpio })
    } finally {
      guardando.current = false
    }
  }
  if (editando) {
    return (
      <input
        autoFocus
        data-testid="planilla-nota-input"
        className="pl-nota-input"
        aria-label={`Nota de ${identificadorDeItem(item)}`}
        maxLength={500}
        value={texto}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => setTexto(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Enter') { event.preventDefault(); terminar(true) }
          if (event.key === 'Escape') { event.preventDefault(); terminar(false) }
        }}
        onBlur={() => terminar(true)}
      />
    )
  }
  if (!puedeEditar) return <span className="pl-celda block" title={actual || undefined}>{actual || <span className="pl-sec">—</span>}</span>
  return (
    <button
      type="button"
      data-testid="planilla-nota"
      className="pl-nota"
      title={actual ? `${actual} (tocá para editar)` : 'Agregar una nota'}
      aria-label={actual ? `Nota: ${actual}. Editar` : `Agregar nota a ${identificadorDeItem(item)}`}
      onClick={(event) => { event.stopPropagation(); setTexto(actual); setEditando(true) }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {actual || <span className="pl-sec">—</span>}
    </button>
  )
}

function FilaPlanilla({ item, verCosto, rolVeCosto, seleccionado, onAlternar, onAbrir, acciones, busy, onGuardarNota }) {
  const ahora = useMemo(() => new Date(), [])
  const modelo = modeloPlanilla(item)
  const bateria = textoBateria(item, { corto: true })
  const bateriaLarga = textoBateria(item)
  const estado = estadoPlanilla(item, ahora)
  const garantia = garantiaPlanilla(item.warrantyUntil, ahora)
  const quien = quienVerifico(item)
  const imei = identificadorDeItem(item)
  const esUnidad = item.kind === 'unit'
  const puedeEditar = esUnidad && item.status !== 'vendido' && item.status !== 'eliminado'
  const tituloIngreso = [`Ingresó el ${fechaHora(item.createdAt, '—')}`, item.lastVerifiedAt ? `verificó ${item.verifiedBy || '—'} el ${fechaHora(item.lastVerifiedAt, '—')}` : 'sin verificar'].join(' · ')
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid="planilla-fila"
      data-condicion={familiaCondicion(item)}
      data-estado={item.status}
      data-tono={colorUbicacion(item) ? 'ubicacion' : undefined}
      data-sel={seleccionado ? 'true' : undefined}
      aria-label={`Ver detalles de ${modelo} ${imei}`.trim()}
      style={estiloFila(item)}
      className="pl-fila pl-grid"
      onClick={onAbrir}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) { event.preventDefault(); onAbrir?.() }
      }}
    >
      <span className="flex items-center" onClick={(event) => event.stopPropagation()}>
        <label className="flex h-full w-full items-center">
          <input type="checkbox" className="h-4 min-h-0 w-4 accent-fono" aria-label={`Seleccionar ${modelo} ${imei}`.trim()} checked={seleccionado} onChange={onAlternar} />
        </label>
      </span>
      <span data-testid="unidad-modelo" className="pl-celda flex items-baseline gap-1.5" title={[modelo, etiquetaCondicion(item), bateriaLarga].filter(Boolean).join(' · ')}>
        <b className={CELDA_IDENTIDAD}>{modelo}</b>
        {bateria ? <span className="pl-sec shrink-0 text-[11px]" data-testid="planilla-bateria">{bateria}</span> : null}
        <span className="sr-only">{`, ${etiquetaCondicion(item)}`}</span>
      </span>
      <span className="pl-c-ingreso pl-celda pl-sec" data-testid="planilla-ingreso" title={tituloIngreso}>
        {fechaCorta(item.createdAt, ahora) || '—'}{esUnidad ? ` · ${quien || '—'}` : ''}
      </span>
      <span data-testid="unidad-imei" className={cn('pl-celda text-[11px]', esUnidad && 'font-mono tabular-nums')} title={esUnidad ? `IMEI/serial ${imei}` : `SKU ${imei}`}>
        {imei || '—'}
      </span>
      <span className="pl-celda">
        {esUnidad
          ? <UbicacionBadge sigla={siglaUbicacion(item)} nombre={item.locationName || ''} sucursal={item.branchName || ''} icono={item.locationIcon} color={item.locationColor} />
          : <span className="pl-sec" title={item.branchName || undefined}>—</span>}
      </span>
      <span className="pl-celda">
        {esUnidad
          ? <ProveedorBadge sigla={item.supplierCode} icono={item.supplierIcon} color={item.supplierColor} nombre={rolVeCosto ? item.supplierName : null} />
          : <span className="pl-sec">—</span>}
      </span>
      {verCosto ? <span className="flex items-center justify-end text-right">{esUnidad ? <CostoStock item={item} /> : <span className="pl-sec">—</span>}</span> : null}
      <span className="pl-c-garantia pl-celda pl-garantia pl-2" data-tono={garantia.tono} data-testid="planilla-garantia" title={garantia.detalle}>
        {garantia.texto || <span className="pl-sec">—</span>}
      </span>
      <span className="pl-celda">
        <NotaEditable item={item} puedeEditar={puedeEditar} onGuardar={onGuardarNota} />
      </span>
      <span className="pl-celda">
        {item.kind === 'product'
          ? <span className="pl-sec">{textoEstadoItem(item)}</span>
          : <ChipEstadoPlanilla estado={estado} />}
      </span>
      <span className="flex items-center justify-end" onClick={(event) => event.stopPropagation()}>
        <MenuAcciones unit={{ serial: imei || modelo }} busy={busy} acciones={acciones} />
      </span>
    </div>
  )
}

function FilaMovil({ item, onAbrir }) {
  const ahora = useMemo(() => new Date(), [])
  const modelo = modeloPlanilla(item)
  const estado = estadoPlanilla(item, ahora)
  const imei = identificadorDeItem(item)
  const bateria = textoBateria(item, { corto: true })
  const esUnidad = item.kind === 'unit'
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid="planilla-fila-movil"
      data-condicion={familiaCondicion(item)}
      data-estado={item.status}
      data-tono={colorUbicacion(item) ? 'ubicacion' : undefined}
      aria-label={`Ver detalles de ${modelo} ${imei}`.trim()}
      style={estiloFila(item)}
      className="pl-fila pl-movil"
      onClick={onAbrir}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) { event.preventDefault(); onAbrir?.() }
      }}
    >
      <span className="flex min-w-0 items-center justify-between gap-2">
        <b data-testid="unidad-modelo" className={cn('min-w-0', CELDA_IDENTIDAD)} title={`${modelo} · ${etiquetaCondicion(item)}`}>
          {modelo}<span className="sr-only">{`, ${etiquetaCondicion(item)}`}</span>
        </b>
        {item.kind === 'product' ? <span className="pl-sec shrink-0 text-[11px]">{textoEstadoItem(item)}</span> : <ChipEstadoPlanilla estado={estado} />}
      </span>
      <span className="pl-sec flex min-w-0 items-center gap-2 text-[11px]">
        <span data-testid="unidad-imei" className={cn('shrink-0 tabular-nums', esUnidad && 'font-mono')} title={esUnidad ? `IMEI/serial ${imei}` : `SKU ${imei}`}>{imeiCorto(imei)}</span>
        {esUnidad ? <UbicacionBadge sigla={siglaUbicacion(item)} nombre={item.locationName || ''} sucursal={item.branchName || ''} icono={item.locationIcon} color={item.locationColor} className="shrink-0 text-fore" /> : null}
        {bateria ? <span className="truncate">{bateria}</span> : null}
      </span>
    </div>
  )
}

function EncabezadoColumnas({ verCosto, todosMarcados, onMarcarTodos }) {
  return (
    <div data-testid="planilla-encabezado" className="pl-grid pl-encabezado rounded-lg border border-transparent border-b-ink-600/60 px-2 py-1">
      <span className="flex items-center">
        <input type="checkbox" className="h-4 min-h-0 w-4 accent-fono" aria-label="Seleccionar visibles" title="Seleccionar visibles" checked={todosMarcados} onChange={onMarcarTodos} />
      </span>
      <span className={CELDA_ENCABEZADO}>Modelo</span>
      <span className={cn(CELDA_ENCABEZADO, 'pl-c-ingreso')} title="Fecha de ingreso y quién verificó">Ingreso</span>
      <span className={CELDA_ENCABEZADO} title="IMEI de la unidad">IMEI</span>
      <span className={CELDA_ENCABEZADO} title="Ubicación (sigla); el nombre completo en el tooltip">Ubic.</span>
      <span className={CELDA_ENCABEZADO} title="Proveedor (sigla)">Prov.</span>
      {verCosto ? <span className={cn(CELDA_ENCABEZADO, 'text-right')}>Costo</span> : null}
      <span className={cn(CELDA_ENCABEZADO, 'pl-c-garantia')} title="Fin de la garantía">Garantía</span>
      <span className={CELDA_ENCABEZADO} title="Nota interna: tocá para editarla">Nota</span>
      <span className={CELDA_ENCABEZADO}>Estado</span>
      <span><span className="sr-only">Acciones</span></span>
    </div>
  )
}

function EncabezadoGrupo({ grupo, abierto, onAlternar, idLista }) {
  return (
    <button
      type="button"
      data-testid="planilla-grupo"
      aria-expanded={abierto}
      aria-controls={idLista}
      className="pl-grupo"
      onClick={onAlternar}
    >
      <Icon name="chevron" className={cn('h-3.5 w-3.5 shrink-0 text-mute transition-transform', abierto && 'rotate-180')} aria-hidden="true" />
      <b className="min-w-0 truncate text-[13px]">{grupo.nombre}</b>
      <span className="ml-auto shrink-0 text-[11px] font-semibold text-mute" data-testid="planilla-grupo-disponibles">{grupo.esProducto ? `${grupo.total} ${grupo.total === 1 ? 'artículo' : 'artículos'}` : textoGrupo(grupo)}</span>
    </button>
  )
}

/**
 * @param {{ items: object[], angosta: boolean, verCosto: boolean, rolVeCosto: boolean, seleccionados: string[],
 *   onAlternar: (id: string) => void, onMarcarTodos: () => void, onAbrir: (item: object) => void,
 *   accionesDe: (item: object) => object[], busy: boolean, onGuardarNota: (item: object, texto: string) => Promise<boolean> }} props
 */
export default function PlanillaUnidades({ items, angosta, verCosto, rolVeCosto, seleccionados, onAlternar, onMarcarTodos, onAbrir, accionesDe, busy, onGuardarNota }) {
  const grupos = useMemo(() => agruparPorModelo(items), [items])
  const [plegados, setPlegados] = useState(() => new Set())
  const alternarGrupo = (clave) => setPlegados((actual) => { const siguiente = new Set(actual); if (siguiente.has(clave)) siguiente.delete(clave); else siguiente.add(clave); return siguiente })
  const todosMarcados = items.length > 0 && items.every((item) => seleccionados.includes(item.id))
  return (
    <div className="planilla space-y-1.5" data-testid="planilla-unidades" data-modo={angosta ? 'movil' : 'escritorio'} style={columnasPlanilla({ verCosto })}>
      {!angosta ? <EncabezadoColumnas verCosto={verCosto} todosMarcados={todosMarcados} onMarcarTodos={onMarcarTodos} /> : null}
      {grupos.map((grupo) => {
        const abierto = !plegados.has(grupo.clave)
        const idLista = `planilla-grupo-${grupo.clave.replace(/[^a-z0-9]+/gi, '-')}`
        return (
          <section key={grupo.clave} className="space-y-1" aria-label={grupo.nombre}>
            <EncabezadoGrupo grupo={grupo} abierto={abierto} onAlternar={() => alternarGrupo(grupo.clave)} idLista={idLista} />
            {abierto ? (
              <div id={idLista} className="space-y-1">
                {grupo.items.map((item) => (angosta
                  ? <FilaMovil key={item.id} item={item} onAbrir={() => onAbrir(item)} />
                  : (
                    <FilaPlanilla
                      key={item.id}
                      item={item}
                      verCosto={verCosto}
                      rolVeCosto={rolVeCosto}
                      busy={busy}
                      seleccionado={seleccionados.includes(item.id)}
                      onAlternar={() => onAlternar(item.id)}
                      onAbrir={() => onAbrir(item)}
                      acciones={accionesDe(item)}
                      onGuardarNota={onGuardarNota}
                    />
                  )))}
              </div>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}
