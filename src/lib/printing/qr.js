// Contrato único de los códigos QR de MobOS (papel y pantalla).
//
// Regla dura: todo QR es una URL absoluta de la app, nunca un texto interno
// tipo `MOBOS:...`. Quien lo escanee con el teléfono tiene que abrir una
// página; el código de barras es el que sigue hablando el idioma del lector
// (`MOBOS:<serial>`), porque no sale de la app y no necesita navegador.
//
// Rutas y payloads:
//   qrPedido(token)      -> <base>/pedidos/<token>     comprobante y seguimiento (#197)
//   qrUnidad(serial)     -> <base>/u/<serial>          unidad física
//   qrProducto(sku)      -> <base>/producto/<sku>      etiqueta de precio/góndola
//   qrPrueba(datos)      -> <base>/prueba?d=&v=&f=&t=  prueba de impresión
//   qrGarantia(token)    -> <base>/garantia/<token>    enlace del caso (copia/QR)
//
// La base sale de `VITE_APP_URL`; si no está, del origen donde corre la app
// (`window.location.origin`) y, en tests, del parámetro explícito `base`. Si no
// hay base (tests con `node --test`, entornos sin origen), los QR de unidad,
// producto y prueba caen al payload histórico `MOBOS:...`: el ticket nunca sale
// sin código, y el lector del local lo sigue entendiendo.
//
// La prueba de impresión no existe en la base (es local del agente): sus datos
// viajan en la URL para que la página sea autocontenida y muestre exactamente
// lo que salió en el papel. `leerPrueba` es la vuelta atrás.
//
// Cada valor va escapado: los segmentos de ruta con `encodeURIComponent` y la
// consulta con `URLSearchParams` (también escapa `&`, `=`, espacios y acentos).

// `import.meta.env` no existe fuera del bundler (tests con `node --test`): el
// acceso va protegido para que el módulo siga siendo puro y testeable.
function variablesDeVite() {
  try {
    return import.meta.env || {}
  } catch {
    return {}
  }
}

// Base absoluta de la app. Orden: parámetro explícito (tests) → VITE_APP_URL →
// VITE_PUBLIC_TRACKING_URL (variable histórica del repo) → origen actual.
export function baseDeApp(explicita = '') {
  const variables = variablesDeVite()
  const candidata = String(
    explicita || variables.VITE_APP_URL || variables.VITE_PUBLIC_TRACKING_URL || '',
  ).trim()
  if (candidata) return candidata.replace(/\/+$/, '')
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin
  return ''
}

const enlaceConBase = (base, ruta) => {
  const origen = baseDeApp(base)
  return origen ? `${origen}${ruta}` : ''
}

const segmento = (valor) => encodeURIComponent(String(valor ?? '').trim())

// Respaldo histórico: sin base no hay página que abrir, pero el papel igual
// lleva un payload legible por el escáner del local.
const conRespaldo = (enlace, respaldo) => enlace || respaldo

export function qrPedido(token, base = '') {
  const valor = segmento(token)
  return valor ? enlaceConBase(base, `/pedidos/${valor}`) : ''
}

export function qrUnidad(serial, base = '') {
  const valor = String(serial ?? '').trim()
  if (!valor) return ''
  return conRespaldo(enlaceConBase(base, `/u/${segmento(valor)}`), `MOBOS:${valor}`)
}

export function qrProducto(sku, base = '') {
  const valor = String(sku ?? '').trim()
  if (!valor) return ''
  return conRespaldo(enlaceConBase(base, `/producto/${segmento(valor)}`), `MOBOS:PROD:${valor}`)
}

export function qrGarantia(token, base = '') {
  const valor = segmento(token)
  return valor ? enlaceConBase(base, `/garantia/${valor}`) : ''
}

export function qrPrueba({ destino = '', validacion = '', fecha = '', tipo = '' } = {}, base = '') {
  const origen = baseDeApp(base)
  const respaldo = `MOBOS:PRUEBA:${String(tipo).trim()}:${String(validacion).trim()}`
  if (!origen) return respaldo
  const consulta = new URLSearchParams({
    d: String(destino).trim(),
    v: String(validacion).trim(),
    f: String(fecha).trim(),
    t: String(tipo).trim(),
  })
  return `${origen}/prueba?${consulta}`
}

// Mismos límites que usa la página para mostrar: lo que llega por URL es
// entrada de terceros y no puede crecer sin control.
const LIMITES_PRUEBA = { destino: 80, validacion: 24, fecha: 40, tipo: 32 }

export function leerPrueba(entrada = '') {
  const parametros = entrada instanceof URLSearchParams
    ? entrada
    : new URLSearchParams(String(entrada).replace(/^\?/, ''))
  const recortar = (clave, limite) => String(parametros.get(clave) || '').trim().slice(0, limite)
  return {
    destino: recortar('d', LIMITES_PRUEBA.destino),
    validacion: recortar('v', LIMITES_PRUEBA.validacion),
    fecha: recortar('f', LIMITES_PRUEBA.fecha),
    tipo: recortar('t', LIMITES_PRUEBA.tipo),
  }
}

// Vuelta atrás de un escaneo: QR nuevo (URL de la app) o código viejo
// (`MOBOS:...`). Devuelve el tipo y el valor útil para que los flujos de
// búsqueda y venta sigan aceptando la etiqueta impresa. Un QR nuevo de unidad
// (`/u/<serial>`) se lee igual que el código de barras histórico.
export function leerEtiqueta(texto = '') {
  const crudo = String(texto ?? '').trim()
  if (!crudo) return { tipo: '', valor: '' }
  if (/^https?:\/\//i.test(crudo)) {
    try {
      const url = new URL(crudo)
      const partes = url.pathname.split('/').filter(Boolean).map((parte) => decodeURIComponent(parte))
      if (partes[0] === 'u' && partes[1]) return { tipo: 'UNIDAD', valor: partes[1] }
      if (partes[0] === 'producto' && partes[1]) return { tipo: 'PROD', valor: partes[1] }
      if (partes[0] === 'p' && partes[1]) return { tipo: 'PEDIDO', valor: partes[1] }
      if (partes[0] === 'prueba') return { tipo: 'PRUEBA', valor: url.searchParams.get('v') || '' }
    } catch {
      // No es una URL válida: se trata como texto escrito a mano.
    }
  }
  const interno = crudo.match(/^MOBOS:(?:(PROD|UBI|PRUEBA|PEDIDO):)?(.+)$/i)
  if (interno) return { tipo: (interno[1] || 'UNIDAD').toUpperCase(), valor: interno[2] }
  return { tipo: '', valor: crudo }
}
