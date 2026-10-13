// Paginación local de listados (docs/TABLAS.md): cálculo puro, sin React.
// Se usa cuando la API ya devolvió todo el conjunto y la pantalla solo decide
// cuánto dibujar. No cambia el contrato de ningún endpoint.

export const TAMANO_PAGINA_DEFECTO = 10

const entero = (valor, minimo, defecto) => {
  const numero = Math.floor(Number(valor))
  return Number.isFinite(numero) && numero >= minimo ? numero : defecto
}

// Rango visible en modo páginas. `desde`/`hasta` son 1-based e inclusivos;
// con 0 elementos ambos son 0.
export function rangoPagina(total, pagina = 0, tamano = TAMANO_PAGINA_DEFECTO) {
  const cantidad = entero(total, 0, 0)
  const size = entero(tamano, 1, TAMANO_PAGINA_DEFECTO)
  const paginas = Math.max(1, Math.ceil(cantidad / size))
  const actual = Math.min(entero(pagina, 0, 0), paginas - 1)
  const inicio = actual * size
  const fin = Math.min(cantidad, inicio + size)
  return { paginas, actual, inicio, fin, desde: cantidad ? inicio + 1 : 0, hasta: fin, size }
}

// Rango visible en modo «Cargar más»: siempre desde el principio.
export function rangoAcumulado(total, visibles = TAMANO_PAGINA_DEFECTO) {
  const cantidad = entero(total, 0, 0)
  const fin = Math.min(cantidad, entero(visibles, 1, TAMANO_PAGINA_DEFECTO))
  return { inicio: 0, fin, hayMas: fin < cantidad }
}

export const textoMostrando = (mostrados, total) =>
  `Mostrando ${entero(mostrados, 0, 0)} de ${entero(total, 0, 0)}`
