// Presentation only: the caller's existing destination catalog remains the
// authority for route access. Unknown catalogs keep their own destinations.
//
// Each primary section lists its context groups (level 1 tabs). A group lists
// the catalog ids it renders; with more than one id the group shows a second,
// segmented level. Groups are `[id, label | null, [catalog ids]]`: the id is the
// first catalog id (stable tab key) and a null label reads the catalog label.
export const PRIMARY_SECTIONS = [
  {
    id: 'inicio',
    label: 'Inicio',
    icon: 'chart',
    groups: [
      ['resumen', 'Resumen', ['resumen']],
      // Análisis pasa a Inicio › Reportes (la URL /analisis no cambia).
      ['analisis', 'Reportes', ['analisis']],
      ['ops', 'Operaciones', ['ops']],
    ],
  },
  {
    id: 'vender',
    label: 'Vender',
    icon: 'plus',
    groups: [
      ['cargar', 'Nueva venta', ['cargar']],
      // Módulo Trade-In: el vendedor cotiza, el dueño ve la pipeline.
      ['cotizador', 'Trade-In', ['cotizador', 'tradein-admin']],
    ],
  },
  {
    id: 'pedidos',
    label: 'Pedidos',
    icon: 'receipt',
    groups: [
      ['pedidos', null, ['pedidos']],
      ['cotizaciones', null, ['cotizaciones']],
      ['repartos', 'Entregas', ['repartos']],
      ['autorizaciones', 'Por aprobar', ['autorizaciones']],
    ],
  },
  {
    id: 'clientes',
    label: 'Clientes',
    icon: 'users',
    groups: [
      ['clientes', null, ['clientes']],
      ['campanas', 'Campañas', ['campanas']],
      ['promociones', null, ['promociones']],
      ['plantillas', null, ['plantillas']],
    ],
  },
  // Taller es una sección solo con el módulo `servicios` activo.
  {
    id: 'taller',
    label: 'Taller',
    icon: 'wrench',
    groups: [
      ['servicio', 'Servicio', ['servicio']],
      ['garantias', 'Garantías', ['garantias']],
    ],
  },
  {
    id: 'stock',
    label: 'Stock',
    icon: 'box',
    groups: [
      ['unidades', 'Unidades', ['unidades', 'inventario']],
      ['productos', 'Productos', ['productos']],
      // Compras es un grupo de Stock; Abastecimiento suma los suyos con su módulo.
      ['compras', null, ['compras']],
      ['traslados', 'Traslados', ['traslados']],
      ['control', 'Control', ['control']],
      ['precios', 'Precios', ['precios', 'celulares', 'comparador', 'centro-control']],
      ['abastecimiento', 'Abastecimiento', ['abastecimiento', 'compras-centro', 'preparacion', 'lotes', 'recepcion', 'metricas']],
    ],
  },
  { id: 'finanzas', label: 'Finanzas', icon: 'wallet', groups: [['finanzas', null, ['finanzas']]] },
  // Configuración cierra el menú del dueño. El catálogo la llama `equipo` (el id
  // que habilita el acceso); sus secciones viven en la propia página (riel
  // vertical en escritorio, tira de pestañas en móvil), por eso es un solo grupo.
  {
    id: 'configuracion',
    label: 'Configuración',
    icon: 'settings',
    groups: [['equipo', 'Configuración', ['equipo']]],
  },
].map(section => ({ ...section, destinations: section.groups.flatMap(group => group[2]) }))

// Shorter labels for the second level (the catalog label stays the source for
// anything not listed here).
const SEGMENT_LABELS = {
  precios: 'Listas',
  celulares: 'Lista por modelo',
}

// Owner mobile bottom bar (D2): the rest of the sections live in the "Más" sheet.
const BOTTOM_PRIORITY = ['inicio', 'vender', 'pedidos', 'stock']
const BOTTOM_MAX = 5

// `opciones.modulos` (opcional): función `(idDeVista) => boolean` que dice si la
// vista pertenece a un módulo activo. Solo resta: nunca agrega destinos que el
// catálogo del rol no trae.
export function shellNavigation(nav = [], opciones = {}) {
  const visible = typeof opciones.modulos === 'function' ? opciones.modulos : () => true
  const destinations = nav.flatMap(group => group.items).filter(([id]) => visible(id))
  const ids = new Set(destinations.map(([id]) => id))
  // Single-domain roles must never open the first owner/seller destination.
  if (ids.has('rendiciones'))
    return [{ id: 'entregas', label: 'Entregas', icon: 'truck', items: destinations }]
  if (ids.has('servicio') && !ids.has('cargar'))
    return [{ id: 'taller', label: 'Taller', icon: 'wrench', items: destinations }]
  // `control` (Stock) agrupa vistas del inventario que no son destinos del
  // catálogo (conteos, alertas, taller…): existe donde existe Unidades o, con el
  // módulo «Inventario por unidades» apagado, donde el dueño ve Compras (alertas).
  const projected = ids.has('unidades') || ids.has('compras') ? [...destinations, ['control', 'Control', 'check']] : destinations
  const sections = PRIMARY_SECTIONS.map(section => ({
    ...section,
    label: section.label,
    items: section.destinations.flatMap(id => projected.filter(([key]) => key === id)),
  })).filter(section => section.items.length)
  const mapped = new Set(sections.flatMap(section => section.items.map(([id]) => id)))
  const remaining = destinations.filter(
    ([id]) => !mapped.has(id) && id !== 'equipo' && id !== 'ayuda',
  )
  if (remaining.length)
    sections.push({
      id: 'contexto',
      label: nav[0]?.titulo || 'Operación',
      icon: 'menu',
      items: remaining,
    })
  return sections
}

export function activeShellSection(sections, active) {
  return sections.find(section => section.items.some(([id]) => id === active)) || null
}

// Bottom bar projection: with five sections or fewer every section is a tab;
// beyond that the owner keeps four and the rest go to the "Más" sheet.
export function shellBottomNav(sections) {
  if (sections.length <= BOTTOM_MAX) return { bottom: sections, more: [] }
  const bottom = BOTTOM_PRIORITY.map(id => sections.find(section => section.id === id)).filter(
    Boolean,
  )
  const rest = sections.filter(section => !bottom.includes(section))
  return { bottom, more: rest }
}

// Level 1 tabs of a section: a projection of permitted catalog entries, never a grant.
export function shellContextGroups(section) {
  if (!section) return []
  const definitions = PRIMARY_SECTIONS.find(candidate => candidate.id === section.id)?.groups
  if (!definitions)
    return section.items.map(item => ({ id: item[0], label: item[1], items: [item] }))
  return definitions
    .map(([id, label, destinations]) => {
      const items = destinations.flatMap(key => section.items.filter(([itemId]) => itemId === key))
      return { id, label: label || items[0]?.[1], items }
    })
    .filter(group => group.items.length)
}

// Precios (Listas · Lista por modelo · Comparador · Centro de Control) pone su
// segundo nivel dentro de la barra de herramientas de cada vista, no en el
// encabezado de página (docs/PANTALLAS.md regla 7).
export function segmentosEnToolbar(group) {
  return Boolean(group?.items.some(([id]) => id === 'precios') && group.items.some(([id]) => id === 'celulares'))
}

// Level 2 (segmented) entries of a group with more than one destination.
export function shellSegments(group) {
  if (!group || group.items.length < 2) return []
  return group.items.map(([id, label]) => ({ id, label: SEGMENT_LABELS[id] || label }))
}
