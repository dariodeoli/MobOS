import { useEffect, useMemo, useRef, useState } from 'react'
import { Aviso, Button, Input, MoneyInput, Select } from '@/components/ui'
import { usePaginaLista } from '@/components/shared/usePaginaLista'
import { textoMostrando } from '@/components/shared/paginacion'
import Icon from '@/components/shared/Icon'
import Popup from '@/components/shared/Popup'
import ProductCombobox from '@/components/shared/ProductCombobox'
import CheckoutCustomer from '../CheckoutCustomer'
import SelectorVariante from './SelectorVariante'
import PrecioStockProducto from './PrecioStockProducto'
import { gs, num } from '@/utils/calculos'
import { useSesion } from '@/lib/sesion'
import { useModulos } from '@/lib/useModulos'
import EncabezadoBloque from './EncabezadoBloque'
import { GRILLA_DOS_COLUMNAS } from '@/components/shared/formulario'
import GaleriaFotosProducto from '@/components/productos/GaleriaFotosProducto'
import FotoProducto from '@/components/shared/FotoProducto'
import { CATEGORIAS_ACCESORIO, CLAVES_ACCESORIO, categoriaAccesorioDe, textoCompatibilidad } from '@/lib/categoriasAccesorio'
import { categoriaMeta } from '@/lib/categoriasProducto'
import { cn } from '@/lib/utils'

const FILAS_INICIALES = 4
// En la lista cada producto es una fila compacta: entran más por pantalla.
const FILAS_LISTA = 14
const CLAVE_VISTA = 'mobos:pos-catalogo-vista'

function leerVista() {
  try { return localStorage.getItem(CLAVE_VISTA) === 'lista' ? 'lista' : 'cuadricula' } catch { return 'cuadricula' }
}
function guardarVista(vista) {
  try { localStorage.setItem(CLAVE_VISTA, vista) } catch { /* sin almacenamiento: la preferencia dura la sesión */ }
}

// Columnas reales de la grilla (auto-fill/breakpoints): la primera página
// llena FILAS_INICIALES filas completas en cualquier ancho.
function useColumnasGrilla(ref, vista) {
  const [columnas, setColumnas] = useState(2)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof window === 'undefined') return undefined
    const medir = () => {
      const plantilla = window.getComputedStyle(el).gridTemplateColumns || ''
      const n = plantilla.split(' ').filter(Boolean).length
      if (n > 0) setColumnas(n)
    }
    medir()
    if (typeof ResizeObserver !== 'function') return undefined
    const obs = new ResizeObserver(medir)
    obs.observe(el)
    return () => obs.disconnect()
  }, [ref, vista])
  return columnas
}

