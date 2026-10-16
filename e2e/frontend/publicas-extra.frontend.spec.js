import { test, expect } from '@playwright/test'
import { vistas, fichaProducto, informe, nombre, contacto } from '../fixtures/publicas-extra.js'

const medidas = [[360, 780], [390, 844], [1440, 1000]]

async function preparar(page, vista, tema = 'light', { error = false, responder, logoAusente = false } = {}) {
  const errores = []
  const productos = []
  page.on('pageerror', causa => errores.push(causa.message))
  await page.addInitScript(esquema => {
    localStorage.setItem('mobos:theme', esquema)
    window.__copias = []
    window.__impresiones = 0
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async texto => { window.__copias.push(texto) } } })
    window.print = () => { window.__impresiones++ }
  }, tema)
  await page.route('**/api/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (!url.pathname.startsWith('/api/')) return route.fallback()
    if (url.pathname === '/api/products') productos.push(url.searchParams.get('q'))
    if (url.pathname === '/api/auth/me') return route.fulfill({ status: vista.autenticado ? 200 : 401, json: vista.autenticado ? { user: { id: 'qa-usuario', tenantId: 'qa-tienda', branchId: 'qa-sucursal', role: 'ADMIN', name: 'Usuario local' }, tenant: { id: 'qa-tienda', name: 'Tienda local' } } : { error: 'Sin sesión' } })
    if (vista.autenticado && ['/api/orders', '/api/users', '/api/inventory/branches', '/api/inventory-branches'].includes(url.pathname)) return route.fulfill({ json: [] })
    if (url.pathname === `${vista.api}/logo` && ['carrito', 'informe', 'alternativa'].includes(vista.id)) return logoAusente ? route.fulfill({ status: 404, body: '' }) : route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5l8AAAAASUVORK5CYII=', 'base64') })
    if (url.pathname === vista.api) {
      if (request.method() === 'POST' && responder) return responder(route)
      return route.fulfill({ status: error ? 404 : 200, json: error ? { message: 'Este enlace no está disponible.' } : vista.payload })
    }
    return route.fulfill({ status: 404, json: { error: 'API no prevista en fixture local' } })
  })
  await page.route(/https:\/\//, route => route.abort())
  await page.goto(vista.ruta, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('main')).toBeVisible()
  if (!error) await expect(page.locator('main')).toContainText(vista.listo)
  await page.evaluate(async esquema => {
    document.documentElement.classList.toggle('dark', esquema === 'dark')
    await document.fonts.ready
    // Esperar transiciones reales de tema; no medir el fotograma intermedio.
    getComputedStyle(document.querySelector('main')).color
    await Promise.all(document.getAnimations().filter(animacion => animacion instanceof CSSTransition).map(animacion => animacion.finished.catch(() => {})))
  }, tema)
  await expect(page.locator('html')).toHaveClass(tema === 'dark' ? /dark/ : /^(?!.*\bdark\b)/)
  const color = await page.locator('main').evaluate(el => getComputedStyle(el).color)
  const intensidad = color.match(/\d+/g).slice(0, 3).reduce((suma, canal) => suma + Number(canal), 0) / 3
  if (tema === 'dark') expect(intensidad, 'texto claro computado en tema oscuro').toBeGreaterThan(150)
  else expect(intensidad, 'texto oscuro computado en tema claro').toBeLessThan(100)
  return { errores, productos }
}

