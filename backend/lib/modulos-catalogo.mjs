// Catálogo único de módulos de MobOS (ver .claude/modulos-plan.md).
// Lo importan el backend (module-store.ts, modulos-guard.ts) y el front
// (src/lib/modulos.js), igual que imei-input.mjs: sin dependencias ni efectos.
//
// - nucleo: siempre activo, no se puede apagar.
// - defaultLegacy: estado para empresas existentes (sin store o en versión 1).
// - defaultNuevo: estado al crear una empresa (se suma al núcleo).
// - legacyFrom: en versión 1 hereda lo que la empresa apagó a mano en ese módulo.
// - navIds / tabIds / apiPrefixes: qué oculta y qué escrituras bloquea al apagarse.
// - porDatos: el estado inicial de una empresa existente se decide por sus datos
//   (ver backend/lib/modulos-datos.ts); un preset no lo cambia.
// - implicadoPor: ids de otros módulos que también lo dejan visible y habilitado.

export const MODULE_KINDS = ['core', 'configurable', 'catalogOnly', 'integration', 'sensitive', 'specialized']
export const MODULE_STORE_VERSION = 2
export const MODULE_PRESETS = ['comercio', 'servicios', 'salud']

const base = { benefits: [], capabilities: [], navIds: [], tabIds: [], apiPrefixes: [], dependencies: [], recommendedFor: ['comercio', 'servicios'], tier: 'pro', status: 'available', kind: 'configurable' }

function modulo(def) {
  const nucleo = def.nucleo === true
  const disponible = (def.status ?? base.status) === 'available'
  return Object.freeze({
    ...base,
    ...def,
    nucleo,
    core: nucleo,
    changeable: !nucleo && disponible,
    defaultLegacy: def.defaultLegacy ?? disponible,
    defaultNuevo: nucleo || (disponible && def.defaultNuevo === true),
  })
}