// La venta en una sola pantalla: para quién es y qué se vende. Primero el
// catálogo (buscar/escanear y agregar con un clic) y después el cliente, que
// define la lista de precios; con la ficha elegida el bloque se colapsa a una
// línea (#309).
export default function PasoProductos({
  esDemo,
  productos,
  nuevoProd,
  setNuevoProd,
  nombreProd = '',
  setNombreProd,
  nuevoDetalles,
  setNuevoDetalles,
  colorInput,
  setColorInput,
  coloresNuevos = [],
  setColoresNuevos,
  agregarColor,
  puedeCrearProducto,
  crearProducto,
  creandoProd,
  cancelarNuevoProd,
  setBusquedaProducto,
  accesorio = 'todas',
  setAccesorio,
  onFotosNuevas = null,
  combos,
  agregarCombo,
  noticeCombo,
  familiasVisibles,
  resolverPreciosCatalogo,
  contextoPreciosCatalogo,
  catalogoServidor = null,
  agregarProducto,
  guardando,
  variantePara,
  onElegirVariante,
  onCerrarVariante,
  acciones = null,
  hayItems = false,
  onAgregarOtro = null,
  onCobrar = null,
}) {
  const { activo: moduloOn } = useModulos()
  const mayoristas = moduloOn('mayoristas')
  const grillaRef = useRef(null)
  const [vista, setVista] = useState(leerVista)
  const columnasGrilla = useColumnasGrilla(grillaRef, vista)
  const enLista = vista === 'lista'
  const columnas = enLista ? FILAS_LISTA / FILAS_INICIALES : columnasGrilla
  function elegirVista(nueva) { setVista(nueva); guardarVista(nueva) }
  // Con stock primero (lo vendible a mano); el resto conserva el orden del
  // catálogo. La búsqueda ya filtra el catálogo completo: solo se pagina lo
  // que se dibuja.
  const clave = familiasVisibles
    .map(fam => `${fam.base}${fam.items.some(item => num(item.stock) > 0) ? '+' : '-'}`)
    .join('|')
  const bases = useMemo(() => {
    const conStock = familiasVisibles.filter(fam => fam.items.some(item => num(item.stock) > 0))
    const sinStock = familiasVisibles.filter(fam => !fam.items.some(item => num(item.stock) > 0))
    return [...conStock, ...sinStock].map(fam => fam.base)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])
  const pagina = usePaginaLista(bases, { tamano: columnas * FILAS_INICIALES, modo: 'mas' })
  const porBase = new Map(familiasVisibles.map(fam => [fam.base, fam]))
  // #354: con el catálogo paginado en el servidor la página ya viene cortada.
  const familiasPagina = catalogoServidor ? familiasVisibles : pagina.filas.map(base => porBase.get(base)).filter(Boolean)
  const { sucursal, sucursales } = useSesion()
  const idsPrecios = [...new Set([...familiasPagina.flatMap(fam => fam.items.map(item => item.id)), ...(variantePara?.items || []).map(item => item.id)])].sort().join(',')
  const clavePrecios = `${contextoPreciosCatalogo}:${idsPrecios}`
  const [cotizacion, setCotizacion] = useState({ key: '', prices: {}, status: 'loading' })
  useEffect(() => {
    let vigente = true
    setCotizacion({ key: clavePrecios, prices: {}, status: 'loading' })
    if (!idsPrecios || !resolverPreciosCatalogo) {
      setCotizacion({ key: clavePrecios, prices: {}, status: 'empty' })
      return () => { vigente = false }
    }
    resolverPreciosCatalogo(idsPrecios.split(','))
      .then(prices => { if (vigente) setCotizacion({ key: clavePrecios, prices, status: 'ready' }) })
      .catch(() => { if (vigente) setCotizacion({ key: clavePrecios, prices: {}, status: 'error' }) })
    return () => { vigente = false }
  }, [clavePrecios, idsPrecios, resolverPreciosCatalogo])
  // Context keys also hide old quotes during the render before effect cleanup.
  const precios = cotizacion.key === clavePrecios ? cotizacion.prices : {}
  const preciosCargando = cotizacion.key !== clavePrecios || cotizacion.status === 'loading'
  return (
    <>
      {/* #281 · identidad de color: Productos = acento de marca (fono). */}
      <section data-testid="pos-bloque-productos" className="rounded-2xl border border-fono/35 bg-fono/[.04] p-3">
        <EncabezadoBloque
          compacto
          titulo="Productos"
          tono="text-fono-light"
          extra={
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-x-3 gap-y-2">
              <span className="shrink-0 text-xs font-medium text-fono-light">{catalogoServidor ? catalogoServidor.total : productos.length} disponibles</span>
              {puedeCrearProducto && (
                <button
                  type="button"
                  data-testid="pos-nuevo-producto"
                  onClick={() => setNuevoProd(true)}
                  className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-fono/30 px-2.5 py-1.5 text-xs font-semibold text-fono-light transition hover:bg-fono/10 md:min-h-9"
                >
                  <Icon name="plus" className="h-3.5 w-3.5" /> Nuevo producto
                </button>
              )}
              {acciones}
            </div>
          }
        />
        <Popup
          open={Boolean(nuevoProd)}
          onClose={cancelarNuevoProd}
          busy={creandoProd}
          tipo="formulario"
          tamano="md"
          title="Nuevo producto"
          description="Se guarda en el catálogo y entra a esta venta."
          testId="pos-nuevo-producto-popup"
          acciones={{
            primaria: {
              label: creandoProd ? 'Creando…' : `Crear${coloresNuevos.length > 0 ? ` (${coloresNuevos.length} colores)` : ''}`,
              onClick: crearProducto,
              disabled: creandoProd || !nombreProd.trim(),
            },
            secundaria: { label: 'Cancelar', cierra: true, disabled: creandoProd },
          }}
        >
          <div className="space-y-3">
            <Input
              autoFocus
              value={nombreProd}
              onChange={e => setNombreProd(e.target.value)}
              placeholder="Nombre base (ej: Protector 17 Air)"
              autoCapitalize="words"
            />
            <div className={GRILLA_DOS_COLUMNAS}>
              <label className="block text-xs text-mute">
                Categoría
                <Select
                  className="mt-1"
                  value={nuevoDetalles.categoria}
                  onChange={e => setNuevoDetalles(d => ({ ...d, categoria: e.target.value }))}
                >
                  {['Accesorios', 'Celulares', 'iPad', 'Apple Watch', 'Mac', 'Otros'].map(c => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </label>
              <div className="text-xs text-mute">
                Condición
                <div className="mt-1 flex gap-1 rounded-xl border border-ink-600 bg-ink-800 p-1">
                  {[
                    ['NEW', 'Nuevo'],
                    ['USED', 'Seminuevo'],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setNuevoDetalles(d => ({ ...d, condicion: value }))}
                      className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition ${
                        nuevoDetalles.condicion === value
                          ? 'bg-fono/15 text-fono-light'
                          : 'text-mute hover:text-fore'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block text-xs text-mute">
                Tipo de accesorio
                <Select
                  className="mt-1"
                  value={nuevoDetalles.accesorio || ''}
                  onChange={e => setNuevoDetalles(d => ({ ...d, accesorio: e.target.value }))}
                >
                  <option value="">No es accesorio</option>
                  {CLAVES_ACCESORIO.map(clave => (
                    <option key={clave} value={clave}>{CATEGORIAS_ACCESORIO[clave].singular}</option>
                  ))}
                </Select>
              </label>
              <label className="block text-xs text-mute">
                Precio de venta (Gs) *
                <MoneyInput
                  className="mt-1"
                  value={nuevoDetalles.precio}
                  onValueChange={v =>
                    setNuevoDetalles(d => ({ ...d, precio: v === '' ? '' : String(v) }))
                  }
                  placeholder="0"
                />
              </label>
              {mayoristas && (
                <label className="block text-xs text-mute">
                  Precio mayorista (Gs)
                  <MoneyInput
                    className="mt-1"
                    value={nuevoDetalles.mayorista}
                    onValueChange={v =>
                      setNuevoDetalles(d => ({ ...d, mayorista: v === '' ? '' : String(v) }))
                    }
                    placeholder="Opcional"
                  />
                </label>
              )}
              <label className="block text-xs text-mute">
                Costo (Gs)
                <MoneyInput
                  className="mt-1"
                  value={nuevoDetalles.costo}
                  onValueChange={v =>
                    setNuevoDetalles(d => ({ ...d, costo: v === '' ? '' : String(v) }))
                  }
                  placeholder="Opcional"
                />
              </label>
            </div>
            {!esDemo && onFotosNuevas && <GaleriaFotosProducto onChange={onFotosNuevas} />}
            <div>
              <div className="mb-1 text-[11px] font-bold uppercase text-mute">
                Colores (opcional)
              </div>
              <div className="flex gap-2">
                <Input
                  value={colorInput}
                  onChange={e => setColorInput(e.target.value)}
                  placeholder="Ej: Azul"
                  autoCapitalize="words"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      agregarColor()
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={agregarColor}>
                  + Color
                </Button>
              </div>
              {coloresNuevos.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {coloresNuevos.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColoresNuevos(s => s.filter(x => x !== c))}
                      className="rounded-full bg-fono/10 px-2.5 py-1 text-xs font-bold text-fono transition hover:bg-bad/15 hover:text-bad"
                      title="Quitar"
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-1 text-[11px] text-mute">
                Sin colores: un solo producto. Con colores: una variante por color; el color se
                cambia en la fila de la venta.
              </p>
            </div>
          </div>
        </Popup>
          <>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <div id="pos-busqueda-producto" className="relative min-w-0 flex-1 basis-56">
                <ProductCombobox
                  products={productos}
                  placeholder="Buscar producto…"
                  onQueryChange={next => setBusquedaProducto(next)}
                  onSelect={producto => {
                    setBusquedaProducto('')
                    agregarProducto(producto)
                  }}
                  onCreate={text => {
                    if (puedeCrearProducto) {
                      setNombreProd(text)
                      setNuevoProd(true)
                    }
                    return Promise.resolve(null)
                  }}
                  className="pl-9"
                />
                <Icon
                  name="search"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute"
                />
              </div>
              {hayItems && onAgregarOtro && (
                <button
                  type="button"
                  onClick={onAgregarOtro}
                  className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-fono/30 px-3 py-2 text-xs font-semibold text-fono-light transition hover:bg-fono/10 md:min-h-9"
                  title="Volver a buscar y agregar otro producto"
                >
                  <Icon name="plus" className="h-3.5 w-3.5" /> Agregar otro
                </button>
              )}
              {hayItems && onCobrar && (
                <button
                  type="button"
                  onClick={onCobrar}
                  className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg bg-fono px-3 py-2 text-xs font-bold text-onbrand transition hover:brightness-110 md:min-h-9"
                  title="Ir al cobro"
                >
                  Cobrar <kbd className="rounded bg-black/15 px-1.5 py-0.5 font-mono text-[10px]">F2</kbd>
                </button>
              )}
            </div>
            <div className="mb-2 flex items-center gap-2">
              {setAccesorio ? (
                <div className="-mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1" role="group" aria-label="Filtrar por tipo de accesorio" data-testid="pos-chips-accesorio">
                  {[['todas', { label: 'Todos', icon: 'grid' }], ...CLAVES_ACCESORIO.map(clave => [clave, CATEGORIAS_ACCESORIO[clave]])].map(([clave, meta]) => (
                    <button
                      key={clave}
                      type="button"
                      aria-pressed={accesorio === clave}
                      onClick={() => setAccesorio(clave)}
                      className={cn('inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition md:min-h-8', accesorio === clave ? 'border-fono/50 bg-fono/15 text-fono-light' : 'border-ink-500 text-mute hover:border-fono hover:text-fore')}
                    >
                      <Icon name={meta.icon} className="h-3.5 w-3.5" />{meta.label}
                    </button>
                  ))}
                </div>
              ) : <span className="flex-1" />}
              <div role="group" aria-label="Vista del catálogo" data-testid="pos-vista-catalogo" className="flex shrink-0 gap-0.5 rounded-lg border border-ink-600 p-0.5">
                {[['cuadricula', 'grid', 'Cuadrícula'], ['lista', 'list', 'Lista']].map(([clave, icono, etiqueta]) => (
                  <button
                    key={clave}
                    type="button"
                    data-testid={`pos-vista-${clave}`}
                    aria-pressed={vista === clave}
                    aria-label={etiqueta}
                    title={etiqueta}
                    onClick={() => elegirVista(clave)}
                    className={cn('inline-flex h-11 w-11 items-center justify-center rounded-md transition md:h-8 md:w-8', vista === clave ? 'bg-fono/15 text-fono-light' : 'text-mute hover:text-fore')}
                  >
                    <Icon name={icono} className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>
            <div
              ref={grillaRef}
              data-vista={vista}
              className={enLista ? 'pos-product-list flex flex-col gap-1.5' : 'pos-product-grid grid grid-cols-2 gap-2 sm:grid-cols-3'}
              aria-label="Resultados de productos"
            >
              {!esDemo && combos.length > 0 && (
                <div className="sm:col-span-2 mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-fono/25 bg-fono/[.05] p-2.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-mute">
                    Combos
                  </span>
                  {combos.map(combo => (
                    <button
                      key={combo.id}
                      type="button"
                      onClick={() => agregarCombo(combo)}
                      className="rounded-lg border border-fono/40 bg-ink-800 px-2.5 py-1.5 text-xs font-semibold text-fono-light transition hover:bg-fono/10"
                      title={(combo.items || [])
                        .map(item => productos.find(p => p.id === item.productId)?.nombre || '')
                        .filter(Boolean)
                        .join(' + ')}
                    >
                      {combo.name} · {gs(combo.pricePyg)}
                    </button>
                  ))}
                </div>
              )}
              {noticeCombo && (
                <Aviso tono="ok" compact className="col-span-2 mb-2">
                  {noticeCombo}
                </Aviso>
              )}
              {familiasPagina.map(fam => {
                const p = fam.items[0]
                // Stock y datos de la ficha para elegir sin adivinar.
                // #287: las unidades físicas del producto (IMEI/serial) se ven
                // como parte de la vista del producto; elegirlas es el paso
                // siguiente al agregarlo.
                const unidadesFamilia = fam.items.reduce((suma, item) => suma + num(item.unitsCount), 0)
                // #404: con foto, el stock se abrevia a la cifra para que la columna angosta no haga crecer la tarjeta.
                const fotoFamilia = p.thumbUrl || p.imagen || p.imageUrl || p.imagenes?.[0] || ''
                if (enLista) {
                  return (
                    <button
                      type="button"
                      key={fam.base}
                      disabled={guardando}
                      onClick={() => (fam.items.length > 1 ? onElegirVariante?.(fam) : agregarProducto(p))}
                      className="pos-product-card pos-product-fila flex min-h-11 min-w-0 items-center gap-2.5 rounded-xl border border-ink-600 px-2.5 py-1.5 text-left transition hover:border-fono focus-visible:outline focus-visible:outline-fono"
                    >
                      <FotoProducto
                        src={fotoFamilia}
                        size={36}
                        icono={CATEGORIAS_ACCESORIO[categoriaAccesorioDe(p)]?.icon || categoriaMeta(p).icon}
                      />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <strong className="line-clamp-1 break-words text-[13px] font-semibold leading-snug">{fam.base}{textoCompatibilidad(p) && <span className="ml-1 text-[11px] font-normal text-mute" data-testid="pos-compat">{textoCompatibilidad(p)}</span>}</strong>
                        <PrecioStockProducto fila productos={fam.items} precios={precios} cargando={preciosCargando} sucursal={sucursal} sucursales={sucursales} />
                        {unidadesFamilia > 0 && (
                          <span className="truncate text-[11px] text-mute">
                            {unidadesFamilia} {unidadesFamilia === 1 ? 'unidad' : 'unidades'} con IMEI
                          </span>
                        )}
                      </span>
                      <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-fono/15 text-fono-light">
                        <Icon name="plus" className="h-4 w-4" />
                      </span>
                    </button>
                  )
                }
                return (
                  <button
                    type="button"
                    key={fam.base}
                    disabled={guardando}
                    onClick={() => (fam.items.length > 1 ? onElegirVariante?.(fam) : agregarProducto(p))}
                    className="pos-product-card flex min-h-11 min-w-0 flex-col items-stretch gap-1 rounded-xl border border-ink-600 p-2.5 text-left transition hover:border-fono focus-visible:outline focus-visible:outline-fono"
                  >
                    <span className="grid min-w-0 grid-cols-[40px_minmax(0,1fr)] items-center gap-x-2 gap-y-1">
                      <FotoProducto
                        src={fotoFamilia}
                        size={40}
                        icono={CATEGORIAS_ACCESORIO[categoriaAccesorioDe(p)]?.icon || categoriaMeta(p).icon}
                      />
                        <strong className="pos-product-name col-span-2 min-w-0 break-words md:col-span-1 text-[13px] font-semibold leading-snug">{fam.base}{textoCompatibilidad(p) && <span className="ml-1 text-[11px] font-normal text-mute" data-testid="pos-compat">{textoCompatibilidad(p)}</span>}</strong>
                        <PrecioStockProducto productos={fam.items} precios={precios} cargando={preciosCargando} sucursal={sucursal} sucursales={sucursales} />
                        {unidadesFamilia > 0 && (
                          <span className="col-span-2 block truncate text-[11px] text-mute">
                            {unidadesFamilia} {unidadesFamilia === 1 ? 'unidad' : 'unidades'} con IMEI
                          </span>
                        )}
                    </span>
                  </button>
                )
              })}
              {!familiasVisibles.length && (
                <p className="p-3 text-sm text-mute">
                  No encontramos productos. Probá otro nombre.
                </p>
              )}
            </div>
            {catalogoServidor && (
              <div
                className="mt-2 flex flex-wrap items-center justify-between gap-2"
                data-testid="pos-catalogo-pie"
              >
                <p className="text-xs text-mute" role="status" data-testid="pos-catalogo-contador">
                  {catalogoServidor.total
                    ? `Página ${catalogoServidor.pagina} de ${catalogoServidor.paginas} · ${catalogoServidor.total} productos`
                    : 'Sin resultados'}
                </p>
                {catalogoServidor.paginas > 1 && (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11 min-w-11 px-4 text-xs"
                      data-testid="pos-catalogo-anterior"
                      disabled={catalogoServidor.pagina <= 1}
                      onClick={catalogoServidor.anterior}
                    >
                      Anterior
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11 min-w-11 px-4 text-xs"
                      data-testid="pos-catalogo-siguiente"
                      disabled={catalogoServidor.pagina >= catalogoServidor.paginas}
                      onClick={catalogoServidor.siguiente}
                    >
                      Siguiente
                    </Button>
                  </div>
                )}
              </div>
            )}
            {!catalogoServidor && pagina.total > 0 && (
              <div
                className="mt-2 flex flex-wrap items-center justify-between gap-2"
                data-testid="pos-catalogo-pie"
              >
                <p className="text-xs text-mute" role="status" data-testid="pos-catalogo-contador">
                  {textoMostrando(pagina.mostrados, pagina.total)}
                </p>
                {pagina.hayMas && (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 px-4 text-xs"
                    data-testid="pos-catalogo-ver-mas"
                    onClick={pagina.cargarMas}
                  >
                    Ver más productos
                  </Button>
                )}
              </div>
            )}
          </>
      </section>

      {/* #308: con más de una variante no se elige sola: selector obligatorio. */}
      <SelectorVariante
        precios={precios}
        preciosCargando={preciosCargando}
        sucursal={sucursal}
        sucursales={sucursales}
        abierto={Boolean(variantePara)}
        familia={variantePara}
        onElegir={producto => onElegirVariante?.(producto, { elegir: true })}
        onClose={() => onCerrarVariante?.()}
      />
    </>
  )
}

export function PosCustomer({
  sesion,
  esDemo,
  customer,
  setCustomer,
  billingTo,
  setBillingTo,
  setF,
  nombreLista = '',
  onStats,
  onSelected,
}) {
  const { perfilEmpresa } = useSesion()
  const nombreVendedor =
    sesion?.rol === 'dueno' && perfilEmpresa?.name ? perfilEmpresa.name : sesion?.nombre

  return (
    <section
      data-testid="pos-bloque-cliente"
      className="rounded-2xl border border-info/35 bg-info/[.04] p-3"
    >
      <EncabezadoBloque
        compacto
        titulo="Cliente"
        tono="text-info"

        extra={
          <div className="shrink-0 text-right text-xs text-mute">
            <span className="block">
              Vendedor:{' '}
              <strong className="text-fore">{nombreVendedor || 'Ingresá con tu PIN'}</strong>
            </span>
          </div>
        }
      />
      <CheckoutCustomer
        colapsarFicha
        esDemo={esDemo}
        value={customer}
        onChange={c => {
          setCustomer(c)
          setF(current => ({ ...current, cliente: c?.name ?? '' }))
        }}
        billingTo={billingTo}
        onBillingChange={setBillingTo}
        nombreLista={nombreLista}
        onStats={onStats}
        onSelected={onSelected}
      />
    </section>
  )
}
