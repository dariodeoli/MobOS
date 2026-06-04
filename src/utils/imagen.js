// Procesa una foto de celular para el comparador:
//  1) la reduce a un tamaño razonable (no guardar megas en base64),
//  2) le quita el fondo blanco SOLO desde los bordes (flood-fill), así un
//     equipo blanco/plata no pierde su cuerpo,
//  3) recorta el sobrante transparente,
//  4) la devuelve como PNG en dataURL (string) lista para guardar.

const MAX_LADO = 600 // px del lado más largo tras reducir

function cargarImagen(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = (e) => {
      URL.revokeObjectURL(url)
      reject(e)
    }
    img.src = url
  })
}

// ¿El pixel i (índice de byte R) es "casi blanco"?
function casiBlanco(d, i, umbral) {
  return d[i] >= umbral && d[i + 1] >= umbral && d[i + 2] >= umbral
}

// Quita el fondo blanco conectado a los bordes con un flood-fill (BFS).
function quitarFondo(ctx, w, h, umbral = 238) {
  const imgData = ctx.getImageData(0, 0, w, h)
  const d = imgData.data
  const visto = new Uint8Array(w * h)
  const cola = []

  const encolarBorde = (x, y) => {
    const p = y * w + x
    if (!visto[p] && casiBlanco(d, p * 4, umbral)) {
      visto[p] = 1
      cola.push(p)
    }
  }
  for (let x = 0; x < w; x++) {
    encolarBorde(x, 0)
    encolarBorde(x, h - 1)
  }
  for (let y = 0; y < h; y++) {
    encolarBorde(0, y)
    encolarBorde(w - 1, y)
  }

  while (cola.length) {
    const p = cola.pop()
    d[p * 4 + 3] = 0 // transparente
    const x = p % w
    const y = (p / w) | 0
    const vecinos = [
      x > 0 ? p - 1 : -1,
      x < w - 1 ? p + 1 : -1,
      y > 0 ? p - w : -1,
      y < h - 1 ? p + w : -1,
    ]
    for (const v of vecinos) {
      if (v >= 0 && !visto[v] && casiBlanco(d, v * 4, umbral)) {
        visto[v] = 1
        cola.push(v)
      }
    }
  }
  ctx.putImageData(imgData, 0, 0)
}

// Recorta los bordes totalmente transparentes.
function recortar(ctx, w, h) {
  const d = ctx.getImageData(0, 0, w, h).data
  let minX = w
  let minY = h
  let maxX = 0
  let maxY = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 10) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < minX || maxY < minY) return null // todo transparente
  const cw = maxX - minX + 1
  const ch = maxY - minY + 1
  const recorte = ctx.getImageData(minX, minY, cw, ch)
  return { recorte, cw, ch }
}

export async function procesarImagenCelular(file) {
  const img = await cargarImagen(file)

  // 1) Reducir manteniendo proporción.
  const escala = Math.min(1, MAX_LADO / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * escala))
  const h = Math.max(1, Math.round(img.height * escala))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, w, h)

  // 2) Quitar fondo + 3) recortar.
  quitarFondo(ctx, w, h)
  const corte = recortar(ctx, w, h)

  const out = document.createElement('canvas')
  if (corte) {
    out.width = corte.cw
    out.height = corte.ch
    out.getContext('2d').putImageData(corte.recorte, 0, 0)
  } else {
    out.width = w
    out.height = h
    out.getContext('2d').drawImage(canvas, 0, 0)
  }

  // 4) Exportar. Preferimos WebP (mucho más liviano y conserva transparencia);
  // si el navegador no lo soporta, caemos a PNG.
  const webp = out.toDataURL('image/webp', 0.85)
  if (webp.startsWith('data:image/webp')) return webp
  return out.toDataURL('image/png')
}
