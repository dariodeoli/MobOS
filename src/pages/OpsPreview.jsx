import TableroOps from '@/components/ops/TableroOps'

// Mock F3 del rediseño «device ops» (#241): tablero de operaciones con el ADN
// visual de la propuesta, con datos FICTICIOS. Es la vista previa para aprobar
// el piloto: no está en el menú, no llama al API y solo se abre con
// /ops-preview en desarrollo (o VITE_OPS_PREVIEW=1). La versión con datos
// reales vive en `pages/Ops.jsx` y se activa con VITE_OPS_V2=1.

const KPIS = [
  { clave: 'ingresos', label: 'Ingresos hoy', valor: 'Gs 14.280.000', detalle: '+34% vs ayer', tono: 'ok' },
  { clave: 'pedidos', label: 'Pedidos', valor: '3', detalle: '2 pagados · 1 pendiente', tono: 'info' },
  { clave: 'taller', label: 'En taller', valor: '5', detalle: '2 por verificar', tono: 'warn' },
  { clave: 'certificados', label: 'Certificados', valor: '18', detalle: 'esta semana', tono: 'fono' },
]

const EQUIPOS = [
  { id: 'a', modelo: 'iPhone 15 Pro · 256 GB', serial: '35 123456 789012 3', estado: 'Certificado', tono: 'ok', grado: 'A', bateria: 92, ubicacion: null },
  { id: 'b', modelo: 'iPhone 14 · 128 GB', serial: '35 998877 665544 1', estado: 'Por verificar', tono: 'slate', grado: null, bateria: null, ubicacion: null },
  { id: 'c', modelo: 'Samsung S24 · 256 GB', serial: '35 445566 778899 0', estado: 'Diagnóstico', tono: 'warn', grado: 'B', bateria: 81, ubicacion: null },
  { id: 'd', modelo: 'iPhone 13 · 128 GB', serial: '35 112233 445566 7', estado: 'Listo', tono: 'ok', grado: 'A', bateria: 88, ubicacion: null },
]

const COLAS = [
  { estado: 'upnext', titulo: 'Up next', tono: 'info', items: ['iPhone 15 Pro · verificación física', 'Samsung S24 · diagnóstico de batería'].map((texto, i) => ({ id: `u${i}`, texto })) },
  { estado: 'queued', titulo: 'Queued', tono: 'slate', items: ['iPhone 14 · limpieza y datos', 'iPad 10 · cambio de pantalla'].map((texto, i) => ({ id: `q${i}`, texto })) },
  { estado: 'ready', titulo: 'Ready', tono: 'ok', items: ['iPhone 13 · etiqueta impresa', 'iPhone 12 · pendiente de retiro'].map((texto, i) => ({ id: `r${i}`, texto })) },
]

export default function OpsPreview() {
  return <TableroOps modo="preview" kpis={KPIS} equipos={EQUIPOS} colas={COLAS} />
}
