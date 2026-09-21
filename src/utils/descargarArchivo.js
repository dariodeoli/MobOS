// Descarga de un archivo generado en el navegador (CSV, JSON, PDF, blob de una
// respuesta). Un solo lugar para el Blob + el enlace temporal + la revocación
// del object URL (docs/PLANTILLA-OBJETOS.md §7); las pantallas no repiten el
// patrón. Devuelve true/false y no lanza: el que llama decide el aviso.
//
// - Texto: se pasa el string y el `tipo`; con `bom` (por defecto en CSV) Excel
//   respeta los acentos.
// - Binario: se pasa un Blob tal cual (la respuesta de la API, por ejemplo).
//
// El entorno es inyectable para los tests.

export function descargarArchivo(nombre, contenido, { tipo = 'text/plain;charset=utf-8', bom = false, entorno = globalThis } = {}) {
  const doc = entorno?.document
  const urlApi = entorno?.URL
  const BlobCtor = entorno?.Blob
  if (!doc?.createElement || !doc.body || !urlApi?.createObjectURL || !BlobCtor) return false
  const programar = entorno.setTimeout || globalThis.setTimeout
  try {
    const blob = contenido instanceof BlobCtor
      ? contenido
      : new BlobCtor([bom ? '\ufeff' : '', String(contenido ?? '')], { type: tipo })
    const url = urlApi.createObjectURL(blob)
    const enlace = doc.createElement('a')
    enlace.href = url
    enlace.download = nombre
    doc.body.appendChild(enlace)
    enlace.click()
    enlace.remove()
    programar(() => urlApi.revokeObjectURL(url), 1000)
    return true
  } catch {
    return false
  }
}

// Atajo para los CSV con BOM, que es el caso más repetido.
export function descargarCsvCliente(nombre, csv, entorno = globalThis) {
  return descargarArchivo(nombre, csv, { tipo: 'text/csv;charset=utf-8', bom: true, entorno })
}
