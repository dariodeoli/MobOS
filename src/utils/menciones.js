// Menciones internas en comentarios de pedido: "@Nombre" o "@Nombre Apellido".
// Puro y testeable: dado el texto y la lista de nombres del equipo, devuelve los
// tramos para pintar y quiénes quedaron mencionados (para avisarles).
const normalizar = (texto) => String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

// Nombres ordenados de más largo a más corto: "@María José" gana a "@María".
const ordenados = (nombres) => [...new Set((nombres || []).filter(Boolean))].sort((a, b) => b.length - a.length)

// Carácter normalizado 1:1 (saca acentos sin cambiar la cantidad de índices):
// así el pintado y la detección pueden caminar el texto original por posición.
const normalizarChar = (char) => {
  const limpio = char.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return (limpio || char).toLowerCase()
}
const esPalabra = (char) => Boolean(char) && /[a-z0-9]/i.test(char)
// La mención vale si no está pegada a otra palabra: ni antes (correos tipo
// a@ana.com) ni después (@anabel no menciona a Ana).
const mencionValida = (cuerpo, patron, indice) => {
  if (!cuerpo.startsWith(patron, indice)) return false
  const antes = indice === 0 ? '' : cuerpo[indice - 1]
  const despues = cuerpo[indice + patron.length]
  return !esPalabra(antes) && !esPalabra(despues)
}

export function mencionadosEn(texto, nombres = []) {
  const cuerpo = [...String(texto || '')].map(normalizarChar).join('')
  return ordenados(nombres).filter((nombre) => {
    const patron = `@${normalizar(nombre)}`
    let indice = cuerpo.indexOf(patron)
    while (indice !== -1) {
      if (mencionValida(cuerpo, patron, indice)) return true
      indice = cuerpo.indexOf(patron, indice + 1)
    }
    return false
  })
}

// Tramos: [{ texto, mencion }] para renderizar sin usar HTML crudo.
export function tramosDeMencion(texto, nombres = []) {
  const cuerpo = String(texto || '')
  if (!cuerpo) return []
  const lista = ordenados(nombres)
  if (!lista.length) return [{ texto: cuerpo, mencion: false }]
  const buscados = lista.map((nombre) => ({ nombre, patron: `@${normalizar(nombre)}` }))
  // Normalización 1:1 para que los índices coincidan con el texto original.
  const cuerpoNormalizado = [...cuerpo].map(normalizarChar).join('')
  const tramos = []
  let i = 0
  while (i < cuerpo.length) {
    const encontrado = cuerpo[i] === '@' ? buscados.find(({ patron }) => mencionValida(cuerpoNormalizado, patron, i)) : null
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
