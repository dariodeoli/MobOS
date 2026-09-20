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