async function auditar(page) {
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

for (const vista of vistas) for (const [width, height] of medidas) for (const tema of ['light', 'dark']) {
  test(`#403 ${vista.id} ${width}px ${tema}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    const { errores, productos } = await preparar(page, vista, tema)
    if (['carrito', 'informe', 'alternativa'].includes(vista.id)) {
      await expect(page.getByTestId('cabecera-tienda')).toContainText(nombre)
      await expect(page.getByTestId('cabecera-tienda').getByRole('img', { name: `Logo de ${nombre}`, exact: true })).toBeVisible()
      await expect(page.getByTestId('publico-whatsapp')).toHaveAttribute('href', contacto.whatsappUrl)
    }
    if (['carrito', 'producto', 'portal', 'alternativa'].includes(vista.id)) await expect(page.locator('main')).toContainText('100.000.000')
    if (vista.id === 'producto') expect(productos).toContain(fichaProducto.sku)
    if (vista.id === 'cuenta') {
      await page.getByTestId('pedido-detalle-boton').click()
      await expect(page.getByTestId('pedido-detalle')).toContainText('100.000.000')
      await expect(page.getByRole('link', { name: 'Ver comprobante', exact: true })).toHaveAttribute('href', /\/pedido\/[b]{64}$/)
    }
    if (vista.id === 'portal') {
      await expect(page.getByTestId('portal-pasos-entrega').locator('> div > div')).toHaveCount(4)
      const columnas = await page.locator('main > div').first().evaluate(el => ({ resumen: el.children[1].getBoundingClientRect().toJSON(), movimiento: el.children[2].getBoundingClientRect().toJSON() }))
      if (width < 1024) expect(columnas.movimiento.top).toBeGreaterThanOrEqual(columnas.resumen.bottom - 1)
      else expect(columnas.movimiento.left).toBeGreaterThanOrEqual(columnas.resumen.right - 1)
    }
    if (vista.id === 'entrada') {
      await expect(page.getByRole('img', { name: 'MobOS', exact: true })).toHaveAttribute('src', tema === 'dark' ? '/logo-dark.svg' : '/logo.svg')
      await expect(page.getByRole('link', { name: 'Conocé MobOS', exact: true })).toHaveAttribute('href', /^https:\/\/moboss\.online/)
    }
    const resultados = await auditar(page)
    console.log('PUBLICA403', vista.id, width, tema, JSON.stringify(resultados))
    expect.soft(errores, 'sin errores React').toEqual([])
    for (const [criterio, resultado] of Object.entries(resultados)) expect.soft(resultado, criterio).toEqual(criterio === 'desborde' ? false : [])
  })
}

for (const [width, height] of medidas) for (const tema of ['light', 'dark']) {
  test(`#403 producto anónimo ${width}px ${tema}: mantiene acceso requerido`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    const { productos } = await preparar(page, { ...vistas.find(v => v.id === 'producto'), autenticado: false, listo: 'Iniciá sesión para ver el precio' }, tema)
    await expect(page.getByRole('link', { name: /Iniciar sesión/ })).toBeVisible()
    expect(productos, 'ninguna consulta de catálogo anónima').toEqual([])
    expect(await page.locator('main').innerText()).not.toContain(fichaProducto.name)
    const resultados = await auditar(page)
    for (const [criterio, resultado] of Object.entries(resultados)) expect.soft(resultado, criterio).toEqual(criterio === 'desborde' ? false : [])
  })
}

test('#403 acciones: carrito copia el enlace y checkout externo conserva destino seguro', async ({ page }) => {
  const vista = vistas.find(v => v.id === 'carrito')
  await preparar(page, vista)
  await page.getByRole('button', { name: /Checkout/ }).click()
  await expect.poll(() => page.evaluate(() => window.__copias.length)).toBe(1)
  expect(await page.evaluate(() => window.__copias[0])).toMatch(/\/carrito\/[a]{64}$/)
  await page.unroute('**/api/**')
  await preparar(page, { ...vista, payload: { ...vista.payload, checkoutUrl: 'https://checkout.example/compra' } })
  const enlace = page.getByRole('link', { name: /Checkout/ })
  await expect(enlace).toHaveAttribute('href', 'https://checkout.example/compra')
  await expect(enlace).toHaveAttribute('rel', /noopener/)
  await expect(enlace).toHaveAttribute('target', '_blank')
  const navegaciones = []
  await page.context().route('https://checkout.example/**', route => { navegaciones.push(route.request().url()); return route.abort() })
  const abierta = page.waitForEvent('popup')
  await enlace.click()
  const popup = await abierta
  await expect.poll(() => navegaciones).toEqual(['https://checkout.example/compra'])
  await popup.close()
})

test('#403 acciones: informe sin inspección copia sin preview e imprime con spy', async ({ page }) => {
  const vista = vistas.find(v => v.id === 'informe')
  await preparar(page, { ...vista, ruta: vista.ruta + '?preview=1', payload: { ...informe, unit: { ...informe.unit, grade: null, checklist: null } } })
  await page.getByRole('button', { name: /Copiar/ }).click()
  await expect.poll(() => page.evaluate(() => window.__copias.length)).toBe(1)
  expect(await page.evaluate(() => window.__copias[0])).not.toContain('preview=')
  await page.getByRole('button', { name: /Imprimir/ }).click()
  expect(await page.evaluate(() => window.__impresiones)).toBe(1)
})

