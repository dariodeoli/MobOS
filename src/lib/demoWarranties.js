const KEY = 'mobos:demo-warranties'
const seed = [
  { id: 'demo-w-1', customerName: 'Cliente demo', serial: 'DEMO-001', description: 'Equipo de demostración: revisar carga.', status: 'RECEIVED', responsibleName: 'Equipo demo', createdAt: '2026-09-11T10:00:00.000Z', updatedAt: '2026-09-11T10:00:00.000Z' },
  { id: 'demo-w-2', customerName: 'Cliente demo', serial: 'DEMO-002', description: 'Accesorio demo en diagnóstico.', status: 'DIAGNOSIS', responsibleName: 'Equipo demo', createdAt: '2026-09-10T10:00:00.000Z', updatedAt: '2026-09-10T10:00:00.000Z' },
]
export function getDemoWarranties() { try { const stored = JSON.parse(localStorage.getItem(KEY) || 'null'); if (Array.isArray(stored)) return stored } catch {} return seed }
export function saveDemoWarranties(items) { localStorage.setItem(KEY, JSON.stringify(items)); return items }
