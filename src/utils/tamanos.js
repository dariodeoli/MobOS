// Tamaños recomendados de los campos según el dato: un monto, un porcentaje o
// una cantidad no tienen por qué ocupar todo el ancho (portado de owncoding-ui,
// ver docs/PLANTILLA-OBJETOS.md §1).

export const TAMANOS_CAMPO = Object.freeze({
  moneda: 'w-36',
  monedaAmplia: 'w-44',
  porcentaje: 'w-24',
  cantidad: 'w-20',
  anio: 'w-20',
  dias: 'w-24',
  fecha: 'w-40',
  fechaHora: 'w-52',
  telefono: 'w-44',
  codigoPostal: 'w-28',
  ip: 'w-40',
  puerto: 'w-24',
  documento: 'w-44',
  ciudad: 'w-56',
})

export function anchoParaLargo(largoMax = 0) {
  if (largoMax <= 12) return 'w-28'
  if (largoMax <= 24) return 'w-40'
  if (largoMax <= 40) return 'w-56'
  return 'w-full'
}