export const MODULE_CATALOG = Object.freeze([
  // ---- Núcleo ----
  modulo({ id: 'agenda', name: 'Agenda', description: 'Turnos y tareas del equipo.', category: 'Operación', icon: 'calendar', kind: 'core', nucleo: true, tier: 'included', preview: 'Agenda de ejemplo', demo: 'Vista previa sin guardar turnos.' }),
  modulo({ id: 'clientes', name: 'Clientes', description: 'Contactos, historial y seguimiento.', category: 'Clientes', icon: 'users', kind: 'core', nucleo: true, tier: 'included', navIds: ['clientes'], preview: 'Clientes de ejemplo', demo: 'Vista previa con datos ficticios.' }),
  modulo({ id: 'equipo', name: 'Equipo', description: 'Accesos y tareas para las personas de la empresa.', category: 'Configuración', icon: 'users', kind: 'core', nucleo: true, tier: 'included', navIds: ['equipo'], preview: 'Equipo de ejemplo', demo: 'Vista previa sin modificar permisos.' }),
  modulo({ id: 'ventas', name: 'Ventas y pedidos', description: 'Punto de venta, pedidos y cotizaciones.', category: 'Ventas', icon: 'receipt', kind: 'core', nucleo: true, tier: 'included', dependencies: ['clientes'], navIds: ['cargar', 'pedidos', 'cotizaciones', 'autorizaciones'], preview: 'Venta de ejemplo', demo: 'Vista previa sin registrar ventas.', capabilities: ['POS', 'Pedidos y cotizaciones'] }),
  modulo({ id: 'inventario', name: 'Stock e inventario', description: 'Productos, variantes, compras, stock y unidades con IMEI o serie.', category: 'Stock', icon: 'box', kind: 'core', nucleo: true, tier: 'included', dependencies: ['ventas'], navIds: ['productos', 'compras'], tabIds: ['alertas'], preview: 'Inventario de ejemplo', demo: 'Vista previa sin cambiar existencias.', capabilities: ['Control por cantidad: productos, variantes y SKU', 'Compras y alertas de reposición'] }),
  modulo({ id: 'finanzas', name: 'Finanzas', description: 'Caja, gastos, bancos y cuentas.', category: 'Finanzas', icon: 'wallet', kind: 'core', nucleo: true, tier: 'included', dependencies: ['ventas'], navIds: ['finanzas', 'caja'], tabIds: ['caja', 'gastos', 'bancos'], preview: 'Resumen financiero de ejemplo', demo: 'Vista previa con importes ficticios.' }),
  modulo({ id: 'reportes', name: 'Reportes', description: 'Indicadores y reportes del negocio.', category: 'Reportes', icon: 'chart', kind: 'core', nucleo: true, tier: 'included', navIds: ['resumen', 'analisis'], tabIds: ['reportes', 'ventas-dia', 'ganancias', 'ganadores'], preview: 'Reporte de ejemplo', demo: 'Vista previa con datos ficticios.' }),
  modulo({ id: 'impresion', name: 'Impresión y comprobantes', description: 'Tickets, comprobantes, etiquetas de stock, IMEI y garantías.', category: 'Configuración', icon: 'printer', kind: 'core', nucleo: true, tier: 'included', preview: 'Ticket y etiqueta de ejemplo', demo: 'Vista previa con datos ficticios; no imprime ni cambia la configuración.', benefits: ['Un lugar para los formatos de papel', 'Reutiliza el logo y los ruteos existentes'], configureHref: '/configuracion/dispositivos', capabilities: ['Tickets y comprobantes', 'Térmica 58/80 mm y A4', 'Orientación vertical y horizontal', 'Tamaño, márgenes y QR', 'Logo y datos de empresa', 'Etiquetas de stock, producto, IMEI y garantía', 'Enrutamiento por tipo de documento'], packs: [{ id: 'comercio', name: 'Comercio', status: 'preview', includes: ['Ticket', 'Comprobante', 'Etiqueta de stock'] }, { id: 'servicios', name: 'Servicios', status: 'preview', includes: ['Orden', 'Etiqueta IMEI', 'Garantía'] }] }),
  modulo({ id: 'mensajes', name: 'Mensajes y plantillas', description: 'Plantillas de WhatsApp y correo para cada evento del negocio.', category: 'Mensajes', icon: 'send', kind: 'core', nucleo: true, tier: 'included', dependencies: ['clientes'], navIds: ['plantillas'], configureHref: '/plantillas', preview: 'Plantilla de ejemplo', demo: 'Vista previa; no envía mensajes.', benefits: ['Respuestas coherentes por contexto', 'Seguimiento de pedidos y clientes'], capabilities: ['WhatsApp', 'Correo · próxima fase', 'Pedido', 'Seguimiento', 'Pago pendiente', 'Entrega', 'Garantía', 'Asistencia técnica'], packs: [{ id: 'comercio', name: 'Comercio', status: 'preview', includes: ['Pedido', 'Pago pendiente', 'Entrega'] }, { id: 'servicios', name: 'Servicios', status: 'preview', includes: ['Seguimiento', 'Garantía', 'Asistencia técnica'] }] }),

  // ---- Módulos (se pueden apagar) ----
  modulo({ id: 'inventario-unidades', name: 'Inventario por unidades', description: 'Cada equipo con su IMEI o serie: inventario, vendidos y eliminados, con Vender y Reservar desde la unidad.', category: 'Stock', icon: 'phone', recommendedFor: [], dependencies: ['inventario'], navIds: ['unidades'], tabIds: ['unidades', 'vendidos', 'eliminados'], apiPrefixes: ['/api/inventory-units'], porDatos: true, preview: 'Unidades de ejemplo', demo: 'Vista previa con unidades ficticias.', benefits: ['Stock abre en Inventario, equipo por equipo', 'Vender una unidad la deja cargada en el POS', 'Reservar una unidad para un cliente'], capabilities: ['Inventario por IMEI/serie', 'Vendidos y eliminados', 'Vender y reservar desde cada unidad'] }),
  modulo({ id: 'venta-sin-stock', name: 'Venta sin stock', description: 'Vender un producto que todavía no tenés, o un equipo sin IMEI, y dejarlo sobre pedido hasta que llegue.', category: 'Ventas', icon: 'clock', recommendedFor: [], dependencies: ['ventas'], porDatos: true, preview: 'Venta sobre pedido de ejemplo', demo: 'Vista previa sin crear pedidos.', benefits: ['«Vender igualmente» y «sobre pedido» en el POS', 'La pantalla Por comprar con lo que falta'], capabilities: ['Sobre pedido sin stock', 'Equipo sin IMEI hasta entregar', 'Por comprar'] }),
  modulo({ id: 'mayoristas', name: 'Mayoristas', description: 'Precio mayorista en el punto de venta, clientes mayoristas, lista de precios mayorista y mensajes para mayoristas.', category: 'Ventas', icon: 'store', recommendedFor: [], dependencies: ['ventas', 'clientes'], porDatos: true, preview: 'Venta mayorista de ejemplo', demo: 'Vista previa con precios ficticios; no cambia precios ni clientes.', benefits: ['El POS aplica el precio mayorista a los clientes mayoristas', 'Tipo de cliente y filtro Mayoristas en Clientes', 'Mensaje de precios mayoristas en las plantillas'], capabilities: ['Precio mayorista por producto', 'Clientes mayoristas', 'Lista de precios mayorista', 'Plantillas para mayoristas'] }),
  modulo({ id: 'tradein', name: 'Trade-In', description: 'Cotizá y recibí equipos usados como parte de pago.', category: 'Ventas', icon: 'refresh', dependencies: ['inventario'], navIds: ['cotizador', 'tradein-admin'], apiPrefixes: ['/api/trade-ins', '/api/device-valuations'], preview: 'Tasación de ejemplo', demo: 'Vista previa sin recibir equipos.', capabilities: ['Cotizador de equipos usados', 'Recepción como medio de pago', 'Valuaciones por modelo'] }),
  // Se activa solo con Trade-In (implicadoPor): no se prende ni apaga por separado y no bloquea apagar Trade-In.
  modulo({ id: 'catalogo-modelos', name: 'Catálogo de modelos', description: 'Todos los modelos Apple con sus capacidades y colores para valores de toma, cotizaciones y equipos recibidos.', category: 'Ventas', icon: 'phone', recommendedFor: [], dependencies: ['tradein'], implicadoPor: ['tradein'], defaultLegacy: false, preview: 'Catálogo de ejemplo', demo: 'Vista previa con modelos reales; no cambia valores ni precios.', capabilities: ['iPhone, iPad, Mac, Apple Watch y AirPods', 'Capacidades y colores por modelo'] }),
  modulo({ id: 'servicios', name: 'Taller y servicios', description: 'Órdenes de servicio, reparaciones y reclamos de garantía.', category: 'Operación', icon: 'tool', kind: 'specialized', recommendedFor: ['servicios', 'salud'], dependencies: ['clientes'], navIds: ['servicio', 'garantias'], tabIds: ['taller'], apiPrefixes: ['/api/service-orders', '/api/workshop', '/api/service-items', '/api/service-checklists', '/api/warranties'], preview: 'Orden de servicio de ejemplo', demo: 'Vista previa sin crear órdenes.', benefits: ['Reutiliza el taller, las órdenes y garantías existentes'], capabilities: ['Recepción y seguimiento', 'Reparaciones', 'Garantía', 'Asistencia técnica'] }),
  modulo({ id: 'delivery', name: 'Delivery externo', description: 'Repartos, cobros en calle, rendiciones y cierres diarios o semanales.', category: 'Operación', icon: 'truck', kind: 'specialized', dependencies: ['clientes', 'ventas'], navIds: ['repartos'], apiPrefixes: ['/api/delivery'], configureHref: '/delivery', preview: 'Cierre de reparto de ejemplo', demo: 'Vista previa con repartos ficticios; no crea viajes ni cobros.', benefits: ['Asignación y seguimiento de pedidos', 'Rendición diaria auditable por repartidor', 'Cierre diario y semanal con zona horaria America/Asuncion'], capabilities: ['Asignación de repartidor y ruta', 'Repartidores y permisos', 'Estado del envío y seguimiento', 'Tarifas por distancia', 'Cobro contra entrega', 'Rendiciones', 'Rendición diaria por repartidor', 'Cierre diario', 'Cierre semanal', 'Cierre semanal por sucursal', 'Diferencias y pendientes auditados', 'Ajustes auditados'], packs: [{ id: 'comercio', name: 'Comercio', status: 'preview', includes: ['Asignación', 'Rendición', 'Cierre diario'] }, { id: 'servicios', name: 'Servicios', status: 'preview', includes: ['Rutas', 'Honorarios', 'Cierre semanal'] }] }),
  modulo({ id: 'campanas-recompra', name: 'Campañas de recompra', description: 'Seguimiento de clientes para que vuelvan a comprar.', category: 'Clientes', icon: 'send', dependencies: ['mensajes'], navIds: ['campanas'], apiPrefixes: ['/api/follow-ups', '/api/marketing/campaigns'], legacyFrom: 'mensajes', preview: 'Campaña de ejemplo', demo: 'Vista previa; no envía mensajes.' }),
  modulo({ id: 'campanas-mensajes', name: 'Envíos masivos', description: 'Mensajes de WhatsApp y correo a grupos de clientes.', category: 'Clientes', icon: 'send', dependencies: ['mensajes'], legacyFrom: 'mensajes', preview: 'Envío de ejemplo', demo: 'Vista previa; no envía mensajes.' }),
  modulo({ id: 'publicidad', name: 'Publicidad', description: 'Campañas y medición de adquisición por negocio.', category: 'Comercial', icon: 'chart', dependencies: ['mensajes'], tabIds: ['publicidad'], apiPrefixes: ['/api/marketing'], preview: 'Campaña de ejemplo', demo: 'Vista previa ficticia: no crea campañas ni conecta cuentas publicitarias.', capabilities: ['Campañas', 'Medición'] }),
  modulo({ id: 'comisiones', name: 'Comisiones', description: 'Reglas de comisión por vendedor y liquidaciones.', category: 'Finanzas', icon: 'wallet', kind: 'sensitive', dependencies: ['finanzas'], tabIds: ['comisiones'], apiPrefixes: ['/api/commission-rules', '/api/commission-settlements'], preview: 'Liquidación de ejemplo', demo: 'Vista previa con importes ficticios.' }),
  modulo({ id: 'cuotas', name: 'Créditos y cuotas', description: 'Ventas a crédito, cuotas, cobranzas y saldo a favor.', category: 'Finanzas', icon: 'wallet', kind: 'sensitive', dependencies: ['finanzas'], tabIds: ['creditos', 'cuotas'], apiPrefixes: ['/api/credits', '/api/collections', '/api/store-credits'], preview: 'Cuotas de ejemplo', demo: 'Vista previa con importes ficticios.' }),
  modulo({ id: 'conciliacion', name: 'Conciliación', description: 'Cierre diario contra bancos y medios de cobro.', category: 'Finanzas', icon: 'wallet', kind: 'sensitive', dependencies: ['finanzas'], tabIds: ['conciliacion'], apiPrefixes: ['/api/finance/reconciliation'], preview: 'Conciliación de ejemplo', demo: 'Vista previa con importes ficticios.' }),
  modulo({ id: 'gift-cards', name: 'Gift cards', description: 'Vendé y canjeá tarjetas de regalo en el punto de venta.', category: 'Ventas', icon: 'tag', kind: 'sensitive', dependencies: ['ventas'], apiPrefixes: ['/api/gift-cards'], preview: 'Gift card de ejemplo', demo: 'Vista previa con saldos ficticios.' }),
  modulo({ id: 'promociones', name: 'Promociones y combos', description: 'Cupones, descuentos y combos de productos.', category: 'Ventas', icon: 'store', dependencies: ['ventas'], navIds: ['promociones'], apiPrefixes: ['/api/promotions', '/api/combos'], preview: 'Promoción de ejemplo', demo: 'Vista previa sin aplicar descuentos.' }),
  modulo({ id: 'listas-precios', name: 'Listas de precios', description: 'Listas de precios negociadas por cliente y precios por cantidad.', category: 'Stock', icon: 'tag', dependencies: ['inventario'], navIds: ['precios'], apiPrefixes: ['/api/price-lists'], preview: 'Lista de ejemplo', demo: 'Vista previa sin cambiar precios.' }),
  modulo({ id: 'comparador', name: 'Comparador y lista por modelo', description: 'Lista de precios por modelo, comparador y centro de control.', category: 'Stock', icon: 'report', dependencies: ['inventario'], navIds: ['celulares', 'comparador', 'centro-control'], preview: 'Comparador de ejemplo', demo: 'Vista previa con datos ficticios.' }),
  modulo({ id: 'abastecimiento', name: 'Abastecimiento', description: 'Qué comprar, preparar compras y lotes, y recibir mercadería.', category: 'Stock', icon: 'box', kind: 'specialized', dependencies: ['inventario'], implicadoPor: ['venta-sin-stock'], navIds: ['abastecimiento', 'compras-centro', 'preparacion', 'lotes', 'recepcion', 'metricas'], apiPrefixes: ['/api/supply', '/api/transit-assignments'], preview: 'Compra de ejemplo', demo: 'Vista previa sin crear compras.' }),
  modulo({ id: 'multisucursal', name: 'Varias sucursales', description: 'Traslados, stock en tránsito, compartido y ubicaciones.', category: 'Stock', icon: 'truck', kind: 'specialized', dependencies: ['inventario'], navIds: ['traslados'], tabIds: ['traslados', 'transito', 'compartido', 'ubicaciones'], apiPrefixes: ['/api/transfers', '/api/shared-stock', '/api/inventory-branches'], preview: 'Traslado de ejemplo', demo: 'Vista previa sin mover stock.' }),
  modulo({ id: 'stock-avanzado', name: 'Control de stock avanzado', description: 'Conteos, verificaciones y reservas de stock.', category: 'Stock', icon: 'box', kind: 'specialized', dependencies: ['inventario'], tabIds: ['conteos', 'verificacion', 'reservas'], apiPrefixes: ['/api/inventory-counts', '/api/stock-verifications', '/api/inventory-reservations'], preview: 'Conteo de ejemplo', demo: 'Vista previa sin cambiar existencias.' }),
  modulo({ id: 'ops', name: 'Tablero de operaciones', description: 'Vista de operaciones en vivo.', category: 'Operación', icon: 'chart', kind: 'specialized', navIds: ['ops'], preview: 'Tablero de ejemplo', demo: 'Vista previa con datos ficticios.' }),
  modulo({ id: 'ia-conectores', name: 'Asistente y conectores', description: 'Asistente de análisis y conexión con asistentes de IA (MCP).', category: 'Integraciones', icon: 'tool', kind: 'integration', tabIds: ['asistente'], apiPrefixes: ['/api/mcp'], preview: 'Conexión de ejemplo', demo: 'Vista previa; no conecta cuentas.' }),
  modulo({ id: 'portal-clientes', name: 'Portal de clientes', description: 'Enlaces públicos, seguimiento de pedidos, garantías y documentos para cada cliente.', category: 'Clientes', icon: 'globe', kind: 'configurable', tier: 'included', dependencies: ['clientes'], defaultNuevo: true, configureHref: '/configuracion/organizacion', preview: 'Portal de ejemplo', demo: 'Vista previa con datos ficticios; no publica cambios ni comparte datos reales.', benefits: ['Seguimiento desde un enlace seguro', 'Garantías y comprobantes con identidad de la empresa'], capabilities: ['Seguimiento de pedidos', 'Portal de garantías', 'Políticas públicas', 'Enlaces con permisos'] }),
  modulo({ id: 'verificacion-imei', name: 'Verificación de IMEI', description: 'Consulta y conserva el último resultado normalizado de la unidad.', category: 'IMEI', icon: 'shield', kind: 'integration', dependencies: ['inventario'], apiPrefixes: ['/api/imei'], configureHref: '/stock/unidades', preview: 'Resultado de ejemplo', demo: 'Preview ficticio: no consulta proveedor ni consume créditos. Un resultado no acredita propiedad ni autenticidad.', benefits: ['Historial por empresa con IMEI enmascarado', 'Roles, créditos e idempotencia verificados en servidor'], capabilities: ['IMEIcheck.net · actual', 'IMEI.info · próximamente / no configurado', 'Créditos por empresa; saldo y consulta en API', 'Roles: stock, productos y recepción de trade-in', 'Consulta reciente visible por 24 h', 'Auditoría de consultas y rechazos'] }),
  modulo({ id: 'impresion-pro', name: 'Impresión Pro', description: 'Galería de diseños profesionales para comprobantes, tickets, cotizaciones, remitos y etiquetas.', category: 'Configuración', icon: 'printer', dependencies: ['impresion'], configureHref: '/configuracion/dispositivos', preview: 'Diseño de ejemplo', demo: 'Galería completa con datos ficticios.' }),

  // ---- Próximamente (sin funciones todavía) ----
  modulo({ id: 'asistentes', name: 'Asistentes', description: 'Ayuda guiada para tareas repetitivas de la empresa.', category: 'Automatización', icon: 'tool', kind: 'catalogOnly', status: 'coming-soon', preview: 'Asistente de ejemplo', demo: 'Vista previa ficticia: no ejecuta acciones ni accede a datos reales.', capabilities: ['Flujos sugeridos por rubro', 'Acciones y permisos pendientes de definir'] }),
  modulo({ id: 'facturacion', name: 'Facturación por API', description: 'Conexiones directas con proveedores compatibles para preparar documentos fiscales.', category: 'Facturación', icon: 'receipt', recommendedFor: ['comercio'], kind: 'catalogOnly', status: 'coming-soon', dependencies: ['ventas'], preview: 'Comprobante de ejemplo', demo: 'Vista previa ficticia: no emite ni envía datos fiscales. Integración y sandbox pendientes.', capabilities: ['KudeExpress y futuros adaptadores', 'Payload, webhook, idempotencia y conciliación', 'Estados, permisos y auditoría por definir', 'Secretos solo server-side'] }),
  modulo({ id: 'autofacturacion', name: 'Autofacturación', description: 'Flujo de autofacturación para emitir documentos desde la operación de la tienda.', category: 'Facturación', icon: 'receipt', recommendedFor: ['comercio'], kind: 'catalogOnly', status: 'coming-soon', dependencies: ['ventas'], preview: 'Autofacturación de ejemplo', demo: 'Vista previa ficticia: no crea documentos ni envía datos fiscales.', capabilities: ['Datos fiscales del cliente', 'Envío de productos, cantidades y precios', 'Estados y reintentos idempotentes', 'Correo al cliente · pendiente de proveedor'] }),
  modulo({ id: 'facturacion-electronica', name: 'Facturación electrónica', description: 'Preparación para emisión electrónica y conciliación con SIFEN/DNIT.', category: 'Facturación', icon: 'receipt', recommendedFor: ['comercio'], kind: 'catalogOnly', status: 'coming-soon', dependencies: ['ventas'], preview: 'Factura electrónica de ejemplo', demo: 'Vista previa ficticia: no firma, envía ni valida documentos en producción.', capabilities: ['SIFEN y KuDE', 'CDC, XML y estados fiscales', 'Certificado y timbrado · configuración pendiente', 'Firma, envío y consulta · Fase futura'] }),
  modulo({ id: 'salud', name: 'Datos de salud', description: 'Preparación para flujos con datos sensibles de salud.', category: 'Salud', icon: 'heart', recommendedFor: ['salud'], kind: 'sensitive', status: 'coming-soon', dependencies: ['clientes'], preview: 'Ficha ficticia', demo: 'Vista previa sin datos personales.' }),
])

