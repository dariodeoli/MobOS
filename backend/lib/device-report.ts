// Seguimiento del informe de dispositivo (#240 ítem 3): normalización del
// serial (clave de la fila por empresa) y textos legibles de la apertura para
// la cronología del cliente.
export const serialSeguimiento = (valor: unknown): string => String(valor || '').trim().toUpperCase().slice(0, 64)

export const serialEnmascarado = (valor: unknown): string => {
  const serial = String(valor || '').trim()
  return serial.length > 6 ? `${serial.slice(0, 4)}…${serial.slice(-3)}` : serial
}

// Origen de la apertura: el canal del envío previo desde la ficha o el portal
// del cliente cuando el equipo se abrió sin un envío registrado.
export const ORIGEN_APERTURA: Record<string, string> = {
  EMAIL: 'enlace del correo',
  WHATSAPP: 'enlace de WhatsApp',
  PORTAL: 'portal del cliente',
}

export function detalleAperturaInforme(metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object') return ''
  const data = metadata as Record<string, unknown>
  const origen = ORIGEN_APERTURA[String(data.canal)] || ORIGEN_APERTURA.PORTAL
  const serial = serialEnmascarado(data.serial)
  return [`abierto desde el ${origen}`, serial ? `serial ${serial}` : ''].filter(Boolean).join(' · ')
}
