// Clave de comparación del modelo: sin mayúsculas, sin acentos y con espacios
// simples. Debe coincidir con la `modelKey` que guarda DeviceValuation.
export const normalizarModelo = value => String(value ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

// Elige la valuación cargada para el modelo y la condición exactos. Sin una
// coincidencia no hay sugerencia: el POS nunca inventa un número.
export function valorSugerido(valuations, model, condition) {
  if (!Array.isArray(valuations)) return null
  const key = normalizarModelo(model)
  if (!key) return null
  return valuations.find(valuation => valuation && valuation.isActive !== false
    && valuation.modelKey === key && (!condition || valuation.condition === condition)) || null
}

// Base de la demo (#240 ítem 7): sin tabla de valores del servidor, la demo
// muestra la valuación con grado usando el catálogo ficticio — precio de venta
// del modelo más parecido por un factor según la condición. Es una referencia
// de demostración, nunca un dato de la tienda real.
const FACTOR_DEMO = { NEW: 0.62, USED: 0.5, REFURBISHED: 0.42 }
export function valorSugeridoDeCatalogo(productos, model, condition = 'USED') {
  const key = normalizarModelo(model)
  if (!key || !Array.isArray(productos)) return null
  const candidatos = productos
    .filter(producto => producto && producto.precioVenta > 0)
    .map(producto => ({ producto, nombre: normalizarModelo(producto.nombre || producto.name) }))
    .filter(({ nombre }) => nombre.includes(key) || key.includes(nombre))
    .sort((a, b) => a.nombre.length - b.nombre.length)
  const elegido = candidatos[0]
  if (!elegido) return null
  const factor = FACTOR_DEMO[String(condition || 'USED').toUpperCase()] ?? FACTOR_DEMO.USED
  const base = Math.round((Number(elegido.producto.precioVenta) * factor) / 10000) * 10000
  if (base <= 0) return null
  return {
    id: `demo-${elegido.producto.id || elegido.nombre}`,
    model: elegido.producto.nombre || model,
    modelKey: elegido.nombre,
    condition,
    baseValuePyg: base,
    maxValuePyg: Math.round((base * 1.2) / 10000) * 10000,
    isActive: true,
    demo: true,
  }
}

// Una ficha se convierte en un pago preparado; solo confirmar la venta lo registra.
export function tradeInDraftPayment(draft, accounts, payments = []) {
  const account = accounts.find(a => a.isActive && a.kind === 'TRADE_IN' && a.currency === 'PYG')
  if (!account) throw new Error('El administrador debe configurar una cuenta activa Canje / Trade-In en Gs antes de continuar.')
  if (!draft?.model?.trim() || !draft?.imei?.trim() || !draft?.conditionNotes?.trim()) throw new Error('Completá modelo, IMEI y condición del equipo recibido.')
  if (!Number.isSafeInteger(draft.value) || draft.value <= 0 || draft.value > 2147483647) throw new Error('El valor de toma debe ser un monto válido en Gs.')
  const serial = draft.imei.trim()
  const serialKey = value => String(value || '').toUpperCase().replace(/[\s-]+/g, '')
  if (payments.some(p => p.tradeIn && serialKey(p.tradeIn.serial) === serialKey(serial))) throw new Error('Ese IMEI ya está incluido como parte de pago en esta venta.')
  return {
    accountId: account.id, medioPago: account.name, cuenta: account.name,
    originalAmount: String(draft.value), exchangeRatePyg: '1', monto: String(draft.value),
    tradeIn: { model: draft.model.trim(), serial, conditionNotes: draft.conditionNotes.trim() },
  }
}
