// Planilla de Unidades (#400, #466): el stock como la hoja de cálculo de Dario. Una fila
// por unidad de 34 px, agrupada por modelo (encabezado plegable con las disponibles),
// color de fila por condición (nuevo verde, semi nuevo amarillo, con la variante de la
// ubicación) y el estado como chip aparte.
//
// - Escritorio / tablet (≥768 px): grilla de columnas fijas (encabezado y celdas comparten
//   la misma plantilla). Modelo pegado a la casilla y, después, las columnas que cada
//   usuario eligió (condición, ingreso, IMEI, sucursal·depósito, proveedor, costo con
//   permiso, estado con la nota de venta, verificación, garantía y nota). Las abreviaturas
//   son el default; el botón «Personalizar» cambia todo (por usuario, con default de empresa).
// - Celular (<768 px): lista compacta (modelo + chip, IMEI corto, ubicación);
//   tocar abre la ficha. Sin scroll horizontal.
// - Proveedor: solo sigla/ícono/color; el nombre real únicamente para quien la API
//   ya se lo dio (ADMIN/GERENTE → `rolVeCosto`).
import './planilla.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import Avatar from '@/components/shared/Avatar'
import Icon from '@/components/shared/Icon'
import ProveedorBadge from '@/components/shared/ProveedorBadge'
import UbicacionBadge from '@/components/shared/UbicacionBadge'
import { CELDA_ENCABEZADO, CELDA_IDENTIDAD } from '@/components/shared/tabla'
import { cn } from '@/lib/utils'
import {
  abrevCondicion, agruparPorModelo, colorUbicacion, estadoVisible, etiquetaCondicion, familiaCondicion, fechaCorta,
  garantiaPlanilla, imeiCorto, modeloPlanilla, notaDeVenta, siglaUbicacion, textoBateria, textoGrupo,
} from '@/lib/planilla'
import { COLUMNAS_PLANILLA, columnasQueEntran, fechaHoraCorta, imeiUltimos4, planillaEfectiva, plantillaColumnas, siglaSucursal } from '@/lib/planillaPrefs'
import { msParaDeshacer } from '@/lib/verificacionStock'
import { identificadorDeItem, textoEstadoItem } from '@/lib/stockItems'
import { estiloCondicion } from '@/lib/stockDisplay'
import { fechaHora } from '@/utils/fecha'
import { CostoStock } from './CeldasStock'
import { MenuAcciones } from './MenuAcciones'
import PersonalizarPlanilla from './PersonalizarPlanilla'

// Estilo de la fila: el color propio de la tienda (Stock › Depósitos, #448) o, sin él,
// los tokens de condición con la variante del depósito.
const estiloFila = (item, colores) => {
  const propio = estiloCondicion(item, colores)
  if (propio) return propio
  const color = colorUbicacion(item)
  return color ? { '--pl-tono': color } : undefined
}

/** Chip de estado (#466): ícono + 3 letras o texto completo, siempre con color. */
function ChipEstadoPlanilla({ estado, modo = 'abrev' }) {
  if (!estado) return null
  const completo = modo === 'completo'
  return (
    <span data-testid="planilla-estado" data-estado={estado.clave} data-tono={estado.tono} className="pl-chip" title={estado.titulo}>
      <Icon name={estado.icono} className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>{completo ? estado.etiqueta : estado.abrev}</span>
      {completo ? null : <span className="sr-only">{`, ${estado.etiqueta}`}</span>}
    </span>
  )
}

