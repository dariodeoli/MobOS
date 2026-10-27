// Datos de presentación de la pantalla «Módulos» (puro, sin React): a qué
// pestaña del filtro pertenece cada módulo, qué incluye y qué pasa al
// desactivarlo. El catálogo y la regla de activación viven en
// backend/lib/modulos-catalogo.mjs; acá solo hay texto de producto.
import { MODULE_CATALOG, moduloActivo } from './modulos.js'

export const FILTROS_MODULOS = [
  ['todos', 'Todos'],
  ['activos', 'Activos'],
  ['ventas', 'Ventas'],
  ['stock', 'Stock'],
  ['finanzas', 'Finanzas'],
  ['clientes', 'Clientes'],
  ['integraciones', 'Integraciones'],
]

// Pestaña del filtro de cada módulo opcional (los próximamente van a Integraciones).
const GRUPO_DE_MODULO = {
  tradein: 'ventas',
  'catalogo-modelos': 'ventas',
  servicios: 'ventas',
  delivery: 'ventas',
  'gift-cards': 'ventas',
  promociones: 'ventas',
  ops: 'ventas',
  'inventario-unidades': 'stock',
  'venta-sin-stock': 'ventas',
  mayoristas: 'ventas',
  'listas-precios': 'stock',
  comparador: 'stock',
  abastecimiento: 'stock',
  multisucursal: 'stock',
  'stock-avanzado': 'stock',
  comisiones: 'finanzas',
  cuotas: 'finanzas',
  conciliacion: 'finanzas',
  'campanas-recompra': 'clientes',
  'campanas-mensajes': 'clientes',
  publicidad: 'clientes',
  'portal-clientes': 'clientes',
  'ia-conectores': 'integraciones',
  'verificacion-imei': 'integraciones',
  'impresion-pro': 'integraciones',
}

export const grupoDeModulo = id => GRUPO_DE_MODULO[id] || 'integraciones'

/** Grupos de la grilla en el orden del filtro: `[id, título]` (sin Todos ni Activos). */
export const GRUPOS_MODULOS = FILTROS_MODULOS.filter(([id]) => id !== 'todos' && id !== 'activos')

/** Lista agrupada por área, en el orden de GRUPOS_MODULOS; omite los grupos vacíos. */
export function agruparModulos(lista) {
  return GRUPOS_MODULOS
    .map(([id, titulo]) => ({ id, titulo, modulos: lista.filter(def => grupoDeModulo(def.id) === id) }))
    .filter(grupo => grupo.modulos.length)
}

