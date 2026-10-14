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
