// Constructor de comandos ESC/POS para impresoras térmicas (58 y 80 mm).
// La app arma los bytes y el agente local solo los transporta: una sola
// fuente de verdad para el diseño del ticket. Sin dependencias.

// La impresora trabaja en una página de códigos de 8 bits: se elige CP850 y se
// traducen los caracteres españoles para que no salgan como signos raros.
const CP850 = {
  'á': 0xa0, 'é': 0x82, 'í': 0xa1, 'ó': 0xa2, 'ú': 0xa3, 'ü': 0x81, 'ñ': 0xa4, 'Ñ': 0xa5,
  'Á': 0xb5, 'É': 0x90, 'Í': 0xd6, 'Ó': 0xe0, 'Ú': 0xe9, 'Ü': 0x9a, '¿': 0xa8, '¡': 0xad, '°': 0xf8,
}

const ESC = 0x1b
const GS = 0x1d

const bytesDeTexto = (texto) => {
  const salida = []
  for (const caracter of String(texto ?? '')) {
    const codigo = CP850[caracter]
    if (codigo !== undefined) { salida.push(codigo); continue }
    const punto = caracter.codePointAt(0)
    salida.push(punto > 0xff ? 0x3f : punto) // fuera de CP850: se imprime "?"
  }
  return salida
}

// Ancho útil en columnas de la fuente A: 32 para 58 mm, 48 para 80 mm.
export const columnasDeAncho = (ancho = 58) => (Number(ancho) >= 80 ? 48 : 32)

// Corta el texto en líneas que entren en el ancho, sin partir palabras.
export function envolver(texto, columnas) {
  const lineas = []
  for (const parrafo of String(texto ?? '').split('\n')) {
    let actual = ''
    for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
      let resto = palabra
      while (resto.length > columnas) {
        if (actual) { lineas.push(actual); actual = '' }
        lineas.push(resto.slice(0, columnas))
        resto = resto.slice(columnas)
      }
      if (!actual) actual = resto
      else if (actual.length + 1 + resto.length <= columnas) actual += ` ${resto}`
      else { lineas.push(actual); actual = resto }
    }
    lineas.push(actual)
  }
  return lineas
}

// Reparte dos textos en una línea: uno a la izquierda y otro a la derecha.
export function repartirLinea(izquierda, derecha, columnas) {
  const izq = String(izquierda ?? '')
  const der = String(derecha ?? '')
  if (izq.length + der.length + 1 > columnas) {
    const recorte = Math.max(0, columnas - der.length - 1)
    return `${izq.slice(0, recorte)} ${der}`.trimEnd()
  }
  return `${izq}${' '.repeat(columnas - izq.length - der.length)}${der}`
}

// Las copias las maneja el agente: acá se arma un solo ticket. El margen deja
// aire a los costados para que el texto no toque el borde del papel.
export function crearTicket({ ancho = 80, margen = 2 } = {}) {
  const columnasBase = columnasDeAncho(ancho)
  const sangria = Math.max(0, Math.min(6, Number(margen) || 0))
  const columnas = columnasBase - sangria * 2
  const prefijo = ' '.repeat(sangria)
  const partes = []
  let doble = false
  const anchoActual = () => (doble ? Math.floor(columnas / 2) : columnas)
  const escribir = (texto) => { partes.push(...bytesDeTexto(`${prefijo}${texto}`)) }

  const api = {
    columnas,
    iniciar() {
      partes.push(ESC, 0x40) // reinicia la impresora
      partes.push(ESC, 0x74, 0x02) // página de códigos CP850
      partes.push(ESC, 0x61, 0x00) // alineado a la izquierda
      return api
    },
    texto(texto = '') {
      for (const linea of envolver(texto, anchoActual())) { escribir(`${linea}\n`) }
      return api
    },
    linea(caracter = '-') {
      escribir(`${String(caracter).repeat(anchoActual())}\n`)
      return api
    },
    par(izquierda, derecha = '') {
      escribir(`${repartirLinea(izquierda, derecha, anchoActual())}\n`)
      return api
    },
    centrado(texto = '') {
      for (const linea of envolver(texto, anchoActual())) {
        const margen = Math.max(0, Math.floor((anchoActual() - linea.length) / 2))
        escribir(`${' '.repeat(margen)}${linea}\n`)
      }
      return api
    },
    negrita(activo = true) {
      partes.push(ESC, 0x45, activo ? 1 : 0)
      return api
    },
    doble(activo = true) {
      doble = Boolean(activo)
      partes.push(GS, 0x21, activo ? 0x11 : 0x00) // doble alto y ancho
      return api
    },
    // QR nativo de la impresora (modelo 2). `tamano` va de 1 a 16.
    qr(datos, { tamano = 6 } = {}) {
      partes.push(ESC, 0x61, 0x01) // centrado
      const contenido = bytesDeTexto(datos)
      const n = contenido.length + 3
      const p = Math.floor(n / 256)
      const q = n % 256
      const modulo = Math.min(16, Math.max(1, Number(tamano) || 6))
      partes.push(GS, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0x00) // modelo 2
      partes.push(GS, 0x28, 0x6b, 3, 0, 0x31, 0x43, modulo) // tamaño del módulo
      partes.push(GS, 0x28, 0x6b, 3, 0, 0x31, 0x45, 0x31) // corrección M
      partes.push(GS, 0x28, 0x6b, p, q, 0x31, 0x50, 0x30, ...contenido) // guarda
      partes.push(GS, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30) // imprime
      partes.push(ESC, 0x61, 0x00) // vuelve a la izquierda
      return api
    },
    // Código de barras CODE128 (GS k 73: incluye el largo).
    barcode(datos) {
      partes.push(ESC, 0x61, 0x01)
      const contenido = bytesDeTexto(datos)
      if (contenido.length && contenido.length <= 255) {
        partes.push(GS, 0x68, 0x50) // altura 80 puntos
        partes.push(GS, 0x77, 0x02) // módulo angosto
        partes.push(GS, 0x48, 0x02) // texto abajo
        partes.push(GS, 0x6b, 0x49, contenido.length, ...contenido)
      }
      partes.push(ESC, 0x61, 0x00)
      return api
    },
    avanza(lineas = 1) {
      partes.push(ESC, 0x64, Math.min(255, Math.max(1, Number(lineas) || 1)))
      return api
    },
    corte() {
      partes.push(GS, 0x56, 0x42, 0x00) // corte parcial con avance
      return api
    },
    bytes() {
      return new Uint8Array(partes)
    },
    base64() {
      let binario = ''
      for (const byte of partes) binario += String.fromCharCode(byte)
      return btoa(binario)
    },
  }
  return api
}
