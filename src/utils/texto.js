// Primera letra en mayúscula para direcciones, notas y textos similares.
export function capitalizarPrimera(value) {
  const texto = String(value ?? '')
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto
}