// Beneficios de cada módulo, en lenguaje de dueño (2-3 viñetas en la tarjeta).
export const BENEFICIOS = {
  'inventario-unidades': ['Cada iPhone con su IMEI: sabés cuál está, cuál se vendió y a quién.', 'Vendés o reservás una unidad desde su ficha, sin buscarla en el POS.', 'Lo vendido y lo dado de baja queda con su historial.'],
  'venta-sin-stock': ['Vendés aunque el equipo todavía no llegó y lo dejás sobre pedido.', 'Ves en «Por comprar» todo lo que ya vendiste y falta traer.'],
  mayoristas: ['El POS aplica solo el precio mayorista al cliente mayorista.', 'Filtrás a tus mayoristas en Clientes y les mandás la lista de precios.'],
  tradein: ['Cotizás el usado del cliente en segundos y lo tomás como parte de pago.', 'El equipo recibido entra a tu stock con su valor de toma.'],
  'catalogo-modelos': ['Todos los iPhone, iPad, Mac y AirPods con sus capacidades y colores.', 'Las tasaciones y cotizaciones eligen el modelo exacto, sin tipear.'],
  servicios: ['Cada reparación con su orden, su estado y su fecha de entrega.', 'Los reclamos de garantía quedan registrados con el equipo y el cliente.'],
  delivery: ['Asignás repartos y ves en qué está cada pedido.', 'Cada repartidor rinde lo que cobró en la calle y cerrás el día sin diferencias.'],
  'campanas-recompra': ['Te recuerda escribirle al cliente para que vuelva a comprar.', 'Ves quién respondió y quién compró después del mensaje.'],
  'campanas-mensajes': ['Mandás un mismo mensaje de WhatsApp o correo a un grupo de clientes.', 'Elegís a quién le llega: por compra, por sucursal o por tipo de cliente.'],
  publicidad: ['Medís cuánto te trae cada campaña de publicidad.', 'Comparás lo que gastaste contra lo que vendiste.'],
  comisiones: ['Definís cuánto cobra cada vendedor por venta.', 'Liquidás las comisiones del mes con el detalle por venta.'],
  cuotas: ['Vendés a crédito y cada cuota queda con su vencimiento.', 'Ves quién te debe, cuánto y desde cuándo, y cobrás en el momento.'],
  conciliacion: ['Cerrás el día comparando lo vendido con lo que entró al banco.', 'Las diferencias quedan marcadas para revisarlas.'],
  'gift-cards': ['Vendés tarjetas de regalo y el cliente las canjea en el POS.', 'Cada tarjeta muestra su saldo y sus movimientos.'],
  promociones: ['Creás cupones y descuentos con fecha de inicio y fin.', 'Armás combos (funda + vidrio) que el POS cobra solos.'],
  'listas-precios': ['Cada cliente especial tiene su lista de precios negociada.', 'Precios por cantidad: más llevan, mejor precio.'],
  comparador: ['Una lista de precios por modelo lista para compartir.', 'Comparás modelos lado a lado para ayudar al cliente a elegir.'],
  abastecimiento: ['Te dice qué comprar según lo que se vende y lo que falta.', 'Preparás la compra, recibís la mercadería y medís a cada proveedor.'],
  multisucursal: ['Mandás equipos de una sucursal a otra y ves lo que está en camino.', 'El stock compartido muestra qué hay en cada local.'],
  'stock-avanzado': ['Contás el inventario con el lector y ves las diferencias al instante.', 'Reservás equipos para un cliente sin que otro los venda.'],
  ops: ['Ves en vivo las ventas, los pedidos y las entregas del día.', 'Detectás atrasos antes de que el cliente reclame.'],
  'ia-conectores': ['Le preguntás al asistente cómo van las ventas y te responde con tus números.', 'Conectás tus asistentes de IA con permisos que vos controlás.'],
  'portal-clientes': ['Cada cliente sigue su pedido desde un enlace seguro.', 'Garantías y comprobantes con el logo de tu empresa.'],
  'verificacion-imei': ['Consultás el IMEI antes de comprar o recibir un equipo.', 'El último resultado queda guardado en la ficha de la unidad.'],
  'impresion-pro': ['Diseños profesionales para tickets, cotizaciones, remitos y etiquetas.', 'Tus comprobantes salen con la imagen de tu marca.'],
  asistentes: ['Ayuda guiada para las tareas que repetís todos los días.'],
  facturacion: ['Conexión directa con tu proveedor de facturación.'],
  autofacturacion: ['Emitís el documento desde la venta, sin cargar todo de nuevo.'],
  'facturacion-electronica': ['Preparación para emitir con SIFEN desde la venta.'],
  salud: ['Preparación para fichas con datos sensibles de salud.'],
}

/** Viñetas de la tarjeta: los beneficios propios o, si no hay, lo que incluye. */
export const beneficiosDe = def => (BENEFICIOS[def.id] || INCLUYE[def.id] || def.capabilities || []).slice(0, 3)

