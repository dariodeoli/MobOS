// Datos ficticios del modo demo para Servicio Técnico (#194). Viven en el
// navegador: la demo muestra casos en distintos estados del pipeline, catálogo
// y checklists sin llamar al API real.
import { SEED_DEMO_CLIENTES } from './demoClientes'

const KEY = 'mobos:demo-servicio'
const haceDias = (dias) => new Date(Date.now() - dias * 86400000).toISOString()
const telefonoDemo = () => SEED_DEMO_CLIENTES[0].phone

const SEED = {
  rows: [
    {
      id: 'demo-os-1', serviceNumber: 'OS-#0001', customerName: 'Lucía Fernández', customerId: 'demo-cliente-lucia', customerPhone: telefonoDemo(), customerCountryCode: '+595',
      device: 'iPhone 13 · 128 GB', deviceType: 'iPhone', serial: 'DEMO-OS-0001', serviceName: 'iPhone · Cambio de batería',
      reportedIssue: 'No carga y se apaga solo.', diagnosis: 'Batería agotada.', technicianName: 'Técnico demo', status: 'DIAGNOSTICO',
      pricePyg: 250000, costPyg: 120000, partsPyg: 90000, laborPyg: 20000, otherCostPyg: 10000,
      receivedAt: haceDias(3), checklist: { 'Batería': 'ok', 'Face ID': 'ok' },
    },
    {
      id: 'demo-os-2', serviceNumber: 'OS-#0002', customerName: 'Distribuidora del Este S.A.', customerId: 'demo-cliente-distribuidora', customerPhone: '0982555111', customerCountryCode: '+595',
      device: 'MacBook Air M2', deviceType: 'MacBook', serial: 'DEMO-OS-0002', serviceName: 'MacBook · Limpieza interna',
      reportedIssue: 'Se calienta y hace ruido.', diagnosis: 'Ventilador con polvo.', technicianName: 'Técnico demo', status: 'ESPERANDO_REPUESTO',
      pricePyg: 480000, costPyg: 150000, partsPyg: 120000, laborPyg: 30000, otherCostPyg: 0,
      receivedAt: haceDias(6), checklist: { 'Teclado': 'ok', 'Puertos': 'revisar' },
    },
    {
      id: 'demo-os-3', serviceNumber: 'OS-#0003', customerName: 'Carlos Ramírez', customerId: 'demo-cliente-carlos', customerPhone: '0971222333', customerCountryCode: '+595',
      device: 'iPad 10', deviceType: 'iPad', serial: 'DEMO-OS-0003', serviceName: 'iPad · Cambio de pantalla',
      reportedIssue: 'Pantalla rota.', diagnosis: 'Cambio de módulo.', technicianName: 'Técnico demo', status: 'LISTO',
      pricePyg: 620000, costPyg: 380000, partsPyg: 320000, laborPyg: 60000, otherCostPyg: 0,
      receivedAt: haceDias(9), checklist: { 'Pantalla': 'rota', 'Face ID': 'ok' },
    },
    {
      id: 'demo-os-4', serviceNumber: 'OS-#0004', customerName: 'Lucía Fernández', customerId: 'demo-cliente-lucia', customerPhone: telefonoDemo(), customerCountryCode: '+595',
      device: 'iPhone 15 · 256 GB', deviceType: 'iPhone', serial: 'DEMO-OS-0004', serviceName: 'iPhone · Diagnóstico',
      reportedIssue: 'No enciende.', diagnosis: '', technicianName: 'Técnico demo', status: 'RECIBIDO',
      pricePyg: 0, costPyg: 0, partsPyg: 0, laborPyg: 0, otherCostPyg: 0,
      receivedAt: haceDias(1), checklist: {},
    },
  ],
  servicios: [
    { id: 'demo-serv-1', name: 'Cambio de batería', deviceType: 'iPhone', suggestedPricePyg: 250000, isActive: true },
    { id: 'demo-serv-2', name: 'Cambio de pantalla', deviceType: 'iPhone', suggestedPricePyg: 450000, isActive: true },
    { id: 'demo-serv-3', name: 'Limpieza interna', deviceType: 'Otros', suggestedPricePyg: 80000, isActive: true },
  ],
  checklists: {},
}

export function getDemoServicio() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (stored && typeof stored === 'object') return { ...SEED, ...stored }
  } catch { /* datos corruptos: se vuelve al seed */ }
  return SEED
}

export function saveDemoServicio(parcial) {
  const actual = getDemoServicio()
  const siguiente = { ...actual, ...parcial }
  localStorage.setItem(KEY, JSON.stringify(siguiente))
  return siguiente
}

export function siguienteNumeroDemo(rows) {
  const numeros = rows.map((row) => Number(String(row.serviceNumber || '').replace(/\D/g, '')) || 0)
  return `OS-#${String(Math.max(0, ...numeros) + 1).padStart(4, '0')}`
}
