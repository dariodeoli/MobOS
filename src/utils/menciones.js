// Menciones internas en comentarios de pedido: "@Nombre" o "@Nombre Apellido".
// Puro y testeable: dado el texto y la lista de nombres del equipo, devuelve los
// tramos para pintar y quiénes quedaron mencionados (para avisarles).
const normalizar = (texto) => String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

// Nombres ordenados de más largo a más corto: "@María José" gana a "@María".
const ordenados = (nombres) => [...new Set((nombres || []).filter(Boolean))].sort((a, b) => b.length - a.length)

export function mencionadosEn(texto, nombres = []) {
  const cuerpo = normalizar(texto)
  return ordenados(nombres).filter((nombre) => cuerpo.includes(`@${normalizar(nombre)}`))
}

// Tramos: [{ texto, mencion }] para renderizar sin usar HTML crudo.
export function tramosDeMencion(texto, nombres = []) {
  const cuerpo = String(texto || '')
  if (!cuerpo) return []
  const lista = ordenados(nombres)
  if (!lista.length) return [{ texto: cuerpo, mencion: false }]
  const buscados = lista.map((nombre) => ({ nombre, patron: `@${normalizar(nombre)}` }))
  const cuerpoNormalizado = normalizar(cuerpo)
  const tramos = []
  let i = 0
  while (i < cuerpo.length) {
    const encontrado = buscados.find(({ patron }) => cuerpoNormalizado.startsWith(patron, i))
    if (encontrado) {
      tramos.push({ texto: cuerpo.slice(i, i + encontrado.patron.length), mencion: true })
      i += encontrado.patron.length
      continue
    }
    const anterior = tramos[tramos.length - 1]
    if (anterior && !anterior.mencion) anterior.texto += cuerpo[i]
    else tramos.push({ texto: cuerpo[i], mencion: false })
    i += 1
  }
  return tramos
}

// Nombre que el autocompletado debe ofrecer para lo que se está escribiendo
// después del último "@" (vacío si no hay mención en curso).
export function consultaDeMencion(texto) {
  const match = String(texto || '').match(/@([^@\s]*)$/)
  return match ? match[1] : null
}

export function insertarMencion(texto, nombre) {
  const cuerpo = String(texto || '')
  const consulta = consultaDeMencion(cuerpo)
  if (consulta === null) return `${cuerpo}@${nombre} `
  return `${cuerpo.slice(0, cuerpo.length - consulta.length - 1)}@${nombre} `
}