// Dónde vive cada módulo en el menú (`vive`) y adónde lleva «Ir a …» (`ir`).
// Sin `ir` cuando el módulo no tiene pantalla propia (se usa desde Configurar).
export const DESTINOS = {
  'inventario-unidades': { vive: ['Stock', 'Unidades'], ir: ['Unidades', '/stock/unidades'] },
  'venta-sin-stock': { vive: ['Vender', 'Nueva venta'], ir: ['Vender', '/pos'] },
  mayoristas: { vive: ['Vender', 'Nueva venta'], ir: ['Vender', '/pos'] },
  tradein: { vive: ['Vender', 'Trade-In'], ir: ['Trade-In', '/trade-in'] },
  'catalogo-modelos': { vive: ['Vender', 'Trade-In'], ir: ['Trade-In', '/trade-in'] },
  servicios: { vive: ['Taller', 'Servicio'], ir: ['Taller', '/servicio'] },
  delivery: { vive: ['Pedidos', 'Entregas'], ir: ['Entregas', '/delivery'] },
  'campanas-recompra': { vive: ['Clientes', 'Campañas'], ir: ['Campañas', '/campanas'] },
  'campanas-mensajes': { vive: ['Clientes', 'Campañas'], ir: ['Campañas', '/campanas'] },
  publicidad: { vive: ['Finanzas', 'Publicidad'], ir: ['Publicidad', '/finanzas/publicidad'] },
  comisiones: { vive: ['Finanzas', 'Comisiones'], ir: ['Comisiones', '/finanzas/comisiones'] },
  cuotas: { vive: ['Finanzas', 'Créditos'], ir: ['Créditos', '/finanzas/creditos'] },
  conciliacion: { vive: ['Finanzas', 'Conciliación'], ir: ['Conciliación', '/finanzas/conciliacion'] },
  'gift-cards': { vive: ['Vender', 'Nueva venta'], ir: ['Vender', '/pos'] },
  promociones: { vive: ['Clientes', 'Promociones'], ir: ['Promociones', '/promociones'] },
  'listas-precios': { vive: ['Stock', 'Precios'], ir: ['Precios', '/precios'] },
  comparador: { vive: ['Stock', 'Precios', 'Lista por modelo'], ir: ['Lista por modelo', '/celulares'] },
  abastecimiento: { vive: ['Stock', 'Abastecimiento'], ir: ['Abastecimiento', '/abastecimiento'] },
  multisucursal: { vive: ['Stock', 'Traslados'], ir: ['Traslados', '/stock/traslados'] },
  'stock-avanzado': { vive: ['Stock', 'Control'], ir: ['Control', '/stock/conteos'] },
  ops: { vive: ['Inicio', 'Operaciones'], ir: ['Operaciones', '/ops'] },
  'ia-conectores': { vive: ['Inicio', 'Reportes', 'Asistente'], ir: ['Asistente', '/analisis/asistente'] },
  'portal-clientes': { vive: ['Configuración', 'Negocio', 'Portal'] },
  'verificacion-imei': { vive: ['Stock', 'Unidades'] },
  'impresion-pro': { vive: ['Configuración', 'Impresión y documentos'] },
}

/** Ruta del menú donde vive el módulo («Stock › Unidades») o null. */
export const viveEn = def => DESTINOS[def.id]?.vive?.join(' › ') || null

/** `{ label, href }` del botón «Ir a …» o null si el módulo no tiene pantalla propia. */
export function irA(def) {
  const ir = DESTINOS[def.id]?.ir
  return ir ? { label: ir[0], href: ir[1] } : null
}

// Qué incluye cada módulo, en lenguaje de producto.
export const INCLUYE = {
  tradein: ['Cotizador de equipos usados', 'Equipo recibido como parte de pago', 'Pipeline de trade-in para el dueño'],
  'catalogo-modelos': ['Todos los modelos Apple: iPhone desde el 11, iPad, Mac, Apple Watch y AirPods', 'Capacidades y colores de cada modelo', 'Se activa solo con Trade-In'],
  servicios: ['Órdenes de servicio y su seguimiento', 'Reclamos de garantía', 'La pestaña Taller en Stock'],
  delivery: ['Repartos y asignación de repartidor', 'Cobro contra entrega y rendiciones', 'Cierre diario y semanal'],
  'campanas-recompra': ['Campañas para que los clientes vuelvan a comprar', 'Seguimiento de clientes'],
  'campanas-mensajes': ['Envíos masivos de WhatsApp y correo a grupos de clientes'],
  publicidad: ['La pestaña Publicidad en Finanzas', 'Medición de lo que traen tus campañas'],
  comisiones: ['Reglas de comisión por vendedor', 'Liquidaciones de comisiones'],
  cuotas: ['Ventas a crédito y cuotas', 'Cobranzas', 'Saldo a favor de clientes'],
  conciliacion: ['Cierre diario contra bancos y medios de cobro'],
  'gift-cards': ['Venta y canje de tarjetas de regalo en el punto de venta'],
  promociones: ['Cupones y descuentos', 'Combos de productos'],
  'inventario-unidades': ['Stock abre primero en Inventario, equipo por equipo (IMEI o serie)', 'Vender una unidad la deja cargada en el POS', 'Reservar una unidad para un cliente', 'Vendidos y eliminados'],
  'venta-sin-stock': ['«Vender igualmente» y «sobre pedido» en el POS', 'Vender un equipo sin IMEI hasta entregarlo', 'La pantalla Por comprar con lo que falta'],
  mayoristas: ['Precio mayorista en el punto de venta', 'Tipo de cliente y filtro Mayoristas en Clientes', 'Precio mayorista de cada producto', 'Plantilla «Precios mayoristas» en Mensajes', 'Funciona sola: una lista mayorista negociada por cliente sigue en Listas de precios'],
  'listas-precios': ['Listas de precios negociadas por cliente', 'Precios por cantidad (el precio mayorista fijo de cada producto va en Mayoristas)'],
  comparador: ['Lista de precios por modelo', 'Comparador de modelos', 'Centro de control'],
  abastecimiento: ['Qué comprar', 'Compras del centro, preparación de compras y lotes', 'Recepción de mercadería', 'Métricas de proveedores'],
  multisucursal: ['Traslados entre sucursales', 'Stock en tránsito y compartido', 'Ubicaciones'],
  'stock-avanzado': ['Conteos de inventario', 'Verificaciones de stock', 'Reservas'],
  ops: ['Tablero de operaciones en vivo, dentro de Inicio'],
  'ia-conectores': ['Asistente de análisis', 'Conexión con asistentes de IA'],
  'portal-clientes': ['Enlaces seguros para que cada cliente siga su pedido', 'Garantías y comprobantes'],
  'verificacion-imei': ['Consulta de IMEI con créditos', 'Último resultado guardado por unidad'],
  'impresion-pro': ['Diseños profesionales para comprobantes, tickets, cotizaciones, remitos y etiquetas'],
}

