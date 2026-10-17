// El índice de Ayuda se filtra con el mismo conjunto de vistas que habilita
// el shell. Los slugs siguen siendo los de la URL pública para no alterar rutas.
const VISTAS_POR_RUTA = {
  '/pos': ['cargar'],
  '/pedidos': ['pedidos'],
  '/delivery': ['repartos'],
  '/clientes': ['clientes'],
  '/campanas': ['campanas'],
  '/productos': ['productos'],
  '/promociones': ['promociones'],
  '/precios': ['precios'],
  '/cotizaciones': ['cotizaciones'],
  '/plantillas': ['plantillas'],
  '/trade-in': ['cotizador', 'tradein-admin'],
  '/stock': ['inventario', 'unidades', 'traslados'],
  '/stock/unidades': ['unidades', 'inventario'],
  '/stock/traslados': ['traslados', 'inventario'],
  '/compras': ['compras'],
  '/servicio': ['servicio'],
  '/garantias': ['servicio', 'garantias'],
  '/autorizaciones': ['autorizaciones'],
  '/resumen': ['resumen'],
  '/ops': ['ops'],
  '/analisis': ['analisis'],
  '/finanzas': ['finanzas'],
  '/configuracion': ['equipo'],
  '/mi-cuenta': ['mi-cuenta'],
  '/celulares': ['celulares'],
  '/comparador': ['comparador'],
  '/centro-control': ['centro-control'],
}

export const normalizarTextoAyuda = (texto) => String(texto || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')

export function ayudaVisibleParaVistas(entrada, vistasAccesibles) {
  if (!Array.isArray(vistasAccesibles)) return true
  const ruta = entrada?.ruta || ''
  if (!ruta) return true
  const permitidas = VISTAS_POR_RUTA[ruta]
    || (ruta.startsWith('/finanzas/') ? ['finanzas'] : null)
    || (ruta.startsWith('/analisis/') ? ['analisis'] : null)
    || (ruta.startsWith('/configuracion/') ? ['equipo'] : null)
    || (ruta.startsWith('/stock/') ? ['inventario', 'unidades', 'traslados'] : [])
  return permitidas.some(vista => vistasAccesibles.includes(vista))
}

export function buscarAyuda(entradas, consulta, vistasAccesibles) {
  const texto = normalizarTextoAyuda(String(consulta || '').trim())
  return (Array.isArray(entradas) ? entradas : []).filter(entrada => {
    if (!ayudaVisibleParaVistas(entrada, vistasAccesibles)) return false
    if (!texto) return true
    return normalizarTextoAyuda([
      entrada.titulo,
      entrada.ubicacion,
      entrada.explicacion,
      entrada.modulo,
    ].join(' ')).includes(texto)
  })
}
