export async function auditar(page) {
  return page.evaluate(() => {
    const main = document.querySelector('main')
    const visible = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[aria-hidden="true"], .sr-only')
    const nombre = el => `${el.tagName}.${String(el.className).slice(0, 90)} ${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 65)}`
    const chicos = [], objetivos = [], recortes = [], contraste = []
    for (const el of main.querySelectorAll('button, a[href], input, select, textarea, label:has(input[type="checkbox"])')) {
      if (!visible(el)) continue
      if (el.matches('input[type="checkbox"]') && el.closest('label')) continue
      const r = el.getBoundingClientRect(), pseudo = getComputedStyle(el, '::after')
      const alto = Math.max(r.height, parseFloat(pseudo.height) || 0), ancho = Math.max(r.width, parseFloat(pseudo.width) || 0)
      if (alto < 43.9 || ancho < 43.9) objetivos.push({ elemento: nombre(el), ancho, alto })
    }
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const rgba = valor => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = valor; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data].map((v, i) => i === 3 ? v / 255 : v) }
    const over = (a, b) => [0, 1, 2].map(i => a[i] * a[3] + b[i] * (1 - a[3])).concat(1)
    const fondo = el => { const capas = []; for (let n = el; n; n = n.parentElement) { const c = rgba(getComputedStyle(n).backgroundColor); capas.push(c); if (c[3] === 1) break } return capas.reduceRight((b, a) => over(a, b), [255, 255, 255, 1]) }
    const luminancia = c => c.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0)
    const vistos = new Set(), walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const nodo = walker.currentNode, el = nodo.parentElement
      if (!nodo.textContent.trim() || !el || !visible(el)) continue
      const estilo = getComputedStyle(el)
      if (parseFloat(estilo.fontSize) < 11.99) chicos.push(nombre(el))
      const rango = document.createRange(); rango.selectNodeContents(nodo)
      const caja = rango.getBoundingClientRect()
      if (caja.right > innerWidth + 1 || caja.left < -1) recortes.push(nombre(el))
      for (let ancestro = el; ancestro && ancestro !== main; ancestro = ancestro.parentElement) {
        const s = getComputedStyle(ancestro), r = ancestro.getBoundingClientRect()
        if (['hidden', 'clip'].includes(s.overflowX) && (caja.right > r.right + 1 || caja.left < r.left - 1)) { recortes.push(nombre(el)); break }
      }
      if (vistos.has(el) || el.closest(':disabled, [aria-disabled="true"]')) continue
      vistos.add(el)
      const bg = fondo(el), fg = over(rgba(estilo.color), bg), a = luminancia(bg), b = luminancia(fg)
      const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05)
      if (ratio < 4.5) contraste.push({ elemento: nombre(el), ratio: Number(ratio.toFixed(2)), color: estilo.color, fondo: bg.slice(0, 3).map(Math.round) })
    }
    return { desborde: document.documentElement.scrollWidth > innerWidth, chicos, objetivos, recortes: [...new Set(recortes)], contraste }
  })
}