/** Vendido (#466): número de la nota/pedido y ✓ si ya se entregó; si no, «sin entregar». */
function NotaDeVenta({ item }) {
  const nota = notaDeVenta(item)
  if (!nota) return null
  return (
    <span data-testid="planilla-nota-venta" data-entregado={nota.entregado ? 'true' : 'false'} className="pl-venta" title={nota.entregado ? `Entregado · pedido ${nota.numero}` : `Sin entregar · pedido ${nota.numero || 's/n'}`}>
      {nota.numero ? <b className="tabular-nums">{nota.numero}</b> : null}
      {nota.entregado
        ? <Icon name="check" className="h-3 w-3 shrink-0" aria-label="Entregado" />
        : <span className="pl-sin-entregar">sin entregar</span>}
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

/** Verificación (#466): avatar de quien verificó + fecha y hora cortas (detalle en el tooltip) y acción de verificar. */
function CeldaVerificado({ item, ahora, onVerificar, onDeshacer, busy }) {
  // Deshacer vive 1 minuto: un temporizador oculta el botón al vencer sin esperar otro render.
  const [, repintar] = useState(0)
  const restante = onDeshacer ? msParaDeshacer(item.lastVerifiedAt) : 0
  useEffect(() => {
    if (restante <= 0) return undefined
    const temporizador = window.setTimeout(() => repintar((n) => n + 1), restante + 50)
    return () => window.clearTimeout(temporizador)
  }, [restante])
  if (item.kind !== 'unit') return <span className="pl-sec">—</span>
  const verificada = Boolean(item.lastVerifiedAt)
  const persona = { id: item.verifiedById || undefined, name: item.verifiedByName || item.verifiedBy || 'Equipo' }
  const detalle = verificada ? `Verificó ${persona.name} el ${fechaHora(item.lastVerifiedAt, '—')}` : 'Sin verificar'
  return (
    <span className="flex min-w-0 items-center gap-1" data-testid="planilla-verificado" data-verificada={verificada ? 'true' : 'false'} title={detalle}>
      {verificada ? (
        <>
          <Avatar user={persona} hasAvatar={Boolean(item.verifiedById)} size="xs" className="shrink-0" />
          <span className="pl-sec truncate text-[11px] tabular-nums">{fechaHoraCorta(item.lastVerifiedAt, ahora)}</span>
        </>
      ) : <span className="pl-sec truncate text-[11px]">sin verificar</span>}
      {onDeshacer && restante > 0 ? (
        <button
          type="button"
          data-testid="planilla-deshacer"
          disabled={busy}
          title="Deshacer mi verificación (1 minuto)"
          aria-label={`Deshacer la verificación de ${identificadorDeItem(item)}`}
          className="pl-verificar pl-deshacer"
          onClick={(event) => { event.stopPropagation(); onDeshacer() }}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <Icon name="back" className="h-3 w-3" aria-hidden="true" />
        </button>
      ) : onVerificar ? (
        <button
          type="button"
          data-testid="planilla-verificar"
          disabled={busy}
          title={verificada ? 'Volver a verificar ahora' : 'Verificar ahora'}
          aria-label={`${verificada ? 'Volver a verificar' : 'Verificar'} ${identificadorDeItem(item)}`}
          className="pl-verificar"
          onClick={(event) => { event.stopPropagation(); onVerificar() }}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <Icon name="check" className="h-3 w-3" aria-hidden="true" />
        </button>
      ) : null}
    </span>
  )
}

function FilaPlanilla({ colores, columnas, prefs, item, rolVeCosto, seleccionado, onAlternar, onAbrir, acciones, busy, onGuardarNota }) {
  const ahora = useMemo(() => new Date(), [])
  const modelo = modeloPlanilla(item)
  const bateria = textoBateria(item, { corto: false })
  const estado = estadoVisible(item, ahora)
  const garantia = garantiaPlanilla(item.warrantyUntil, ahora)
  const imei = identificadorDeItem(item)
  const esUnidad = item.kind === 'unit'
  const puedeEditar = esUnidad && item.status !== 'vendido' && item.status !== 'eliminado'
  const verificar = acciones?.find((accion) => accion.label === 'Verificar')
  const deshacer = acciones?.find((accion) => accion.label === 'Deshacer verificación')
  const celdas = {
    condicion: () => (
      <span className="pl-celda" data-testid="planilla-condicion">
        {esUnidad
          ? <span className="pl-chip" data-tono={familiaCondicion(item) === 'new' ? 'ok' : 'warn'} title={etiquetaCondicion(item)}><span>{abrevCondicion(item)}</span></span>
          : <span className="pl-sec">—</span>}
      </span>
    ),
    ingreso: () => (
      <span className="pl-celda pl-sec" data-testid="planilla-ingreso" title={`Ingresó el ${fechaHora(item.createdAt, '—')}`}>{fechaCorta(item.createdAt, ahora) || '—'}</span>
    ),
    imei: () => (
      <span data-testid="unidad-imei" className={cn('pl-celda text-[11px]', esUnidad && 'font-mono tabular-nums')} title={esUnidad ? `IMEI/serial ${imei}` : `SKU ${imei}`}>
        {prefs.imei === 'ultimos4' && esUnidad && imei ? `…${imeiUltimos4(imei)}` : imei || '—'}
      </span>
    ),
    ubicacion: () => (
      <span className="pl-celda">
        {esUnidad
          ? <UbicacionBadge modo={prefs.ubicacion} sigla={siglaUbicacion(item)} nombre={item.locationName || ''} sucursal={item.branchName || ''} sucursalSigla={siglaSucursal(item.branchName)} icono={item.locationIcon} color={item.locationColor} />
          : <span className="pl-sec" title={item.branchName || undefined}>—</span>}
      </span>
    ),
    proveedor: () => (
      <span className="pl-celda">
        {esUnidad
          ? <ProveedorBadge modo={prefs.proveedor} sigla={item.supplierCode} icono={item.supplierIcon} color={item.supplierColor} nombre={rolVeCosto ? item.supplierName : null} />
          : <span className="pl-sec">—</span>}
      </span>
    ),
    costo: () => <span className="flex items-center justify-end pr-1 text-right">{esUnidad ? <CostoStock item={item} /> : <span className="pl-sec">—</span>}</span>,
    estado: () => (
      <span className="pl-celda flex items-center gap-1.5">
        {item.kind === 'product'
          ? <span className="pl-sec">{textoEstadoItem(item)}</span>
          : <><ChipEstadoPlanilla estado={estado} modo={prefs.estado} /><NotaDeVenta item={item} /></>}
      </span>
    ),
    verificado: () => <CeldaVerificado item={item} ahora={ahora} busy={busy} onVerificar={verificar ? () => verificar.run() : undefined} onDeshacer={deshacer ? () => deshacer.run() : undefined} />,
    garantia: () => (
      <span className="pl-celda pl-garantia pl-2" data-tono={garantia.tono} data-testid="planilla-garantia" title={garantia.detalle}>
        {garantia.texto || <span className="pl-sec">—</span>}
      </span>
    ),
    nota: () => <span className="pl-celda"><NotaEditable item={item} puedeEditar={puedeEditar} onGuardar={onGuardarNota} /></span>,
  }
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid="planilla-fila"
      data-condicion={familiaCondicion(item)}
      data-estado={item.status}
      data-tono={colorUbicacion(item) ? 'ubicacion' : undefined}
      data-propio={estiloCondicion(item, colores) ? 'true' : undefined}
      data-sel={seleccionado ? 'true' : undefined}
      aria-label={`Ver detalles de ${modelo} ${imei}`.trim()}
      style={estiloFila(item, colores)}
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
      <span data-testid="unidad-modelo" className="pl-celda flex items-baseline gap-1.5" title={[modelo, etiquetaCondicion(item), bateria].filter(Boolean).join(' · ')}>
        <b className={CELDA_IDENTIDAD}>{modelo}</b>
        {bateria ? <span className="pl-sec shrink-0 text-[11px] tabular-nums" data-testid="planilla-bateria">{bateria}</span> : null}
        <span className="sr-only">{`, ${etiquetaCondicion(item)}`}</span>
      </span>
      {columnas.map((id) => <Celda key={id} id={id} render={celdas[id]} />)}
      <span className="flex items-center justify-end" onClick={(event) => event.stopPropagation()}>
        <MenuAcciones unit={{ serial: imei || modelo }} busy={busy} acciones={acciones} />
      </span>
    </div>
  )
}

// Un hijo por columna, siempre en el orden de la plantilla.
function Celda({ render }) {
  return render ? render() : null
}

function FilaMovil({ item, onAbrir, colores }) {
  const ahora = useMemo(() => new Date(), [])
  const modelo = modeloPlanilla(item)
  const estado = estadoVisible(item, ahora)
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
      data-propio={estiloCondicion(item, colores) ? 'true' : undefined}
      aria-label={`Ver detalles de ${modelo} ${imei}`.trim()}
      style={estiloFila(item, colores)}
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
        {item.kind === 'product'
          ? <span className="pl-sec shrink-0 text-[11px]">{textoEstadoItem(item)}</span>
          : <span className="flex shrink-0 items-center gap-1.5"><ChipEstadoPlanilla estado={estado} /><NotaDeVenta item={item} /></span>}
      </span>
      <span className="pl-sec flex min-w-0 items-center gap-2 text-[11px]">
        <span data-testid="unidad-imei" className={cn('shrink-0 tabular-nums', esUnidad && 'font-mono')} title={esUnidad ? `IMEI/serial ${imei}` : `SKU ${imei}`}>{imeiCorto(imei)}</span>
        {esUnidad ? <UbicacionBadge sigla={siglaUbicacion(item)} nombre={item.locationName || ''} sucursal={item.branchName || ''} icono={item.locationIcon} color={item.locationColor} className="shrink-0 text-fore" /> : null}
        {bateria ? <span className="truncate">{bateria}</span> : null}
      </span>
    </div>
  )
}

