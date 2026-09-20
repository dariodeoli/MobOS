export const ROLE_ORDER = ['ADMIN', 'GERENTE', 'VENDEDOR', 'CAJERA', 'TECNICO']

export const ROLE_LABELS = {
  ADMIN: 'Dueño',
  GERENTE: 'Gerente',
  VENDEDOR: 'Vendedor',
  CAJERA: 'Cajera',
  TECNICO: 'Técnico',
}

export const ROLE_DESCRIPTIONS = {
  ADMIN: 'Dueño: acceso total al panel, incluidos inventario, finanzas, equipo y configuración.',
  GERENTE: 'Gerente: conduce la operación de la tienda; además de vender, gestiona pedidos, catálogo, cobros y descuentos.',
  VENDEDOR: 'Vendedor: atiende clientes, carga ventas y cotizaciones, y prepara Trade-In como parte de pago.',
  CAJERA: 'Cajera: carga ventas y cobros, concilia pagos y consulta pedidos, clientes y catálogo.',
  TECNICO: 'Técnico: recibe equipos, diagnostica y gestiona las órdenes de servicio técnico.',
}

export const CAPACIDAD_DOMINIOS = [
  'Panel',
  'Ventas',
  'Catálogo y stock',
  'Pagos',
  'Servicio',
  'Equipo y configuración',
]

export const CAPACIDADES = [
  { id: 'panel-control', dominio: 'Panel', label: 'Centro de control', description: 'Todo el panel: inventario, compras, servicio, resumen, análisis, finanzas y equipo.', roles: ['ADMIN'] },
  { id: 'panel-pos', dominio: 'Panel', label: 'Punto de venta', description: 'Vender, pedidos, clientes, productos, promociones, Trade-In y cotizaciones.', roles: ['ADMIN', 'GERENTE', 'VENDEDOR', 'CAJERA'] },
  { id: 'panel-taller', dominio: 'Panel', label: 'Panel del taller', description: 'Servicio Técnico: recepción, diagnóstico, reparación y entrega.', roles: ['ADMIN', 'TECNICO'] },

  { id: 'cargar-ventas', dominio: 'Ventas', label: 'Cargar ventas', description: 'Cliente, productos, IMEI, pagos, entrega y comprobante.', roles: ['ADMIN', 'GERENTE', 'VENDEDOR', 'CAJERA'] },
  { id: 'descuentos', dominio: 'Ventas', label: 'Aplicar descuentos', description: 'Descuento extra de la venta y descuento por línea, sin pedir autorización.', roles: ['ADMIN', 'GERENTE'] },
  { id: 'pedidos-todos', dominio: 'Ventas', label: 'Ver todos los pedidos', description: 'Lista completa de la tienda; el resto ve solo los propios.', roles: ['ADMIN', 'GERENTE'] },
  { id: 'cotizaciones', dominio: 'Ventas', label: 'Cotizaciones', description: 'Crear cotizaciones con vencimiento y convertirlas en pedido.', roles: ['ADMIN', 'GERENTE', 'VENDEDOR', 'CAJERA'] },
  { id: 'clientes', dominio: 'Ventas', label: 'Gestionar clientes', description: 'Ficha, direcciones, RUC, importación y seguimiento.', roles: ['ADMIN', 'GERENTE', 'VENDEDOR', 'CAJERA', 'TECNICO'] },

  { id: 'catalogo', dominio: 'Catálogo y stock', label: 'Gestionar catálogo y combos', description: 'Crear productos desde el POS, editarlos, desactivarlos y armar combos.', roles: ['ADMIN', 'GERENTE'] },
  { id: 'stock-venta', dominio: 'Catálogo y stock', label: 'Consultar stock e IMEI', description: 'Disponibilidad y equipos serializados al cargar la venta.', roles: ['ADMIN', 'GERENTE', 'VENDEDOR', 'CAJERA', 'TECNICO'] },
  { id: 'inventario', dominio: 'Catálogo y stock', label: 'Inventario operativo', description: 'Recepción, ubicaciones, reservas, traslados, conteo y alertas.', roles: ['ADMIN'] },

  { id: 'cobros', dominio: 'Pagos', label: 'Registrar cobros', description: 'Pagos parciales y combinados con cuentas y cotización.', roles: ['ADMIN', 'GERENTE', 'VENDEDOR', 'CAJERA'] },
  { id: 'conciliar', dominio: 'Pagos', label: 'Conciliar pagos', description: 'Confirmar o rechazar comprobantes de pago.', roles: ['ADMIN', 'GERENTE', 'CAJERA'] },
  { id: 'devoluciones', dominio: 'Pagos', label: 'Registrar devoluciones', description: 'Devolver un pago y liberar el saldo del pedido.', roles: ['ADMIN', 'GERENTE'] },
  { id: 'caja', dominio: 'Pagos', label: 'Caja, compras y gastos', description: 'Apertura y cierre de caja, compras a proveedores y gastos.', roles: ['ADMIN'] },

  { id: 'servicio-tecnico', dominio: 'Servicio', label: 'Gestionar órdenes de servicio', description: 'Alta, diagnóstico, técnico, estados, precio y costo.', roles: ['ADMIN', 'GERENTE', 'TECNICO'] },
  { id: 'tradein-pos', dominio: 'Servicio', label: 'Preparar Trade-In', description: 'Cargar un equipo usado como parte de pago en la venta.', roles: ['ADMIN', 'GERENTE', 'VENDEDOR', 'CAJERA'] },
  { id: 'tradein-pipeline', dominio: 'Servicio', label: 'Pipeline de Trade-In', description: 'Revisión, reparación, stock y salida de equipos recibidos.', roles: ['ADMIN'] },
  { id: 'promociones', dominio: 'Servicio', label: 'Gestionar promociones', description: 'Crear, activar y desactivar códigos de descuento.', roles: ['ADMIN'] },
  { id: 'garantias', dominio: 'Servicio', label: 'Garantías y servicio', description: 'Coberturas, reparaciones y seguimiento postventa.', roles: ['ADMIN'] },

  { id: 'equipo', dominio: 'Equipo y configuración', label: 'Gestionar equipo', description: 'Altas, invitaciones, roles, metas y horarios.', roles: ['ADMIN'] },
  { id: 'configuracion', dominio: 'Equipo y configuración', label: 'Configurar la empresa', description: 'Datos, sucursales, cuentas de cobro, claves y facturación.', roles: ['ADMIN'] },
  { id: 'reportes', dominio: 'Equipo y configuración', label: 'Reportes y comisiones', description: 'Resultados por producto, categoría, vendedor y día.', roles: ['ADMIN'] },
]

export function capacidadesDe(rol) {
  return CAPACIDADES.filter(capacidad => capacidad.roles.includes(rol))
}

export function capacidadesNegadas(rol) {
  return CAPACIDADES.filter(capacidad => !capacidad.roles.includes(rol))
}

export function capacidadesPorDominio() {
  return CAPACIDAD_DOMINIOS.map(dominio => ({
    dominio,
    capacidades: CAPACIDADES.filter(capacidad => capacidad.dominio === dominio),
  })).filter(grupo => grupo.capacidades.length > 0)
}
