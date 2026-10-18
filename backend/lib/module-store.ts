import type { Prisma } from '@prisma/client'

export const MODULE_CATALOG = [
  { id: 'agenda', name: 'Agenda', description: 'Turnos y tareas del equipo.', category: 'Operación', icon: 'calendar', recommendedFor: ['servicios', 'salud'], tier: 'included', core: true, changeable: false, dependencies: [], preview: 'Agenda de ejemplo', demo: 'Vista previa sin guardar turnos.', status: 'available', navIds: [] },
  { id: 'clientes', name: 'Clientes', description: 'Contactos, historial y seguimiento.', category: 'Clientes', icon: 'users', recommendedFor: ['comercio', 'servicios', 'salud'], tier: 'included', core: true, changeable: false, dependencies: [], preview: 'Clientes de ejemplo', demo: 'Vista previa con datos ficticios.', status: 'available', navIds: ['clientes'] },
  { id: 'servicios', name: 'Servicios', description: 'Órdenes de servicio, garantías y reparaciones.', category: 'Operación', icon: 'tool', recommendedFor: ['servicios', 'salud'], tier: 'included', core: true, changeable: false, dependencies: ['clientes'], preview: 'Orden de servicio de ejemplo', demo: 'Vista previa sin crear órdenes.', status: 'available', navIds: ['servicio', 'garantias'] },
  { id: 'equipo', name: 'Equipo', description: 'Accesos y tareas para las personas de la empresa.', category: 'Configuración', icon: 'users', recommendedFor: ['comercio', 'servicios', 'salud'], tier: 'included', core: true, changeable: false, dependencies: [], preview: 'Equipo de ejemplo', demo: 'Vista previa sin modificar permisos.', status: 'available', navIds: ['equipo'] },
  { id: 'ventas', name: 'Ventas', description: 'Punto de venta, pedidos, cotizaciones y promociones.', category: 'Operación', icon: 'receipt', recommendedFor: ['comercio'], tier: 'included', core: false, changeable: false, dependencies: ['clientes'], preview: 'Venta de ejemplo', demo: 'Vista previa sin registrar ventas.', status: 'available', navIds: ['cargar', 'pedidos', 'cotizaciones', 'promociones'] },
  { id: 'inventario', name: 'Inventario', description: 'Productos, compras, stock y precios.', category: 'Operación', icon: 'box', recommendedFor: ['comercio'], tier: 'pro', core: false, changeable: false, dependencies: ['ventas'], preview: 'Inventario de ejemplo', demo: 'Vista previa sin cambiar existencias.', status: 'available', navIds: ['unidades', 'productos', 'compras', 'traslados', 'abastecimiento', 'compras-centro', 'preparacion', 'lotes', 'recepcion', 'metricas', 'precios', 'celulares', 'comparador', 'centro-control'] },
  { id: 'finanzas', name: 'Finanzas', description: 'Caja, pagos, gastos y márgenes.', category: 'Finanzas', icon: 'wallet', recommendedFor: ['comercio'], tier: 'pro', core: false, changeable: false, dependencies: ['ventas'], preview: 'Resumen financiero de ejemplo', demo: 'Vista previa con importes ficticios.', status: 'available', navIds: ['finanzas', 'caja'] },
  { id: 'mensajes', name: 'Mensajes y plantillas', description: 'Plantillas de WhatsApp y seguimiento de clientes.', category: 'Mensajes', icon: 'send', recommendedFor: ['comercio'], tier: 'pro', core: false, changeable: true, dependencies: ['clientes'], preview: 'Plantilla de ejemplo', demo: 'Vista previa; no envía mensajes.', benefits: ['Respuestas coherentes por contexto', 'Seguimiento de pedidos y clientes'], status: 'available', navIds: ['plantillas', 'campanas'], configureHref: '/plantillas', capabilities: ['WhatsApp', 'Correo · próxima fase', 'Pedido', 'Seguimiento', 'Pago pendiente', 'Entrega', 'Garantía', 'Asistencia técnica'], packs: [{ id: 'comercio', name: 'Comercio', status: 'preview', includes: ['Pedido', 'Pago pendiente', 'Entrega'] }, { id: 'servicios', name: 'Servicios', status: 'preview', includes: ['Seguimiento', 'Garantía', 'Asistencia técnica'] }] },
  { id: 'impresion', name: 'Impresión y comprobantes', description: 'Tickets, comprobantes, etiquetas de stock, IMEI y garantías.', category: 'Configuración', icon: 'printer', recommendedFor: ['comercio', 'servicios'], tier: 'included', core: false, changeable: false, dependencies: [], preview: 'Ticket y etiqueta de ejemplo', demo: 'Vista previa con datos ficticios; no imprime ni cambia la configuración.', benefits: ['Un lugar para los formatos de papel', 'Reutiliza el logo y los ruteos existentes'], status: 'available', navIds: [], configureHref: '/configuracion/dispositivos', capabilities: ['Tickets y comprobantes', 'Térmica 58/80 mm y A4', 'Orientación vertical y horizontal', 'Tamaño, márgenes y QR', 'Logo y datos de empresa', 'Etiquetas de stock, producto, IMEI y garantía', 'Enrutamiento por tipo de documento'], packs: [{ id: 'comercio', name: 'Comercio', status: 'preview', includes: ['Ticket', 'Comprobante', 'Etiqueta de stock'] }, { id: 'servicios', name: 'Servicios', status: 'preview', includes: ['Orden', 'Etiqueta IMEI', 'Garantía'] }] },
  { id: 'verificacion-imei', name: 'Verificación de IMEI', description: 'Consulta y conserva el último resultado normalizado de la unidad.', category: 'IMEI', icon: 'shield', recommendedFor: ['comercio'], tier: 'pro', core: false, changeable: true, dependencies: ['inventario'], preview: 'Resultado de ejemplo', demo: 'Preview ficticio: no consulta proveedor ni consume créditos. Un resultado no acredita propiedad ni autenticidad.', benefits: ['Historial por empresa con IMEI enmascarado', 'Roles, créditos e idempotencia verificados en servidor'], status: 'available', navIds: [], configureHref: '/stock/unidades', capabilities: ['IMEIcheck.net · actual', 'IMEI.info · próximamente / no configurado', 'Créditos por empresa; saldo y consulta en API', 'Roles: stock, productos y recepción de trade-in', 'Consulta reciente visible por 24 h', 'Auditoría de consultas y rechazos'] },
  { id: 'reportes', name: 'Reportes', description: 'Indicadores y reportes del negocio.', category: 'Reportes', icon: 'chart', recommendedFor: ['comercio', 'servicios', 'salud'], tier: 'pro', core: false, changeable: false, dependencies: [], preview: 'Reporte de ejemplo', demo: 'Vista previa con datos ficticios.', status: 'available', navIds: ['resumen', 'analisis', 'metricas'] },
  { id: 'salud', name: 'Datos de salud', description: 'Preparación para flujos con datos sensibles de salud.', category: 'Salud', icon: 'heart', recommendedFor: ['salud'], tier: 'pro', core: false, changeable: false, dependencies: ['clientes'], preview: 'Ficha ficticia', demo: 'Vista previa sin datos personales.', status: 'coming-soon', navIds: [] },
] as const

