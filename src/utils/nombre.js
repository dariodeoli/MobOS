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

// Normaliza un nombre para mostrarlo y guardarlo, solo cuando hace falta:
// - "PEREZ, JUAN" (con coma) se reordena: la coma siempre separa apellidos de
//   nombres ("Perez, Juan" → "Juan Perez").
// - "DARIO OLIVEIRA" (todo mayúsculas, típico del RUC/SIFEN) pasa a capitalizar
//   cada palabra.
// Un nombre ya escrito por el vendedor ("Cliente E2E 4f2") se respeta tal cual.
export function normalizarNombre(texto) {
  const original = String(texto ?? '').replace(/\s+/g, ' ').trim()
  if (!original) return ''
  const conComa = original.includes(',')
  const todoMayusculas = original === original.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(original)
  if (!conComa && !todoMayusculas) return original
  const [apellidos, nombres] = conComa ? original.split(',', 2).map((parte) => parte.trim()) : [null, original]
  const palabras = String(nombres || '').split(' ').filter(Boolean)
  const ordenadas = apellidos ? [...palabras, ...apellidos.split(' ').filter(Boolean)] : palabras
  return ordenadas.map(titulo).filter(Boolean).join(' ')
}

// ¿El texto viene en el orden "apellidos, nombres"? (lo que hay que reordenar)
export function esApellidosPrimero(texto) {
  return String(texto ?? '').includes(',')
}
