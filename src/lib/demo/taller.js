// Órdenes de taller de la demo (fuente única): las usan el taller, la ficha del
// cliente y el historial por etapa. Fechas relativas al momento de carga: hay
// órdenes de hace minutos, de hoy, de ayer, de la semana, del mes y de meses
// anteriores (entregadas), en todos los estados.
import { imeiDemo } from './iphones.js'

const haceDias = (dias) => new Date(Date.now() - dias * 86400000).toISOString()
const haceMin = (minutos) => new Date(Date.now() - minutos * 60000).toISOString()
const telefonoDemo = () => '0981123456'

const BASE = [
    {
      id: 'demo-os-1', serviceNumber: 'OS-#0001', customerName: 'Lucía Fernández', customerId: 'demo-cliente-lucia', customerPhone: telefonoDemo(), customerCountryCode: '+595',
      device: 'iPhone 13 · 128 GB', deviceType: 'iPhone', serial: imeiDemo(9001), serviceName: 'iPhone · Cambio de batería',
      reportedIssue: 'No carga y se apaga solo.', diagnosis: 'Batería agotada.', technicianName: 'Jorge Villalba', status: 'DIAGNOSTICO',
      pricePyg: 250000, costPyg: 120000, partsPyg: 90000, laborPyg: 20000, otherCostPyg: 10000,
      receivedAt: haceDias(3), checklist: { 'Batería': 'ok', 'Face ID': 'ok' },
      // Nació de un caso de garantía (#224): el vínculo se conserva.
      warrantyCaseId: 'demo-w-1',
    },
    {
      id: 'demo-os-2', serviceNumber: 'OS-#0002', customerName: 'Distribuidora del Este S.A.', customerId: 'demo-cliente-distribuidora', customerPhone: '0982555111', customerCountryCode: '+595',
      device: 'MacBook Air M2', deviceType: 'MacBook', serial: 'AUR-OS-0002', serviceName: 'MacBook · Limpieza interna',
      reportedIssue: 'Se calienta y hace ruido.', diagnosis: 'Ventilador con polvo.', technicianName: 'Jorge Villalba', status: 'ESPERANDO_REPUESTO',
      pricePyg: 480000, costPyg: 150000, partsPyg: 120000, laborPyg: 30000, otherCostPyg: 0,
      receivedAt: haceDias(6), checklist: { 'Teclado': 'ok', 'Puertos': 'revisar' },
    },
    {
      id: 'demo-os-3', serviceNumber: 'OS-#0003', customerName: 'Carlos Ramírez', customerId: 'demo-cliente-carlos', customerPhone: '0971222333', customerCountryCode: '+595',
      device: 'iPad 10', deviceType: 'iPad', serial: 'AUR-OS-0003', serviceName: 'iPad · Cambio de pantalla',
      reportedIssue: 'Pantalla rota.', diagnosis: 'Cambio de módulo.', technicianName: 'Jorge Villalba', status: 'LISTO',
      pricePyg: 620000, costPyg: 380000, partsPyg: 320000, laborPyg: 60000, otherCostPyg: 0,
      receivedAt: haceDias(9), checklist: { 'Pantalla': 'rota', 'Face ID': 'ok' },
    },
    {
      id: 'demo-os-4', serviceNumber: 'OS-#0004', customerName: 'Lucía Fernández', customerId: 'demo-cliente-lucia', customerPhone: telefonoDemo(), customerCountryCode: '+595',
      device: 'iPhone 15 · 256 GB', deviceType: 'iPhone', serial: imeiDemo(9004), serviceName: 'iPhone · Diagnóstico',
      reportedIssue: 'No enciende.', diagnosis: '', technicianName: 'Jorge Villalba', status: 'RECIBIDO',
      pricePyg: 0, costPyg: 0, partsPyg: 0, laborPyg: 0, otherCostPyg: 0,
      receivedAt: haceDias(1), checklist: {},
    }
]

