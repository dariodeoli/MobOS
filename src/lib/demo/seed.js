import { APP_NAME } from '@/lib/brand'

// ── Defaults ────────────────────────────────────────────────────────
export function prod(nombre, categoria) {
  return {
    id: nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    nombre,
    categoria,
    precioVenta: 0,
    precioMayorista: 0,
    precioCosto: 0,
    comision: 0,
    stock: 0,
    activo: true,
  }
}

export const PRODUCTOS_DEFAULT = [
  prod('Skin Pitón Blanco', 'Skins'),
  prod('Skin Pitón Negro', 'Skins'),
  prod('Skin Pitón Azul', 'Skins'),
  prod('Skin Transparente', 'Skins'),
  prod('Skin Holográfica', 'Skins'),
  prod('Protector 17 Pro Max Azul', 'Protectores'),
  prod('Protector 17 Pro Max Naranja', 'Protectores'),
  prod('Protector 17 Pro Max Silver', 'Protectores'),
  prod('Protector 17 Pro Azul', 'Protectores'),
  prod('Protector 17 Pro Naranja', 'Protectores'),
  prod('Protector 17 Pro Silver', 'Protectores'),
  prod('Protector de Cámara Samsung', 'Protectores'),
  prod('Protector de Cámara iPhone', 'Protectores'),
  prod('Cargador Portátil', 'Accesorios'),
  prod('Cargador MagSafe Portátil', 'Accesorios'),
  prod('Strap', 'Accesorios'),
  prod('Tarjetero MagSafe', 'Accesorios'),
]

// Sin vendedores de ejemplo: el dueño carga los nombres reales desde el
// formulario de venta ("➕ Agregar vendedor") o desde el Centro de Control.
export const VENDEDORES_DEFAULT = []

export const FRASES_DEFAULT = [
  'Cada venta te acerca a tu meta. ¡Vamos!',
  'El éxito es la suma de pequeños esfuerzos repetidos día a día.',
  'No cuentes los días, haz que los días cuenten.',
  'Tu actitud determina tu dirección. ¡Hoy es un gran día!',
  'Los clientes compran confianza antes que productos. Sonreí.',
  'La constancia vence al talento. Seguí firme.',
  'Hoy es el mejor día para superar tu marca de ayer.',
  'Vendé con pasión, atendé con el corazón.',
  'Las metas grandes se logran con acciones pequeñas y constantes.',
  'Creé en vos: ya hiciste lo difícil, ahora cerrá la venta.',
]

export const CONFIG_DEFAULT = {
  clavePanel: 'fono2024', // el propietario la cambia en el Centro de Control
  nombreTienda: APP_NAME,
}

