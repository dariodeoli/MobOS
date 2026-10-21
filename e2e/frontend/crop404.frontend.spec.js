import { test, expect } from '@playwright/test'
import { esperarAnimaciones } from '../helpers/animaciones.js'
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE1cAAAAASUVORK5CYII=', 'base64')
async function imagen(page, name = 'fixture.png') {
  const b64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 400
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#00ff00'; ctx.fillRect(0, 0, 400, 400); ctx.fillStyle = '#ff0000'; ctx.fillRect(400, 0, 400, 400)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  return { name, mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') }
}
function archivoMultipart(request, name) {
  const body = request.postDataBuffer(), boundary = /boundary=(.+)/.exec(request.headers()['content-type'])[1]
  for (const part of body.toString('latin1').split(`--${boundary}`)) {
    const split = part.indexOf('\r\n\r\n')
    if (part.slice(0, split).includes(`name="${name}"`)) return Buffer.from(part.slice(split + 4, -2), 'latin1')
  }
  return null
}
async function preparar(page, { width = 390, dark = false, alta = false, dos = false, modal = false } = {}) {
  const uploads = []
  await page.setViewportSize({ width, height: width === 360 ? 740 : width === 390 ? 844 : 900 })
  await page.addInitScript(dark => localStorage.setItem('mobos:theme', dark ? 'dark' : 'light'), dark)
  await page.route('**/api/products/**/images**', async r => {
    if (r.request().method() === 'POST') {
      uploads.push({ url: r.request().url(), foto: archivoMultipart(r.request(), 'file'), mini: archivoMultipart(r.request(), 'thumb') })
      return r.fulfill({ status: 201, json: { id: `nueva-${uploads.length}`, url: '/api/products/fixture-product/images/nueva', isPrimary: false } })
    }
    if (new URL(r.request().url()).pathname.endsWith('/images')) return r.fulfill({ status: 200, json: [{ id: 'original', url: '/api/products/fixture-product/images/original', isPrimary: true }, ...(dos ? [{ id: 'segunda', url: '/api/products/fixture-product/images/segunda', isPrimary: false }] : [])] })
    return r.fulfill({ status: 200, contentType: 'image/png', body: pixel })
  })
  await page.goto(`/e2e/fixtures/crop404.html?${alta ? 'alta&' : ''}${modal ? 'modal' : ''}`)
  expect(await page.locator('html').evaluate(el => el.classList.contains('dark'))).toBe(dark)
  if (!alta) await expect(page.getByRole('button', { name: 'Foto 1 (principal)', exact: true })).toBeVisible()
  return uploads
}
for (const width of [360, 390, 1440]) for (const dark of [false, true]) test(`#404 encuadre y cancelar conserva galería ${width} ${dark ? 'oscuro' : 'claro'}`, async ({ page }) => {
  const uploads = await preparar(page, { width, dark })
  await page.getByTestId('galeria-archivo').setInputFiles(await imagen(page))
  const dialog = page.getByRole('dialog', { name: 'Recortar foto' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('img', { name: 'Foto a recortar' })).toBeVisible()
  expect(uploads).toHaveLength(0)
  await esperarAnimaciones(page)
  for (const button of await dialog.getByRole('button').all()) {
    const box = await button.boundingBox()
    if (box) { expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize().height) }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Foto 1 (principal)', exact: true })).toBeVisible()
  expect(uploads).toHaveLength(0)
})
test('#404 confirmar encuadre conserva píxeles elegidos, WebP, miniatura y orden del lote', async ({ page }) => {
  const uploads = await preparar(page)
  await page.getByTestId('galeria-archivo').setInputFiles([await imagen(page), await imagen(page, 'segunda.png')])
  let dialog = page.getByRole('dialog', { name: 'Recortar foto' })
  await expect(dialog.getByRole('img', { name: 'Foto a recortar' })).toBeVisible()
  const zoom = dialog.getByRole('slider')
  await zoom.fill('1.5')
  await expect(zoom).toHaveValue('1.5')
  await zoom.fill('1')
  await esperarAnimaciones(page)
  const box = await dialog.getByTestId('recorte-encuadre').boundingBox()
  await page.mouse.move(box.x + 80, box.y + 100); await page.mouse.down(); await page.mouse.move(box.x + 200, box.y + 100); await page.mouse.up()
  await dialog.getByRole('button', { name: 'Usar esta foto', exact: true }).click()
  await expect.poll(() => uploads.length).toBe(1)
  dialog = page.getByRole('dialog', { name: 'Recortar foto' })
  await expect(dialog.getByRole('button', { name: 'Usar esta foto', exact: true })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Usar esta foto', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(uploads).toHaveLength(2)
  const datos = await page.evaluate(async ({ foto, mini }) => {
    const decode = async (b64) => {
      const b = await createImageBitmap(await (await fetch(`data:image/webp;base64,${b64}`)).blob())
      const c = document.createElement('canvas'); c.width = b.width; c.height = b.height
      c.getContext('2d').drawImage(b, 0, 0)
      return { width: b.width, height: b.height, center: [...c.getContext('2d').getImageData(b.width / 2, b.height / 2, 1, 1).data] }
    }
    return { foto: await decode(foto), mini: await decode(mini) }
  }, { foto: uploads[0].foto.toString('base64'), mini: uploads[0].mini.toString('base64') })
  expect(datos.foto.width).toBe(400); expect(datos.foto.height).toBe(400)
  expect(datos.mini.width).toBe(160); expect(datos.mini.height).toBe(160)
  expect(datos.foto.center[1]).toBeGreaterThan(240); expect(datos.foto.center[0]).toBeLessThan(10)
  await expect(page.getByRole('button', { name: 'Foto 1 (principal)', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Foto 2', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Foto 3', exact: true })).toBeVisible()
})
test('#404 alta conserva foto local solo al confirmar y no hace uploads', async ({ page }) => {
  const uploads = await preparar(page, { alta: true })
  await page.getByTestId('galeria-archivo').setInputFiles(await imagen(page))
  await expect(page.getByTestId('pendientes-locales')).toHaveText('0')
  await page.getByRole('dialog', { name: 'Recortar foto' }).getByRole('button', { name: 'Usar esta foto', exact: true }).click()
  await expect(page.getByTestId('pendientes-locales')).toHaveText('1')
  expect(uploads).toHaveLength(0)
})
for (const caso of ['tipo', 'tamaño', 'corrupta']) test(`#404 rechaza ${caso} sin subir`, async ({ page }) => {
  const uploads = await preparar(page)
  const file = caso === 'tipo' ? { name: 'no.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') } : caso === 'tamaño' ? { name: 'grande.png', mimeType: 'image/png', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) } : { name: 'rota.png', mimeType: 'image/png', buffer: Buffer.from('no es una imagen') }
  await page.getByTestId('galeria-archivo').setInputFiles(file)
  await expect(page.getByRole('alert')).toBeVisible()
  expect(uploads).toHaveLength(0)
  if (caso === 'corrupta') await expect(page.getByRole('button', { name: 'Usar esta foto', exact: true })).toBeDisabled()
})
for (const cambio of ['Cambiar producto', 'Retirar permiso', 'Cambiar contexto']) test(`#404 ${cambio} descarta recorte sin subir`, async ({ page }) => {
  const uploads = await preparar(page)
  await page.getByTestId('galeria-archivo').setInputFiles(await imagen(page))
  await expect(page.getByRole('dialog', { name: 'Recortar foto' })).toBeVisible()
  // Cambio de props/contexto externo, como ruta/sesión que cambia mientras está abierto.
  await page.getByRole('button', { name: cambio, exact: true }).evaluate(el => el.click())
  await expect(page.getByRole('dialog', { name: 'Recortar foto' })).toHaveCount(0)
  expect(uploads).toHaveLength(0)
})


