import { leerDemo, guardarDemo } from './demoStorage.js'
const KEY = 'mobos:demo-warranties'
const haceDias = (dias) => new Date(Date.now() - dias * 86400000).toISOString()
const enDias = (dias) => new Date(Date.now() + dias * 86400000).toISOString()
// Casos de demo (#194) con clientes reales de la demo (#221/#224): uno ya pasó
// al taller (conserva el vínculo con su orden) y el otro espera conversión.
const seed = [
  { id: 'demo-w-1', customerId: 'demo-cliente-lucia', customerName: 'Lucía Fernández', serial: 'DEMO-OS-0001', description: 'iPhone 13 · 128 GB: ingresa por la batería cambiada.', status: 'DIAGNOSIS', responsibleName: 'Técnico demo', serviceOrderId: 'demo-os-1', serviceOrderNumber: 'OS-#0001', createdAt: haceDias(2), updatedAt: haceDias(1) },
  { id: 'demo-w-2', customerId: 'demo-cliente-distribuidora', customerName: 'Distribuidora del Este S.A.', serial: 'DEMO-W-0002', description: 'MacBook Air M2: limpieza y ventilador con cobertura.', status: 'RECEIVED', responsibleName: 'Técnico demo', createdAt: haceDias(4), updatedAt: haceDias(4), expiresAt: enDias(120) },
  { id: 'demo-w-3', customerId: 'demo-cliente-maria', customerName: 'María González', serial: '353911101079227', description: 'iPhone 15 Pro 256GB: batería con autonomía baja, se cambia por garantía.', status: 'READY', responsibleName: 'Jorge Villalba', serviceOrderNumber: 'OS-#0006', createdAt: haceDias(6), updatedAt: haceDias(1), expiresAt: enDias(5) },
  { id: 'demo-w-4', customerId: 'demo-cliente-ana', customerName: 'Ana Villalba', serial: '357209101158414', description: 'iPhone 14 256GB: no carga por cable; se reemplazó el puerto de carga.', status: 'DELIVERED', responsibleName: 'Jorge Villalba', createdAt: haceDias(21), updatedAt: haceDias(15), expiresAt: enDias(210), resolution: 'Puerto de carga reemplazado sin costo.' },
  { id: 'demo-w-5', customerId: 'demo-cliente-ramiro', customerName: 'Ramiro Cáceres', serial: '358491101237609', description: 'iPhone 13 Pro Max: pantalla con línea verde.', status: 'DIAGNOSIS', responsibleName: 'Jorge Villalba', createdAt: haceDias(3), updatedAt: haceDias(2), expiresAt: enDias(6) },
  { id: 'demo-w-6', customerId: 'demo-cliente-gloria', customerName: 'Gloria Martínez', serial: '352837111395983', description: 'AirPods Pro 2: auricular izquierdo sin sonido; cambio directo de fábrica.', status: 'DELIVERED', responsibleName: 'Diego López', createdAt: haceDias(40), updatedAt: haceDias(33), expiresAt: enDias(95), resolution: 'Se entregó unidad nueva.' },
  { id: 'demo-w-7', customerId: 'demo-cliente-estela', customerName: 'Estela Ramírez', serial: '356623111475173', description: 'iPhone 15 256GB Rosa: cámara trasera con manchas.', status: 'RECEIVED', responsibleName: 'Jorge Villalba', createdAt: haceDias(1), updatedAt: haceDias(1), expiresAt: enDias(340) },
]
export function getDemoWarranties() { try { const stored = JSON.parse(leerDemo(KEY) || 'null'); if (Array.isArray(stored)) return stored } catch {} return seed }
export function saveDemoWarranties(items) { guardarDemo(KEY, JSON.stringify(items)); return items }
