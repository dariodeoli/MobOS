// #422 · Formato visible del ID de pedido. El backend numera con MOB cuando la
// empresa no configuró prefijo (`backend/lib/order-number.ts`): la pantalla
// muestra y edita el prefijo efectivo, no un campo vacío que después no se
// puede guardar.
export function prefijoEfectivo(valor) {
  const texto = String(valor || '').toUpperCase()
  return /^[A-Z]{2,3}$/.test(texto) ? texto : 'MOB'
}

// Un número como lo muestra el sistema: PREFIJO-#0001 (mínimo 4 dígitos).
export function idPedido(prefijo, numero) {
  return `${prefijoEfectivo(prefijo)}-#${String(Math.max(1, Number(numero) || 1)).padStart(4, '0')}`
}

// Vista previa en vivo: «PED-#1001, PED-#1002, PED-#1003…».
export function vistaPreviaNumeros(prefijo, inicio, cantidad = 3) {
  const base = Math.max(1, Number(inicio) || 1)
  return `${Array.from({ length: cantidad }, (_, i) => idPedido(prefijo, base + i)).join(', ')}…`
}
