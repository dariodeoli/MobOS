// Nombres de personas normalizados para el mostrador: el RUC/SIFEN devuelve
// "APELLIDO1 APELLIDO2 NOMBRE1 NOMBRE2" (a veces con coma) y la ficha necesita
// "Nombre1 Nombre2 Apellido1 Apellido2" con mayúsculas solo en la inicial.
// Nunca se muestra "Apellido, Nombre".
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'da', 'das', 'do', 'dos', 'van', 'von', 'san', 'santa'])

const titulo = (palabra) => {
  const limpia = String(palabra || '').toLowerCase()
  if (!limpia) return ''
  if (PARTICULAS.has(limpia)) return limpia
  return limpia.charAt(0).toUpperCase() + limpia.slice(1)
}

const estaEnMayusculas = (texto) => texto === texto.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(texto)

// Razones sociales (#234): el proveedor de RUC devuelve las empresas en el
// mismo formato en mayúsculas que las personas ("DISTRIBUIDORA DEL SUR S.A.").
// Se detectan por su tipo societario (S.A., S.R.L., LTDA, cooperativa…) y se
// respetan tal cual: no se reordenan ni se capitalizan como un nombre de
// persona.
const TIPO_SOCIETARIO = /\b(S\.?A\.?|S\.?R\.?L\.?|S\.?A\.?C\.?I\.?|S\.?A\.?E\.?|S\.?A\.?S\.?|LTDA\.?|E\.?A\.?S\.?|C[IÍ]A\.?|SOCIEDAD|EMPRESA|COMPA[ÑN][IÍ]A|COOPERATIVA|FUNDACI[OÓ]N|ASOCIACI[OÓ]N|MUNICIPALIDAD|GOBERNACI[OÓ]N|MINISTERIO|UNIVERSIDAD|COLEGIO|CONSORCIO)\b/i

export function esRazonSocial(texto) {
  return TIPO_SOCIETARIO.test(String(texto || ''))
}

// Separa un nombre en partes, entendiendo la coma: "Perez, Juan" o
// "PEREZ GOMEZ, JUAN CARLOS".
export function nombrePartes(texto) {
  const limpio = String(texto ?? '').replace(/\s+/g, ' ').trim()
  if (!limpio) return { nombres: [], apellidos: [], conComa: false }
  if (limpio.includes(',')) {
    const [apellidos, nombres] = limpio.split(',', 2).map((parte) => parte.trim())
    return {
      nombres: String(nombres || '').split(' ').filter(Boolean),
      apellidos: String(apellidos || '').split(' ').filter(Boolean),
      conComa: true,
    }
  }
  return { nombres: limpio.split(' ').filter(Boolean), apellidos: [], conComa: false }
}

// Normaliza un nombre para mostrarlo y guardarlo:
// - "Perez, Juan" (con coma) se reordena: la coma separa apellidos de nombres.
// - `apellidosPrimero: 'sifen'` reordena los formatos en mayúsculas del
//   proveedor (3+ palabras) de "A1 A2 N1 N2" a "N1 N2 A1 A2".
// - `apellidosPrimero: true` fuerza el reordenamiento siempre.
// Un nombre ya escrito por el vendedor ("Cliente E2E 4f2") se respeta tal cual.
export function normalizarNombre(texto, { apellidosPrimero = 'auto' } = {}) {
  const original = String(texto ?? '').replace(/\s+/g, ' ').trim()
  if (!original) return ''
  if (esRazonSocial(original)) return original
  const partes = nombrePartes(original)
  const mayusculas = estaEnMayusculas(original)
  const reordenar = !partes.conComa && (
    apellidosPrimero === true ||
    (apellidosPrimero === 'sifen' && mayusculas && partes.nombres.length >= 3)
  )
  if (!partes.conComa && !reordenar && !mayusculas) return original

  let ordenadas
  if (partes.conComa) {
    ordenadas = [...partes.nombres, ...partes.apellidos]
  } else if (reordenar) {
    // En "A1 A2 N1 N2" los apellidos son 2; en "A1 N1 N2", 1.
    const corte = partes.nombres.length >= 4 ? 2 : partes.nombres.length - 1
    ordenadas = [...partes.nombres.slice(corte), ...partes.nombres.slice(0, corte)]
  } else {
    ordenadas = partes.nombres
  }
  return ordenadas.map(titulo).filter(Boolean).join(' ')
}

// ¿El texto viene en el orden "apellidos, nombres"? (lo que hay que reordenar)
export function esApellidosPrimero(texto) {
  return String(texto ?? '').includes(',')
}