// #451: más órdenes de taller en todos los estados y con IMEI de aspecto real.
const ORDENES_PRO = [
  ['iPhone 14 · 128 GB', 'iPhone', 'Cambio de pantalla', 'Pantalla rota por caída.', 'Módulo OLED a reemplazar.', 'LISTO', 420000, 260000, 2, 'demo-cliente-patricia', 'Patricia Duarte'],
  ['iPhone 13 · 128 GB', 'iPhone', 'Cambio de batería', 'Se descarga rápido.', 'Batería al 71% de salud.', 'LISTO', 250000, 120000, 4, 'demo-cliente-sandra', 'Sandra Báez'],
  ['iPhone 12 · 64 GB', 'iPhone', 'Cambio de batería', 'Se apaga con el frío.', 'Batería hinchada.', 'LISTO', 250000, 120000, 6, 'demo-cliente-bruno', 'Bruno Insfrán'],
  ['iPhone 15 · 128 GB', 'iPhone', 'Diagnóstico', 'No carga por cable.', 'Puerto de carga sucio.', 'LISTO', 80000, 10000, 7, 'demo-cliente-camila', 'Camila Arévalo'],
  ['iPhone 11 · 64 GB', 'iPhone', 'Cambio de pantalla', 'Táctil intermitente.', 'Flex de pantalla dañado.', 'ESPERANDO_REPUESTO', 380000, 230000, 5, 'demo-cliente-osvaldo', 'Osvaldo Rojas'],
  ['iPhone 14 Pro · 256 GB', 'iPhone', 'Reparación de cámara', 'Foto borrosa.', 'Módulo de cámara trasera.', 'DIAGNOSTICO', 690000, 430000, 3, 'demo-cliente-natalia', 'Natalia Britez'],
  ['iPhone 13 Pro · 256 GB', 'iPhone', 'Diagnóstico', 'Mojado, no enciende.', '', 'DIAGNOSTICO', 0, 0, 1, 'demo-cliente-derlis', 'Derlis Giménez'],
  ['iPhone 15 Pro · 256 GB', 'iPhone', 'Diagnóstico', 'Se reinicia solo.', '', 'RECIBIDO', 0, 0, 0, 'demo-cliente-mirta', 'Mirta Samaniego'],
].map(([device, deviceType, serviceName, reportedIssue, diagnosis, status, pricePyg, costPyg, dias, customerId, customerName], i) => ({
  id: `demo-os-p${i + 5}`, serviceNumber: `OS-#${String(i + 5).padStart(4, '0')}`, customerName, customerId, customerPhone: telefonoDemo(), customerCountryCode: '+595',
  device, deviceType, serial: imeiDemo(9100 + i), serviceName: `${deviceType} · ${serviceName}`, reportedIssue, diagnosis,
  technicianName: 'Jorge Villalba', status, pricePyg, costPyg, partsPyg: Math.round(costPyg * 0.8), laborPyg: Math.round(costPyg * 0.15), otherCostPyg: Math.round(costPyg * 0.05),
  receivedAt: haceDias(dias), checklist: {},
}))

