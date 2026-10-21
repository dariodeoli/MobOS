// Libro de gastos y publicidad de la demo: cuatro meses de historia ficticia,
// siempre relativa a «hoy» (Paraguay) para que nunca envejezca. Los ids llevan
// el prefijo `demo-gasto-` / `demo-ad-` y se regeneran en cada arranque, así lo
// que la persona cargue a mano en la pestaña no se pisa.
import { diaDemo, instanteDemo } from './reloj.js'

export const PREFIJO_GASTO_DEMO = 'demo-gasto-'
export const PREFIJO_AD_DEMO = 'demo-ad-'

// [días atrás, concepto, categoría, monto Gs, contraparte, tipo, estado]
const GASTOS = [
  [0, 'Limpieza y librería del local', 'Insumos', 150000, 'Librería Central', 'EXPENSE', 'CLEARED'],
  [1, 'Flete AEX Miami → Asunción', 'Logística', 640000, 'AEX Paraguay', 'EXPENSE', 'CLEARED'],
  [2, 'Cheque a Importadora Tecnológica S.A.', 'Proveedores', 5200000, 'Importadora Tecnológica S.A.', 'CHEQUE', 'PENDING'],
  [3, 'Fundas y packaging de la semana', 'Insumos', 380000, 'Plásticos del Sur', 'EXPENSE', 'CLEARED'],
  [4, 'Reparación del aire acondicionado', 'Mantenimiento', 450000, 'Frío Lambaré', 'EXPENSE', 'CLEARED'],
  [6, 'Almuerzo del equipo (cierre de semana)', 'Otros', 210000, 'Equipo', 'EXPENSE', 'CLEARED'],
  [9, 'Adelanto a Distribuidora del Este (lote USA)', 'Proveedores', 3000000, 'Distribuidora del Este', 'SUPPLIER_ADVANCE', 'CLEARED'],
  [12, 'ANDE · luz del local', 'Servicios', 860000, 'ANDE', 'EXPENSE', 'CLEARED'],
  [12, 'Tigo · internet y telefonía', 'Servicios', 420000, 'Tigo', 'EXPENSE', 'CLEARED'],
  [15, 'Cheque a proveedor de repuestos', 'Proveedores', 1750000, 'Repuestos Apple PY', 'CHEQUE', 'PENDING'],
  [18, 'Sueldos del equipo (quincena)', 'Personal', 6200000, 'Equipo', 'EXPENSE', 'CLEARED'],
  [20, 'Alquiler del local', 'Alquiler', 4500000, 'Inmobiliaria Central', 'EXPENSE', 'CLEARED'],
  [24, 'Contador · honorarios del mes', 'Servicios', 900000, 'Estudio Rojas & Asoc.', 'EXPENSE', 'CLEARED'],
  [30, 'Sueldos del equipo (fin de mes)', 'Personal', 6200000, 'Equipo', 'EXPENSE', 'CLEARED'],
  [33, 'Cheque a Distribuidora Luque (cobrado)', 'Proveedores', 2400000, 'Distribuidora Luque S.A.', 'CHEQUE', 'CLEARED'],
  [36, 'ANDE · luz del local', 'Servicios', 810000, 'ANDE', 'EXPENSE', 'CLEARED'],
  [41, 'Seguro del local', 'Seguros', 780000, 'Aseguradora del Sol', 'EXPENSE', 'CLEARED'],
  [45, 'Alquiler del local', 'Alquiler', 4500000, 'Inmobiliaria Central', 'EXPENSE', 'CLEARED'],
  [52, 'Sueldos del equipo (quincena)', 'Personal', 6200000, 'Equipo', 'EXPENSE', 'CLEARED'],
  [60, 'Sueldos del equipo (fin de mes)', 'Personal', 6200000, 'Equipo', 'EXPENSE', 'CLEARED'],
  [66, 'Alquiler del local', 'Alquiler', 4500000, 'Inmobiliaria Central', 'EXPENSE', 'CLEARED'],
  [72, 'Compra de mobiliario de exhibición', 'Equipamiento', 2300000, 'Muebles Asunción', 'EXPENSE', 'CLEARED'],
  [80, 'Retiro del dueño', 'Retiros', 5000000, 'Hernán Acosta', 'OWNER_WITHDRAWAL', 'CLEARED'],
  [88, 'Sueldos del equipo (quincena)', 'Personal', 6200000, 'Equipo', 'EXPENSE', 'CLEARED'],
  [96, 'Alquiler del local', 'Alquiler', 4500000, 'Inmobiliaria Central', 'EXPENSE', 'CLEARED'],
  [110, 'Capacitación del equipo en taller', 'Personal', 650000, 'Academia Mobile PY', 'EXPENSE', 'CLEARED'],
]

// [días atrás, plataforma, monto Gs, nota]
const ADS = [
  [0, 'Meta Ads', 300000, 'Promo del día · iPhone 15'],
  [2, 'Meta Ads', 450000, 'Campaña iPhone 15 · semana'],
  [5, 'Instagram', 300000, 'Reels de accesorios'],
  [9, 'Meta Ads', 520000, 'Retargeting a clientes inactivos'],
  [14, 'Google Ads', 380000, 'Búsqueda «iPhone Asunción»'],
  [19, 'Meta Ads', 450000, 'Campaña iPhone 15 · semana'],
  [27, 'TikTok', 250000, 'Video de unboxing'],
  [33, 'Meta Ads', 600000, 'Lanzamiento Black Friday'],
  [41, 'Facebook', 280000, 'Publicaciones patrocinadas'],
  [49, 'Google Ads', 420000, 'Búsqueda «reparación de celulares»'],
  [58, 'Meta Ads', 480000, 'Campaña de recompra'],
  [71, 'Instagram', 320000, 'Historias con promo'],
  [84, 'Meta Ads', 510000, 'Campaña iPhone 14'],
  [97, 'TikTok', 230000, 'Contenido del taller'],
  [108, 'Meta Ads', 440000, 'Campaña de apertura'],
]

export function gastosDemo(ahora = new Date()) {
  return GASTOS.map(([dias, descripcion, categoria, monto, contraparte, kind, status], indice) => ({
    id: `${PREFIJO_GASTO_DEMO}${String(indice + 1).padStart(2, '0')}`,
    creadoEn: instanteDemo(dias, 10, 15, ahora),
    fecha: diaDemo(dias, ahora),
    motivo: descripcion,
    description: descripcion,
    categoria,
    category: categoria,
    monto,
    originalAmount: monto,
    amountPyg: monto,
    currency: 'PYG',
    counterparty: contraparte,
    kind,
    status,
  }))
}

export function adsDemo(ahora = new Date()) {
  return ADS.map(([dias, plataforma, monto, nota], indice) => ({
    id: `${PREFIJO_AD_DEMO}${String(indice + 1).padStart(2, '0')}`,
    creadoEn: instanteDemo(dias, 9, 0, ahora),
    fecha: diaDemo(dias, ahora),
    plataforma,
    monto,
    nota,
  }))
}
