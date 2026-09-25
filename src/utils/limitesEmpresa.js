// Validación de los límites y el seguro de la empresa (#162 · #241). Pura y
// compartida por la pantalla (mensajes claros antes de llamar al API) y sus
// tests; el backend revalida con las mismas reglas.

/** Porcentaje entero 0–100 desde el campo (coma decimal); '' → null. */
export function validarPorcentajeEntero(valor, etiqueta = 'El porcentaje') {
  const texto = String(valor ?? '').trim()
  if (texto === '') return { ok: true, valor: null }
  const numero = Number(texto.replace(',', '.'))
  if (!Number.isFinite(numero) || numero < 0 || numero > 100) return { ok: false, error: `${etiqueta} debe estar entre 0 y 100.` }
  if (!Number.isSafeInteger(numero)) return { ok: false, error: `${etiqueta} se guarda sin decimales (ej.: 25).` }
  return { ok: true, valor: numero }
}

/** Porcentaje 0–100 con hasta 2 decimales (el recargo por mora); '' → null. */
export function validarPorcentajeDecimal(valor, etiqueta = 'El porcentaje') {
  const texto = String(valor ?? '').trim()
  if (texto === '') return { ok: true, valor: null }
  const numero = Number(texto.replace(',', '.'))
  if (!Number.isFinite(numero) || numero < 0 || numero > 100) return { ok: false, error: `${etiqueta} debe estar entre 0 y 100.` }
  const bp = Math.round(numero * 100)
  if (Math.abs(numero * 100 - bp) > 1e-6) return { ok: false, error: `${etiqueta} admite hasta 2 decimales.` }
  return { ok: true, valor: numero }
}

/** Entero no negativo: los montos llegan como número del campo (o vacío). */
export function validarEnteroNoNegativo(valor, etiqueta = 'El monto') {
  const numero = typeof valor === 'number' ? valor : Number(String(valor ?? '').replace(/\./g, ''))
  if (!Number.isSafeInteger(numero) || numero < 0) return { ok: false, error: `${etiqueta} debe ser un entero no negativo.` }
  return { ok: true, valor: numero }
}