// Aviso extra al desactivar los módulos que pueden tener plata o trámites abiertos.
export const SALDOS_AL_DESACTIVAR = {
  tradein: 'No se puede desactivar mientras haya trade-ins en curso.',
  'inventario-unidades': 'No se puede desactivar mientras haya equipos con IMEI en stock, reservados o en tránsito.',
  delivery: 'No se puede desactivar si hay cobros de delivery sin rendir.',
  comisiones: 'No se puede desactivar si hay comisiones sin liquidar.',
  cuotas: 'No se puede desactivar si hay cuotas con saldo.',
  'gift-cards': 'No se puede desactivar si hay gift cards con saldo.',
}

export const AL_DESACTIVAR = 'Se oculta del menú y se bloquean las acciones nuevas. Tus datos y tu historial se conservan, y podés volver a activarlo cuando quieras.'

// Adonde lleva «Configurar ›» cuando el módulo se configura en otro lugar.
const CONFIGURAR = { 'portal-clientes': '/configuracion/negocio?org=portal' }
export const hrefConfigurar = def => CONFIGURAR[def.id] || def.configureHref || null

/** Módulos opcionales que la pantalla muestra (el núcleo no se lista). */
export const modulosOpcionales = (catalogo = MODULE_CATALOG) => catalogo.filter(def => !def.nucleo)

export const disponible = def => def.status === 'available'

/** Nombres de los módulos requeridos que todavía no están activos. */
export function dependenciasFaltantes(def, fuente, catalogo = MODULE_CATALOG) {
  return def.dependencies
    .filter(id => !moduloActivo(fuente, id))
    .map(id => catalogo.find(item => item.id === id)?.name || id)
}

/** Nombres de los módulos activos que dependen de este (hay que apagarlos primero).
 *  Los que este mismo módulo activa solo (implicadoPor) no bloquean: se apagan con él. */
export function dependientesActivos(def, fuente, catalogo = MODULE_CATALOG) {
  return catalogo
    .filter(item => !item.nucleo && item.dependencies.includes(def.id) && !(item.implicadoPor ?? []).includes(def.id) && moduloActivo(fuente, item.id))
    .map(item => item.name)
}

/** Lista filtrada por la pestaña elegida. */
export function filtrarModulos(fuente, filtro = 'todos', catalogo = MODULE_CATALOG) {
  return modulosOpcionales(catalogo).filter(def => {
    if (filtro === 'todos') return true
    if (filtro === 'activos') return disponible(def) && moduloActivo(fuente, def.id)
    return grupoDeModulo(def.id) === filtro
  })
}