function EncabezadoColumnas({ columnas, todosMarcados, onMarcarTodos }) {
  return (
    <div data-testid="planilla-encabezado" className="pl-grid pl-encabezado rounded-lg border border-transparent border-b-ink-600/60 px-2 py-1">
      <span className="flex items-center">
        <input type="checkbox" className="h-4 min-h-0 w-4 accent-fono" aria-label="Seleccionar visibles" title="Seleccionar visibles" checked={todosMarcados} onChange={onMarcarTodos} />
      </span>
      <span className={CELDA_ENCABEZADO}>Modelo</span>
      {columnas.map((id) => (
        <span key={id} data-col={id} className={cn(CELDA_ENCABEZADO, COLUMNAS_PLANILLA[id].derecha && 'text-right')} title={COLUMNAS_PLANILLA[id].ayuda}>{COLUMNAS_PLANILLA[id].titulo}</span>
      ))}
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

const FABRICA = planillaEfectiva({}, {})

/** Ancho de la planilla en px (se reacomoda al redimensionar); en pruebas sin layout queda en un ancho amplio. */
function useAnchoPlanilla(ref) {
  const [ancho, setAncho] = useState(1400)
  useEffect(() => {
    const nodo = ref.current
    if (!nodo || typeof ResizeObserver === 'undefined') return undefined
    const medir = () => setAncho(Math.round(nodo.getBoundingClientRect().width) || 1400)
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(nodo)
    return () => observador.disconnect()
  }, [ref])
  return ancho
}

/**
 * @param {{ items: object[], angosta: boolean, verCosto: boolean, rolVeCosto: boolean, seleccionados: string[],
 *   onAlternar: (id: string) => void, onMarcarTodos: () => void, onAbrir: (item: object) => void,
 *   accionesDe: (item: object) => object[], busy: boolean, onGuardarNota: (item: object, texto: string) => Promise<boolean>,
 *   personalizacion?: { planilla: object, propia: object, guardarPropia: (parche: object) => void, guardarEmpresa: (parche: object) => Promise<unknown> } }} props
 */
export default function PlanillaUnidades({ colores, items, angosta, verCosto, rolVeCosto, seleccionados, onAlternar, onMarcarTodos, onAbrir, accionesDe, busy, onGuardarNota, personalizacion }) {
  const grupos = useMemo(() => agruparPorModelo(items), [items])
  const [plegados, setPlegados] = useState(() => new Set())
  const [personalizando, setPersonalizando] = useState(false)
  const raiz = useRef(null)
  const ancho = useAnchoPlanilla(raiz)
  // La personalización llega de useStockDisplay (ListaStock); sin ella, valores de fábrica y sin el botón.
  const planilla = personalizacion?.planilla || FABRICA
  const { propia, guardarPropia, guardarEmpresa } = personalizacion || {}
  const columnas = useMemo(() => columnasQueEntran(planilla, { verCosto }, ancho), [planilla, verCosto, ancho])
  const alternarGrupo = (clave) => setPlegados((actual) => { const siguiente = new Set(actual); if (siguiente.has(clave)) siguiente.delete(clave); else siguiente.add(clave); return siguiente })
  const todosMarcados = items.length > 0 && items.every((item) => seleccionados.includes(item.id))
  return (
    <div ref={raiz} className="planilla space-y-1" data-testid="planilla-unidades" data-modo={angosta ? 'movil' : 'escritorio'} style={{ '--pl-cols': plantillaColumnas(planilla, columnas) }}>
      {!angosta && personalizacion ? (
        <div className="flex justify-end">
          <button
            type="button"
            data-testid="planilla-personalizar-abrir"
            aria-haspopup="dialog"
            onClick={() => setPersonalizando(true)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-ink-600 px-2.5 text-xs font-semibold text-mute transition hover:border-fono/40 hover:text-fore"
          >
            <Icon name="sliders" className="h-3.5 w-3.5" aria-hidden="true" />Personalizar
          </button>
        </div>
      ) : null}
      {!angosta ? <EncabezadoColumnas columnas={columnas} todosMarcados={todosMarcados} onMarcarTodos={onMarcarTodos} /> : null}
      {grupos.map((grupo) => {
        const abierto = !plegados.has(grupo.clave)
        const idLista = `planilla-grupo-${grupo.clave.replace(/[^a-z0-9]+/gi, '-')}`
        return (
          <section key={grupo.clave} className="space-y-0.5" aria-label={grupo.nombre}>
            <EncabezadoGrupo grupo={grupo} abierto={abierto} onAlternar={() => alternarGrupo(grupo.clave)} idLista={idLista} />
            {abierto ? (
              <div id={idLista} className="space-y-0.5">
                {grupo.items.map((item) => (angosta
                  ? <FilaMovil key={item.id} item={item} colores={colores} onAbrir={() => onAbrir(item)} />
                  : (
                    <FilaPlanilla
                      key={item.id}
                      colores={colores}
                      columnas={columnas}
                      prefs={planilla}
                      item={item}
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
      {personalizacion ? <PersonalizarPlanilla
        abierto={personalizando}
        onCerrar={() => setPersonalizando(false)}
        planilla={planilla}
        propia={propia}
        rolVeCosto={Boolean(rolVeCosto)}
        guardarPropia={guardarPropia}
        guardarEmpresa={guardarEmpresa}
      /> : null}
    </div>
  )
}
