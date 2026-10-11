// Presentation only: the caller's existing destination catalog remains the
// authority for route access. Unknown catalogs keep their own destinations.
export const PRIMARY_SECTIONS = [
  { id: 'inicio', label: 'Inicio', icon: 'chart', destinations: ['resumen', 'ops'] },
  {
    id: 'vender',
    label: 'Vender',
    icon: 'plus',
    destinations: ['cargar', 'cotizador'],
  },
  {
    id: 'ventas',
    label: 'Ventas',
    icon: 'receipt',
    destinations: [
      'pedidos',
      'cotizaciones',
      'clientes',
      'promociones',
      'plantillas',
      'repartos',
      'servicio',
      'tradein-admin',
      'autorizaciones',
      'garantias',
    ],
  },
  {
    id: 'stock',
    label: 'Stock',
    icon: 'box',
    destinations: [
      'unidades',
      'productos',
      'inventario',
      'compras',
      'traslados',
      'abastecimiento',
      'compras-centro',
      'preparacion',
      'lotes',
      'recepcion',
      'metricas',
      'precios',
      'celulares',
      'comparador',
      'centro-control',
    ],
  },
  { id: 'finanzas', label: 'Finanzas', icon: 'receipt', destinations: ['finanzas', 'analisis'] },
]

export function shellNavigation(nav = []) {
  const destinations = nav.flatMap(group => group.items)
  const ids = new Set(destinations.map(([id]) => id))
  // Single-domain roles must never open the first owner/seller destination.
  if (ids.has('rendiciones'))
    return [{ id: 'entregas', label: 'Entregas', icon: 'truck', items: destinations }]
  if (ids.has('servicio') && !ids.has('cargar'))
    return [{ id: 'taller', label: 'Taller', icon: 'wrench', items: destinations }]
  const sections = PRIMARY_SECTIONS.map(section => ({
    ...section,
    items: section.destinations.flatMap(id => destinations.filter(([key]) => key === id)),
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

// Context buckets are a projection of permitted catalog entries, never a grant.
const CONTEXT_GROUPS = {
  stock: [
    ['inventario', 'Inventario', ['unidades', 'productos', 'inventario']],
    [
      'compras',
      'Compras',
      [
        'compras',
        'abastecimiento',
        'compras-centro',
        'preparacion',
        'lotes',
        'recepcion',
        'metricas',
      ],
    ],
    ['traslados', 'Traslados', ['traslados']],
    ['precios', 'Precios', ['precios', 'celulares', 'comparador', 'centro-control']],
  ],
  ventas: [
    ['pedidos', 'Pedidos', ['pedidos', 'autorizaciones']],
    ['cotizaciones', 'Cotizaciones', ['cotizaciones']],
    ['entregas', 'Entregas', ['repartos']],
    ['taller', 'Taller', ['servicio', 'garantias', 'tradein-admin']],
    ['clientes', 'Clientes', ['clientes', 'promociones', 'plantillas']],
  ],
}

export function shellContextGroups(section) {
  if (!section) return []
  const definitions = CONTEXT_GROUPS[section.id]
  if (!definitions)
    return section.items.map(item => ({ id: item[0], label: item[1], items: [item] }))
  return definitions
    .map(([id, label, destinations]) => ({
      id,
      label,
      items: destinations.flatMap(key => section.items.filter(([itemId]) => itemId === key)),
    }))
    .filter(group => group.items.length)
}
