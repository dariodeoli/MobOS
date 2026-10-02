// Proveedores ficticios del modo demo (#324): una sola lista para Inventario,
// Compras y Abastecimiento. Antes Compras hablaba de «Proveedor Norte/Sur» y el
// modal de proveedores decía «sin proveedores registrados»; ahora todo sale de
// acá, con abreviatura, contacto y ciudad ficticios.
// Sin dependencias: lo importan demoInventory, demoPurchases y los tests.
export const PROVEEDORES_DEMO = [
  { id: 'demo-prov-importadora', code: 'IMPTEC', name: 'Importadora Tecnológica S.A.', contact: 'Compras · +595 981 000 111', phone: '+595 981 000 111', city: 'Asunción', department: 'Capital', address: 'Av. Ficticia 2500', email: 'compras@importadoratecnologica.ejemplo', document: '80011111-2', isActive: true },
  { id: 'demo-prov-distribuidora', code: 'DISESTE', name: 'Distribuidora del Este', contact: 'Ventas · +595 982 000 222', phone: '+595 982 000 222', city: 'Ciudad del Este', department: 'Alto Paraná', address: 'Km 8 Ruta Internacional', email: 'ventas@distribuidoraeste.ejemplo', document: '80022222-3', isActive: true },
  { id: 'demo-prov-mayorista', code: 'MAYAPY', name: 'Mayorista Apple PY', contact: 'Pedidos · +595 983 000 333', phone: '+595 983 000 333', city: 'Asunción', department: 'Capital', address: 'Av. Ficticia 890', email: 'pedidos@mayoristaapple.ejemplo', document: '80033333-4', isActive: true },
]

export const proveedorDemo = (id) => PROVEEDORES_DEMO.find((item) => item.id === id) || null

export const proveedorDemoPorNombre = (nombre) => {
  const clave = String(nombre || '').trim().toLowerCase()
  return PROVEEDORES_DEMO.find((item) => item.name.toLowerCase() === clave) || null
}

export const etiquetaProveedorDemo = (proveedor) => {
  if (!proveedor) return ''
  return proveedor.code ? `${proveedor.code} · ${proveedor.name}` : proveedor.name
}
