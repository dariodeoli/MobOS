// Menciones internas (@Nombre) en comentarios de pedido: misma regla que la UI
// (`src/utils/menciones.js`): sin acentos, con límites de palabra y nombre
// completo o solo el primero. Puro y testeable.
const normalizarChar = (char: string) => {
  const limpio = char.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return (limpio || char).toLowerCase()
}
const esPalabra = (char: string) => Boolean(char) && /[a-z0-9]/i.test(char)

/** ¿El texto menciona a alguno de los nombres? (sin acentos y con límites). */
export function mencionadosEn(texto: unknown, nombres: string[] = []): string[] {
  const cuerpo = [...String(texto || '')].map(normalizarChar).join('')
  return nombres.filter(Boolean).filter((nombre) => {
    const patron = `@${[...String(nombre)].map(normalizarChar).join('')}`
    let indice = cuerpo.indexOf(patron)
    while (indice !== -1) {
      const antes = indice === 0 ? '' : cuerpo[indice - 1]
      const despues = cuerpo[indice + patron.length]
      if (!esPalabra(antes) && !esPalabra(despues)) return true
      indice = cuerpo.indexOf(patron, indice + 1)
    }
    return false
  })
}

/** Variantes de nombre de una persona para detectar menciones. */
export function variantesDeNombre(nombre: string | null | undefined): string[] {
  const partes = String(nombre || '').trim().split(/\s+/).filter(Boolean)
  if (!partes.length) return []
  return [...new Set([partes.join(' '), partes[0], ...(partes.length > 1 ? [partes[partes.length - 1]] : [])])].filter((variante) => variante.length >= 3)
}
