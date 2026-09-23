// Informe de dispositivo en modo demo (#240 ítem 3/#194): arma el payload del
// informe desde los datos del navegador — los pedidos demo (seriales de los
// equipos vendidos) y las unidades del inventario demo. Nada sale del navegador.
import { SEED_DEMO_CLIENTES, clientesDemoGuardados, registrarVistoInformeDemo } from './demoClientes.js'
import { listDemoUnits } from './demoInventory.js'
import { consultasDemoImei } from './demoImei.js'
import { INSPECCION_ITEMS, locksDeVerificacion, resumenInspection } from './phonecheck.js'
import { ESTADO_GARANTIA } from './estadosPedido.js'

const enmascarar = (valor) => {
  const texto = String(valor || '').trim()
  if (texto.length <= 6) return texto
  return `${texto.slice(0, 4)}…${texto.slice(-3)}`
}

const CONDICION = { NEW: 'Nuevo', USED: 'Seminuevo', REFURBISHED: 'Reacondicionado' }
const TIENDA = 'Aurora Móviles'
const SUCURSAL = 'Casa Central'

const mismoSerial = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()

// Checklist público del demo (#240): mismo contrato que el backend — ítems
// marcados con su rótulo, resumen de conformes y notas solo de lo no-OK.
const ETIQUETAS_ITEMS = Object.fromEntries(INSPECCION_ITEMS.map((item) => [item.clave, item.label]))
const CONFORMES = ['ok', 'na']
function checklistDemo(inspection) {
  const items = INSPECCION_ITEMS
    .map((item) => ({ clave: item.clave, estado: inspection?.items?.[item.clave]?.estado || '', nota: inspection?.items?.[item.clave]?.nota || '' }))
    .filter((item) => item.estado)
  if (!items.length) return null
  return {
    puntaje: resumenInspection(inspection).puntaje ?? null,
    aprobados: items.filter((item) => CONFORMES.includes(item.estado)).length,
    evaluados: items.length,
    items: items.map((item) => ({ label: ETIQUETAS_ITEMS[item.clave] || item.clave, estado: item.estado, nota: CONFORMES.includes(item.estado) ? '' : item.nota })),
  }
}

/** Pedido demo que vendió ese serial (seeds + clientes creados en la pestaña). */
export function pedidoDemoDelSerial(serial) {
  const clientes = [...SEED_DEMO_CLIENTES, ...clientesDemoGuardados()]
  for (const cliente of clientes) {
    for (const pedido of cliente.demoProfile?.orders || []) {
      const item = (pedido.items || []).find((linea) => (linea.serials || []).some((valor) => mismoSerial(valor, serial)))
      if (item) return { cliente, pedido, item }
    }
  }
  return null
}

export function demoInformePayload(serial) {
  if (!serial) return null
  const venta = pedidoDemoDelSerial(serial)
  const unidad = listDemoUnits(serial).find((fila) => mismoSerial(fila.serial, serial)) || null
  if (!venta && !unidad) return null
  const modelo = venta?.item?.model || venta?.item?.description || unidad?.product?.nombre || unidad?.product?.name || 'Equipo'
  const condicion = CONDICION[unidad?.condition] || (venta ? 'Seminuevo' : '—')
  const garantia = venta?.cliente?.demoProfile?.warranties?.find((item) => mismoSerial(item.serial, serial)) || null
  const vence = garantia?.expiresAt || null
  const inspeccion = unidad?.inspection || null
  const grado = inspeccion ? resumenInspection(inspeccion).grado : null
  // Última consulta IMEI del demo: alimenta la tarjeta de controles del informe.
  const consulta = consultasDemoImei(serial)[0] || null
  return {
    store: { name: TIENDA, branch: SUCURSAL },
    unit: {
      model: modelo,
      serialMasked: enmascarar(serial),
      imeiMasked: enmascarar(serial),
      condition: condicion,
      batteryHealth: unidad?.batteryHealth ?? null,
      verifiedAt: unidad?.lastVerifiedAt || null,
      verifiedBy: unidad?.lastVerifiedBy?.name || null,
      verifiedByCode: unidad?.verifiedByCode || null,
      verificationCount: unidad?.verificationCount || 0,
      grade: grado,
      checklist: checklistDemo(inspeccion),
      // #240: repuestos no-OEM de la inspección (sin datos personales).
      repuestosNoOem: inspeccion?.repuestosNoOem || '',
      repuestosNoOemNota: inspeccion?.repuestosNoOemNota || '',
    },
    sale: venta ? { orderNumber: venta.pedido.orderNumber, date: venta.pedido.createdAt, branch: SUCURSAL } : null,
    warranty: garantia ? { status: ESTADO_GARANTIA[garantia.status] || garantia.status, description: garantia.description || '', expiresAt: vence } : null,
    check: consulta ? { provider: consulta.provider, status: consulta.status, date: consulta.requestedAt } : null,
    // Mismo criterio que el backend: solo los locks informados con valor.
    controles: consulta ? locksDeVerificacion({ normalized: consulta.normalized }).filter((control) => control.valor && control.valor !== '—') : [],
    disclaimer: 'Informe de demostración: datos ficticios del navegador. No es un certificado oficial ni reemplaza la garantía del fabricante.',
    demo: true,
  }
}

/**
 * Apertura del informe demo (#240 ítem 3): marca «visto» en la fila del serial
 * con el mismo criterio que el API público — solo equipos vendidos o ya
 * compartidos desde la ficha; nada sale del navegador.
 */
export function marcarInformeVistoDemo(serial) {
  const venta = pedidoDemoDelSerial(serial)
  const unidad = listDemoUnits(serial).find((fila) => mismoSerial(fila.serial, serial)) || null
  if (!venta && !unidad) return null
  return registrarVistoInformeDemo(venta?.cliente?.id || null, serial)
}
