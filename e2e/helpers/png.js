import { deflateSync } from 'node:zlib'

// PNG sólido de prueba (#271): la app necesita una imagen real para el recorte
// de fotos (canvas) y el backend valida MIME + bytes mágicos. Se genera acá
// para no depender de archivos binarios en el repo.
const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    tabla[n] = c >>> 0
  }
  return tabla
})()

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = TABLA_CRC[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function bloque(tipo, datos) {
  const largo = Buffer.alloc(4)
  largo.writeUInt32BE(datos.length)
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'latin1'), datos])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(cuerpo))
  return Buffer.concat([largo, cuerpo, crc])
}

export function pngSolido({ ancho = 240, alto = 240, rgb = [220, 38, 38] } = {}) {
  const fila = Buffer.alloc(1 + ancho * 3)
  for (let x = 0; x < ancho; x += 1) {
    fila[1 + x * 3] = rgb[0]
    fila[2 + x * 3] = rgb[1]
    fila[3 + x * 3] = rgb[2]
  }
  const crudo = Buffer.concat(Array.from({ length: alto }, () => fila))
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(ancho, 0)
  ihdr.writeUInt32BE(alto, 4)
  ihdr[8] = 8 // bits por canal
  ihdr[9] = 2 // color RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloque('IHDR', ihdr),
    bloque('IDAT', deflateSync(crudo)),
    bloque('IEND', Buffer.alloc(0)),
  ])
}
