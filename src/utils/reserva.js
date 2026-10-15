/**
 * Mensaje de confirmación de una reserva: qué se reservó, para quién y hasta
 * cuándo (hora de Paraguay). `ahora` es inyectable para los tests.
 */
export function mensajeReserva({ serials = [], cliente = '', horas = 2 }, ahora = Date.now()) {
  const hasta = new Date(ahora + horas * 3600_000)
  const cuando = hasta.toLocaleString('es-PY', { timeZone: 'America/Asuncion', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
  const que = serials.length === 1 ? `Unidad IMEI …${String(serials[0]).slice(-4)}` : `${serials.length} unidades`
  const quien = cliente ? `para ${cliente}` : 'sin cliente'
  return `${que} reservada${serials.length === 1 ? '' : 's'} ${quien} hasta ${cuando} (${horas} ${horas === 1 ? 'hora' : 'horas'}). Se libera sola al vencer.`
}
