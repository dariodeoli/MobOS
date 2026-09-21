// Catálogo de iPhones y equipo del modo demo (#213). Sin dependencias: lo
// importan el seed de storage y el store de inventario (y sus tests en node).
// iPhones del modo demo (#213): catálogo base para el inventario serializado.
// Los 4 primeros ya existían en `prepararDatosDemo`; los ids y nombres coinciden
// para no duplicar. Los IMEIs de las unidades son ficticios (prefijo DEMO).
export const IPHONES_DEMO = [
  { id: 'demo-iphone-15-pro-256-titanio', sku: 'IP15PRO-256-TIT', nombre: 'iPhone 15 Pro 256GB Titanio', precioVenta: 6850000, precioCosto: 5300000, atributos: { modelo: 'iPhone 15 Pro', color: 'Titanio', capacidad: '256GB', estado: 'Nuevo' } },
  { id: 'demo-iphone-15-pro-256-negro', sku: 'IP15PRO-256-NEG', nombre: 'iPhone 15 Pro 256GB Negro', precioVenta: 6750000, precioCosto: 5250000, atributos: { modelo: 'iPhone 15 Pro', color: 'Negro', capacidad: '256GB', estado: 'Nuevo' } },
  { id: 'demo-iphone-15-128-azul', sku: 'IP15-128-AZU', nombre: 'iPhone 15 128GB Azul', precioVenta: 4850000, precioCosto: 3900000, atributos: { modelo: 'iPhone 15', color: 'Azul', capacidad: '128GB', estado: 'Nuevo' } },
  { id: 'demo-iphone-14-pro-256-plata', sku: 'IP14PRO-256-PLA', nombre: 'iPhone 14 Pro 256GB Plata', precioVenta: 4950000, precioCosto: 4000000, atributos: { modelo: 'iPhone 14 Pro', color: 'Plata', capacidad: '256GB', estado: 'Seminuevo' } },
  { id: 'demo-iphone-15-pro-max-256-titanio', sku: 'IP15PM-256-NAT', nombre: 'iPhone 15 Pro Max 256GB Titanio Natural', precioVenta: 7250000, precioCosto: 5600000, atributos: { modelo: 'iPhone 15 Pro Max', color: 'Titanio Natural', capacidad: '256GB', estado: 'Nuevo' } },
  { id: 'demo-iphone-15-pro-max-512-azul', sku: 'IP15PM-512-AZU', nombre: 'iPhone 15 Pro Max 512GB Azul', precioVenta: 8100000, precioCosto: 6300000, atributos: { modelo: 'iPhone 15 Pro Max', color: 'Azul', capacidad: '512GB', estado: 'Nuevo' } },
  { id: 'demo-iphone-15-256-rosa', sku: 'IP15-256-ROS', nombre: 'iPhone 15 256GB Rosa', precioVenta: 5400000, precioCosto: 4300000, atributos: { modelo: 'iPhone 15', color: 'Rosa', capacidad: '256GB', estado: 'Nuevo' } },
  { id: 'demo-iphone-14-128-medianoche', sku: 'IP14-128-MED', nombre: 'iPhone 14 128GB Medianoche', precioVenta: 3600000, precioCosto: 2850000, atributos: { modelo: 'iPhone 14', color: 'Medianoche', capacidad: '128GB', estado: 'Seminuevo' } },
  { id: 'demo-iphone-14-256-azul', sku: 'IP14-256-AZU', nombre: 'iPhone 14 256GB Azul', precioVenta: 3950000, precioCosto: 3150000, atributos: { modelo: 'iPhone 14', color: 'Azul', capacidad: '256GB', estado: 'Seminuevo' } },
  { id: 'demo-iphone-13-128-blanco', sku: 'IP13-128-BLA', nombre: 'iPhone 13 128GB Blanco', precioVenta: 3050000, precioCosto: 2400000, atributos: { modelo: 'iPhone 13', color: 'Blanco', capacidad: '128GB', estado: 'Seminuevo' } },
  { id: 'demo-iphone-13-pro-max-256-grafito', sku: 'IP13PM-256-GRA', nombre: 'iPhone 13 Pro Max 256GB Grafito', precioVenta: 4450000, precioCosto: 3500000, atributos: { modelo: 'iPhone 13 Pro Max', color: 'Grafito', capacidad: '256GB', estado: 'Seminuevo' } },
  { id: 'demo-iphone-12-128-verde', sku: 'IP12-128-VER', nombre: 'iPhone 12 128GB Verde', precioVenta: 2350000, precioCosto: 1850000, atributos: { modelo: 'iPhone 12', color: 'Verde', capacidad: '128GB', estado: 'Seminuevo' } },
]

// Equipo demo (#213): roles, PINs ficticios y meta diaria. Los PINs son de
// demostración; el acceso demo usa 2001 (dueño) y 3001 (vendedor).
export const EQUIPO_DEMO = [
  { id: 'demo-user', nombre: 'Dueño demo', rol: 'ADMIN', email: 'dueno@demo.mobos', pin: '2001', metaDiaria: 0, activo: true },
  { id: 'demo-user-gerente', nombre: 'Ana Giménez', rol: 'GERENTE', email: 'ana@demo.mobos', pin: '2002', metaDiaria: 3000000, activo: true },
  { id: 'demo-user-vendedor', nombre: 'Diego López', rol: 'VENDEDOR', email: 'diego@demo.mobos', pin: '2003', metaDiaria: 1500000, activo: true },
  { id: 'demo-user-cajera', nombre: 'María Benítez', rol: 'CAJERA', email: 'maria@demo.mobos', pin: '2004', metaDiaria: 0, activo: true },
  { id: 'demo-user-tecnico', nombre: 'Jorge Villalba', rol: 'TECNICO', email: 'jorge@demo.mobos', pin: '2005', metaDiaria: 0, activo: true },
  { id: 'demo-user-vendedora', nombre: 'Sofía Cáceres', rol: 'VENDEDOR', email: 'sofia@demo.mobos', pin: '2006', metaDiaria: 1200000, activo: true },
]
