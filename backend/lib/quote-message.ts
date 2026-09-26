// Plantilla profesional del mensaje de cotización (#261): una sola verdad para
// el texto que viaja por WhatsApp y la versión de texto del correo. El enlace
// público va siempre visible (los clientes de correo y WhatsApp lo necesitan).

export type ItemCotizacion = { description: string; quantity: number; totalPyg: number }

const gs = (value: number) => `Gs. ${Math.round(Math.max(0, Number(value) || 0)).toLocaleString('es-PY')}`

function fechaLarga(value: Date | string | null | undefined) {
  if (!value) return ''
  const fecha = value instanceof Date ? value : new Date(String(value))
  if (Number.isNaN(fecha.getTime())) return ''
  return new Intl.DateTimeFormat('es-PY', { day: 'numeric', month: 'long', year: 'numeric' }).format(fecha)
}

/**
 * Mensaje de la cotización: saludo, resumen de ítems (los primeros, con aviso si
 * hay más), total, validez y enlace público. Sin datos internos.
 */
export function mensajeCotizacion(input: {
  quoteNumber: string
  customerName?: string | null
  companyName?: string | null
  items?: ItemCotizacion[]
  totalPyg: number
  validUntil?: Date | string | null
  link: string
}): string {
  const numero = String(input.quoteNumber || '').trim() || 'la cotización'
  const tienda = String(input.companyName || '').trim() || 'la tienda'
  const cliente = String(input.customerName || '').trim()
  const items = Array.isArray(input.items) ? input.items.filter((item) => item && item.description) : []
  const visibles = items.slice(0, 8)
  const restantes = items.length - visibles.length
  const lineas = visibles.map((item) => `• ${item.quantity} × ${item.description} — ${gs(item.totalPyg)}`)
  if (restantes > 0) lineas.push(`• y ${restantes} ítem${restantes === 1 ? '' : 's'} más`)
  const validez = fechaLarga(input.validUntil)

  const partes = [
    cliente ? `Hola ${cliente}, te compartimos la cotización ${numero} de ${tienda}.` : `Te compartimos la cotización ${numero} de ${tienda}.`,
    lineas.length ? `Detalle:\n${lineas.join('\n')}` : '',
    `Total: ${gs(input.totalPyg)}`,
    validez ? `Válida hasta el ${validez}.` : '',
    `Podés verla, aceptarla o rechazarla desde este enlace:\n${String(input.link || '').trim()}`,
    `Cualquier duda, escribinos.\n${tienda}`,
  ]
  return partes.filter(Boolean).join('\n\n').trim()
}
