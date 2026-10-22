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
  servicios: 'ventas',
  delivery: 'ventas',
  'gift-cards': 'ventas',
  promociones: 'ventas',
  ops: 'ventas',
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

// Qué incluye cada módulo, en lenguaje de producto.
export const INCLUYE = {
  tradein: ['Cotizador de equipos usados', 'Equipo recibido como parte de pago', 'Pipeline de trade-in para el dueño'],
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
  'listas-precios': ['Listas de precios mayoristas y por cliente'],
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

/** Nombres de los módulos activos que dependen de este (hay que apagarlos primero). */
export function dependientesActivos(def, fuente, catalogo = MODULE_CATALOG) {
  return catalogo
    .filter(item => !item.nucleo && item.dependencies.includes(def.id) && moduloActivo(fuente, item.id))
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
