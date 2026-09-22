// Estados que ofrece el filtro de la pantalla de conciliación.
export const ESTADOS_CONCILIACION = ['PENDING', 'VERIFIED', 'REJECTED']

// Patrón «último usado como predeterminado» (#209) aplicado a Finanzas: claves
// namespaced y validaciones de lo recordado. La API compartida vive en
// `@/lib/ultimoUsado` + `@/hooks/useUltimoUsado` (PLT); acá solo lo propio del
// dominio (qué se recuerda en Gastos y en Conciliación y cuándo deja de valer).
//
// Reglas: solo selecciones frecuentes, siempre cambiables y visibles, y si la
// opción guardada ya no existe en ese contexto se cae al default de la pantalla.

export const CLAVES_FIN = {
  rango: 'fin:rango',
  cajaRango: 'fin:caja-rango',
  gastoTipo: 'fin:gastos-tipo',
  gastoMoneda: 'fin:gastos-moneda',
  gastoCuenta: 'fin:gastos-cuenta',
  conciliacionCuenta: 'fin:conciliacion-cuenta',
  conciliacionMedio: 'fin:conciliacion-medio',
  conciliacionProcesadora: 'fin:conciliacion-procesadora',
  conciliacionEstado: 'fin:conciliacion-estado',
}

// Monedas que ofrece el alta de movimientos (mismo set que CurrencySelect).
export const MONEDAS_DE_GASTO = ['PYG', 'USD', 'BRL', 'EUR', 'USDT']

/** Preset de rango recordado, o el default de la pantalla si ya no existe. */
export function rangoDePreset(PRESETS, id, porDefecto) {
  const preset = PRESETS.find((fila) => fila.id === id)
  return preset ? { ...preset.calc(), preset: preset.id } : porDefecto()
}

/** Cuenta recordada válida para el movimiento: existe, activa y de la moneda actual. */
export function cuentaDeGastoValida(accountId, accounts = [], currency = 'PYG') {
  if (!accountId) return false
  return accounts.some((cuenta) => cuenta.id === accountId && cuenta.isActive && cuenta.currency === currency)
}

/**
 * Filtros de conciliación que siguen valiendo con las facetas del período:
 * los que ya no existen se sueltan (vuelven al default «todas») y el estado
 * desconocido se limpia. Devuelve `{ filtros, estado }` listos para usar.
 */
export function filtrosConciliacionValidos(filtros = {}, estado = '', facetas = {}) {
  const { porCuenta = [], porMedio = [], porProcesadora = [] } = facetas
  const salida = { accountId: '', method: '', processor: '', ...filtros }
  if (salida.accountId && !porCuenta.some((fila) => fila.key === salida.accountId)) salida.accountId = ''
  if (salida.method && !porMedio.some((fila) => fila.key === salida.method)) salida.method = ''
  if (salida.processor && !porProcesadora.some((fila) => fila.key === salida.processor)) salida.processor = ''
  return { filtros: salida, estado: ESTADOS_CONCILIACION.includes(estado) ? estado : '' }
}