export const TRADEIN_DEFAULT = {
  exchangeRate: 7300,
  exchangeMarket: 0, // valor de la casa de cambio antes del ajuste (lo setea la función automática)
  exchangeAdjust: 0, // ₲ que se suman al valor de mercado (markup propio)
  exchangeSource: 'Cambios Chaco',
  exchangeDate: new Date().toISOString().split('T')[0],
  exchangeUpdatedAt: null, // ISO de la última actualización automática
  conditionMultipliers: {
    excelente: { label: 'Excelente', desc: 'Sin rayones, impecable', value: 0.85 },
    bueno: { label: 'Bueno', desc: 'Pequeños rayones, bien conservado', value: 0.7 },
    regular: { label: 'Regular', desc: 'Rayones visibles, desgaste notable', value: 0.55 },
    danado: { label: 'Con daños', desc: 'Pantalla rota, golpes o daños visibles', value: 0.35 },
  },
  batteryMultipliers: {
    '90-100': { label: '90% – 100%', desc: 'Excelente salud de batería', value: 1.0 },
    '80-89': { label: '80% – 89%', desc: 'Buen estado de batería', value: 0.95 },
    '70-79': { label: '70% – 79%', desc: 'Batería con desgaste', value: 0.9 },
    menos70: { label: 'Menos del 70%', desc: 'Batería muy desgastada', value: 0.8 },
  },
  repairMultipliers: {
    pantalla: {
      label: 'Pantalla reemplazada por terceros',
      desc: 'Display cambiado por servicio no oficial',
      value: 0.88,
    },
    camara: {
      label: 'Cámara reemplazada por terceros',
      desc: 'Módulo de cámara cambiado por terceros',
      value: 0.92,
    },
    bateria: {
      label: 'Batería reemplazada por terceros',
      desc: 'Batería cambiada por servicio no oficial',
      value: 0.95,
    },
  },
  devices: [
    {
      model: 'iPhone 17 Pro Max',
      capacities: ['256GB', '512GB', '1TB'],
      prices: { '256GB': 850, '512GB': 950, '1TB': 1050 },
    },
    {
      model: 'iPhone 17 Pro',
      capacities: ['256GB', '512GB', '1TB'],
      prices: { '256GB': 750, '512GB': 850, '1TB': 950 },
    },
    { model: 'iPhone 17', capacities: ['256GB', '512GB'], prices: { '256GB': 520, '512GB': 640 } },
    {
      model: 'iPhone 16 Pro Max',
      capacities: ['256GB', '512GB', '1TB'],
      prices: { '256GB': 950, '512GB': 1050, '1TB': 1150 },
    },
    {
      model: 'iPhone 16 Pro',
      capacities: ['128GB', '256GB', '512GB', '1TB'],
      prices: { '128GB': 850, '256GB': 900, '512GB': 980, '1TB': 1080 },
    },
    {
      model: 'iPhone 16 Plus',
      capacities: ['128GB', '256GB', '512GB'],
      prices: { '128GB': 700, '256GB': 750, '512GB': 820 },
    },
    {
      model: 'iPhone 16',
      capacities: ['128GB', '256GB', '512GB'],
      prices: { '128GB': 620, '256GB': 670, '512GB': 730 },
    },
    {
      model: 'iPhone 15 Pro Max',
      capacities: ['256GB', '512GB', '1TB'],
      prices: { '256GB': 800, '512GB': 880, '1TB': 960 },
    },
    {
      model: 'iPhone 15 Pro',
      capacities: ['128GB', '256GB', '512GB', '1TB'],
      prices: { '128GB': 700, '256GB': 750, '512GB': 820, '1TB': 900 },
    },
    {
      model: 'iPhone 15 Plus',
      capacities: ['128GB', '256GB', '512GB'],
      prices: { '128GB': 580, '256GB': 630, '512GB': 700 },
    },
    {
      model: 'iPhone 15',
      capacities: ['128GB', '256GB', '512GB'],
      prices: { '128GB': 520, '256GB': 570, '512GB': 630 },
    },
    {
      model: 'iPhone 14 Pro Max',
      capacities: ['128GB', '256GB', '512GB', '1TB'],
      prices: { '128GB': 650, '256GB': 700, '512GB': 770, '1TB': 850 },
    },
    {
      model: 'iPhone 14 Pro',
      capacities: ['128GB', '256GB', '512GB', '1TB'],
      prices: { '128GB': 570, '256GB': 620, '512GB': 680, '1TB': 760 },
    },
    {
      model: 'iPhone 14',
      capacities: ['128GB', '256GB', '512GB'],
      prices: { '128GB': 420, '256GB': 460, '512GB': 510 },
    },
    {
      model: 'iPhone 13 Pro Max',
      capacities: ['128GB', '256GB', '512GB', '1TB'],
      prices: { '128GB': 520, '256GB': 570, '512GB': 630, '1TB': 710 },
    },
    {
      model: 'iPhone 13 Pro',
      capacities: ['128GB', '256GB', '512GB', '1TB'],
      prices: { '128GB': 450, '256GB': 490, '512GB': 540, '1TB': 620 },
    },
    {
      model: 'iPhone 13',
      capacities: ['128GB', '256GB', '512GB'],
      prices: { '128GB': 360, '256GB': 390, '512GB': 440 },
    },
    {
      model: 'iPhone 12 Pro Max',
      capacities: ['128GB', '256GB', '512GB'],
      prices: { '128GB': 380, '256GB': 420, '512GB': 470 },
    },
    {
      model: 'iPhone 12 Pro',
      capacities: ['128GB', '256GB', '512GB'],
      prices: { '128GB': 330, '256GB': 360, '512GB': 410 },
    },
    {
      model: 'iPhone 12',
      capacities: ['64GB', '128GB', '256GB'],
      prices: { '64GB': 250, '128GB': 280, '256GB': 320 },
    },
    {
      model: 'iPhone 11 Pro Max',
      capacities: ['64GB', '256GB', '512GB'],
      prices: { '64GB': 280, '256GB': 320, '512GB': 360 },
    },
    {
      model: 'iPhone 11 Pro',
      capacities: ['64GB', '256GB', '512GB'],
      prices: { '64GB': 240, '256GB': 270, '512GB': 310 },
    },
    {
      model: 'iPhone 11',
      capacities: ['64GB', '128GB', '256GB'],
      prices: { '64GB': 180, '128GB': 210, '256GB': 240 },
    },
  ],
}
