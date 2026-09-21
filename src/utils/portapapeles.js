// Copiar al portapapeles, con respaldo. La Clipboard API solo existe en
// contextos seguros y con gesto del usuario; cuando falla se usa el campo
// temporal + `execCommand('copy')`, que es lo que hacían las pantallas por su
// cuenta (docs/PLANTILLA-OBJETOS.md §7).
//
// Nunca lanza: devuelve true/false para que la pantalla elija el aviso. El
// segundo parámetro es inyectable para los tests.

export async function copiarAlPortapapeles(texto, entorno = globalThis) {
  const valor = String(texto ?? '')
  if (!valor) return false
  try {
    if (entorno?.navigator?.clipboard?.writeText) {
      await entorno.navigator.clipboard.writeText(valor)
      return true
    }
  } catch { /* sigue el respaldo */ }
  return copiaDeRespaldo(entorno, valor)
}

function copiaDeRespaldo(entorno, valor) {
  const doc = entorno?.document
  if (!doc?.createElement || !doc.body) return false
  try {
    const campo = doc.createElement('textarea')
    campo.value = valor
    campo.setAttribute('readonly', '')
    campo.style.position = 'fixed'
    campo.style.opacity = '0'
    doc.body.appendChild(campo)
    campo.select()
    const copiado = typeof doc.execCommand === 'function' ? doc.execCommand('copy') : false
    doc.body.removeChild(campo)
    return Boolean(copiado)
  } catch {
    return false
  }
}
