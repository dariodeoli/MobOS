import { useEffect, useMemo, useRef, useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { useModulos } from '@/lib/useModulos'
import { resources } from '@/lib/api'
import { getProductos } from '@/lib/storage'
import { num } from '@/utils/calculos'
import { obligatorio } from 'owncoding-ui/utils'
import { Aviso, Badge, Button, Card, EmptyState, FormField, IconAction, Input, MoneyInput, Select, useResultado, useToast, useValidacionCampos } from '@/components/ui'
import { FormActions } from '@/components/shared/popupKit'
import Popup from '@/components/shared/Popup'
import PopupConfirmar from '@/components/shared/PopupConfirmar'
import '@/components/ventas/ventasF3.css'
import '@/components/shared/gestionProfundo.css'
import ProductCombobox from '@/components/shared/ProductCombobox'
import Switch from '@/components/shared/Switch'
import PercentField, { formatPercent, parsePercent } from '@/components/shared/PercentField'
import BarraModulo from '@/components/shared/BarraModulo'
import SegmentosToolbar from '@/components/app/SegmentosToolbar'
import FieldRow from '@/components/shared/FieldRow'
import { ANCHO_CAMPO } from '@/components/shared/anchoCampos'
import '@/components/stock/stockToque.css'
import { GRILLA_DOS_COLUMNAS } from '@/components/shared/formulario'
import Icon from '@/components/shared/Icon'

// Gestión de precios: listas por cliente (con ítems por producto o categoría y
// descuento/recargo) y precios por cantidad. El POS resuelve con la prioridad
// escalón por cantidad > lista del cliente > mayorista > minorista > USD.
const itemVacio = () => ({ scope: 'PRODUCT', productId: '', category: '', valuePct: '' })
const tierVacio = () => ({ minQuantity: '', unitPricePyg: '' })
const AYUDA_PRECIOS_BASE = 'Listas por cliente y precios por cantidad. El POS resuelve el mejor precio; la lista asignada gana sobre el precio '
const ayudaPrecios = mayoristas => `${AYUDA_PRECIOS_BASE}${mayoristas ? 'mayorista y minorista.' : 'de venta.'}`

export default function Precios() {
  const { sesion, esDemo } = useSesion()
  // Mayoristas apagado: los textos no hablan de precio mayorista (las listas se conservan).
  const mayoristas = useModulos().activo('mayoristas')
  const AYUDA_PRECIOS = ayudaPrecios(mayoristas)
  const toast = useToast()
  const avisar = useResultado()
  const [listas, setListas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [editor, setEditor] = useState(null) // { id?, name, isActive, items }
  // #323: la base del formulario separa «cambios sin guardar» de la foto inicial
  // (el cierre con cambios pide confirmación) y el error de guardado vive
  // dentro del modal, no detrás del overlay.
  const editorBase = useRef('')
  const [errorLista, setErrorLista] = useState('')
  const [productoTier, setProductoTier] = useState('')
  const [filasTier, setFilasTier] = useState([])
  const [busy, setBusy] = useState(false)
  const [aBorrar, setABorrar] = useState(null)
  // El catálogo vive en el cache que se hidrata con la sesión; si la pantalla
  // se abre antes (enlace directo), se pide a la API para no quedar vacía.
  const [productos, setProductos] = useState(() => getProductos().filter(p => p.activo !== false))
  useEffect(() => {
    if (productos.length || esDemo) return undefined
    let vivo = true
    resources.products.list().then((filas) => {
      if (!vivo || !Array.isArray(filas)) return
      setProductos(filas.filter(p => p.isActive !== false).map(p => ({ ...p, nombre: p.name, categoria: p.category })))
    }).catch(() => {})
    return () => { vivo = false }
  }, [productos.length, esDemo])
  const categorias = useMemo(() => [...new Set(productos.map(p => p.categoria || p.category).filter(Boolean))].sort(), [productos])
  const gestiona = Boolean(sesion?.esPropietario) || ['ADMIN', 'GERENTE'].includes(sesion?.rol)

  async function cargar() {
    setCargando(true); setError('')
    try {
      const [listasData, productosData] = await Promise.all([
        resources.priceLists.list(),
        resources.products.list().catch(() => null),
      ])
      setListas(Array.isArray(listasData) ? listasData : [])
      fusionarProductos(productosData)
    } catch (cause) { setError(cause?.message || 'No se pudieron cargar los precios.') } finally { setCargando(false) }
  }
  useEffect(() => { cargar() }, [esDemo]) // eslint-disable-line react-hooks/exhaustive-deps

  // El catálogo global se hidrata después del montaje: al cambiar la sesión se
  // vuelve a leer el cache para no quedarnos con la foto vacía del arranque.
  useEffect(() => {
    const delCache = getProductos().filter(p => p.activo !== false)
    if (delCache.length) setProductos((actuales) => {
      const porId = new Map(delCache.map(p => [p.id, p]))
      for (const actual of actuales) if (!porId.has(actual.id)) porId.set(actual.id, actual)
      return [...porId.values()]
    })
  }, [sesion])

  // Fusión por id: nunca se pierde un producto ya visible (el catálogo de la
  // API viene paginado y el recién creado puede quedar afuera de la página).
  function fusionarProductos(filas) {
    if (!Array.isArray(filas)) return
    setProductos((actuales) => {
      const porId = new Map(actuales.map(p => [p.id, p]))
      for (const fila of filas) {
        if (fila?.isActive === false) continue
        porId.set(fila.id, { ...porId.get(fila.id), ...fila, nombre: fila.name, categoria: fila.category })
      }
      return [...porId.values()]
    })
  }

  // Al tipear en un buscador de producto se consulta al servidor y se fusiona:
  // así aparecen también los productos creados después de abrir la pantalla.
  async function buscarProductos(texto) {
    if (esDemo || String(texto || '').trim().length < 2) return
    try {
      fusionarProductos(await resources.products.list(texto.trim()))
    } catch { /* la búsqueda del servidor es un extra */ }
  }

  // #323: reglas por campo del formulario. Los ítems llevan su error junto al
  // control (producto/categoría y porcentaje) con las reglas compartidas.
  const reglasLista = useMemo(() => {
    const reglas = { nombre: [obligatorio('Escribí el nombre de la lista.')] }
    ;(editor?.items || []).forEach((item, index) => {
      if (item.scope === 'PRODUCT') reglas[`item-${index}-producto`] = [obligatorio('Elegí el producto de cada ítem o quitalo.')]
      else reglas[`item-${index}-categoria`] = [obligatorio('Elegí la categoría de cada ítem o quitalo.')]
      reglas[`item-${index}-porcentaje`] = [(valor) => {
        const numero = parsePercent(valor)
        return numero === null || numero <= 0 || numero > 100
          ? 'El porcentaje de cada ítem debe estar entre 0 y 100.'
          : ''
      }]
    })
    return reglas
  }, [editor])
  const { errorDe, validar, limpiar } = useValidacionCampos(reglasLista)
  const editorDirty = Boolean(editor) && JSON.stringify(editor) !== editorBase.current

  function abrirLista(lista = null) {
    setError('')
    setErrorLista('')
    limpiar()
    const siguiente = lista
      ? { id: lista.id, name: lista.name, isActive: lista.isActive !== false, items: (lista.items || []).map(item => ({ scope: item.scope === 'CATEGORY' ? 'CATEGORY' : 'PRODUCT', productId: item.productId || '', category: item.category || '', valuePct: formatPercent(Number(item.discountPct) || 0) })) }
      : { id: null, name: '', isActive: true, items: [] }
    editorBase.current = JSON.stringify(siguiente)
    setEditor(siguiente)
  }
  const nombreProducto = (id) => productos.find(p => p.id === id)?.nombre || productos.find(p => p.id === id)?.name || ''
  // Nombres reales de los primeros ítems (nunca «Producto, Producto»): si el
  // catálogo todavía no los conoce se omiten y queda solo la cantidad.
  const resumenItems = (items = []) => {
    const nombres = items.map(item => item.productId ? nombreProducto(item.productId) : item.category).filter(Boolean)
    return nombres.length ? `${nombres.slice(0, 3).join(', ')}${nombres.length > 3 || items.length > nombres.length ? '…' : ''}` : ''
  }

  async function guardarLista(event) {
    event.preventDefault()
    if (!editor || busy) return
    const valores = { nombre: editor.name.trim() }
    editor.items.forEach((item, index) => {
      if (item.scope === 'PRODUCT') valores[`item-${index}-producto`] = item.productId
      else valores[`item-${index}-categoria`] = item.category
      valores[`item-${index}-porcentaje`] = item.valuePct
    })
    if (!validar(valores).valido) return
    const items = editor.items.map(item => ({
      scope: item.scope,
      productId: item.scope === 'PRODUCT' ? item.productId : null,
      category: item.scope === 'CATEGORY' ? item.category : null,
      discountPct: parsePercent(item.valuePct),
    }))
    setBusy(true); setError(''); setErrorLista('')
    try {
      const payload = { name: editor.name.trim(), isActive: editor.isActive, items }
      if (editor.id) await resources.priceLists.update(editor.id, { ...payload, replaceItems: true })
      else await resources.priceLists.create(payload)
      setEditor(null)
      avisar.guardado('Lista')
      await cargar()
    } catch (cause) {
      setErrorLista(cause?.message || 'No se pudo guardar la lista.')
    } finally { setBusy(false) }
  }

  // Cambio de un ítem: limpia el error del campo tocado y actualiza la fila.
  function cambiarItem(index, cambios, camposError = []) {
    for (const campo of camposError) limpiar(campo)
    setEditor(current => ({ ...current, items: current.items.map((row, i) => i === index ? { ...row, ...cambios } : row) }))
  }

  async function alternarLista(lista) {
    try { await resources.priceLists.update(lista.id, { isActive: !lista.isActive }); toast.success(lista.isActive ? 'Lista desactivada.' : 'Lista activada.'); await cargar() } catch (cause) { setError(cause?.message || 'No se pudo cambiar el estado.') }
  }
  async function borrarLista() {
    if (!aBorrar || busy) return
    setBusy(true)
    try { await resources.priceLists.deactivate(aBorrar.id); setABorrar(null); toast.success('Lista eliminada.'); await cargar() } catch (cause) { setError(cause?.message || 'No se pudo eliminar la lista.') } finally { setBusy(false) }
  }

  // Precios por cantidad: al elegir producto se cargan sus escalones desde
  // los ítems de lista que lo apuntan (el escalón vive en el ítem).
  useEffect(() => {
    if (!productoTier) { setFilasTier([]); return }
    const vistos = new Map()
    for (const lista of listas) {
      for (const item of (lista.items || [])) {
        if (item.scope !== 'PRODUCT' || item.productId !== productoTier) continue
        for (const tier of (item.tiers || [])) {
          if (!vistos.has(tier.minQty)) vistos.set(tier.minQty, { minQuantity: String(tier.minQty), unitPricePyg: String(tier.unitPricePyg) })
        }
      }
    }
    setFilasTier([...vistos.values()].sort((a, b) => Number(a.minQuantity) - Number(b.minQuantity)))
  }, [productoTier, listas])

  async function guardarTiers(event) {
    event.preventDefault()
    if (!productoTier || busy) return
    const escalones = []
    for (const fila of filasTier) {
      const minQuantity = Number(fila.minQuantity); const unitPricePyg = num(fila.unitPricePyg)
      if (!Number.isSafeInteger(minQuantity) || minQuantity < 2) { setError('Cada escalón empieza en 2 unidades o más.'); return }
      if (!Number.isSafeInteger(unitPricePyg) || unitPricePyg < 0) { setError('El precio del escalón es inválido.'); return }
      escalones.push({ minQuantity, unitPricePyg })
    }
    setBusy(true); setError('')
    try {
      for (const lista of listas) {
        const itemAfectado = (lista.items || []).find(item => item.scope === 'PRODUCT' && item.productId === productoTier)
        if (!itemAfectado) continue
        const items = (lista.items || []).map(item => {
          if (item.id !== itemAfectado.id) return undefined
          return {
            id: item.id,
            scope: item.scope || 'PRODUCT',
            productId: item.productId,
            category: item.category,
            discountPct: Number(item.discountPct) > 0 ? Number(item.discountPct) : undefined,
            tiers: escalones.map(escalon => ({ minQty: escalon.minQuantity, unitPricePyg: escalon.unitPricePyg })),
          }
        }).filter(Boolean)
        await resources.priceLists.update(lista.id, { items, replaceItems: true })
      }
      toast.success('Precios por cantidad guardados.')
      await cargar()
    } catch (cause) { setError(cause?.message || 'No se pudieron guardar los escalones.') } finally { setBusy(false) }
  }

  if (!gestiona) return (
    <Card>
      <EmptyState
        icon="lock"
        title="Solo administración o gerencia configuran precios"
        description="Pedile a una persona con rol de administración que revise las listas y los precios por cantidad."
      />
    </Card>
  )

  return <div className="gp ventas-f3 space-y-4" data-testid="precios-pagina">
    {/* Una barra por pestaña (docs/PANTALLAS.md regla 7): la acción de la pestaña; la
        descripción vive en el tooltip de ayuda, no como texto fijo. */}
    <BarraModulo titulo="Precios" testId="barra-precios" segmentos={<SegmentosToolbar />}>
      <span role="img" aria-label={AYUDA_PRECIOS} title={AYUDA_PRECIOS} className="hidden h-8 w-8 place-items-center text-mute sm:inline-grid"><Icon name="info" className="h-4 w-4" /></span>
      <Button type="button" className="min-h-11 lg:min-h-0" onClick={() => abrirLista()} disabled={busy}>+ Nueva lista</Button>
    </BarraModulo>

    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
    <Card className="space-y-3">
      <div>
        <h2 className="font-semibold">Listas de precios</h2>
        <p className="mt-1 text-xs text-mute">Descuento o recargo por producto o categoría, sobre el precio del cliente; se asigna en su ficha.</p>
      </div>
      {error && <Aviso tono="error">{error}</Aviso>}
      {cargando ? <p className="text-sm text-mute">Cargando listas…</p> : !listas.length ? <EmptyState compact icon="store" title="Todavía no hay listas de precios." description="Creá una lista para dar descuento o recargo a clientes puntuales." /> : <div className="gp-lista">
        {listas.map((lista, indice) => <div key={lista.id} data-testid="lista-precio-fila" style={{ '--i': Math.min(indice, 12) }} className="gp-fila justify-between">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold"><span className="truncate">{lista.name}</span><Badge color={lista.isActive ? 'green' : 'slate'}>{lista.isActive ? 'Activa' : 'Inactiva'}</Badge></p>
            <p className="mt-1 text-xs text-mute">{(lista.items || []).length} ítem{(lista.items || []).length === 1 ? '' : 's'}{resumenItems(lista.items) ? ` · ${resumenItems(lista.items)}` : ''}</p>
          </div>
          <span className="acciones-toque flex shrink-0 items-center gap-1">
            {/* Debajo de lg los toques miden 44 px (acciones-toque), en escritorio 28. */}
            <IconAction icon="edit" label="Editar lista" onClick={() => abrirLista(lista)} />
            <IconAction icon="refresh" label={lista.isActive ? 'Desactivar lista' : 'Activar lista'} onClick={() => alternarLista(lista)} />
            <IconAction icon="trash" tone="bad" label="Eliminar lista" onClick={() => setABorrar(lista)} />
          </span>
        </div>)}
      </div>}
    </Card>

    <Card className="space-y-3">
      <div>
        <h2 className="font-semibold">Precios por cantidad</h2>
        <p className="mt-1 text-xs text-mute">Desde la cantidad mínima, el precio unitario de la línea es el del escalón. Cargá el escalón más alto y el resto se resuelve solo.</p>
      </div>
      <div className={`w-full ${ANCHO_CAMPO.busqueda}`}><p className="mb-1 text-xs text-mute">Producto</p><ProductCombobox products={productos} selectedId={productoTier} onQueryChange={buscarProductos} onSelect={product => setProductoTier(product.id)} placeholder="Elegí el producto…" /></div>
      {productoTier && <form onSubmit={guardarTiers} className="space-y-3">
        {filasTier.map((fila, index) => <div key={index} className="flex max-w-[640px] items-end gap-2">
          <FieldRow label="Desde" htmlFor={`tier-${index}-min`} className="w-28 shrink-0">
            <Input id={`tier-${index}-min`} aria-label="Cantidad mínima" inputMode="numeric" value={fila.minQuantity} onChange={event => setFilasTier(filas => filas.map((row, i) => i === index ? { ...row, minQuantity: event.target.value.replace(/\D/g, '') } : row))} placeholder="3" />
          </FieldRow>
          <FieldRow label="Precio unitario" htmlFor={`tier-${index}-precio`} className="min-w-0 flex-1">
            <div className="min-w-0 flex-1"><MoneyInput id={`tier-${index}-precio`} aria-label="Precio unitario del escalón" value={fila.unitPricePyg} onValueChange={value => setFilasTier(filas => filas.map((row, i) => i === index ? { ...row, unitPricePyg: value === '' ? '' : String(value) } : row))} placeholder="0" /></div>
          </FieldRow>
          <span className="acciones-toque shrink-0"><IconAction icon="trash" tone="bad" label="Quitar escalón" onClick={() => setFilasTier(filas => filas.filter((_, i) => i !== index))} /></span>
        </div>)}
        {!filasTier.length && <p className="text-sm text-mute">Sin escalones: el producto se vende con el precio de su lista o del tramo del cliente.</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={() => setFilasTier(filas => [...filas, tierVacio()])}>+ Escalón</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar escalones'}</Button>
        </div>
      </form>}
    </Card>
    </div>

    <Popup
      open={editor !== null}
      onClose={() => setEditor(null)}
      dirty={editorDirty}
      busy={busy}
      title={editor?.id ? 'Editar lista de precios' : 'Nueva lista de precios'}
      tamano="lg"
    >
      {editor && <form onSubmit={guardarLista} className="space-y-4">
        <div className={GRILLA_DOS_COLUMNAS}>
          <FormField label="Nombre" htmlFor="lista-nombre" error={errorDe('nombre')}>
            <Input id="lista-nombre" value={editor.name} onChange={event => { limpiar('nombre'); setEditor(current => ({ ...current, name: event.target.value })) }} placeholder={mayoristas ? 'Mayorista VIP, Empresas…' : 'Empresas, Clientes VIP…'} />
          </FormField>
          <label className="flex items-center gap-2 self-end text-sm text-mute"><Switch checked={editor.isActive} onChange={event => setEditor(current => ({ ...current, isActive: event.target.checked }))} />Lista activa</label>
        </div>
        <div className="space-y-3">
          <p className="text-[11px] font-medium uppercase tracking-wider text-mute">Ítems</p>
          {editor.items.map((item, index) => (
            <div key={index} className="grid gap-2 rounded-xl border border-ink-600 p-3 sm:grid-cols-[7rem_minmax(10rem,1fr)_8rem_2.75rem] sm:items-end">
              <FormField label="Tipo" htmlFor={`item-${index}-tipo`}>
                <Select id={`item-${index}-tipo`} value={item.scope} onChange={event => cambiarItem(index, { ...itemVacio(), scope: event.target.value }, [`item-${index}-producto`, `item-${index}-categoria`])}><option value="PRODUCT">Producto</option><option value="CATEGORY">Categoría</option></Select>
              </FormField>
              {item.scope === 'PRODUCT'
                ? (
                  <FormField label="Producto" descripcionId={`item-${index}-producto-descripcion`} error={errorDe(`item-${index}-producto`)}>
                    <ProductCombobox products={productos} selectedId={item.productId} onQueryChange={buscarProductos} onSelect={product => cambiarItem(index, { productId: product.id }, [`item-${index}-producto`])} placeholder="Producto…" />
                  </FormField>
                )
                : (
                  <FormField label="Categoría" htmlFor={`item-${index}-categoria`} error={errorDe(`item-${index}-categoria`)}>
                    <Select id={`item-${index}-categoria`} value={item.category} onChange={event => cambiarItem(index, { category: event.target.value }, [`item-${index}-categoria`])}><option value="">Elegí categoría</option>{categorias.map(categoria => <option key={categoria} value={categoria}>{categoria}</option>)}</Select>
                  </FormField>
                )}
              <FormField label="Porcentaje" htmlFor={`item-${index}-porcentaje`} error={errorDe(`item-${index}-porcentaje`)}>
                <PercentField id={`item-${index}-porcentaje`} value={item.valuePct} onChange={value => cambiarItem(index, { valuePct: value }, [`item-${index}-porcentaje`])} />
              </FormField>
              <span className="acciones-toque"><IconAction icon="trash" tone="bad" label="Quitar ítem" onClick={() => { limpiar(); setEditor(current => ({ ...current, items: current.items.filter((_, i) => i !== index) })) }} /></span>
            </div>
          ))}
          {!editor.items.length && <p className="text-sm text-mute">Sin ítems, la lista no cambia ningún precio.</p>}
          <Button type="button" variant="outline" onClick={() => { limpiar(); setEditor(current => ({ ...current, items: [...current.items, itemVacio()] })) }}>+ Ítem</Button>
        </div>
        {errorLista && <Aviso tono="error">{errorLista}</Aviso>}
        <FormActions>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => setEditor(null)}>Cancelar</Button>
          <Button type="submit" disabled={busy || !editor.name.trim()}>{busy ? 'Guardando…' : 'Guardar lista'}</Button>
        </FormActions>
      </form>}
    </Popup>

    <PopupConfirmar
      open={aBorrar !== null}
      onCancel={() => !busy && setABorrar(null)}
      onConfirm={borrarLista}
      busy={busy}
      title={`¿Eliminar ${aBorrar?.name || 'la lista'}?`}
      description={`Los clientes con esta lista asignada vuelven a su precio ${mayoristas ? 'minorista o mayorista' : 'de venta'}. La acción queda en la auditoría.`}
      confirmLabel="Eliminar lista"
      variant="danger"
    />
  </div>
}
