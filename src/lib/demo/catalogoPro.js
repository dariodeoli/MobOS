// Catálogo demo ampliado (#451): además de los teléfonos, accesorios de
// mostrador (láminas, fundas, cargadores, cables, adaptadores, audio,
// smartwatches y power banks) con costo, stock, algunos faltantes y stock bajo.
// Sin dependencias de React/almacenamiento: lo usan el seed de storage, las
// ventas canónicas, el generador de historial y los tests en node.
import { IPHONES_DEMO } from './iphones.js'

// [id, nombre, categoría, precio, costo, stock, tipo de foto, compatibles, punto de reposición]
export const ACCESORIOS_DEMO = [
  ['demo-funda-magsafe-transparente', 'Funda MagSafe Transparente', 'Accesorios', 180000, 70000, 23, 'CASE', ['iPhone 15 Pro']],
  ['demo-funda-silicona-negra', 'Funda Silicona Negra', 'Accesorios', 150000, 55000, 14, 'CASE', ['iPhone 15', 'iPhone 15 Pro']],
  ['demo-cargador-usbc-20w', 'Cargador USB-C 20W', 'Accesorios', 220000, 120000, 10, 'CARGADOR', []],
  ['demo-airpods-pro-2-usbc', 'AirPods Pro 2 USB-C', 'Audio', 1850000, 1300000, 3, 'AUDIO', []],
  ['demo-vidrio-17-pro', 'Protector de vidrio 17 Pro', 'Protectores', 120000, 45000, 0, 'LAMINA', ['iPhone 17 Pro']],
  ['demo-lamina-hidrogel-17', 'Lámina hidrogel iPhone 17', 'Protectores', 60000, 18000, 40, 'LAMINA', ['iPhone 17']],
  ['demo-case-antigolpes-17-pro', 'Case antigolpes iPhone 17 Pro', 'Accesorios', 210000, 85000, 12, 'CASE', ['iPhone 17 Pro']],
  ['demo-cable-usbc-lightning-1m', 'Cable USB-C a Lightning 1 m', 'Accesorios', 90000, 30000, 30, 'CABLE', ['iPhone 14', 'iPhone 13']],
  ['demo-cable-usbc-usbc-2m', 'Cable USB-C a USB-C 2 m', 'Accesorios', 110000, 38000, 18, 'CABLE', ['iPhone 17 Pro', 'iPad']],
  ['demo-cargador-magsafe-15w', 'Cargador MagSafe 15W', 'Accesorios', 340000, 190000, 6, 'CARGADOR', ['iPhone 17 Pro', 'iPhone 15 Pro']],
  // Protectores
  ['demo-vidrio-15-pro', 'Vidrio templado iPhone 15 Pro', 'Protectores', 90000, 28000, 35, 'LAMINA', ['iPhone 15 Pro']],
  ['demo-vidrio-14', 'Vidrio templado iPhone 14', 'Protectores', 80000, 25000, 22, 'LAMINA', ['iPhone 14']],
  ['demo-vidrio-s24', 'Vidrio templado Galaxy S24', 'Protectores', 85000, 26000, 9, 'LAMINA', ['Galaxy S24'], 10],
  ['demo-vidrio-privacidad-17-pro', 'Vidrio privacidad iPhone 17 Pro', 'Protectores', 140000, 52000, 0, 'LAMINA', ['iPhone 17 Pro'], 5],
  // Fundas
  ['demo-funda-silicona-15-pro-azul', 'Funda silicona iPhone 15 Pro Azul', 'Accesorios', 150000, 55000, 18, 'CASE', ['iPhone 15 Pro']],
  ['demo-case-clear-15-pro-max', 'Case transparente iPhone 15 Pro Max', 'Accesorios', 170000, 62000, 11, 'CASE', ['iPhone 15 Pro Max']],
  ['demo-case-magsafe-17-pro-max', 'Case MagSafe iPhone 17 Pro Max', 'Accesorios', 230000, 92000, 7, 'CASE', ['iPhone 17 Pro Max'], 8],
  ['demo-funda-cuero-14-pro', 'Funda de cuero iPhone 14 Pro', 'Accesorios', 260000, 105000, 5, 'CASE', ['iPhone 14 Pro'], 5],
  ['demo-case-s24', 'Case reforzado Galaxy S24', 'Accesorios', 160000, 58000, 13, 'CASE', ['Galaxy S24']],
  // Cargadores
  ['demo-cargador-usbc-35w', 'Cargador USB-C 35W', 'Accesorios', 290000, 160000, 14, 'CARGADOR', []],
  ['demo-cargador-auto-usbc', 'Cargador de auto USB-C', 'Accesorios', 130000, 52000, 20, 'CARGADOR', []],
  ['demo-cargador-dual-45w', 'Cargador dual USB-C 45W', 'Accesorios', 380000, 210000, 4, 'CARGADOR', [], 6],
  // Cables
  ['demo-cable-lightning-2m', 'Cable Lightning 2 m', 'Accesorios', 120000, 42000, 16, 'CABLE', ['iPhone 13', 'iPhone 12']],
  ['demo-cable-usbc-trenzado-1m', 'Cable USB-C trenzado 1 m', 'Accesorios', 100000, 34000, 25, 'CABLE', []],
  // Adaptadores
  ['demo-adaptador-lightning-35', 'Adaptador Lightning a 3,5 mm', 'Accesorios', 80000, 28000, 12, 'ADAPTADOR', ['iPhone 13']],
  ['demo-adaptador-usbc-hdmi', 'Adaptador USB-C a HDMI', 'Accesorios', 210000, 95000, 6, 'ADAPTADOR', ['iPad', 'MacBook']],
  ['demo-adaptador-usbc-usba', 'Adaptador USB-C a USB-A', 'Accesorios', 60000, 20000, 0, 'ADAPTADOR', [], 6],
  ['demo-hub-usbc-5en1', 'Hub USB-C 5 en 1', 'Accesorios', 340000, 180000, 5, 'ADAPTADOR', ['iPad', 'MacBook']],
  // Audio
  ['demo-airpods-4', 'AirPods 4', 'Audio', 1650000, 1180000, 5, 'AUDIO', []],
  ['demo-auriculares-bt-jbl', 'Auriculares Bluetooth JBL', 'Audio', 420000, 260000, 9, 'AUDIO', []],
  ['demo-auriculares-usbc', 'Auriculares con cable USB-C', 'Audio', 90000, 30000, 20, 'AUDIO', []],
  ['demo-buds-samsung', 'Galaxy Buds FE', 'Audio', 780000, 520000, 4, 'AUDIO', ['Galaxy S24'], 5],
  // Smartwatches
  ['demo-apple-watch-se', 'Apple Watch SE 40 mm', 'Smartwatch', 1800000, 1350000, 3, 'WATCH', ['iPhone']],
  ['demo-apple-watch-s10', 'Apple Watch Series 10 42 mm', 'Smartwatch', 3400000, 2750000, 2, 'WATCH', ['iPhone'], 3],
  ['demo-smartwatch-xiaomi', 'Smartwatch Xiaomi Band 9', 'Smartwatch', 380000, 240000, 10, 'WATCH', []],
  ['demo-correa-apple-watch', 'Correa Apple Watch silicona', 'Smartwatch', 120000, 40000, 17, 'WATCH', ['Apple Watch']],
  // Power banks
  ['demo-powerbank-10000', 'Power bank 10.000 mAh', 'Power banks', 210000, 110000, 12, 'POWERBANK', []],
  ['demo-powerbank-20000-pd', 'Power bank 20.000 mAh PD', 'Power banks', 330000, 180000, 8, 'POWERBANK', []],
  ['demo-powerbank-magsafe-5000', 'Power bank MagSafe 5.000 mAh', 'Power banks', 380000, 210000, 3, 'POWERBANK', ['iPhone 15 Pro'], 5],
  ['demo-soporte-auto', 'Soporte de auto magnético', 'Accesorios', 100000, 36000, 15, 'ADAPTADOR', []],
]

/** Línea de venta de cada producto del catálogo demo (descripción, modelo, categoría, precio, costo). */
export const CATALOGO_VENTA = (() => {
  const mapa = {}
  for (const item of IPHONES_DEMO) {
    mapa[item.id] = { id: item.id, descripcion: item.nombre, modelo: item.atributos.modelo, categoria: 'Celulares', precio: item.precioVenta, costo: item.precioCosto, celular: true }
  }
  for (const [id, nombre, categoria, precio, costo, stock] of ACCESORIOS_DEMO) {
    mapa[id] = { id, descripcion: nombre, modelo: nombre, categoria, precio, costo, celular: false, stock }
  }
  return mapa
})()