const reg = (valor) => (valor && typeof valor === 'object' && !Array.isArray(valor) ? valor : {})
const porId = new Map(MODULE_CATALOG.map(def => [def.id, def]))
export const moduloDef = (id) => porId.get(id)

/**
 * Normaliza lo que se tenga a mano: settings de empresa ({ moduleStore }),
 * empresa ({ settings }), estado ({ modules }) o respuesta de la API ({ state }).
 * Devuelve null si no hay datos (se usa el default legacy).
 */
export function leerModuleStore(fuente) {
  const raiz = reg(fuente)
  const guardado = raiz.state && typeof raiz.state === 'object' ? raiz.state
    : raiz.moduleStore && typeof raiz.moduleStore === 'object' ? raiz.moduleStore
    : raiz.settings && reg(raiz.settings).moduleStore ? reg(raiz.settings).moduleStore
    : raiz.modules && typeof raiz.modules === 'object' ? raiz
    : null
  if (!guardado) return null
  const s = reg(guardado)
  return { version: s.version === MODULE_STORE_VERSION ? MODULE_STORE_VERSION : 1, preset: MODULE_PRESETS.includes(s.preset) ? s.preset : 'comercio', modules: reg(s.modules) }
}

/**
 * Estado efectivo de un módulo según la versión guardada:
 * núcleo siempre; valor guardado si existe; si no, versión 2 usa defaultNuevo
 * (un módulo agregado después no se prende solo) y versión 1/sin datos usa
 * defaultLegacy respetando lo que la empresa apagó a mano en `legacyFrom`.
 */