test('#403 acciones: remito requiere todas las unidades y confirma recepción', async ({ page }) => {
  const recibidos = []
  await preparar(page, vistas.find(v => v.id === 'remito'), 'light', { responder: route => { recibidos.push(route.request().postDataJSON()); return route.fulfill({ json: { receivedAt: '2026-10-15T12:00:00Z' } }) } })
  const confirmar = page.getByRole('button', { name: 'Confirmar recepción', exact: true })
  const check = page.getByRole('checkbox').first()
  await check.uncheck(); await expect(confirmar).toBeDisabled()
  await check.check(); await confirmar.click()
  await expect(page.getByTestId('estado-remito')).toHaveText('Recibido')
  expect(recibidos).toHaveLength(1)
})

for (const decision of ['ACEPTAR', 'RECHAZAR']) test(`#403 alternativa ${decision}: confirma una respuesta sin omitir OTP`, async ({ page }) => {
  const recibidos = []
  await preparar(page, vistas.find(v => v.id === 'alternativa'), 'light', { responder: route => { recibidos.push(route.request().postDataJSON()); return route.fulfill({ json: {} }) } })
  await expect(page.getByTestId('alternativa-aceptar')).toBeDisabled()
  await page.getByRole('textbox', { name: 'Código de confirmación', exact: true }).fill('123')
  await expect(page.getByTestId('alternativa-aceptar')).toBeDisabled()
  await page.getByRole('textbox', { name: 'Código de confirmación', exact: true }).fill('123456')
  await page.getByTestId(decision === 'ACEPTAR' ? 'alternativa-aceptar' : 'alternativa-rechazar').click()
  await expect(page.getByTestId('alternativa-aceptar')).toHaveCount(0)
  expect(recibidos).toEqual([{ decision, otp: '123456' }])
})

for (const id of ['cuenta', 'carrito', 'informe', 'remito', 'alternativa', 'portal']) test(`#403 ${id}: enlace inválido no muestra documento`, async ({ page }) => {
  const vista = vistas.find(v => v.id === id)
  await preparar(page, vista, 'light', { error: true })
  await expect(page.locator('main')).toContainText(id === 'informe' ? 'No encontramos este equipo' : 'Este enlace no está disponible.')
  await expect(page.locator('main')).not.toContainText(fichaProducto.name)
})


test('#403 certificado: ajustes de legibilidad solo en pantalla, impresión conservada', async ({ page }) => {
  await preparar(page, vistas.find(v => v.id === 'informe'))
  const texto = page.locator('.informe-publico [class~="text-[11px]"]').first()
  await expect(texto).toHaveCSS('font-size', '12px')
  await expect(page.locator('.informe-publico h2').first()).toHaveCSS('white-space', 'normal')
  await page.emulateMedia({ media: 'print' })
  await expect(texto).toHaveCSS('font-size', '11px')
  await expect(page.locator('.informe-publico h2').first()).toHaveCSS('white-space', 'nowrap')
})

for (const id of ['carrito', 'informe', 'alternativa']) {
  test(`#403 contacto ausente ${id}: no inventa WhatsApp y conserva documento sin logo`, async ({ page }) => {
    const vista = vistas.find(vista => vista.id === id)
    await page.setViewportSize({ width: 360, height: 780 })
    // El error de imagen ocurre antes del handler genérico: logo opcional,
    // sin recurrir al endpoint privado de tenant ni a URL inventada.
    const { errores } = await preparar(page, { ...vista, payload: { ...vista.payload, contacto: null } }, 'light', { logoAusente: true })
    await expect(page.getByTestId('publico-whatsapp')).toHaveCount(0)
    await expect(page.getByTestId('cabecera-tienda').getByRole('img', { name: `Logo de ${nombre}`, exact: true })).toHaveCount(0)
    await expect(page.getByTestId('cabecera-tienda')).toContainText(nombre)
    expect(errores).toEqual([])
  })
}
