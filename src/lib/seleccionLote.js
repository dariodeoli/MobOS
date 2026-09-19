// Selección en lote para listas: helpers puros (testeables) que usan las
// pantallas con acción por lote. La barra y el estado viven en los componentes
// compartidos para no repetir el patrón en cada lista.

export function alternarId(seleccionados = [], id) {
  return seleccionados.includes(id) ? seleccionados.filter((item) => item !== id) : [...seleccionados, id]
}

export function seleccionarTodos(filas = [], seleccionados = []) {
  const ids = filas.map((fila) => fila.id)
  const todos = ids.length > 0 && ids.every((id) => seleccionados.includes(id))
  return todos ? [] : ids
}