export const MODULE_PRESETS = ['comercio', 'servicios', 'salud'] as const
export type ModulePreset = typeof MODULE_PRESETS[number]
export type ModuleSetting = { enabled: boolean; manuallySelected: boolean; source: 'preset' | 'manual'; updatedAt: string }
export type ModuleStoreState = { version: 1; preset: ModulePreset; modules: Record<string, ModuleSetting> }

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const presetModules = (preset: ModulePreset) => new Set(MODULE_CATALOG.filter(module => module.core || module.changeable === false || module.status === 'available' && module.recommendedFor.some(rubro => rubro === preset)).map(module => module.id))

export function dependenciesEnabled(dependencies: readonly string[], modules: Record<string, { enabled: boolean }>) {
  return dependencies.every(id => modules[id]?.enabled === true)
}

export function hasEnabledDependents(moduleId: string, catalog: readonly { id: string; dependencies: readonly string[] }[], modules: Record<string, { enabled: boolean }>) {
  return catalog.some(module => modules[module.id]?.enabled && module.dependencies.includes(moduleId))
}

export function moduleStoreFrom(settings: unknown, now = new Date().toISOString()): ModuleStoreState {
  const root = record(settings)
  const stored = record(root.moduleStore)
  const preset = MODULE_PRESETS.includes(stored.preset as ModulePreset) ? stored.preset as ModulePreset : 'comercio'
  const oldModules = record(stored.modules)
  const defaults = presetModules(preset)
  const modules: Record<string, ModuleSetting> = {}
  for (const module of MODULE_CATALOG) {
    const saved = record(oldModules[module.id])
    const isSaved = typeof saved.enabled === 'boolean'
    modules[module.id] = {
      enabled: module.core || (isSaved ? saved.enabled as boolean : defaults.has(module.id)),
      manuallySelected: !module.core && saved.manuallySelected === true,
      source: module.core ? 'preset' : saved.source === 'manual' ? 'manual' : 'preset',
      updatedAt: typeof saved.updatedAt === 'string' ? saved.updatedAt : now,
    }
  }
  return { version: 1, preset, modules }
}

export function parseModuleChange(body: unknown): { preset?: ModulePreset; moduleId?: string; enabled?: boolean } | null {
  const value = record(body)
  if (typeof value.preset === 'string' && MODULE_PRESETS.includes(value.preset as ModulePreset) && Object.keys(value).length === 1) return { preset: value.preset as ModulePreset }
  if (Object.keys(value).length === 2 && typeof value.moduleId === 'string' && typeof value.enabled === 'boolean' && MODULE_CATALOG.some(module => module.id === value.moduleId)) return { moduleId: value.moduleId, enabled: value.enabled }
  return null
}

export function updateModuleStore(settings: unknown, change: NonNullable<ReturnType<typeof parseModuleChange>>, now = new Date().toISOString()) {
  const current = moduleStoreFrom(settings, now)
  const modules = { ...current.modules }
  if (change.preset) {
    const included = presetModules(change.preset)
    for (const module of MODULE_CATALOG) {
      if (module.core || module.changeable === false) continue
      modules[module.id] = { enabled: included.has(module.id), manuallySelected: false, source: 'preset', updatedAt: now }
    }
    return { version: 1 as const, preset: change.preset, modules }
  }
  const definition = MODULE_CATALOG.find(module => module.id === change.moduleId)
  if (!definition || definition.core || definition.changeable !== true || definition.status !== 'available') {
    throw new Error('MODULE_CHANGE_NOT_ALLOWED')
  }
  if (change.enabled === false && hasEnabledDependents(definition.id, MODULE_CATALOG, modules)) throw new Error('MODULE_HAS_ENABLED_DEPENDENTS')
  if (change.enabled === true && !dependenciesEnabled(definition.dependencies, modules)) throw new Error('MODULE_DEPENDENCY_REQUIRED')
  modules[definition.id] = { enabled: change.enabled!, manuallySelected: true, source: 'manual', updatedAt: now }
  return { ...current, modules }
}

export function mergeModuleStoreSettings(settings: unknown, state: ModuleStoreState) {
  return { ...record(settings), moduleStore: state } as Prisma.InputJsonObject
}