test('#404 recorte que termina después de cambiar contexto no sube ni revive selección', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.toBlob
    let primera = true
    HTMLCanvasElement.prototype.toBlob = function(callback, ...args) {
      if (!primera) return original.call(this, callback, ...args)
      primera = false
      return original.call(this, blob => {
        window.recorteEmpezado404 = true
        window.soltarRecorte404 = () => callback(blob)
      }, ...args)
    }
  })
  const uploads = await preparar(page)
  await page.getByTestId('galeria-archivo').setInputFiles(await imagen(page))
  await page.getByRole('dialog', { name: 'Recortar foto' }).getByRole('button', { name: 'Usar esta foto', exact: true }).click()
  await expect.poll(() => page.evaluate(() => Boolean(window.recorteEmpezado404))).toBe(true)
  await page.getByRole('button', { name: 'Cambiar contexto', exact: true }).evaluate(el => el.click())
  await expect(page.getByRole('dialog', { name: 'Recortar foto' })).toHaveCount(0)
  await page.evaluate(async () => { window.soltarRecorte404(); await new Promise(resolve => setTimeout(resolve, 50)) })
  expect(uploads).toHaveLength(0)
  await expect(page.getByTestId('galeria-fotos').getByRole('button', { name: /^Foto / })).toHaveCount(0)
})