export function estadoDeModulo(def, almacen) {
  if (def.nucleo) return true
  const guardado = reg(almacen?.modules?.[def.id])
  if (typeof guardado.enabled === 'boolean') return def.status === 'available' ? guardado.enabled : false
  if (almacen?.version === MODULE_STORE_VERSION) return def.defaultNuevo
  if (def.legacyFrom && reg(almacen?.modules?.[def.legacyFrom]).enabled === false) return false
  return def.defaultLegacy
}

/**
 * Helper único. `fuente`: settings, empresa, estado o respuesta de la API.
 * Núcleo siempre true; demo siempre true (opciones.demo o fuente.demo/esDemo);
 * sin datos, default legacy; un id fuera del catálogo no es un módulo y da true.
 */
export function moduloActivo(fuente, id, opciones = {}) {
  const raiz = reg(fuente)
  if (opciones.demo === true || raiz.demo === true || raiz.esDemo === true) return true
  const def = porId.get(id)
  if (!def) return true
  const almacen = leerModuleStore(fuente)
  if (estadoDeModulo(def, almacen)) return true
  return (def.implicadoPor ?? []).some(otro => { const d = porId.get(otro); return Boolean(d) && estadoDeModulo(d, almacen) })
}

/** Estado inicial de una empresa nueva: núcleo + defaultNuevo, en versión 2. */
export function nuevoModuleStore(ahora = new Date().toISOString(), preset = 'comercio') {
  const modules = {}
  for (const def of MODULE_CATALOG) modules[def.id] = { enabled: def.nucleo || def.defaultNuevo, manuallySelected: false, source: 'preset', updatedAt: ahora }
  return { version: MODULE_STORE_VERSION, preset, modules }
}

/** Módulo dueño de una ruta de API: el prefijo más largo que la contiene. */
export function moduloDePrefijo(ruta) {
  let mejor = null
  let largo = -1
  for (const def of MODULE_CATALOG) {
    for (const prefijo of def.apiPrefixes) {
      if ((ruta === prefijo || ruta.startsWith(`${prefijo}/`)) && prefijo.length > largo) { mejor = def.id; largo = prefijo.length }
    }
  }
  return mejor
}
