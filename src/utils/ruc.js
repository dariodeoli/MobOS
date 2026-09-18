// RUC/CI paraguayo: dígitos con puntos y guión final (80012345-6). Es el mismo
// patrón para validar un campo y para extraer el RUC de textos importados
// (notas, razón social, direcciones de un CSV).

export const RUC_RE = /\d[\d.\s]{2,}-\d+/

export function extraerRuc(texto) {
  const encontrado = String(texto || '').match(RUC_RE)
  return encontrado ? encontrado[0].trim() : ''
}

export function esRuc(valor) {
  return RUC_RE.test(String(valor || '').trim())
}