test('#404 rechazo tardío al ordenar no restaura fotos del contexto anterior', async ({ page }) => {
  await preparar(page, { dos: true })
  let started, release
  const ready = new Promise(resolve => started = resolve)
  await page.route('**/api/products/**/images', async r => {
    if (r.request().method() !== 'PATCH') return r.fallback()
    started()
    await new Promise(resolve => release = resolve)
    await r.fulfill({ status: 403, json: { error: 'Contexto anterior' } })
  })
  await page.getByRole('button', { name: 'Foto 2', exact: true }).click()
  await page.getByRole('button', { name: 'Mover antes', exact: true }).click()
  await ready
  await page.getByRole('button', { name: 'Cambiar contexto', exact: true }).evaluate(el => el.click())
  release()
  await expect(page.getByTestId('galeria-fotos').getByRole('button', { name: /^Foto / })).toHaveCount(0)
  await expect(page.getByText('El acceso cambió. Volvé a abrir el producto para agregar fotos.', { exact: true })).toBeVisible()
})


for (const alta of [false, true]) test(`#404 cámara en modal ${alta ? 'alta' : 'ficha'} abre recorte y devuelve foco sin subir`, async ({ page }) => {
  const uploads = await preparar(page, { width: 360, modal: true, alta })
  const camara = page.getByTestId('galeria-camara')
  const chooser = page.waitForEvent('filechooser')
  await camara.click()
  await (await chooser).setFiles(await imagen(page))
  const crop = page.getByRole('dialog', { name: 'Recortar foto' })
  await expect(crop).toBeVisible()
  await expect(page.locator('input[capture="environment"]')).toHaveAttribute('accept', 'image/*')
  await crop.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await expect(crop).toHaveCount(0)
  await expect(camara).toBeFocused()
  await expect(page.getByRole('dialog', { name: alta ? 'Nuevo producto' : 'Ficha de producto', exact: true })).toBeVisible()
  expect(uploads).toHaveLength(0)
})

test('#404 modo lectura no permite recortar ni subir archivos', async ({ page }) => {
  const uploads = await preparar(page)
  await page.getByRole('button', { name: 'Retirar permiso', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Elegir fotos', exact: true })).toHaveCount(0)
  await page.getByTestId('galeria-archivo').setInputFiles(await imagen(page))
  await expect(page.getByRole('dialog', { name: 'Recortar foto' })).toHaveCount(0)
  expect(uploads).toHaveLength(0)
})
