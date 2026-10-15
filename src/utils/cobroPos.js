// Reglas de presentación del cobro del POS sin JSX (testeables).

// Solo Delivery y Encomienda cobran envío: con cualquier otro tipo el monto
// guardado (carrito restaurado, tipo cambiado) no suma al total.
export const entregaCobraEnvio = (entrega) => entrega === 'Delivery' || entrega === 'Encomienda'

export const montoEnvioEfectivo = (entrega, monto) => (entregaCobraEnvio(entrega) ? Math.max(0, Number(monto) || 0) : 0)

// «Paga al recibir» solo oculta los pagos cuando no hay ninguno cargado: un pago
// que entra por otro camino (canje borrador, venta recuperada) nunca queda oculto.
export const pagaAlRecibirVigente = (activo, pagos) => Boolean(activo) && (pagos || []).length === 0

// Encomienda (#399): empresa, sucursal de destino y dirección guardada del
// cliente. Solo viajan con «Envío por encomienda»; la dirección solo si es una
// ficha ya guardada (tiene id) y pertenece al cliente elegido.
export const datosEncomienda = (entrega, f = {}, direcciones = []) => {
  if (entrega !== 'Encomienda') return {}
  const empresa = String(f.encEmpresa || '').trim()
  const sucursal = String(f.encSucursal || '').trim()
  const direccion = (direcciones || []).find(d => d?.id && d.id === f.encDireccionId)
  return {
    ...(empresa ? { shippingCarrier: empresa } : {}),
    ...(sucursal ? { shippingBranch: sucursal } : {}),
    ...(direccion ? { shippingAddressId: direccion.id } : {}),
  }
}

// Aviso del POS para un cliente bloqueado (#399): el crédito se rechaza en el
// servidor; el contado se permite pero se advierte.
export const avisoClienteBloqueado = (cliente) => (cliente?.blocked
  ? `Cliente bloqueado${String(cliente.blockedReason || '').trim() ? `: ${String(cliente.blockedReason).trim()}` : ''}`
  : '')

// Empresas de encomienda usadas hace poco, para sugerirlas en el combobox.
const CLAVE_EMPRESAS = 'mobos:encomienda-empresas'
export const empresasRecientes = () => {
  try {
    const lista = JSON.parse(globalThis.localStorage?.getItem(CLAVE_EMPRESAS) || '[]')
    return Array.isArray(lista) ? lista.filter(x => typeof x === 'string' && x.trim()).slice(0, 8) : []
  } catch { return [] }
}
export const recordarEmpresa = (empresa) => {
  const nombre = String(empresa || '').trim()
  if (!nombre) return
  try {
    const resto = empresasRecientes().filter(x => x.toLowerCase() !== nombre.toLowerCase())
    globalThis.localStorage?.setItem(CLAVE_EMPRESAS, JSON.stringify([nombre, ...resto].slice(0, 8)))
  } catch { /* sin almacenamiento: la sugerencia es solo comodidad */ }
}

// Delivery propio (#461): se pide la dirección de entrega y el repartidor (o
// «asignar después»). La dirección viaja en las indicaciones de entrega del
// pedido; el repartidor, como asignación del pedido (o, en la demo, como texto).
export const direccionDeEntrega = (f = {}, direcciones = []) => {
  const guardada = (direcciones || []).find(d => d?.id && d.id === f.entregaDireccionId)
  if (guardada) return [guardada.address, guardada.city].filter(Boolean).join(', ')
  return String(f.entregaDireccion || '').trim()
}

export const notasDeEntrega = (entrega, f = {}, direcciones = [], repartidor = null) => {
  const partes = []
  const observacion = String(f.observacion || '').trim()
  if (observacion) partes.push(observacion)
  if (entrega === 'Delivery') {
    const direccion = direccionDeEntrega(f, direcciones)
    if (direccion) partes.push(`Entregar en: ${direccion}`)
    if (repartidor?.name) partes.push(`Repartidor: ${repartidor.name}`)
  }
  return partes.join(' · ')
}