// Historial del taller: entregadas (y una cancelada) en las últimas semanas y
// meses, más una recibida hace minutos. [equipo, tipo, servicio, falla, diagnóstico, estado, precio, costo, días desde la recepción, días desde la entrega, clienteId, cliente]
const HISTORIAL_TALLER = [
  ['iPhone 14 Plus · 128 GB', 'iPhone', 'Cambio de batería', 'Dura pocas horas.', 'Batería al 74%.', 'ENTREGADO', 250000, 120000, 11, 9, 'demo-cliente-lorena', 'Lorena Servín'],
  ['iPhone 13 · 128 GB', 'iPhone', 'Cambio de pantalla', 'Pantalla estrellada.', 'Módulo completo.', 'ENTREGADO', 420000, 260000, 17, 14, 'demo-cliente-juan', 'Juan Pereira'],
  ['iPhone 12 · 128 GB', 'iPhone', 'Cambio de batería', 'Se apaga al 30%.', 'Batería al 69%.', 'ENTREGADO', 250000, 120000, 24, 22, 'demo-cliente-ana', 'Ana Villalba'],
  ['iPhone 15 · 128 GB', 'iPhone', 'Diagnóstico', 'No carga.', 'Puerto sucio, limpieza.', 'ENTREGADO', 80000, 10000, 33, 32, 'demo-cliente-estela', 'Estela Ramírez'],
  ['iPhone 11 · 64 GB', 'iPhone', 'Cambio de pantalla', 'Táctil sin respuesta.', 'Pantalla nueva.', 'ENTREGADO', 380000, 230000, 41, 38, 'demo-cliente-gloria', 'Gloria Martínez'],
  ['iPhone 14 Pro · 256 GB', 'iPhone', 'Reparación de cámara', 'Cámara trasera borrosa.', 'Módulo de cámara.', 'ENTREGADO', 690000, 430000, 58, 54, 'demo-cliente-maria', 'María González'],
  ['iPhone 13 Pro · 256 GB', 'iPhone', 'Cambio de batería', 'Batería hinchada.', 'Batería nueva.', 'ENTREGADO', 280000, 140000, 76, 73, 'demo-cliente-hugo', 'Hugo Benítez'],
  ['iPhone 12 Pro · 128 GB', 'iPhone', 'Cambio de pantalla', 'Pantalla rota.', 'Módulo OLED.', 'ENTREGADO', 450000, 280000, 99, 95, 'demo-cliente-ricardo', 'Ricardo Amarilla'],
  ['iPhone 11 · 128 GB', 'iPhone', 'Diagnóstico', 'Mojado.', 'Daño por líquido, sin reparación.', 'CANCELADO', 0, 0, 45, 44, 'demo-cliente-osvaldo', 'Osvaldo Rojas'],
].map(([device, deviceType, serviceName, reportedIssue, diagnosis, status, pricePyg, costPyg, dias, entrega, customerId, customerName], i) => ({
  id: `demo-os-h${i + 1}`, serviceNumber: `OS-#${String(40 - i).padStart(4, '0')}`, customerName, customerId, customerPhone: telefonoDemo(), customerCountryCode: '+595',
  device, deviceType, serial: imeiDemo(9200 + i), serviceName: `${deviceType} · ${serviceName}`, reportedIssue, diagnosis,
  technicianName: 'Jorge Villalba', status, pricePyg, costPyg, partsPyg: Math.round(costPyg * 0.8), laborPyg: Math.round(costPyg * 0.15), otherCostPyg: Math.round(costPyg * 0.05),
  receivedAt: haceDias(dias), deliveredAt: haceDias(entrega), checklist: {},
}))

// Recibida hace minutos: «Hoy» y «Recién» nunca quedan vacíos.
const RECIENTES_TALLER = [{
  id: 'demo-os-r1', serviceNumber: 'OS-#0050', customerName: 'Lorena Servín', customerId: 'demo-cliente-lorena', customerPhone: telefonoDemo(), customerCountryCode: '+595',
  device: 'iPhone 14 Plus · 128 GB', deviceType: 'iPhone', serial: imeiDemo(9300), serviceName: 'iPhone · Diagnóstico', reportedIssue: 'Se reinicia al abrir la cámara.', diagnosis: '',
  technicianName: 'Jorge Villalba', status: 'RECIBIDO', pricePyg: 0, costPyg: 0, partsPyg: 0, laborPyg: 0, otherCostPyg: 0, receivedAt: haceMin(7), checklist: {},
}]

export const ORDENES_TALLER_DEMO = [...BASE, ...ORDENES_PRO, ...HISTORIAL_TALLER, ...RECIENTES_TALLER]
