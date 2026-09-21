import { leerDemo, guardarDemo } from './demoStorage.js'
const KEY = 'mobos:demo-warranties'
const haceDias = (dias) => new Date(Date.now() - dias * 86400000).toISOString()
// Casos de demo (#194) con clientes reales de la demo (#221/#224): uno ya pasó
// al taller (conserva el vínculo con su orden) y el otro espera conversión.
const seed = [
  { id: 'demo-w-1', customerId: 'demo-cliente-lucia', customerName: 'Lucía Fernández', serial: 'DEMO-OS-0001', description: 'iPhone 13 · 128 GB: ingresa por la batería cambiada.', status: 'DIAGNOSIS', responsibleName: 'Técnico demo', serviceOrderId: 'demo-os-1', serviceOrderNumber: 'OS-#0001', createdAt: haceDias(2), updatedAt: haceDias(1) },
  { id: 'demo-w-2', customerId: 'demo-cliente-distribuidora', customerName: 'Distribuidora del Este S.A.', serial: 'DEMO-W-0002', description: 'MacBook Air M2: limpieza y ventilador con cobertura.', status: 'RECEIVED', responsibleName: 'Técnico demo', createdAt: haceDias(4), updatedAt: haceDias(4) },
]
export function getDemoWarranties() { try { const stored = JSON.parse(leerDemo(KEY) || 'null'); if (Array.isArray(stored)) return stored } catch {} return seed }
export function saveDemoWarranties(items) { guardarDemo(KEY, JSON.stringify(items)); return items }
