// Serial/IMEI: el final identifica el equipo de un vistazo y nunca se recorta.

export function ultimos4(serial) {
  return String(serial ?? '').slice(-4)
}

export function partirSerial(serial) {
  const texto = String(serial ?? '')
  if (!texto) return { cabeza: '', cola: '' }
  return { cabeza: texto.slice(0, -4), cola: texto.slice(-4) }
}

// Máscara para las vistas donde el serial completo no aporta: "••••4821".
export function serialEnmascarado(serial) {
  const cola = ultimos4(serial)
  return cola ? `••••${cola}` : ''
}
