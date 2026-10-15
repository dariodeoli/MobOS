// #422 · Lee `docs/NOVEDADES.md` (registro acumulativo para el dueño) y devuelve
// las últimas versiones listas para mostrar: { version, fecha, intro, items }.
// Las secciones son `## vX.Y.Z — fecha`; cada punto es un «- » con el módulo en
// negrita. El texto se limpia de marcas de Markdown.
const limpiar = (texto) => String(texto).replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').trim()

export function ultimasNovedades(markdown, cantidad = 3) {
  const secciones = String(markdown || '').split(/^## /m).slice(1)
  const versiones = []
  for (const seccion of secciones) {
    const [titulo, ...resto] = seccion.split('\n')
    const encabezado = titulo.match(/^(v[\w.]+)\s*[—-]\s*(.+)$/)
    if (!encabezado) continue
    const lineas = resto.map((linea) => linea.trim())
    versiones.push({
      version: encabezado[1],
      fecha: encabezado[2].trim(),
      intro: limpiar(lineas.filter((linea) => linea && !linea.startsWith('- ') && !linea.startsWith('#') && linea !== '---').join(' ')),
      items: lineas.filter((linea) => linea.startsWith('- ')).map((linea) => limpiar(linea.slice(2))),
    })
    if (versiones.length >= cantidad) break
  }
  return versiones
}
