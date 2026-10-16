// Oráculo independiente: lee el protocolo recibido por el agente, reconstruye
// cada etiqueta y decodifica sus píxeles. No importa código del renderer.
import { Buffer } from 'node:buffer'
import jsQR from 'jsqr'
import { PNG } from 'pngjs'
export function leerRaster(base64) {
  const data = Buffer.from(base64, 'base64'), pages = []
  let at = 0, width = 0, rows = [], cuts = 0
  const flush = () => {
    if (!rows.length) return
    const bits = Buffer.concat(rows), height = bits.length / (width / 8)
    const rgba = new Uint8ClampedArray(width * height * 4).fill(255)
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const black = bits[y * width / 8 + (x >> 3)] & (128 >> (x & 7))
      const i = (y * width + x) * 4
      rgba[i] = rgba[i + 1] = rgba[i + 2] = black ? 0 : 255
    }
    const decoded = jsQR(rgba, width, height, { inversionAttempts: 'dontInvert' })
    pages.push({ width, height, qr: decoded?.data || null, png: PNG.sync.write({ width, height, data: Buffer.from(rgba) }) })
    rows = []; width = 0
  }
  while (at < data.length) {
    if (data[at] === 27 && data[at + 1] === 64) { flush(); at += 2 }
    else if (data[at] === 27 && [116, 97, 100].includes(data[at + 1])) at += 3
    else if (data[at] === 29 && data[at + 1] === 86) { cuts++; flush(); at += 3 }
    else if (data[at] === 29 && data[at + 1] === 118 && data[at + 2] === 48) {
      const columns = data.readUInt16LE(at + 4), height = data.readUInt16LE(at + 6)
      if (width && width !== columns * 8) throw Error('Ancho raster cambió entre tiras')
      width = columns * 8
      const end = at + 8 + columns * height
      if (end > data.length) throw Error('Imagen raster truncada')
      rows.push(data.subarray(at + 8, end)); at = end
    } else throw Error(`Comando inesperado en ${at}: ${data[at]}`)
  }
  flush()
  if (!pages.length) throw Error('El trabajo no contiene raster')
  return { pages, cuts }
}
export function urlsUnidades(capturado) {
  return leerRaster(capturado.data).pages.map(page => {
    if (!page.qr) throw Error('QR no decodificable en el raster enviado')
    const url = new URL(page.qr)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw Error('QR público inválido')
    if (!/^\/u\/[^/]+$/.test(url.pathname)) throw Error(`Ruta QR inesperada: ${url.pathname}`)
    return decodeURIComponent(url.pathname.slice(3))
  })
}
// Capacidad declarada del fixture, guardada por el ADMIN real del arnés.
// La dirección TEST-NET solo llega al agente interceptado, nunca a una LAN.
export async function configurarImpresoraRaster(page, api) {
  await page.evaluate(async api => {
    const list = await fetch(`${api}/api/print/printers`, { credentials: 'include' }).then(r => r.json())
    const existing = list.printers?.find(p => p.name === 'Raster E2E')
    const response = await fetch(`${api}/api/print/printers${existing ? '/' + encodeURIComponent(existing.id) : ''}`, {
      method: existing ? 'PATCH' : 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Raster E2E', brand: 'ZKTeco', model: 'ZKP8008', connection: 'lan', destination: 'lan:192.0.2.99:9100', width: 80, copies: 1, cut: true, isDefault: true, isActive: true, branchId: 'e2e-branch-1' }),
    })
    if (response.status !== (existing ? 200 : 201)) throw Error(`Configurar perfil raster: ${response.status}`)
    const created = await response.json()
    const { refrescarDesdeBackend, cargarImpresoras } = await import('/src/lib/printing/agent.js')
    await refrescarDesdeBackend(created.tenantId)
    if (!cargarImpresoras(created.tenantId).impresoras.some(p => p.modelo === 'ZKP8008')) throw Error('No se recuperó el perfil del tenant autenticado')
  }, api)
}
