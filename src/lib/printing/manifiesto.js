// Manifiesto del envío entrante (#250 §11): el papel que viaja con el lote —
// código grande (`ENV-…`), recorrido, método/empresa/conductor/guía,
// responsable, responsable de despacho, productos con sus IMEI conocidos y las
// unidades pendientes, y el QR de recepción cuando la ruta pública esté
// cerrada. De la misma data salen las **etiquetas por unidad del lote**
// (`N de M`), con el código del envío para que el paquete hable del lote.
//
// Datos: `GET /api/supply/shipments/[id]/manifest` (INV, F4) → `manifiestoEnvio`
// + `proveedor`. El QR solo se imprime con un `enlace` explícito (regla dura:
// nunca un QR muerto); el backend ya arma `/envio/<publicToken>`, pendiente de
// la página pública (docs/MANIFIESTO.md).
import { CONDICIONES_STOCK } from './etiquetaUnidad.js'

const texto = (valor) => String(valor ?? '').trim()

export const ESTADOS_MANIFIESTO = Object.freeze({
  BORRADOR: 'Borrador',
  PREPARANDO: 'Preparando',
  DESPACHADO: 'Despachado',
  EN_TRANSITO: 'En tránsito',
  RECEPCION_PARCIAL: 'Recepción parcial',
  RECIBIDO: 'Recibido',
  CON_INCIDENCIA: 'Con incidencia',
  CANCELADO: 'Cancelado',
})

const fechaHora = (valor, conHora = false) => {
  if (!valor) return ''
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return ''
  return conHora ? fecha.toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' }) : fecha.toLocaleDateString('es-PY')
}

/**
 * Datos normalizados del manifiesto.
 *
 * @param {object} manifiesto respuesta de `GET /api/supply/shipments/[id]/manifest`.
 * @param {object} [opciones]
 * @param {string} [opciones.emisor] empresa que emite.
 * @param {string} [opciones.enlace] URL absoluta de la página pública del envío (QR).
 * @param {Date} [opciones.ahora]
 */
export function datosManifiesto(manifiesto = {}, { emisor = '', enlace = '', ahora = new Date() } = {}) {
  const lineas = (Array.isArray(manifiesto.lineas) ? manifiesto.lineas : []).map((linea) => {
    const imeis = (Array.isArray(linea.imeis) ? linea.imeis : []).map(texto).filter(Boolean)
    const cantidad = Math.max(imeis.length, Number(linea.cantidad) || 0)
    return {
      producto: texto(linea.producto) || 'Producto',
      capacidad: texto(linea.capacidad),
      condicion: CONDICIONES_STOCK[texto(linea.condicion).toUpperCase()] || texto(linea.condicion),
      cantidad,
      imeis,
      pendientes: Math.max(0, cantidad - imeis.length),
    }
  })
  const origen = texto(manifiesto.origen)
  const destino = texto(manifiesto.destino)
  const estado = texto(manifiesto.estado).toUpperCase()
  const unidades = lineas.reduce((suma, linea) => suma + linea.cantidad, 0)
  const conImei = lineas.reduce((suma, linea) => suma + linea.imeis.length, 0)

  return {
    titulo: 'Manifiesto de envío',
    code: texto(manifiesto.code),
    estado: ESTADOS_MANIFIESTO[estado] || estado,
    origen,
    destino,
    recorrido: [origen, destino].filter(Boolean).join(' → '),
    metodo: texto(manifiesto.metodoLabel) || texto(manifiesto.metodo),
    empresa: texto(manifiesto.empresa),
    conductor: texto(manifiesto.conductor),
    guia: texto(manifiesto.guia),
    responsable: texto(manifiesto.responsable),
    compra: texto(manifiesto.compra),
    proveedor: texto(manifiesto.proveedor),
    salida: texto(manifiesto.salida),
    salidaTexto: fechaHora(manifiesto.salida, true),
    eta: texto(manifiesto.eta),
    etaTexto: fechaHora(manifiesto.eta),
    notas: texto(manifiesto.notas),
    lineas,
    resumen: {
      lineas: lineas.length,
      unidades,
      conImei,
      pendientes: Math.max(0, unidades - conImei),
    },
    emisor: texto(emisor),
    enlace: texto(enlace),
    enlacePublico: Boolean(texto(enlace)),
    fechaEmision: fechaHora(ahora, true),
  }
}

/**
 * Etiquetas por unidad del lote (`N de M`): una por IMEI conocido y una por
 * unidad pendiente, con el código del envío (`ENV-…`). Mismo shape que consume
 * `datosEtiquetaLote` (`ticketEtiquetasLote` / `buildEtiquetasLoteHtml`).
 */
export function etiquetasDeLote(manifiesto = {}) {
  const lineas = Array.isArray(manifiesto.lineas) ? manifiesto.lineas : []
  const total = lineas.reduce((suma, linea) => suma + Math.max(0, Number(linea?.cantidad) || 0), 0) || Math.max(0, Number(manifiesto.unidades) || 0)
  const etiquetas = []
  let n = 0
  for (const linea of lineas) {
    const cantidad = Math.max(0, Number(linea?.cantidad) || 0)
    const imeis = Array.isArray(linea?.imeis) ? linea.imeis : []
    for (let indice = 0; indice < cantidad; indice += 1) {
      n += 1
      const imei = texto(imeis[indice])
      etiquetas.push({
        n,
        total,
        producto: texto(linea.producto),
        capacidad: texto(linea.capacidad),
        condicion: texto(linea.condicion),
        imei: imei || null,
        pendiente: !imei,
        compra: texto(manifiesto.compra),
        referencia: null,
        pedido: null,
        destino: texto(manifiesto.destino),
        lote: texto(manifiesto.code),
      })
    }
  }
  return etiquetas
}
